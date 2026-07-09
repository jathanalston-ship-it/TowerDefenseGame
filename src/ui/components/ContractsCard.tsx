// Champion Contracts home card (docs/CONTRACTS.md) — this week's three-contract board:
// live constraint pitches, completion state from the save ledger, and the payouts
// (cores; ❖ marks a Gilded-phenotype marquee). Deterministic UTC board — no server.

import { meta } from '../../state/meta';
import { activeContracts, contractWeekKey } from '../../core/contracts';
import { CurrencyIcon } from './CurrencyIcon';

export function ContractsCard(): JSX.Element {
  const save = meta.use();
  const wk = contractWeekKey();
  const rows = activeContracts();
  const done = new Set(save.contracts.completed);
  return (
    <div className="cc-contracts panel" aria-label="Champion Contracts">
      <div className="liveops-head">
        <span className="liveops-k">❖ CHAMPION CONTRACTS</span>
        <span className="liveops-next">rotates weekly</span>
      </div>
      {rows.map((c) => {
        const hit = done.has(`${wk}:${c.id}`);
        return (
          <div className="cc-contract" key={c.id}>
            <span className={`cc-contract-name${hit ? ' done' : ''}`}>{hit ? '✓ ' : ''}{c.name}</span>
            <span className="cc-contract-blurb">{c.blurb}</span>
            <span className="cc-contract-pay">
              +{c.reward.cores} <CurrencyIcon id="genomeCores" size={10} title="Genome Cores" />
              {c.reward.cosmetic ? ' · ❖' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
