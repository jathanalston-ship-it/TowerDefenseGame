import { meta } from '../state/meta';
import type { RunResult, RunReward } from '../state/meta';
import { CountUp } from './components/CountUp';
import { Icon } from './components/Icon';

function Stat({ label, value, animate }: { label: string; value: number; animate?: boolean }): JSX.Element {
  return (
    <div className="record">
      <div className="k">{label}</div>
      {animate ? <CountUp className="v" value={value} animateFrom={0} duration={600} /> : <div className="v">{value}</div>}
    </div>
  );
}

export function Results({
  result,
  reward,
  onContinue,
}: {
  result: RunResult;
  reward: RunReward;
  onContinue: () => void;
}): JSX.Element {
  const save = meta.get();

  // Per-mode title + outcome class.
  let title: string;
  if (result.mode === 'stage') title = result.won ? 'STAGE CLEARED' : 'STAGE FAILED';
  else if (result.mode === 'endless') title = 'OVERRUN';
  else title = result.won ? 'EXTRACTION COMPLETE' : 'NUCLEUS LOST';

  return (
    <div className="menu" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className={`result-big ${result.won ? 'win' : 'lose'}`}>{title}</div>
      <div className="panel" style={{ width: 'min(520px, 92vw)' }}>
        <div className="records" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {result.mode === 'stage' && <Stat label="Stage" value={result.stageNumber} />}
          <Stat label={result.mode === 'endless' ? 'Wave Survived' : 'Wave Reached'} value={result.wave} animate />
          {result.mode === 'endless' && <Stat label="Score" value={result.score} animate />}
          <Stat label="Kills" value={result.kills} animate />
        </div>

        {result.mode === 'stage' && result.objectiveDone && (
          <div className="reward" style={{ marginTop: 14, fontSize: 15 }}>
            <span style={{ color: 'var(--success)' }}>✓ Objective complete</span>
            <span style={{ color: 'var(--muted)' }}> · +{Math.round(result.objectiveBonus * 100)}% reward</span>
          </div>
        )}
        {result.mode === 'endless' && (
          <div className="reward" style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>
            Best score <b style={{ color: 'var(--gold)' }}>{save.bestEndlessScore}</b> · best wave {save.bestEndlessWave}
          </div>
        )}

        <div className="reward" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          Banked
          <b style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <CountUp value={reward.shardsEarned} animateFrom={0} duration={700} />
            <Icon name="diamond" size={15} />
          </b>
          Shards
          {reward.newBest && <span style={{ color: 'var(--caustic)' }}> · New best!</span>}
        </div>
      </div>
      <button className="primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
