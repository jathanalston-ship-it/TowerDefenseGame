// Tutorial completion reward reveal (docs/TUTORIAL.md) — the celebratory payout shown once the
// Combat Tutorial is finished for the FIRST time. Lists the one-time grants + the visible Power
// Score increase, then hands the player into the Hive with a starter progression loop ready.

import { formatPower } from '../../core/power';
import { CurrencyIcon } from '../components/CurrencyIcon';
import type { TutorialRewardSummary } from '../../state/meta';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function TutorialRewardReveal({ reward, onClose }: { reward: TutorialRewardSummary; onClose: () => void }): JSX.Element {
  const rows: { icon: JSX.Element | string; label: string; v: string }[] = [
    { icon: <CurrencyIcon id="genomeCores" size={15} title="" />, label: 'Genome Cores', v: `+${reward.cores}` },
    { icon: '✦', label: 'Strain Samples · each tower', v: `+${reward.towerShards}` },
    { icon: '✦', label: 'Apex Genome', v: `+${reward.heroShards}` },
    { icon: '◈', label: 'Tutorial Bio-Container', v: `${cap(reward.containerRarity)} · in the Vault` },
    { icon: '⚔', label: 'Hero Equipment', v: reward.itemName },
  ];
  if (reward.achievement) rows.push({ icon: '🏆', label: 'Achievement', v: reward.achievement });

  return (
    <div className="tut-reward" role="dialog" aria-label="Tutorial Complete" onClick={onClose}>
      <div className="evo-rays" aria-hidden />
      <div className="tut-reward-card" onClick={(e) => e.stopPropagation()}>
        <div className="tut-reward-badge">◈ TUTORIAL COMPLETE ◈</div>
        <h2 className="tut-reward-title">Assimilation Protocol</h2>
        <p className="tut-reward-sub">Your first progression loop is ready — here is your starter payout.</p>
        <div className="tut-reward-rows">
          {rows.map((r) => (
            <div className="tut-reward-row" key={r.label}>
              <span className="trr-icon" aria-hidden>{r.icon}</span>
              <span className="trr-label">{r.label}</span>
              <span className="trr-v">{r.v}</span>
            </div>
          ))}
        </div>
        <div className="tut-reward-power">Power Score&nbsp; <b>{formatPower(reward.powerBefore)} → {formatPower(reward.powerAfter)}</b></div>
        <button className="primary tut-reward-go" onClick={onClose}>Enter the Hive ▸</button>
      </div>
    </div>
  );
}
