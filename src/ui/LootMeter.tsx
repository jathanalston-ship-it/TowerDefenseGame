// Top-bar Loot Box Meter. The run is ALWAYS filling a meter toward a box whose rarity is
// already decided (LOOTBOX.md "anticipation"), with the box queued AFTER it shown as the
// pre-determined "next" — so the next loot box is known before the current meter completes.
// Reads the saved queue (meta) + the live run snapshot, where banked loot points mirror
// the meta earn rate so the bar and the run-end award stay in sync. No gameplay, no sim.

import { LOOT_EARN, costOf, rarityRegistry } from '../core/loot';
import { meta } from '../state/meta';
import type { HudSnapshot } from '../core/types';

export function LootMeter({ hud }: { hud: HudSnapshot }): JSX.Element {
  const { lootQueue } = meta.use();
  const frontId = lootQueue.queue[0] ?? 'common';
  const nextId = lootQueue.queue[1];
  const front = rarityRegistry.get(frontId);
  const next = nextId ? rarityRegistry.get(nextId) : undefined;
  const color = front?.color ?? 'var(--r-common)';

  // Live total = banked progress + this run's accrual (same formula meta banks at run end).
  const live = Math.floor(Math.max(0, hud.wave) * LOOT_EARN.pointsPerWave + hud.kills * LOOT_EARN.pointsPerKill);
  const cost = costOf(frontId);
  const total = lootQueue.progress + live;
  const pct = Math.min(1, Math.max(0, total / cost));
  const ready = total >= cost;

  return (
    <div className="hud-cell hud-loot tt" tabIndex={0}>
      <div className="hud-k">Loot</div>
      <div className="loot-row">
        <span className="loot-chest" aria-hidden style={{ borderColor: color, color }}>
          ◈
        </span>
        <div className="loot-bar-wrap">
          <div className="loot-bar">
            <div className="loot-bar-fill" style={{ width: `${pct * 100}%`, background: color }} />
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
        Filling toward a <b style={{ color }}>{front?.name ?? 'Common'}</b> box ({Math.min(Math.floor(total), cost)}/
        {cost}).{' '}
        {ready ? 'Ready — opens at run end.' : `${Math.max(1, Math.ceil(cost - total))} pts to go.`}
        {next && (
          <>
            {' '}
            Already queued next: <b style={{ color: next.color }}>{next.name}</b>.
          </>
        )}
      </span>
    </div>
  );
}
