// Top-bar Loot Box Meter. Pure visualization of the EXISTING reward pacing
// (chestForWave): how close the run is to its next chest-tier upgrade and which
// chest it's on track to earn. Reads only the snapshot + config — no gameplay,
// no new state. Stage: progress toward the next tier (rich@7, prime@12 / extract).
// Endless: progress toward the next depth tier.

import { CHESTS, chestForWave } from '../core/config';
import type { HudSnapshot } from '../core/types';

const RARITY_COLOR: Record<string, string> = {
  standard: 'var(--r-common)',
  rich: 'var(--r-rare)',
  prime: 'var(--r-legendary)',
};

export function LootMeter({ hud }: { hud: HudSnapshot }): JSX.Element {
  const wave = Math.max(0, hud.wave);
  const chest = CHESTS[chestForWave(wave)] ?? CHESTS.standard;
  const color = RARITY_COLOR[chest.rarity] ?? 'var(--r-common)';

  // Band toward the next chest-tier threshold (mirrors chestForWave's 7 / 12 steps).
  const lo = wave < 7 ? 0 : 7;
  const next = wave < 7 ? 7 : wave < 12 ? 12 : null; // null = top tier reached
  const pct = next ? Math.min(1, Math.max(0, (wave - lo) / (next - lo))) : 1;
  const wavesLeft = next ? Math.max(1, next - wave) : 0;

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
            <span style={{ color }}>{chest.name}</span>
            <span className="hud-sub">{next ? ` · ${wavesLeft}w` : ' · MAX'}</span>
          </div>
        </div>
      </div>
      <span className="tt-bubble">
        Next chest: <b style={{ color }}>{chest.name}</b> ({chest.rolls} rolls).{' '}
        {next ? `Reach wave ${next} to upgrade the tier.` : 'Top tier — survive to extract it.'}
      </span>
    </div>
  );
}
