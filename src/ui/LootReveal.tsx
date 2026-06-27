// Loot-box opening experience. The reward set is already decided (a deterministic
// ChestResult from the meta layer) — this only CHOREOGRAPHS the reveal:
//   charge (anticipation) → burst (lighting + particles + rarity flash) → cascade
//   the deduped rewards climaxing on the best pull → summary.
// Ceremony scales to the best rarity (fast floor, big ceiling — the anti-tedium
// engine), a click reveals everything instantly (fast for repeated use), and it
// accepts an array of chests for future multi-open (one combined ceremony).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChestResult, RewardItem } from '../state/lootbox';
import { CHESTS, HERO_LABELS, TOWER_DEFS } from '../core/config';
import type { LootRarity, MaterialKind } from '../core/config';
import { itemDef } from '../core/equipment';
import { audio } from '../audio/sound';

const TIER: LootRarity[] = ['common', 'rare', 'epic', 'legendary', 'exotic'];
const RARITY: Record<LootRarity, { label: string; color: string }> = {
  common: { label: 'COMMON', color: 'var(--r-common)' },
  rare: { label: 'RARE', color: 'var(--r-rare)' },
  epic: { label: 'EPIC', color: 'var(--r-epic)' },
  legendary: { label: 'LEGENDARY', color: 'var(--r-legendary)' },
  exotic: { label: 'EXOTIC', color: '#5ffbf1' },
};
const MAT_LABEL: Record<MaterialKind, string> = { mutagen: 'Mutagen', scrap: 'Scrap', catalyst: 'Catalyst' };
const maxR = (a: LootRarity, b: LootRarity): LootRarity => (TIER.indexOf(a) >= TIER.indexOf(b) ? a : b);

/** A deduped, display-ready reward (the cascade unit — duplicates already merged). */
interface Reward {
  key: string;
  rarity: LootRarity;
  color: string;
  name: string;
  amount: string; // e.g. "+5 Shards" or "EPIC"
}

function describe(item: RewardItem): { key: string; name: string; amount: number; suffix: string; color: string } {
  switch (item.type) {
    case 'tower': {
      const d = TOWER_DEFS[item.kind];
      return { key: `tower:${item.kind}`, name: d.name, amount: item.amount, suffix: 'Shards', color: d.color };
    }
    case 'hero':
      return { key: `hero:${item.id}`, name: HERO_LABELS[item.id] ?? item.id, amount: item.amount, suffix: 'Hero Shards', color: 'var(--gold)' };
    case 'material':
      return { key: `mat:${item.mat}`, name: MAT_LABEL[item.mat], amount: item.amount, suffix: 'Materials', color: 'var(--caustic)' };
    case 'equipment': {
      const d = itemDef(item.item.defId);
      return { key: `equip:${item.item.uid}`, name: d?.name ?? 'Equipment', amount: 1, suffix: 'Item', color: RARITY[item.rarity].color };
    }
    case 'cosmetic':
      return { key: `cos:${item.id}`, name: item.id, amount: 1, suffix: 'Cosmetic', color: 'var(--r-epic)' };
    case 'relic':
      return { key: `relic:${item.id}`, name: item.id, amount: 1, suffix: 'Relic', color: 'var(--r-legendary)' };
    case 'event':
      return { key: `evt:${item.currency}`, name: item.currency, amount: item.amount, suffix: 'Event', color: 'var(--viral)' };
  }
}

/** Merge raw pulls into deduped rewards, ordered ascending so the best is the finale. */
function summarize(items: RewardItem[]): Reward[] {
  const byKey = new Map<string, { rarity: LootRarity; name: string; amount: number; suffix: string; color: string }>();
  for (const it of items) {
    const d = describe(it);
    const ex = byKey.get(d.key);
    if (ex) {
      ex.amount += d.amount;
      ex.rarity = maxR(ex.rarity, it.rarity);
    } else {
      byKey.set(d.key, { rarity: it.rarity, name: d.name, amount: d.amount, suffix: d.suffix, color: d.color });
    }
  }
  return [...byKey.values()]
    .sort((a, b) => TIER.indexOf(a.rarity) - TIER.indexOf(b.rarity))
    .map((r) => ({
      key: r.name + r.suffix,
      rarity: r.rarity,
      color: r.color,
      name: r.name,
      amount: r.suffix === 'Item' ? RARITY[r.rarity].label : `+${r.amount} ${r.suffix}`,
    }));
}

export function LootReveal({ chest, onDone }: { chest: ChestResult | ChestResult[]; onDone?: () => void }): JSX.Element {
  const chests = useMemo(() => (Array.isArray(chest) ? chest : [chest]), [chest]);
  const rewards = useMemo(() => summarize(chests.flatMap((c) => c.items)), [chests]);
  const top = useMemo(() => chests.reduce<LootRarity>((r, c) => maxR(r, c.topRarity), 'common'), [chests]);
  const tier = TIER.indexOf(top);
  const name = chests.length === 1 ? (CHESTS[chests[0].chestId]?.name ?? 'Reward Cache') : `${chests.length}× Caches`;
  const pulls = chests.reduce((n, c) => n + c.items.length, 0);

  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const done = open && revealed >= rewards.length;
  const calledDone = useRef(false);

  // Charge (anticipation) scales with rarity: fast floor (~360ms), big ceiling.
  const chargeMs = 320 + tier * 140;
  // Cascade interval: snappy, slightly slower for higher tiers to savor.
  const stepMs = 150 + tier * 35;

  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(true);
      audio.cue('chest');
    }, chargeMs);
    return () => clearTimeout(t);
  }, [chargeMs]);

  useEffect(() => {
    if (!open || revealed >= rewards.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), stepMs);
    return () => clearTimeout(t);
  }, [open, revealed, rewards.length, stepMs]);

  // Per-reveal stinger — epic+ pulls land a "jackpot".
  useEffect(() => {
    if (revealed === 0) return;
    const r = rewards[revealed - 1];
    audio.cue(r && TIER.indexOf(r.rarity) >= 2 ? 'jackpot' : 'reveal');
  }, [revealed, rewards]);

  useEffect(() => {
    if (done && onDone && !calledDone.current) {
      calledDone.current = true;
      onDone();
    }
  }, [done, onDone]);

  // Click anywhere to skip straight to the full reveal (fast for repeated opens).
  const skip = (): void => {
    if (!open) {
      setOpen(true);
      audio.cue('chest');
    }
    setRevealed(rewards.length);
  };

  // Burst particles (DOM sparks; rarity-tinted, count scales with tier).
  const sparks = useMemo(() => {
    const n = 12 + tier * 6;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
      const dist = 60 + ((i * 37) % 90);
      return { tx: Math.cos(a) * dist, ty: Math.sin(a) * dist, delay: (i % 5) * 0.04 };
    });
  }, [tier]);

  const accent = RARITY[top].color;

  return (
    <div
      className={`loot tier-${top} ${open ? 'is-open' : 'is-charging'} ${done ? 'is-done' : ''}`}
      style={{ ['--loot-accent' as string]: accent }}
      onClick={skip}
    >
      <div className="loot-stage">
        <div className="loot-glow" />
        {open && (
          <div className="loot-sparks" aria-hidden>
            {sparks.map((s, i) => (
              <span
                key={i}
                className="loot-spark"
                style={{ ['--tx' as string]: `${s.tx}px`, ['--ty' as string]: `${s.ty}px`, animationDelay: `${s.delay}s` }}
              />
            ))}
          </div>
        )}
        <div className={`chest rarity-${chests[0].chestId} ${open ? 'is-open' : ''}`} aria-hidden>
          <div className="chest-burst" />
          <div className="chest-box">
            <div className="chest-lid" />
            <div className="chest-shine" />
          </div>
        </div>
        {open && (
          <div className="loot-rarity-flash" style={{ color: accent }}>
            {RARITY[top].label}
          </div>
        )}
      </div>

      <div className="loot-title">
        {open ? name : 'Opening…'}
        <span className="loot-pulls">{pulls} pull{pulls > 1 ? 's' : ''}</span>
      </div>

      <ul className="loot-items">
        {rewards.slice(0, revealed).map((r) => (
          <li className={`loot-item tier-${r.rarity}`} key={r.key} style={{ ['--rw' as string]: r.color }}>
            <span className="loot-dot" style={{ background: r.color, boxShadow: `0 0 10px ${r.color}` }} />
            <span className="loot-name">{r.name}</span>
            <span className="loot-amt" style={{ color: r.color }}>{r.amount}</span>
          </li>
        ))}
      </ul>

      {!done && <div className="loot-skip">click to reveal</div>}
    </div>
  );
}
