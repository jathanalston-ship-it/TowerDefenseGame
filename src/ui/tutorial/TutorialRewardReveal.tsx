// One-time payout reveal primitives. `RewardRows` renders a TutorialRewardSummary's grant list +
// Power delta (shared by the Commissioning ceremony's GRADUATION step — THE onboarding reward
// moment — and the legacy Hud Tour remainder); `TutorialRewardReveal` is the standalone overlay
// the Hud Tour shows ONLY for a pre-merge save still owed the old tour grant (docs/TUTORIAL.md
// §graduation; the tutorial's own completion goes through the full Commissioning instead).

import { formatPower } from '../../core/power';
import { CurrencyIcon } from '../components/CurrencyIcon';
import type { TutorialRewardSummary } from '../../state/meta';
import './TutorialRewardReveal.css';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function RewardRows({ reward }: { reward: TutorialRewardSummary }): JSX.Element {
  const rows: { icon: JSX.Element | string; label: string; v: string }[] = [
    { icon: <CurrencyIcon id="genomeCores" size={15} title="" />, label: 'Genome Cores', v: `+${reward.cores}` },
    { icon: '✦', label: 'Strain Samples · each tower', v: `+${reward.towerShards}` },
    { icon: '✦', label: 'Apex Genome', v: `+${reward.heroShards}` },
    { icon: '◈', label: `Tutorial Bio-Container${reward.containers > 1 ? 's' : ''}`, v: `${reward.containers > 1 ? `${reward.containers}× ` : ''}${cap(reward.containerRarity)} · in the Vault` },
    { icon: '⚔', label: 'Hero Equipment', v: `${reward.items > 1 ? `${reward.items}× ` : ''}${reward.itemName}` },
  ];
  if (reward.achievement) rows.push({ icon: '🏆', label: 'Achievement', v: reward.achievement });
  return (
    <>
      <div className="tut-reward-rows">
        {rows.map((r) => (
          <div className="tut-reward-row" key={r.label}>
            <span className="trr-icon" aria-hidden>{r.icon}</span>
            <span className="trr-label">{r.label}</span>
            <span className="trr-v">{r.v}</span>
          </div>
        ))}
      </div>
      {/* Only a real gain is celebrated — an unchanged "1,005 → 1,005" read as a broken payout
          (the grants are spendables: their Power lands when they're invested). */}
      {reward.powerAfter > reward.powerBefore && (
        <div className="tut-reward-power">Power Score&nbsp; <b>{formatPower(reward.powerBefore)} → {formatPower(reward.powerAfter)}</b></div>
      )}
    </>
  );
}

export function TutorialRewardReveal({ reward, onClose }: { reward: TutorialRewardSummary; onClose: () => void }): JSX.Element {
  return (
    <div className="tut-reward" role="dialog" aria-label="Tutorial Complete" onClick={onClose}>
      <div className="evo-rays" aria-hidden />
      <div className="tut-reward-card" onClick={(e) => e.stopPropagation()}>
        <div className="tut-reward-badge">◈ ORIENTATION COMPLETE ◈</div>
        <h2 className="tut-reward-title">Assimilation Protocol</h2>
        <p className="tut-reward-sub">
          Your starter payout — and from here, <b>Mission Control</b> on the Command Center always
          holds your next objective. You never have to guess.
        </p>
        <RewardRows reward={reward} />
        <button className="primary tut-reward-go" onClick={onClose}>To Mission Control ▸</button>
      </div>
    </div>
  );
}
