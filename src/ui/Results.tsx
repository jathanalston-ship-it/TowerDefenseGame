import { useEffect, useState } from 'react';
import type { RunOutcome, RunResult } from '../state/meta';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { itemDef } from '../core/equipment';
import { LootReveal } from './LootReveal';
import { ShardIcon } from './components/Icon';

/** Ease a number from 0 → target so banked rewards "tick up" satisfyingly. */
function useCountUp(target: number, ms = 700): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setN(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3)))); // easeOutCubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

export function Results({
  result,
  outcome,
  onContinue,
}: {
  result: RunResult;
  outcome: RunOutcome;
  onContinue: () => void;
}): JSX.Element {
  const masteryGains = TOWER_ORDER.filter((k) => outcome.mastery[k].xpGained > 0);
  const heroMasteryGains = HERO_ORDER.filter((k) => outcome.heroMastery[k].xpGained > 0);
  const shards = useCountUp(outcome.reward.shardsEarned);

  return (
    <div className="menu" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className={`result-big ${result.won ? 'win' : 'lose'}`}>
        {result.endless
          ? `DEPTH ${result.wave} REACHED`
          : result.won
            ? 'EXTRACTION COMPLETE'
            : 'NUCLEUS LOST'}
      </div>

      <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
        <div className="records" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="record">
            <div className="k">{result.endless ? 'Depth Reached' : 'Wave Reached'}</div>
            <div className="v">{result.wave}</div>
          </div>
          <div className="record">
            <div className="k">Kills</div>
            <div className="v">{result.kills}</div>
          </div>
        </div>
        <div className="reward" style={{ marginTop: 16 }}>
          Banked <b>{shards} <ShardIcon /></b> Shards
          {outcome.reward.newBest && <span style={{ color: 'var(--caustic)' }}> · New best wave!</span>}
        </div>
      </div>

      <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
        <LootReveal chest={outcome.chest} />
      </div>

      {(() => {
        const def = itemDef(outcome.gear.defId);
        if (!def) return null;
        const tone =
          outcome.gear.rarity === 'exotic'
            ? 'var(--viral)'
            : outcome.gear.rarity === 'legendary'
              ? 'var(--r-legendary)'
              : outcome.gear.rarity === 'epic'
                ? 'var(--r-epic)'
                : outcome.gear.rarity === 'rare'
                  ? 'var(--r-rare)'
                  : 'var(--r-common)';
        return (
          <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
            <div className="panel-title">Gear Drop</div>
            <div className="gear-drop">
              <span className="equip-dot" style={{ background: tone, boxShadow: `0 0 8px ${tone}` }} />
              <span className="gear-drop-info">
                <span style={{ color: tone, fontWeight: 700 }}>
                  {def.name} <span style={{ textTransform: 'uppercase', fontSize: 10 }}>{outcome.gear.rarity}</span>
                </span>
                <span className="equip-desc">{def.desc}</span>
              </span>
            </div>
          </div>
        );
      })()}

      {masteryGains.length > 0 && (
        <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
          <div className="panel-title">Tower Mastery Gained</div>
          <div className="mastery-gains">
            {masteryGains.map((k) => {
              const m = outcome.mastery[k];
              const leveled = m.toLevel > m.fromLevel;
              return (
                <div className="mastery-gain" key={k}>
                  <span className="mg-name" style={{ color: TOWER_DEFS[k].color }}>
                    {TOWER_DEFS[k].name}
                  </span>
                  <span className="mg-xp">+{m.xpGained} XP</span>
                  <span className={`mg-lvl ${leveled ? 'is-up' : ''}`}>
                    {leveled ? `Lv ${m.fromLevel} → ${m.toLevel}` : `Lv ${m.toLevel}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {heroMasteryGains.length > 0 && (
        <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
          <div className="panel-title">Hero Mastery Gained</div>
          <div className="mastery-gains">
            {heroMasteryGains.map((k) => {
              const m = outcome.heroMastery[k];
              const leveled = m.toLevel > m.fromLevel;
              return (
                <div className="mastery-gain" key={k}>
                  <span className="mg-name" style={{ color: HERO_DEFS[k].color }}>
                    {HERO_DEFS[k].name}
                  </span>
                  <span className="mg-xp">+{m.xpGained} XP</span>
                  <span className={`mg-lvl ${leveled ? 'is-up' : ''}`}>
                    {leveled ? `Lv ${m.fromLevel} → ${m.toLevel}` : `Lv ${m.toLevel}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button className="primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
