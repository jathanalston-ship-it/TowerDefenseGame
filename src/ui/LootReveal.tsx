// Run-end loot box: an animated opening that builds anticipation, pops, then
// cascades the rolled rewards in one at a time. The reward set is already decided
// (deterministic ChestResult from the meta layer) — this only choreographs the
// reveal. Built to expand to multiple chest rarities (the `rarity` drives styling).

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ChestResult, RewardItem } from '../state/lootbox';
import { CHESTS, HERO_LABELS, TOWER_DEFS } from '../core/config';
import { audio } from '../audio/sound';
import type { TowerKind } from '../core/types';

function RewardRow({ item }: { item: RewardItem }): JSX.Element {
  if (item.type === 'tower') {
    const def = TOWER_DEFS[item.kind as TowerKind];
    return (
      <>
        <span className="loot-dot" style={{ background: def.color, boxShadow: `0 0 10px ${def.color}` }} />
        <span className="loot-name">{def.name}</span>
        <span className="loot-amt" style={{ color: def.color }}>
          +{item.amount} Shard{item.amount > 1 ? 's' : ''}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="loot-dot is-hero">✦</span>
      <span className="loot-name">{HERO_LABELS[item.id] ?? item.id}</span>
      <span className="loot-amt is-hero">
        +{item.amount} Hero Shard{item.amount > 1 ? 's' : ''}
      </span>
    </>
  );
}

export function LootReveal({
  chest,
  title,
  color,
}: {
  chest: ChestResult;
  title?: string; // overrides the chest-name label (loot-queue boxes pass their rarity name)
  color?: string; // rarity color for the box framing + title (loot-queue boxes)
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const name = title ?? CHESTS[chest.chestId]?.name ?? 'Reward Cache';

  // Beat 1: a short anticipation pause, then the chest pops open (with a thunk).
  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(true);
      audio.cue('chest');
    }, 320);
    return () => clearTimeout(t);
  }, []);

  // Beat 2: once open, reveal the rolled items one at a time.
  useEffect(() => {
    if (!open || revealed >= chest.items.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 340);
    return () => clearTimeout(t);
  }, [open, revealed, chest.items.length]);

  // Beat 3: each reveal plays a climbing tick — hero shards land a "jackpot".
  useEffect(() => {
    if (revealed === 0) return;
    const it = chest.items[revealed - 1];
    audio.cue(it && it.type === 'hero' ? 'jackpot' : 'reveal');
  }, [revealed, chest.items]);

  return (
    <div className="loot">
      <div
        className={`chest rarity-${chest.chestId} ${open ? 'is-open' : ''}`}
        aria-hidden="true"
        style={color ? ({ '--rarity': color } as CSSProperties) : undefined}
      >
        <div className="chest-burst" />
        <div className="chest-box">
          <div className="chest-lid" />
          <div className="chest-shine" />
        </div>
      </div>
      <div className="loot-title" style={color ? { color } : undefined}>
        {open ? name : 'Opening…'}
      </div>
      <ul className="loot-items">
        {chest.items.slice(0, revealed).map((it, i) => (
          <li className={`loot-item${it.type === 'hero' ? ' is-jackpot' : ''}`} key={i}>
            <RewardRow item={it} />
          </li>
        ))}
      </ul>
    </div>
  );
}
