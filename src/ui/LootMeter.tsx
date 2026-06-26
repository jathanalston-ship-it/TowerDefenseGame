// Persistent Loot Meter — a forever bar (never resets across runs/modes) that fills
// from kills + completed waves and awards loot boxes on each fill. Reads the saved
// meta state, so it shows the same progress in-run and on the menu.

import { meta } from '../state/meta';
import { lootMeterSize } from '../core/config';

export function LootMeter({ compact = false }: { compact?: boolean }): JSX.Element {
  const save = meta.use();
  const size = lootMeterSize(save.lootBoxesLifetime);
  const pct = size > 0 ? Math.max(0, Math.min(1, save.lootMeter / size)) : 0;

  return (
    <div className={`loot-meter ${compact ? 'is-compact' : ''}`}>
      <div className="lm-head">
        <span className="lm-label">◇ Loot Meter</span>
        {/* key by box count → the badge pulses each time a box is awarded */}
        <span className="lm-boxes" key={save.lootBoxes} title="Loot boxes on hand">
          ◆ {save.lootBoxes}
        </span>
      </div>
      <div className="lm-bar" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="lm-fill" style={{ width: `${pct * 100}%` }} />
      </div>
      {!compact && (
        <div className="lm-sub">
          {Math.floor(save.lootMeter)} / {size}
          {save.lootBoxesLifetime > 0 ? ` · ${save.lootBoxesLifetime} earned` : ''}
        </div>
      )}
    </div>
  );
}
