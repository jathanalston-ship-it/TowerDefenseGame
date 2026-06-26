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

function RewardChip({ label, value, color }: { label: string; value: number; color: string }): JSX.Element {
  return (
    <span className="reward-chip" style={{ color }}>
      <Icon name="diamond" size={13} />
      <b><CountUp value={value} animateFrom={0} duration={700} /></b> {label}
    </span>
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

        <div className="reward-row">
          {reward.shards > 0 && <RewardChip label="Shards" value={reward.shards} color="var(--gold)" />}
          {reward.components > 0 && <RewardChip label="Components" value={reward.components} color="var(--r-common)" />}
          {reward.essence > 0 && <RewardChip label="Essence" value={reward.essence} color="var(--neural)" />}
          {reward.catalyst > 0 && <RewardChip label="Catalyst" value={reward.catalyst} color="var(--viral)" />}
          {reward.newBest && <span className="new-best">★ New best!</span>}
        </div>

        {(reward.newAchievements.length > 0 || reward.newTitle) && (
          <div className="unlock-row">
            {reward.newAchievements.map((name) => (
              <div className="unlock" key={name}>
                <span className="unlock-mark">✦</span> Achievement: <b>{name}</b>
              </div>
            ))}
            {reward.newTitle && (
              <div className="unlock unlock-title">
                <span className="unlock-mark">⟡</span> Title earned: <b>“{reward.newTitle}”</b>
              </div>
            )}
          </div>
        )}
      </div>
      <button className="primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
