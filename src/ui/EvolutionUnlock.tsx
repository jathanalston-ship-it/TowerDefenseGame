// Evolution Unlock sequence (docs/TOWER-CODEX.md §2) — the dramatic, RPG-boss-grade moment when a
// Campaign milestone raises the account-wide Evolution Cap (docs/EVOLUTION-CAP.md). NOT a silent
// unlock: a full-screen reveal of the new tier, the affected towers (living portraits at the new
// cap, bursting in), and the mutation each gains. Shown by App over Results when the cap rose.

import { TOWER_DEFS, TOWER_ORDER, starMutationTier } from '../core/config';
import { stepAt } from '../core/stars';
import { TowerPortrait } from './TowerPortrait';
import { stepView } from './towerLabModel';
import { meta } from '../state/meta';
import './EvolutionUnlock.css';

export interface EvolutionUnlockData {
  oldCap: number; // star cap before this run
  newCap: number; // star cap after (newCap > oldCap)
  stage: number; // the campaign stage just cleared that raised it
}

export function EvolutionUnlock({ unlock, onClose }: { unlock: EvolutionUnlockData; onClose: () => void }): JSX.Element {
  const save = meta.get();
  const { oldCap, newCap, stage } = unlock;
  const gen = starMutationTier(newCap); // the generation taxonomy at the new cap (shared with the renderer)
  // Each tower's mutation at the newly-unlocked tier (authored star step, or the ascension power tier).
  const towers = TOWER_ORDER.map((k) => {
    const st = stepAt(k, newCap);
    return {
      kind: k,
      name: TOWER_DEFS[k].name,
      color: TOWER_DEFS[k].color,
      mutation: st ? stepView(k, st, save).name : `Ascension ◈${newCap}`,
    };
  });

  return (
    <div className="evo-unlock" role="dialog" aria-label="New Evolution Unlocked" onClick={onClose}>
      <div className="evo-rays" aria-hidden />
      <div className="evo-card" onClick={(e) => e.stopPropagation()}>
        <div className="evo-eyebrow">◆ New Evolution Unlocked ◆</div>
        <h2 className="evo-title">{gen.name}</h2>
        <div className="evo-cap">Star Cap Increased&nbsp; <b>◈{oldCap} → ◈{newCap}</b></div>
        <p className="evo-blurb">{gen.desc}</p>
        <div className="evo-band">Cleared Campaign Stage {stage} · new mutations available · ◈{oldCap + 1}–◈{newCap}</div>

        <div className="evo-roster">
          {towers.map((t, i) => (
            <div className="evo-tower" key={t.kind} style={{ animationDelay: `${0.25 + i * 0.13}s` }}>
              <div className="evo-portrait">
                <TowerPortrait color={t.color} stars={newCap} size={96} kind={t.kind} />
                <span className="evo-burst" aria-hidden />
              </div>
              <div className="evo-tower-name" style={{ color: t.color }}>{t.name}</div>
              <div className="evo-tower-mut" title={t.mutation}>✦ {t.mutation}</div>
            </div>
          ))}
        </div>

        <p className="evo-foot">Every tower can now ascend further. Spend Strain Samples in the Tower Lab to claim it.</p>
        <button className="primary evo-continue" onClick={onClose}>Continue</button>
      </div>
    </div>
  );
}
