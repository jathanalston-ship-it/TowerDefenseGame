// Top-bar Loot Box Meter. The run is ALWAYS filling a meter toward a box whose rarity is
// already decided (LOOTBOX.md "anticipation"), with the box queued AFTER it shown as the
// pre-determined "next". As a run banks loot points the meter CYCLES through its boxes —
// fill → complete (pop) → reset to the next — instead of capping at the first. The walk uses
// the same `(queue, points)` the run-end award sees (lootMeterView), so the live bar and the
// run-end haul stay in sync. No gameplay, no sim.

import { useEffect, useRef, useState } from 'react';
import { LOOT_EARN, rarityRegistry } from '../core/loot';
import { lootMeterView } from '../core/lootQueue';
import { ascendantBonuses } from '../core/ascendant';
import { meta } from '../state/meta';
import type { HudSnapshot } from '../core/types';

export function LootMeter({ hud }: { hud: HudSnapshot }): JSX.Element {
  const save = meta.use();
  const lootQueue = save.lootQueue;
  // Live points this run — mirrors the meta run-end formula exactly (incl. the prestige loot
  // multiplier), so the meter fills at the rate the run will actually award.
  const lootMult = ascendantBonuses(save.prestige.nodes).lootGainMult;
  const live = Math.floor(Math.max(0, hud.wave * LOOT_EARN.pointsPerWave + hud.kills * LOOT_EARN.pointsPerKill) * lootMult);

  const view = lootMeterView(lootQueue, live);
  const front = rarityRegistry.get(view.frontId);
  const next = view.nextId ? rarityRegistry.get(view.nextId) : undefined;
  const color = front?.color ?? 'var(--r-common)';

  // Completion animation: when a box completes (the view's `completed` count rises) flash the
  // bar + pop the chest, and hold the bar full for the flash before it resets to the next box.
  const [popping, setPopping] = useState(false);
  const prevCompleted = useRef(view.completed);
  useEffect(() => {
    if (view.completed > prevCompleted.current) {
      setPopping(true);
      const id = setTimeout(() => setPopping(false), 620);
      prevCompleted.current = view.completed;
      return () => clearTimeout(id);
    }
    prevCompleted.current = view.completed;
    return undefined;
  }, [view.completed]);

  const widthPct = (popping ? 1 : view.pct) * 100; // hold full during the completion flash

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
        Filling toward a <b style={{ color }}>{front?.name ?? 'Common'}</b> box ({Math.floor(view.filled)}/{view.cost}
        ). {Math.max(1, Math.ceil(view.cost - view.filled))} pts to go.
        {view.completed > 0 && (
          <>
            {' '}
            <b>{view.completed}</b> box{view.completed > 1 ? 'es' : ''} locked in this run — opens at run end.
          </>
        )}
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
