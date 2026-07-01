// Adaptation tree (docs/PROGRESSION-REDESIGN §2) — the UI where mastery becomes a DECISION. Every
// mastery Rank pays one Antigen Point; the player spends it into one of three branches (Virulence /
// Resilience / Contagion). Shared by Tower Lab and Hero Lab — a strain and a champion read the same
// three-branch shape, only the nodes differ (core/adaptation authors them per subject). Pure
// presentation over meta.adaptation(); spend/respec route through the meta layer (which guards the
// point budget + tier gating). A fresh unit has spent nothing ⇒ the tree is all "pickable", nothing
// folded — golden-safe by construction.

import { meta } from '../../state/meta';
import { ADAPT_BRANCHES, ADAPT_BRANCH_META } from '../../core/adaptation';

/** One branch column: its tier-ordered nodes as owned / pickable / locked chips. */
export function AdaptationTree({ subject, unit, color }: { subject: 'tower' | 'hero'; unit: string; color: string }): JSX.Element {
  meta.use(); // re-render on spend / respec
  const view = meta.adaptation(subject, unit);
  const noPoints = view.pointsAvailable <= 0;

  return (
    <div className="adapt" style={{ ['--accent' as string]: color }}>
      <div className="adapt-head">
        <span className="adapt-points" title="Antigen Points — one per Mastery Rank (every 25 levels)">
          <b>{view.pointsAvailable}</b> Antigen {view.pointsAvailable === 1 ? 'Point' : 'Points'}
          {view.pointsSpent > 0 && <span className="adapt-spent"> · {view.pointsSpent} spent</span>}
        </span>
        {view.pointsSpent > 0 && (
          <button className="adapt-respec" onClick={() => meta.respecAdaptation(subject, unit)} title="Refund every pick (free, out of combat)">
            ⟲ Respec
          </button>
        )}
      </div>
      {view.pointsEarned === 0 ? (
        <p className="adapt-empty">Earn Antigen Points by raising this {subject === 'tower' ? 'strain' : 'champion'} to Mastery Rank 1 (Lv 25). Then adapt it down a branch.</p>
      ) : (
        <div className="adapt-branches">
          {ADAPT_BRANCHES.map((branch) => {
            const bm = ADAPT_BRANCH_META[branch];
            const nodes = view.nodes.filter((n) => n.node.branch === branch).sort((a, b) => a.node.tier - b.node.tier);
            return (
              <div className="adapt-branch" key={branch} style={{ ['--branch' as string]: bm.color }}>
                <div className="adapt-branch-head" style={{ color: bm.color }}>{bm.name}</div>
                <div className="adapt-branch-blurb">{bm.blurb}</div>
                <div className="adapt-nodes">
                  {nodes.map(({ node, chosen, canPick }) => {
                    const buyable = !chosen && canPick && !noPoints;
                    const state = chosen ? 'own' : canPick ? (noPoints ? 'ready' : 'buy') : 'lock';
                    return (
                      <button
                        key={node.id}
                        className={`adapt-node is-${state}`}
                        disabled={!buyable}
                        onClick={() => buyable && meta.spendAdaptation(subject, unit, node.id)}
                        title={chosen ? `Adapted: ${node.desc}` : canPick ? (noPoints ? `Costs 1 Antigen Point (none free) — ${node.desc}` : `Spend 1 Antigen Point — ${node.desc}`) : `Unlocks after a Tier ${node.tier - 1} ${bm.name} adaptation`}
                      >
                        <span className="adapt-node-mark">{chosen ? '✓' : canPick ? '+' : '🔒'}</span>
                        <span className="adapt-node-body">
                          <span className="adapt-node-name">{node.name}</span>
                          <span className="adapt-node-desc">{node.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
