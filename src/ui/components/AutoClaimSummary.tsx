// AUTO-CLAIM SUMMARY (docs/NOTIFICATIONS.md §auto-claim) — the ONE "Also earned" row on Results.
// Mounting it settles the run's no-choice rewards (state/autoClaim.ts: quest missions, Season
// Pass levels, Milestones, Evolution Track nodes on revealed systems) and reads the batch back
// in a single line, so the hub comes back with decisions waiting — not seven claim chores.
// Self-contained: Results mounts it with one line; nothing else in the results flow changes.

import { useLayoutEffect, useState } from 'react';
import { meta } from '../../state/meta';
import { autoClaimSettled, type AutoClaimReport } from '../../state/autoClaim';
import { autoClaimPref, setAutoClaimPref } from '../../state/prefs';
import { presentRewardEvent } from '../../state/rewardVisibility';
import { rewardTypeOf } from '../../state/rewardToast';
import type { RewardEvent } from '../../state/rewardToast';

// One claim pass per settled run: keyed on the run's result object, so a remount (StrictMode,
// a re-render of Results) reads the same report instead of claiming — or reporting — twice.
const settled = new WeakMap<object, AutoClaimReport | null>();
function settleOnce(key: object): AutoClaimReport | null {
  if (!settled.has(key)) settled.set(key, autoClaimSettled());
  return settled.get(key) ?? null;
}

/** "+350 Genome Cores · 2 Bio-Containers · +40 Materials" — grouped, gated, summed by kind. */
export function summarizeRewards(events: readonly RewardEvent[]): string[] {
  const save = meta.get();
  const byType = new Map<string, { qty: number; names: Set<string> }>();
  for (const raw of events) {
    const e = presentRewardEvent(save, raw);
    if (!e) continue;
    const row = byType.get(e.type) ?? { qty: 0, names: new Set<string>() };
    row.qty += e.qty ?? 1;
    if (e.name) row.names.add(e.name);
    byType.set(e.type, row);
  }
  const out: string[] = [];
  for (const [type, row] of byType) {
    const def = rewardTypeOf(type);
    const unit = def?.unit ?? type;
    if (def?.merge === 'never') out.push(row.names.size > 0 ? `${unit}: ${[...row.names].join(', ')}` : unit);
    else if (def?.merge === 'count') out.push(`${row.qty} ${unit}${row.qty === 1 ? '' : 's'}`);
    else out.push(`+${Math.round(row.qty).toLocaleString('en-US')} ${unit}`);
  }
  return out;
}

export function AutoClaimSummary({ settle }: { settle: object }): JSX.Element | null {
  // Settling CLAIMS rewards (a store write that other components react to), so it runs in a layout
  // effect — never during render (React forbids updating another component mid-render) — and
  // still lands before the first paint. settleOnce is idempotent per settle key (StrictMode-safe).
  const [report, setReport] = useState<AutoClaimReport | null>(null);
  useLayoutEffect(() => { setReport(settleOnce(settle)); }, [settle]);
  if (!report) return null;
  const parts = summarizeRewards(report.events);
  if (parts.length === 0) return null;
  return (
    <div className="rr-autoclaim" role="status" aria-label="Rewards claimed automatically">
      <span className="rr-autoclaim-k">✪ Also earned</span>
      <span className="rr-autoclaim-v">{parts.join(' · ')}</span>
      <span className="rr-autoclaim-n">{report.claims} reward{report.claims === 1 ? '' : 's'} auto-claimed · Settings to claim by hand</span>
    </div>
  );
}

/** The Settings switch (one line in the Settings panel): off ⇒ every claim stays a manual tap
 *  on its own screen, with its badge, exactly as before auto-claim existed. */
export function AutoClaimToggle(): JSX.Element {
  const [on, setOn] = useState(autoClaimPref());
  const flip = (): void => { const next = !on; setOn(next); setAutoClaimPref(next); };
  return (
    <label className="set-toggle">
      <span>Auto-Claim Rewards<small>Quest, Season Pass, Milestone, live-event and Evolution Track rewards claim themselves when a run ends (one “Also earned” row on Results).</small></span>
      <button className={`set-switch ${on ? 'on' : ''}`} onClick={flip} aria-pressed={on}>
        {on ? 'On' : 'Off'}
      </button>
    </label>
  );
}
