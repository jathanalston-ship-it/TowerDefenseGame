// Champion Contracts home card (docs/CONTRACTS.md) — this week's three-contract board:
// difficulty pips, mode scope, per-constraint term chips, payouts (cores + Account XP;
// ❖ names the Gilded marquee), the weekly rotation countdown, and the PERFECT WEEK
// sweep meter. Deterministic UTC board — no server.

import { useEffect, useState } from 'react';
import { meta } from '../../state/meta';
import {
  MODE_LABEL, PERFECT_WEEK, activeContracts, constraintLabel, contractRotationEnd, contractWeekKey,
} from '../../core/contracts';
import { ACCOUNT_XP } from '../../core/accountLevel';
import { liveopsNow, untilText } from '../../core/liveops';
import { cosmeticRegistry } from '../../core/cosmetics';
import { CurrencyIcon } from './CurrencyIcon';

export function ContractsCard(): JSX.Element {
  const save = meta.use();
  const [now, setNow] = useState(liveopsNow);
  useEffect(() => {
    const refresh = (): void => { if (!document.hidden) setNow(liveopsNow()); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const wk = contractWeekKey(now);
  const rows = activeContracts(now);
  const done = new Set(save.contracts.completed);
  const hits = rows.filter((c) => done.has(`${wk}:${c.id}`)).length;
  const swept = hits === rows.length;
  return (
    <div className="cc-contracts panel" aria-label="Champion Contracts">
      <div className="liveops-head">
        <span className="liveops-k">❖ CHAMPION CONTRACTS</span>
        <span className="liveops-next">rotates in {untilText(now, contractRotationEnd(now))}</span>
      </div>
      {rows.map((c) => {
        const hit = done.has(`${wk}:${c.id}`);
        const marquee = c.reward.cosmetic ? cosmeticRegistry.get(c.reward.cosmetic) : null;
        return (
          <div className={`cc-contract${hit ? ' is-done' : ''}${c.reward.cosmetic ? ' is-marquee' : ''}`} key={c.id}>
            <span className="cc-contract-top">
              <span className={`cc-contract-name${hit ? ' done' : ''}`}>{hit ? '✓ ' : ''}{c.name}</span>
              <span className="cc-contract-diff" title={`Difficulty ${c.difficulty}/3`} aria-label={`Difficulty ${c.difficulty} of 3`}>
                {'◆'.repeat(c.difficulty)}{'◇'.repeat(3 - c.difficulty)}
              </span>
              {c.mode !== 'any' && <span className="cc-contract-mode">{MODE_LABEL[c.mode]}</span>}
            </span>
            <span className="cc-contract-blurb">{c.blurb}</span>
            <span className="cc-contract-terms">
              {c.constraints.map((k, i) => <i key={i}>{constraintLabel(k)}</i>)}
            </span>
            <span className="cc-contract-pay">
              +{c.reward.cores} <CurrencyIcon id="genomeCores" size={10} title="Genome Cores" />
              <span className="cc-contract-xp">+{ACCOUNT_XP.contract} XP</span>
              {marquee && <b className="cc-contract-marquee">❖ {marquee.name}</b>}
            </span>
          </div>
        );
      })}
      {/* Perfect Week (docs/CONTRACTS.md §perfect-week): sweep the board for the bonus. */}
      <div className={`cc-sweep${swept ? ' is-swept' : ''}`} role="status">
        <span className="cc-sweep-pips" aria-hidden>
          {rows.map((c) => <i key={c.id} className={done.has(`${wk}:${c.id}`) ? 'on' : ''} />)}
        </span>
        <span className="cc-sweep-label">
          {swept
            ? 'PERFECT WEEK — the board is swept'
            : <>Perfect Week — sweep all three: +{PERFECT_WEEK.cores} <CurrencyIcon id="genomeCores" size={10} title="Genome Cores" /> +{ACCOUNT_XP.perfectWeek} XP</>}
        </span>
        {save.contracts.perfectWeeks > 0 && (
          <span className="cc-sweep-life" title="Lifetime Perfect Weeks">×{save.contracts.perfectWeeks}</span>
        )}
      </div>
    </div>
  );
}
