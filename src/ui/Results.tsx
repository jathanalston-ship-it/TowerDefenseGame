import type { RunResult, RunReward } from '../state/meta';
import { CountUp } from './components/CountUp';

export function Results({
  result,
  reward,
  onContinue,
}: {
  result: RunResult;
  reward: RunReward;
  onContinue: () => void;
}): JSX.Element {
  return (
    <div className="menu" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className={`result-big ${result.won ? 'win' : 'lose'}`}>
        {result.won ? 'EXTRACTION COMPLETE' : 'NUCLEUS LOST'}
      </div>
      <div className="panel" style={{ width: 'min(480px, 90vw)' }}>
        <div className="records" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <div className="record">
            <div className="k">Wave Reached</div>
            <CountUp className="v" value={result.wave} animateFrom={0} duration={500} />
          </div>
          <div className="record">
            <div className="k">Kills</div>
            <CountUp className="v" value={result.kills} animateFrom={0} duration={650} />
          </div>
        </div>
        <div className="reward" style={{ marginTop: 16 }}>
          Banked{' '}
          <b>
            <CountUp value={reward.shardsEarned} animateFrom={0} duration={700} /> ◆
          </b>{' '}
          Shards
          {reward.newBest && <span style={{ color: 'var(--caustic)' }}> · New best wave!</span>}
        </div>
      </div>
      <button className="primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
