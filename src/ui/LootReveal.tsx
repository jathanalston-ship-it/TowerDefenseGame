// Loot-box opening experience — a premium, NBA-2K-pack-style reveal ceremony. The
// reward set is already decided (a deterministic ChestResult from the meta layer); this
// only CHOREOGRAPHS the reveal as a staged sequence that builds anticipation:
//   1 box appears → 2 it opens → 3 a bright mutation burst → 4 a face-down reward card
//   rises → 5 it slowly turns → 6 its rarity glows into view → 7 TAP TO REVEAL →
//   8 the card flips to the reward → 9 the full reward summary cascades in.
// Pacing + intensity scale with rarity (fast floor for commons, a long savored ceiling
// with beams/shockwave/extra glow for rare+ pulls). A click fast-forwards to the reveal
// gate, then flips, then skips the cascade — snappy for repeated opens.
//
// Two callers, one component:
//   • run-end caches  — <LootReveal chest={chestResult} /> (rarity from the pulls).
//   • loot-queue boxes — <LootReveal chest={box} title="Mythic Box" color={...} />,
//     where the BOX rarity (6-tier registry scale) supplies title + accent and its
//     registry rank drives how big the ceremony gets.

import { useEffect, useMemo, useState } from 'react';
import type { ChestResult, RewardItem } from '../state/lootbox';
import { CHESTS, HERO_DEFS, HERO_LABELS, TOWER_DEFS } from '../core/config';
import type { LootRarity, MaterialKind } from '../core/config';
import type { HeroKind } from '../core/types';
import { itemDef } from '../core/equipment';
import { rarityRank } from '../core/loot';
import { audio } from '../audio/sound';
import { CurrencyIcon } from './components/CurrencyIcon';
import type { CurrencyId } from '../core/currencies';

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
  currency?: CurrencyId; // tower/hero shard pulls get the matching currency icon + gain burst
}

function describe(item: RewardItem): { key: string; name: string; amount: number; suffix: string; color: string; currency?: CurrencyId } {
  switch (item.type) {
    case 'tower': {
      const d = TOWER_DEFS[item.kind];
      return { key: `tower:${item.kind}`, name: d.name, amount: item.amount, suffix: 'Shards', color: d.color, currency: 'towerShards' };
    }
    case 'hero':
      return { key: `hero:${item.id}`, name: HERO_LABELS[item.id] ?? item.id, amount: item.amount, suffix: 'Hero Shards', color: HERO_DEFS[item.id as HeroKind]?.color ?? 'var(--vital)', currency: 'heroShards' };
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
  const byKey = new Map<string, { rarity: LootRarity; name: string; amount: number; suffix: string; color: string; currency?: CurrencyId }>();
  for (const it of items) {
    const d = describe(it);
    const ex = byKey.get(d.key);
    if (ex) {
      ex.amount += d.amount;
      ex.rarity = maxR(ex.rarity, it.rarity);
    } else {
      byKey.set(d.key, { rarity: it.rarity, name: d.name, amount: d.amount, suffix: d.suffix, color: d.color, currency: d.currency });
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
      currency: r.currency,
    }));
}

// The reveal runs through these stages in order; only `tease` waits for the player.
type Stage = 'box' | 'opening' | 'burst' | 'tease' | 'flip' | 'summary';
const STAGES: Stage[] = ['box', 'opening', 'burst', 'tease', 'flip', 'summary'];
const S_BURST = STAGES.indexOf('burst');

export function LootReveal({
  chest,
  title,
  color,
  onClose,
  onOpenMore,
  remaining = 0,
}: {
  chest: ChestResult | ChestResult[];
  title?: string; // overrides the chest-name label (loot-queue boxes pass their rarity name)
  color?: string; // rarity color for the framing + accent (loot-queue boxes)
  onClose: () => void; // explicit dismissal (Return / Continue) — the ceremony NEVER auto-closes
  onOpenMore?: () => void; // crack the next container in place (Open More), without leaving the reveal
  remaining?: number; // containers still in the stockpile → drives the "Open More (N left)" CTA
}): JSX.Element {
  const chests = useMemo(() => (Array.isArray(chest) ? chest : [chest]), [chest]);
  const rewards = useMemo(() => summarize(chests.flatMap((c) => c.items)), [chests]);
  const top = useMemo(() => chests.reduce<LootRarity>((r, c) => maxR(r, c.topRarity), 'common'), [chests]);

  // Ceremony magnitude: the bigger of the best item rarity (run-end pulls) and the box's
  // registry rank (loot-queue boxes — chestId is the rarity id; non-rarity chests → -1).
  const itemTier = TIER.indexOf(top);
  const boxTier = useMemo(() => chests.reduce((m, c) => Math.max(m, rarityRank(c.chestId)), -1), [chests]);
  const tier = Math.max(itemTier, boxTier);
  const t = Math.max(0, tier);
  const isRare = tier >= 2; // epic-equivalent and up earn the extra spectacle…
  const isEpic = tier >= 3; // …legendary/exotic/mythic the full treatment

  const name = title ?? (chests.length === 1 ? (CHESTS[chests[0].chestId]?.name ?? 'Reward Cache') : `${chests.length}× Caches`);
  const pulls = chests.reduce((n, c) => n + c.items.length, 0);
  // Accent: an explicit box color (loot-queue) wins; otherwise the best item rarity.
  const accent = color ?? RARITY[top].color;
  // Rarity word on the card: the box name (loot-queue) or the best item rarity label.
  const rarityWord = color ? name.toUpperCase() : RARITY[top].label;
  const headline = rewards.length ? rewards[rewards.length - 1] : null; // the card's hero reward
  const pips = Math.min(5, t + 1);

  const [stage, setStage] = useState<Stage>('box');
  const [revealed, setRevealed] = useState(0);
  const si = STAGES.indexOf(stage);

  // Anticipation scales with rarity: fast floor, long savored ceiling.
  const openMs = 420 + t * 150;
  const stepMs = 150 + t * 35;

  // Auto-advance the anticipation stages; `tease` holds until the player clicks.
  useEffect(() => {
    let id: ReturnType<typeof setTimeout> | undefined;
    if (stage === 'box') id = setTimeout(() => setStage('opening'), 480);
    else if (stage === 'opening') { audio.cue('chest'); id = setTimeout(() => setStage('burst'), openMs); }
    else if (stage === 'burst') id = setTimeout(() => setStage('tease'), 380);
    else if (stage === 'flip') { audio.cue(isRare ? 'jackpot' : 'reveal'); id = setTimeout(() => setStage('summary'), 660); }
    return () => { if (id) clearTimeout(id); };
  }, [stage, openMs, isRare]);

  // The reward summary cascades once the card has flipped.
  useEffect(() => {
    if (stage !== 'summary' || revealed >= rewards.length) return;
    const id = setTimeout(() => setRevealed((r) => r + 1), stepMs);
    return () => clearTimeout(id);
  }, [stage, revealed, rewards.length, stepMs]);

  // Per-reward stinger — epic+ pulls land a "jackpot".
  useEffect(() => {
    if (revealed === 0) return;
    const r = rewards[revealed - 1];
    audio.cue(r && TIER.indexOf(r.rarity) >= 2 ? 'jackpot' : 'reveal');
  }, [revealed, rewards]);

  // The reveal is "done" once the cascade has fully played. This used to auto-fire a dismiss
  // callback here, which destroyed the summary the instant it finished animating in — the player
  // never got to read it. Now `done` only UNLOCKS the explicit actions below; closing is always a
  // deliberate player choice (see BUGFIX-LOG #5).
  const done = stage === 'summary' && revealed >= rewards.length;

  // Click: fast-forward anticipation → reveal gate → flip → skip the cascade.
  const advance = (): void => {
    if (si < STAGES.indexOf('tease')) setStage('tease');
    else if (stage === 'tease') setStage('flip');
    else setRevealed(rewards.length);
  };

  // "Review Rewards" — jump straight to the fully-revealed summary so the player can read every
  // drop immediately, skipping the staged theatrics. Never triggered automatically.
  const reviewRewards = (): void => {
    setStage('summary');
    setRevealed(rewards.length);
  };

  // Celebration sparks fired on the reveal (rarity-tinted; count scales with tier).
  const sparks = useMemo(() => {
    const n = 14 + t * 7;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
      const dist = 70 + ((i * 37) % 110);
      return { tx: Math.cos(a) * dist, ty: Math.sin(a) * dist, delay: (i % 5) * 0.03 };
    });
  }, [t]);

  const cardOut = si >= S_BURST; // the card is mounted from the burst onward
  const boxOut = si <= S_BURST; // the chest shows through the burst, then yields to the card
  const flipped = stage === 'flip' || stage === 'summary';
  const pipNodes = Array.from({ length: pips }, (_, i) => <i key={i} />);

  return (
    <div
      className={`loot loot-v3 tier-${top} stage-${stage} ${isRare ? 'is-rare' : ''} ${isEpic ? 'is-epic' : ''} ${done ? 'is-done' : ''}`}
      style={{ ['--loot-accent' as string]: accent }}
      onClick={advance}
    >
      <div className="loot-stage">
        <div className="loot-glow" />

        {/* steps 1–3: the box appears, opens, then bursts into light */}
        {boxOut && (
          <div className={`chest rarity-${chests[0].chestId} ${stage !== 'box' ? 'is-open' : ''}`} aria-hidden>
            <div className="chest-burst" />
            <div className="chest-box">
              <div className="chest-lid" />
              <div className="chest-shine" />
            </div>
          </div>
        )}
        {stage === 'burst' && <div className="loot-flash" aria-hidden />}

        {/* steps 4–8: a face-down card rises, teases its rarity, and flips on the click */}
        {cardOut && (
          <div className="loot-card-wrap">
            {isRare && <div className="card-beams" aria-hidden />}
            <div className="card-aura" aria-hidden />
            {flipped && isRare && (
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
            <div className={`loot-card3d ${flipped ? 'is-flipped' : ''}`}>
              <div className="card-back" aria-hidden>
                <div className="card-back-grid" />
                <div className="card-sigil" />
                <div className="card-holo" />
                <div className="card-badge">
                  <span className="card-gem" />
                  <span className="card-rword">{rarityWord}</span>
                  <span className="card-pips">{pipNodes}</span>
                </div>
              </div>
              <div className="card-face">
                <div className="card-holo" />
                <div className="card-face-rword">{rarityWord}</div>
                <div className="card-emblem" style={headline ? { ['--rw' as string]: headline.color } : undefined}>
                  <span className="emblem-ring" />
                  <span className="emblem-core" />
                </div>
                <div className="card-reward-name">{headline ? headline.name : name}</div>
                <div className="card-reward-amt" style={headline ? { color: headline.color } : undefined}>
                  {headline ? headline.amount : `${pulls} pull${pulls > 1 ? 's' : ''}`}
                </div>
                <span className="card-pips face">{pipNodes}</span>
              </div>
            </div>
            {flipped && isRare && <div className="card-shockwave" aria-hidden />}
            {stage === 'tease' && <div className="loot-reveal-prompt">TAP TO REVEAL</div>}
          </div>
        )}
      </div>

      <div className="loot-title" style={color ? { color } : undefined}>
        {si <= STAGES.indexOf('opening') ? 'Opening…' : name}
        <span className="loot-pulls">{pulls} pull{pulls > 1 ? 's' : ''}</span>
      </div>

      {/* step 9: the reward summary cascades in */}
      {stage === 'summary' && (
        <ul className="loot-items">
          {rewards.slice(0, revealed).map((r) => (
            <li className={`loot-item tier-${r.rarity}`} key={r.key} style={{ ['--rw' as string]: r.color }}>
              {r.currency ? (
                <CurrencyIcon id={r.currency} color={r.color} size={20} pickup className="loot-cur" />
              ) : (
                <span className="loot-dot" style={{ background: r.color, boxShadow: `0 0 10px ${r.color}` }} />
              )}
              <span className="loot-name">{r.name}</span>
              <span className="loot-amt" style={{ color: r.color }}>{r.amount}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Explicit, player-driven controls — the ceremony never dismisses on its own. Before the
          reveal lands: Review Rewards (skip to the full list). After it lands: Open More (crack the
          next box) + Return, or Continue when the stockpile is empty. stopPropagation keeps these
          clicks from also triggering the backdrop's skip-advance. */}
      <div className="loot-actions" onClick={(e) => e.stopPropagation()}>
        {!done ? (
          <button type="button" className="loot-btn loot-review" onClick={reviewRewards}>
            Review Rewards
          </button>
        ) : onOpenMore && remaining > 0 ? (
          <>
            <button type="button" className="loot-btn primary" onClick={onOpenMore}>
              Open More <span className="loot-btn-sub">({remaining} left)</span>
            </button>
            <button type="button" className="loot-btn" onClick={onClose}>
              Return
            </button>
          </>
        ) : (
          <button type="button" className="loot-btn primary" onClick={onClose}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
