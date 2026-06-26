import type { RunOutcome, RunResult } from '../state/meta';
import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { LootReveal } from './LootReveal';
import { ShardIcon } from './components/Icon';

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

  return (
    <div className="menu" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className={`result-big ${result.won ? 'win' : 'lose'}`}>
        {result.won ? 'EXTRACTION COMPLETE' : 'NUCLEUS LOST'}
      </div>

      <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
        <div className="records" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="record">
            <div className="k">Wave Reached</div>
            <div className="v">{result.wave}</div>
          </div>
          <div className="record">
            <div className="k">Kills</div>
            <div className="v">{result.kills}</div>
          </div>
        </div>
        <div className="reward" style={{ marginTop: 16 }}>
          Banked <b>{outcome.reward.shardsEarned} <ShardIcon /></b> Shards
          {outcome.reward.newBest && <span style={{ color: 'var(--caustic)' }}> · New best wave!</span>}
        </div>
      </div>

      <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
        <LootReveal chest={outcome.chest} />
      </div>

      {masteryGains.length > 0 && (
        <div className="panel" style={{ width: 'min(480px, 92vw)' }}>
          <div className="panel-title">Mastery Gained</div>
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

      <button className="primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
