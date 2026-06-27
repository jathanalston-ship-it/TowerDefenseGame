// Loot box opening — the payoff the meter was building toward. Banked boxes are
// opened here (on the menu, the between-runs moment), revealing a rarity-colored
// currency cache that feeds the upgrade tracks → spend it → one more run.

import { useState } from 'react';
import { meta } from '../state/meta';
import type { LootReward } from '../state/meta';
import { LOOT_RARITY } from '../core/config';
import { CountUp } from './components/CountUp';

export function LootBoxOpener(): JSX.Element | null {
  const save = meta.use();
  const [reveal, setReveal] = useState<LootReward | null>(null);
  const [seq, setSeq] = useState(0); // re-mounts the reveal so the burst replays each open
  const pending = meta.pendingLootRarity();

  if (save.lootBoxes <= 0 && !reveal) return null;

  const open = (): void => {
    const r = meta.openLootBox();
    if (r) {
      setReveal(r);
      setSeq((s) => s + 1);
    }
  };

  return (
    <div className="loot-opener">
      {save.lootBoxes > 0 && pending && (
        <button className={`primary loot-open-btn rarity-${pending}`} onClick={open}>
          Open Loot Box{save.lootBoxes > 1 ? ` · ${save.lootBoxes}` : ''}
          <span className="loot-open-rarity" style={{ color: LOOT_RARITY[pending].color }}>
            {LOOT_RARITY[pending].label}
          </span>
        </button>
      )}

      {reveal && (
        <div
          className={`loot-reveal rarity-${reveal.rarity}`}
          key={seq}
          role="button"
          tabIndex={0}
          onClick={() => setReveal(null)}
          style={{ ['--rarity' as string]: LOOT_RARITY[reveal.rarity].color }}
        >
          <div className="lr-rarity">{LOOT_RARITY[reveal.rarity].label} Cache</div>
          <div className="lr-rewards">
            {reveal.shards > 0 && (
              <span>
                <b><CountUp value={reveal.shards} animateFrom={0} duration={650} /></b> Shards
              </span>
            )}
            {reveal.essence > 0 && (
              <span>
                <b><CountUp value={reveal.essence} animateFrom={0} duration={650} /></b> Essence
              </span>
            )}
            {reveal.components > 0 && (
              <span>
                <b><CountUp value={reveal.components} animateFrom={0} duration={650} /></b> Components
              </span>
            )}
          </div>
          <div className="lr-dismiss">{save.lootBoxes > 0 ? 'Tap to continue — open another' : 'Tap to continue'}</div>
        </div>
      )}
    </div>
  );
}
