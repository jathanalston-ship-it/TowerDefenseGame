// Top-bar loot meter. The run banks loot points into the meta queue LIVE during play
// (meta.syncRunLoot drives it from the HUD loop), so this just REFLECTS that queue: the box
// filling now (queue[0] + its banked progress), its fill %, and the pre-determined "next" box.
// When a box completes the queue's front advances — we flash the bar + pop the chest, then it
// keeps filling the next box. No estimate, no run-end-only cap: a deep run cycles boxes in
// real time and the meter always matches the meta state. No gameplay, no sim.

import { useEffect, useRef, useState } from 'react';
import { costOf, rarityRegistry } from '../core/loot';
import { meta } from '../state/meta';

export function LootMeter(): JSX.Element {
  const { lootQueue } = meta.use();
  const frontId = lootQueue.queue[0] ?? 'common';
  const nextId = lootQueue.queue[1];
  const front = rarityRegistry.get(frontId);
  const next = nextId ? rarityRegistry.get(nextId) : undefined;
  const color = front?.color ?? 'var(--r-common)';
  const cost = costOf(frontId);
  const filled = Math.min(Math.max(0, lootQueue.progress), cost);
  const pct = cost > 0 ? Math.min(1, filled / cost) : 0;
  const toGo = Math.max(1, Math.ceil(cost - filled));

  // Completion animation: a box completed when the front rarity changes OR the banked progress
  // drops (overflow carried into the next box). Flash the bar full + pop the chest, briefly.
  const [popping, setPopping] = useState(false);
  const prevFront = useRef(frontId);
  const prevProgress = useRef(lootQueue.progress);
  useEffect(() => {
    const advanced = frontId !== prevFront.current || lootQueue.progress < prevProgress.current;
    prevFront.current = frontId;
    prevProgress.current = lootQueue.progress;
    if (!advanced) return undefined;
    setPopping(true);
    const id = setTimeout(() => setPopping(false), 620);
    return () => clearTimeout(id);
  }, [frontId, lootQueue.progress]);

  const widthPct = (popping ? 1 : pct) * 100; // hold full during the completion flash

  return (
    <div className="hud-cell hud-loot tt" tabIndex={0}>
      <div className="hud-k">Loot</div>
      <div className="loot-row">
        <span className={`loot-chest ${popping ? 'is-pop' : ''}`} aria-hidden style={{ borderColor: color, color }}>
          ◈
        </span>
        <div className="loot-bar-wrap">
          <div className={`loot-bar ${popping ? 'is-complete' : ''}`}>
            <div className="loot-bar-fill" style={{ width: `${widthPct}%`, background: color }} />
          </div>
          <div className="loot-sub">
            <span style={{ color }}>{front?.name ?? 'Common'}</span>
            {next && (
              <span className="hud-sub">
                {' · next '}
                <b style={{ color: next.color }}>{next.name}</b>
              </span>
            )}
          </div>
        </div>
      </div>
      <span className="tt-bubble">
        Filling toward a <b style={{ color }}>{front?.name ?? 'Common'}</b> box ({Math.floor(filled)}/{cost}). {toGo} pts
        to go — banked live as you play, opened into shards on completion.
        {next && (
          <>
            {' '}
            Next up: <b style={{ color: next.color }}>{next.name}</b>.
          </>
        )}
      </span>
    </div>
  );
}
