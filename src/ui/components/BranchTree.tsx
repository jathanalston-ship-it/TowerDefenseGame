// The centerpiece of the Tower Inspect panel: a tower's MUTATION TREE (TOWER-BRANCHES.md).
// Each branch is a lane — a ladder of 5 tier nodes climbing from the base mutation to the
// signature transformation. Owned tiers are filled, the NEXT tier is the bright actionable
// node (cost + inline preview), future tiers are dim previews, and once a path is committed
// the other lane(s) collapse into a "locked out" bar. Rendered generically from the read-model
// (core/branchTree), so extra branches or longer ladders need no layout change. Pure display.

import type { BranchTreeView } from '../../core/branchTree';

/** Compact Biomass cost (600 → "600", 2800 → "2.8k", 160000 → "160k"). */
export function fmtCost(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
}

export function BranchTree({
  tree,
  accent,
  onBuyNext,
}: {
  tree: BranchTreeView;
  accent: string;
  onBuyNext: (branchId: string, tier: number) => void;
}): JSX.Element {
  return (
    <div className="mut-tree" role="group" aria-label="Mutation tree">
      {tree.lanes.map((lane) => {
        // A closed path collapses to a single greyed bar — it can never be bought again.
        if (lane.lockedOut) {
          return (
            <div className="mut-lane is-lockedout" key={lane.branchId}>
              <div className="mut-lane-h">
                <span className="mut-lane-name">{lane.name}</span>
                <span className="mut-lane-tag is-out">LOCKED OUT</span>
              </div>
            </div>
          );
        }
        return (
          <div className={`mut-lane${lane.committed ? ' is-committed' : ''}`} key={lane.branchId}>
            <div className="mut-lane-h">
              <span className="mut-lane-name" style={lane.committed ? { color: accent } : undefined}>
                {lane.name}
              </span>
              {lane.committed ? (
                <span className="mut-lane-tag" style={{ background: accent }}>
                  PATH · T{lane.owned}/{lane.tiers.length}
                </span>
              ) : (
                <span className="mut-lane-tag is-choose">CHOOSE</span>
              )}
            </div>
            {!lane.committed && <p className="mut-lane-theme">{lane.theme}</p>}
            <div className="mut-ladder">
              {lane.tiers.map((t) => {
                const tierPip = (
                  <span
                    className="mut-pip"
                    aria-hidden
                    style={
                      t.state === 'owned'
                        ? { background: accent, borderColor: accent, color: '#0a0e14' }
                        : t.state === 'next'
                          ? { borderColor: accent, color: accent }
                          : undefined
                    }
                  >
                    {t.tier}
                  </span>
                );
                const body = (
                  <span className="mut-node-body">
                    <span className="mut-node-top">
                      <span className="mut-node-name">{t.name}</span>
                      {t.state === 'owned' && <span className="mut-node-have" aria-label="owned" style={{ color: accent }}>✓</span>}
                      {(t.state === 'next' || t.state === 'future') && (
                        <span className={`mut-node-cost${t.state === 'next' && !t.affordable ? ' is-poor' : ''}`}>{fmtCost(t.cost)} ⬡</span>
                      )}
                    </span>
                    {/* The upcoming-tier preview reads its full effect inline; future tiers stay terse. */}
                    {t.state === 'next' && <span className="mut-node-desc">{t.desc}</span>}
                  </span>
                );

                if (t.state === 'next') {
                  return (
                    <button
                      key={t.tier}
                      className={`mut-node is-next${t.affordable ? '' : ' is-poor'}`}
                      style={{ borderColor: accent }}
                      disabled={!t.affordable}
                      title={t.desc}
                      onClick={() => onBuyNext(lane.branchId, t.tier)}
                    >
                      {tierPip}
                      {body}
                    </button>
                  );
                }
                return (
                  <div key={t.tier} className={`mut-node is-${t.state}`} title={t.desc}>
                    {tierPip}
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
