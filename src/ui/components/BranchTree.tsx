// The centerpiece of the Tower Inspect panel: a tower's MUTATION TREE (TOWER-BRANCHES.md §3).
// COMPACT by design — the old layout stacked all ten tier rows into a ladder and buried the
// buy button below the fold of a 200px sidebar. Each branch is now a lane CARD: a horizontal
// five-pip tier TRACK (owned / next / future at a glance) plus ONE detail card for the
// SELECTED tier — its description, cost, projected stat changes, and the buy/splice button.
// Tap any pip to preview that tier without scrolling; the selection defaults to the buyable
// tier so the next action is always in hand. A committed path pins its lane; the other
// lane(s) collapse into a "locked out" bar. Rendered generically from the read-model
// (core/branchTree), so extra branches or longer ladders need no layout change. Pure display.

import { useState } from 'react';
import { branchStatsView } from '../../core/branchTree';
import type { BranchLaneView, BranchTreeView, TierNodeView } from '../../core/branchTree';
import type { TowerKind } from '../../core/types';

/** Compact Biomass cost (600 → "600", 2800 → "2.8k", 160000 → "160k"). */
export function fmtCost(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
}

/** What buying up to `tier` on this lane would change vs. the tower's CURRENT fold — only the
 *  dimensions that move, as "now → then" chips. Pure preview over branchStatsView. */
function statDeltas(
  kind: TowerKind,
  committedId: string | null,
  currentTier: number,
  branchId: string,
  tier: number,
): string[] {
  const cur = branchStatsView(kind, committedId, currentTier);
  const at = branchStatsView(kind, branchId, tier);
  const out: string[] = [];
  if (cur.dps !== null && at.dps !== null && at.dps !== cur.dps) out.push(`DPS ~${cur.dps} → ~${at.dps}`);
  if (at.range !== cur.range) out.push(`Range ${cur.range} → ${at.range}`);
  if (cur.rate !== null && at.rate !== null && at.rate.toFixed(1) !== cur.rate.toFixed(1)) {
    out.push(`${cur.rate.toFixed(1)} → ${at.rate.toFixed(1)}/s`);
  }
  if (at.splash !== cur.splash) out.push(`Splash ${cur.splash} → ${at.splash}`);
  if (at.shots !== cur.shots) out.push(`Targets ×${cur.shots} → ×${at.shots}`);
  return out.slice(0, 3);
}

function TierDetail({ lane, t, kind, committedId, currentTier, accent, onBuy }: {
  lane: BranchLaneView;
  t: TierNodeView;
  kind: TowerKind;
  committedId: string | null;
  currentTier: number;
  accent: string;
  onBuy: () => void;
}): JSX.Element {
  // Owned tiers already sit inside the current fold — a delta only means something forward.
  const deltas = t.state === 'owned' ? [] : statDeltas(kind, committedId, currentTier, lane.branchId, t.tier);
  return (
    <div className="mut-detail">
      <div className="mut-detail-top">
        <span className="mut-detail-name">T{t.tier} · {t.name}</span>
        {t.state === 'owned' && <span className="mut-detail-owned" style={{ color: accent }}>✓ active</span>}
        {(t.state === 'next' || t.state === 'future') && (
          <span className={`mut-node-cost${t.state === 'next' && !t.affordable ? ' is-poor' : ''}`}>{fmtCost(t.cost)} ⬡</span>
        )}
      </div>
      <p className="mut-detail-desc">{t.desc}</p>
      {deltas.length > 0 && (
        <div className="mut-detail-delta" aria-label="Projected change">
          {deltas.map((d) => <span key={d}>{d}</span>)}
        </div>
      )}
      {t.state === 'next' && (
        <button
          className="mut-buy"
          style={{ borderColor: accent }}
          disabled={!t.affordable}
          title={t.affordable
            ? (t.tier === 1 ? 'Buying Tier 1 locks this tower to this path for the run' : `Evolve to ${t.name}`)
            : `Not enough Biomass — needs ${fmtCost(t.cost)}`}
          onClick={onBuy}
        >
          {t.tier === 1 ? 'Splice this path' : 'Evolve'} · {fmtCost(t.cost)} ⬡
        </button>
      )}
      {t.state === 'future' && <span className="mut-detail-req">Unlocks after Tier {t.tier - 1}</span>}
      {t.state === 'owned' && t.tier === lane.tiers.length && lane.owned === lane.tiers.length && (
        <span className="mut-detail-req is-apex">PATH COMPLETE — the signature form</span>
      )}
    </div>
  );
}

export function BranchTree({
  tree,
  kind,
  accent,
  onBuyNext,
}: {
  tree: BranchTreeView;
  kind: TowerKind;
  accent: string;
  onBuyNext: (branchId: string, tier: number) => void;
}): JSX.Element {
  // Which tier each lane is PREVIEWING (pip taps); undefined → follow the buyable tier.
  const [selByLane, setSelByLane] = useState<Record<string, number | undefined>>({});
  // Pre-lock, only the FOCUSED lane opens its detail card — both headers, themes and pip
  // tracks stay visible for the comparison, and the whole choice fits without scrolling.
  const [focusLane, setFocusLane] = useState<string | null>(null);
  const currentTier = tree.lanes.find((l) => l.committed)?.owned ?? 0;
  const focusedId = tree.committedId ?? focusLane ?? tree.lanes.find((l) => !l.lockedOut)?.branchId ?? null;

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
        const selTier = selByLane[lane.branchId] ?? lane.next?.tier ?? lane.tiers.length;
        const sel = lane.tiers[selTier - 1] ?? lane.tiers[lane.tiers.length - 1];
        const focused = lane.branchId === focusedId;
        return (
          <div
            className={`mut-lane${lane.committed ? ' is-committed' : ''}${focused && !lane.committed ? ' is-focus' : ''}`}
            key={lane.branchId}
            onClick={focused ? undefined : () => setFocusLane(lane.branchId)}
          >
            <div className="mut-lane-h">
              <span className="mut-lane-name" style={lane.committed ? { color: accent } : undefined}>
                {lane.name}
              </span>
              {lane.committed ? (
                <span className="mut-lane-tag" style={{ background: accent }}>
                  PATH · T{lane.owned}/{lane.tiers.length}
                </span>
              ) : (
                <span className="mut-lane-tag is-choose">{focused ? 'CHOOSE' : 'COMPARE'}</span>
              )}
            </div>
            {!lane.committed && <p className="mut-lane-theme">{lane.theme}</p>}
            {/* The tier track — the whole ladder in one glance-able row. */}
            <div className="mut-track" role="group" aria-label={`${lane.name} tiers`}>
              {lane.tiers.map((t) => (
                <button
                  key={t.tier}
                  className={`mut-tpip is-${t.state}${focused && t.tier === sel.tier ? ' is-sel' : ''}`}
                  style={
                    t.state === 'owned'
                      ? { background: accent, borderColor: accent, color: 'var(--panel-deep)' }
                      : t.state === 'next'
                        ? { borderColor: accent, color: accent }
                        : undefined
                  }
                  aria-label={`Tier ${t.tier} — ${t.name} (${t.state === 'owned' ? 'active' : t.state === 'next' ? `buy for ${fmtCost(t.cost)} biomass` : 'locked'})`}
                  aria-pressed={focused && t.tier === sel.tier}
                  title={`T${t.tier} · ${t.name}`}
                  onClick={() => {
                    setFocusLane(lane.branchId);
                    setSelByLane((s) => ({ ...s, [lane.branchId]: t.tier }));
                  }}
                >
                  {t.state === 'owned' ? '✓' : t.tier}
                </button>
              ))}
            </div>
            {focused && (
              <TierDetail
                lane={lane}
                t={sel}
                kind={kind}
                committedId={tree.committedId}
                currentTier={currentTier}
                accent={accent}
                onBuy={() => {
                  // Follow the ladder after the buy: selection snaps back to "the next tier".
                  setSelByLane((s) => ({ ...s, [lane.branchId]: undefined }));
                  onBuyNext(lane.branchId, sel.tier);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
