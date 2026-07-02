// Adaptation lab (docs/ADAPTATION.md) — where Mastery (experience) becomes SPECIALIZATION.
// Renders a unit's full mutation tree: four themed branch columns × ten tiers for a tower
// (three shared branches for a champion), forks as mutually exclusive side-by-side picks,
// campaign gate rails across the deep tiers, and keystone pips where the battlefield form
// evolves. Selecting any node opens the inspector: the mutation, its cost, every requirement
// (met/unmet), what it forsakes, the form change, and the Power contribution — the full
// preview BEFORE the point is spent. Pure presentation over meta.adaptation(); spends and
// the priced, stage-gated respec route through the meta layer (which owns every guard).
// A fresh unit has spent nothing ⇒ neutral effect ⇒ golden-safe by construction.

import { useState } from 'react';
import { meta } from '../../state/meta';
import type { AdaptView } from '../../state/meta';
import { ADAPT_BRANCH_META, HERO_ADAPT_BRANCHES, TOWER_ADAPT_BRANCHES, adaptStageGate } from '../../core/adaptation';
import { CurrencyIcon } from './CurrencyIcon';

type NodeView = AdaptView['nodes'][number];
/** Chip display state: owned / buyable / pickable-but-broke / campaign-gated / sealed-by-fork / tier-locked. */
type ChipState = 'own' | 'buy' | 'broke' | 'gate' | 'seal' | 'lock';

function chipState(nv: NodeView, view: AdaptView): ChipState {
  if (nv.chosen) return 'own';
  if (nv.canPick) return view.pointsAvailable > 0 ? 'buy' : 'broke';
  if (nv.node.exclusiveWith?.some((id) => view.chosen.includes(id))) return 'seal';
  if (!ladderMet(nv, view)) return 'lock';
  return 'gate'; // canPick false, ladder ok, not sealed ⇒ the campaign gate is what blocks it
}

/** Whether the tier ladder below this node is satisfied (a pick at tier−1 in its branch). */
function ladderMet(nv: NodeView, view: AdaptView): boolean {
  if (nv.node.tier <= 1) return true;
  return view.nodes.some((o) => o.node.branch === nv.node.branch && o.node.tier === nv.node.tier - 1 && o.chosen);
}

const STATE_MARK: Record<ChipState, string> = { own: '✓', buy: '+', broke: '·', gate: '🔒', seal: '⊘', lock: '·' };

/** The Adaptation lab: budget bar → branch-column tree → inspector. */
export function AdaptationTree({ subject, unit, color }: { subject: 'tower' | 'hero'; unit: string; color: string }): JSX.Element {
  const save = meta.use(); // re-render on spend / respec; carries the Genome Core balance
  const view = meta.adaptation(subject, unit);
  const [selId, setSelId] = useState<string | null>(null);

  const branches = (subject === 'tower' ? TOWER_ADAPT_BRANCHES : HERO_ADAPT_BRANCHES)
    .filter((b) => view.nodes.some((n) => n.node.branch === b));
  // Legacy shared picks (pre-per-tower saves) surface as an extra column until respecced.
  for (const nv of view.nodes) if (!branches.includes(nv.node.branch)) branches.push(nv.node.branch);
  const maxTier = Math.max(1, ...view.nodes.map((n) => n.node.tier));
  const tiers = Array.from({ length: maxTier }, (_, i) => i + 1);

  const sel = view.nodes.find((n) => n.node.id === selId) ?? null;
  const respec = view.respec;
  const canRespec = view.pointsSpent > 0 && !respec.gated && save.shards >= respec.cost;

  return (
    <div className="adapt" style={{ ['--accent' as string]: color }}>
      {/* ── Budget bar: the Antigen wallet, its provenance, the form stage, the respec ── */}
      <header className="adapt-bar">
        <span className="adapt-budget" title="Antigen — spent one per adaptation. Earned from Mastery Ranks, campaign depth, rare Bio-Container traces and achievements; never farmable from repeat runs.">
          <CurrencyIcon id="antigen" size={18} title="" />
          <b>{view.pointsAvailable}</b>
          <span className="adapt-budget-cap">Antigen{view.pointsSpent > 0 ? ` · ${view.pointsSpent} spent` : ''}</span>
        </span>
        <span className="adapt-sources">
          <span title="From this unit's Mastery Ranks (one per Rank — the slow, infinite engine)">◈ {view.sources.mastery}</span>
          <span title="From campaign depth (one per 15 stages cleared)">⚑ {view.sources.campaign}</span>
          <span title="Antigen Traces from Legendary+ Bio-Containers (lifetime-capped)">☣ {view.sources.containers}</span>
          <span title="From achievements (one per 5, capped)">✦ {view.sources.achievements}</span>
        </span>
        {subject === 'tower' && (
          <span className={`adapt-form is-f${view.visualTier}`} title="Battlefield form stage — keystone and apex adaptations physically evolve this strain's body on the field.">
            FORM {view.visualTier}/3
          </span>
        )}
        {view.pointsSpent > 0 && (
          <button
            className="adapt-respec"
            disabled={!canRespec}
            onClick={() => meta.respecAdaptation(subject, unit)}
            title={respec.gated
              ? `Identity rewrites unlock at campaign Stage ${respec.stageReq} (at ${view.campaignStage})`
              : `Refund every pick for ${respec.cost} Genome Cores (have ${save.shards})`}
          >
            ⟲ Respec · {respec.cost} <CurrencyIcon id="genomeCores" size={12} title="" />
          </button>
        )}
      </header>

      {view.pointsEarned === 0 ? (
        <p className="adapt-empty">
          Earn Antigen by raising this {subject === 'tower' ? 'strain' : 'champion'} to Mastery Rank 1 (Lv 25), clearing campaign stages,
          cracking Legendary Bio-Containers, or unlocking achievements — then rewrite its behavior here.
        </p>
      ) : (
        <div className="adapt-lab">
          {/* ── The tree: tier rows × branch columns, gate rails across the deep tiers ── */}
          <div className="adapt-canvas">
            <div className="adapt-row is-heads">
              {branches.map((b) => (
                <div className="adapt-col-head" key={b} style={{ ['--branch' as string]: ADAPT_BRANCH_META[b].color }}>
                  <span className="adapt-col-icon">{ADAPT_BRANCH_META[b].icon}</span>
                  <span className="adapt-col-name">{ADAPT_BRANCH_META[b].name}</span>
                </div>
              ))}
            </div>
            {tiers.map((tier) => {
              const gate = subject === 'tower' ? adaptStageGate(tier) : 0;
              const showRail = gate > 0 && adaptStageGate(tier - 1) !== gate; // first tier of a new gate band
              return (
                <div key={tier} className="adapt-tierblock">
                  {showRail && (
                    <div className={`adapt-gate ${view.campaignStage >= gate ? 'is-met' : ''}`}>
                      <span>{view.campaignStage >= gate ? '✓' : '🔒'} CAMPAIGN STAGE {gate}</span>
                    </div>
                  )}
                  <div className="adapt-row">
                    {branches.map((b) => {
                      const cell = view.nodes
                        .filter((n) => n.node.branch === b && n.node.tier === tier)
                        .sort((x, y) => x.node.id.localeCompare(y.node.id));
                      return (
                        <div className={`adapt-cell${cell.length > 1 ? ' is-fork' : ''}${tier > 1 ? ' has-spine' : ''}`} key={b} style={{ ['--branch' as string]: ADAPT_BRANCH_META[b].color }}>
                          {cell.map((nv, i) => {
                            const st = chipState(nv, view);
                            return (
                              <button
                                key={nv.node.id}
                                className={`adapt-node is-${st}${nv.node.id === selId ? ' is-sel' : ''}${nv.node.visualTier ? ' is-key' : ''}${i > 0 ? ' is-alt' : ''}`}
                                onClick={() => setSelId(nv.node.id === selId ? null : nv.node.id)}
                                title={nv.node.desc}
                              >
                                <span className="adapt-node-mark">{STATE_MARK[st]}</span>
                                <span className="adapt-node-name">{nv.node.name}</span>
                                {nv.node.visualTier ? <span className="adapt-node-key">◈{nv.node.visualTier}</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Inspector: the full preview before the point is spent ── */}
          <Inspector subject={subject} unit={unit} view={view} sel={sel} />
        </div>
      )}
    </div>
  );
}

function Inspector({ subject, unit, view, sel }: { subject: 'tower' | 'hero'; unit: string; view: AdaptView; sel: NodeView | null }): JSX.Element {
  if (!sel) {
    return (
      <aside className="adapt-inspect is-idle">
        <p>Select a mutation to preview its effect, cost, requirements and Power contribution before committing.</p>
        <p className="adapt-inspect-hint">Forked tiers are permanent either/or identities — the road not taken seals until a Respec.</p>
      </aside>
    );
  }
  const { node } = sel;
  const bm = ADAPT_BRANCH_META[node.branch];
  const st = chipState(sel, view);
  const ladder = ladderMet(sel, view);
  const gateMet = !node.campaignStage || view.campaignStage >= node.campaignStage;
  const siblings = (node.exclusiveWith ?? [])
    .map((id) => view.nodes.find((n) => n.node.id === id)?.node.name ?? id);
  const sealedBy = (node.exclusiveWith ?? []).filter((id) => view.chosen.includes(id))
    .map((id) => view.nodes.find((n) => n.node.id === id)?.node.name ?? id);
  const kindLabel = node.tier === 10 ? 'APEX' : node.visualTier ? 'KEYSTONE' : 'ADAPTATION';
  // Power contribution preview: score with this node hypothetically added. Behavioral picks
  // (pierce/range/rate) rewrite conduct rather than the damage index — surfaced honestly.
  const key = `${subject}:${unit}`;
  const dPower = sel.chosen ? 0 : meta.previewPower((s) => ({
    ...s, adaptation: { ...s.adaptation, [key]: [...view.chosen, node.id] },
  })).score - meta.power().score;

  return (
    <aside className="adapt-inspect" style={{ ['--branch' as string]: bm.color }}>
      <div className="adapt-inspect-main">
        <div className="adapt-inspect-kicker" style={{ color: bm.color }}>
          {bm.icon} {bm.name} · TIER {node.tier} {kindLabel}
        </div>
        <h4 className="adapt-inspect-name">{node.name}</h4>
        <p className="adapt-inspect-desc">{node.desc}</p>
        {node.visualTier ? (
          <div className="adapt-inspect-visual">◈ Battlefield form evolves to Stage {node.visualTier} — the strain visibly mutates.</div>
        ) : null}
        {sealedBy.length > 0 ? (
          <div className="adapt-inspect-fork is-sealed">⊘ Sealed — this strain chose {sealedBy.join(', ')}. Respec to rewrite its identity.</div>
        ) : siblings.length > 0 && !sel.chosen ? (
          <div className="adapt-inspect-fork">⊘ Either/or: adapting this permanently forsakes {siblings.join(', ')}.</div>
        ) : null}
      </div>
      <div className="adapt-inspect-side">
        {!sel.chosen && (
          <ul className="adapt-inspect-reqs">
            <li className={view.pointsAvailable > 0 ? 'is-met' : ''}>
              {view.pointsAvailable > 0 ? '✓' : '✗'} 1 Antigen <span>(have {view.pointsAvailable})</span>
            </li>
            {node.tier > 1 && (
              <li className={ladder ? 'is-met' : ''}>
                {ladder ? '✓' : '✗'} Tier {node.tier - 1} {bm.name} adaptation
              </li>
            )}
            {node.campaignStage ? (
              <li className={gateMet ? 'is-met' : ''}>
                {gateMet ? '✓' : '✗'} Campaign Stage {node.campaignStage} <span>(at {view.campaignStage})</span>
              </li>
            ) : null}
          </ul>
        )}
        <div className="adapt-inspect-power">
          {sel.chosen ? 'Active — shaping every run.' : dPower > 0 ? `Power +${dPower}` : 'Power unchanged — a behavioral rewrite.'}
        </div>
        <button
          className="adapt-inspect-buy"
          disabled={st !== 'buy'}
          onClick={() => meta.spendAdaptation(subject, unit, node.id)}
        >
          {sel.chosen ? '✓ ADAPTED' : st === 'buy' ? <>ADAPT · 1 <CurrencyIcon id="antigen" size={13} title="" /></> : st === 'broke' ? 'NO ANTIGEN FREE' : st === 'seal' ? 'SEALED' : st === 'gate' ? `STAGE ${node.campaignStage}` : 'LOCKED'}
        </button>
      </div>
    </aside>
  );
}
