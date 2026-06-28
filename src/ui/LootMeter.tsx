// Persistent Bio-Container meter — a forever bar (never resets across runs/modes) that
// fills from kills + completed waves and EARNS a typed Bio-Container on each fill. Built
// to be *glanceable*: the fill, glow, and accent are colored by the NEXT container's
// rarity, the glow brightens toward completion, milestones pulse, and an earn bursts — so
// the player keeps looking, and every look builds anticipation. Reads saved meta state,
// so it's identical in-run and on the menu/LOOT screen.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { lootMeterSize, LOOT_RARITY } from '../core/config';

const MILESTONES = [0.25, 0.5, 0.75]; // crossings that fire a one-shot pulse

export function LootMeter({ compact = false }: { compact?: boolean }): JSX.Element {
  const save = meta.use();
  const boxes = Object.values(save.boxes).reduce((a, b) => a + b, 0); // total owned (all types)
  const size = lootMeterSize(save.lootBoxesLifetime);
  const pct = size > 0 ? Math.max(0, Math.min(1, save.lootMeter / size)) : 0;
  const rarity = meta.nextLootRarity();
  const rDef = LOOT_RARITY[rarity];

  // One-shot effects: a milestone pulse (crossing 25/50/75%) and a completion burst
  // (a box was awarded). Tracked via refs so they fire on the *transition*, not every
  // render — keyed elements re-mount to replay the animation.
  const prevPct = useRef(pct);
  const prevBoxes = useRef(boxes);
  const [pulse, setPulse] = useState(0);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (MILESTONES.some((m) => prevPct.current < m && pct >= m)) setPulse((p) => p + 1);
    prevPct.current = pct;
  }, [pct]);
  useEffect(() => {
    if (boxes > prevBoxes.current) setBurst((b) => b + 1);
    prevBoxes.current = boxes;
  }, [boxes]);

  return (
    <div
      className={`loot-meter rarity-${rarity} ${compact ? 'is-compact' : ''} ${pct >= 0.85 ? 'is-near' : ''}`}
      style={{ ['--rarity' as string]: rDef.color, ['--lm-pct' as string]: pct }}
    >
      <div className="lm-head">
        <span className="lm-label">◇ Bio-Container Meter</span>
        <span className="lm-next" title={`Next: ${rDef.label} Bio-Container`}>
          <span className="lm-next-dot" />
          {!compact && <span className="lm-next-label">{rDef.label}</span>}
        </span>
        <span className="lm-boxes" key={boxes} title="Bio-Containers in stash">
          ◆ {boxes}
        </span>
      </div>

      <div className="lm-bar" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="lm-track">
          <div className="lm-fill" style={{ width: `${pct * 100}%` }}>
            <span className="lm-shimmer" aria-hidden />
          </div>
          {pulse > 0 && <span className="lm-pulse" key={`p${pulse}`} aria-hidden />}
        </div>
        <span className="lm-glow" aria-hidden />
        {burst > 0 && <span className="lm-burst" key={`b${burst}`} aria-hidden />}
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
