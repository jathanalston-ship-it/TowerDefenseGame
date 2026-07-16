// WEEKLY DIRECTIVES home card (docs/LIVEOPS.md §directives) — the cumulative objective ladder:
// this week's three directives with live progress bars banked across every run, a claim button
// on each completed row, and the shared CAPSTONE that unlocks when the whole board is cleared.
// Deterministic UTC board (no server); progress folds at finishRun, rewards claim here.

import { useMemo, useState } from 'react';
import { meta } from '../../state/meta';
import { untilText, liveopsNow } from '../../core/liveops';
import { audio } from '../../audio/sound';
import { CurrencyIcon } from './CurrencyIcon';

function rewardChips(r: { cores?: number; essence?: number; container?: boolean }): JSX.Element {
  return (
    <span className="dir-reward">
      {r.cores ? <>+{r.cores} <CurrencyIcon id="genomeCores" size={10} title="Genome Cores" /></> : null}
      {r.essence ? <> · +{r.essence} <CurrencyIcon id="geneEssence" size={10} title="Gene Essence" /></> : null}
      {r.container ? <> · ⬢ Container</> : null}
    </span>
  );
}

export function DirectivesCard(): JSX.Element {
  meta.use();
  const [, bump] = useState(0);
  const v = meta.directivesView();
  const endsIn = useMemo(() => untilText(liveopsNow(), new Date(liveopsNow().getTime() + v.weekEndsInMs)), [v.weekEndsInMs]);
  // Claims present through the global claim popup (docs/NOTIFICATIONS.md §claim-popups) —
  // an itemized receipt naming the directive, so the grant is never a silent row-flip.
  const claim = (id: string): void => {
    const got = meta.claimDirective(id);
    if (!got) return;
    const capstone = id === '__capstone';
    audio.cue(capstone ? 'jackpot' : 'chest');
    bump((n) => n + 1);
  };
  const doneCount = v.directives.filter((d) => d.complete).length;

  return (
    <div className="dir panel" aria-label="Weekly Directives">
      <div className="liveops-head">
        <span className="liveops-k">❇ WEEKLY DIRECTIVES</span>
        <span className="liveops-next">{doneCount}/{v.directives.length} · resets {endsIn}</span>
      </div>

      {v.directives.map((d) => {
        const pct = Math.round((d.progress / d.target) * 100);
        return (
          <div className={`dir-row${d.complete ? ' is-complete' : ''}${d.claimed ? ' is-claimed' : ''}`} key={d.id}>
            <span className="dir-icon" aria-hidden>{d.icon}</span>
            <span className="dir-body">
              <span className="dir-name">{d.name}</span>
              <span className="dir-blurb">{d.blurb}</span>
              <span className="dir-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
            </span>
            <span className="dir-side">
              <span className="dir-count">{Math.min(d.progress, d.target).toLocaleString()}/{d.target.toLocaleString()}</span>
              {d.claimed
                ? <span className="dir-claimed">✓ Claimed</span>
                : d.complete
                  ? <button className="dir-claim" onClick={() => claim(d.id)}>Claim {rewardChips(d.reward)}</button>
                  : <span className="dir-pay">{rewardChips(d.reward)}</span>}
            </span>
          </div>
        );
      })}

      <div className={`dir-capstone${v.capstone.earned ? ' is-earned' : ''}${v.capstone.claimed ? ' is-claimed' : ''}`}>
        <span className="dir-cap-icon" aria-hidden>{v.capstone.reward.icon}</span>
        <span className="dir-cap-body">
          <span className="dir-cap-name">{v.capstone.reward.name}</span>
          <span className="dir-cap-hint">Clear all three directives to unlock the weekly mandate.</span>
        </span>
        {v.capstone.claimed
          ? <span className="dir-claimed">✓ Claimed</span>
          : v.capstone.earned
            ? <button className="dir-claim is-cap" onClick={() => claim('__capstone')}>Claim {rewardChips(v.capstone.reward)}</button>
            : <span className="dir-pay">{rewardChips(v.capstone.reward)}</span>}
      </div>
    </div>
  );
}
