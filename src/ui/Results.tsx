import type { RunResult, RunReward } from '../state/meta';

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
            <div className="v">{result.wave}</div>
          </div>
          <div className="record">
            <div className="k">Kills</div>
            <div className="v">{result.kills}</div>
          </div>
        </div>
        <div className="reward" style={{ marginTop: 16 }}>
          Banked <b>{reward.shardsEarned} ◆</b> Shards
          {reward.newBest && <span style={{ color: 'var(--caustic)' }}> · New best wave!</span>}
        </div>
      </div>
      <button className="primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
