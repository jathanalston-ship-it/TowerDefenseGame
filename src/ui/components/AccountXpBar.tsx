// Account Level surfaces (docs/ACCOUNT-LEVEL.md §presentation) — the shared XP bar (Profile,
// Command strip, hub top bar) + the menu LEVEL-UP toaster. The bar always shows the same three
// facts: the level, the fill toward the next, and (full mode) the next milestone. The toaster
// drains meta's level-up queue so a level earned ANYWHERE outside a run settle (buying a star,
// molting …) still celebrates — the run-settle levels celebrate on the Results screen instead.

import { useEffect, useState } from 'react';
import { meta } from '../../state/meta';
import type { AccountLevelUp } from '../../state/meta';
import { ACCOUNT_TITLE_BY_ID } from '../../core/accountLevel';
import type { AccountLevelReward } from '../../core/accountLevel';
import { audio } from '../../audio/sound';

/** One-line reward summary for a level's payout (toast, Results, and the Profile preview). */
export function rewardLine(r: AccountLevelReward): string {
  const parts: string[] = [];
  if (r.cores > 0) parts.push(`+${r.cores} Cores`);
  if (r.essence > 0) parts.push(`+${r.essence} Essence`);
  if (r.towerShards > 0) parts.push(`+${r.towerShards} Strain Samples`);
  if (r.heroShards > 0) parts.push(`+${r.heroShards} Apex Genome`);
  const mats = r.mats.mutagen + r.mats.scrap + r.mats.catalyst;
  if (mats > 0) parts.push(`+${mats} Materials`);
  if (r.ichor > 0) parts.push(`+${r.ichor} Ichor`);
  if (r.containers.length > 0) parts.push(`${r.containers.length} Bio-Container${r.containers.length > 1 ? 's' : ''}`);
  if (r.titleId) parts.push(`Title: ${ACCOUNT_TITLE_BY_ID.get(r.titleId)?.name ?? r.titleId}`);
  return parts.join(' · ');
}

/** The Account XP bar. `compact` = chip form (top bar / vitals); default = full block. */
export function AccountXpBar({ compact = false }: { compact?: boolean }): JSX.Element {
  meta.use();
  const v = meta.accountLevel();
  const pct = Math.min(100, Math.round((v.into / Math.max(1, v.need)) * 100));
  if (compact) {
    return (
      <span className="axp-chip" title={`Account Level ${v.level} — ${v.into}/${v.need} XP · next milestone L${v.nextMilestone}`}>
        <b className="axp-lv">LV {v.level}</b>
        <i className="axp-mini" aria-hidden><i style={{ width: `${pct}%` }} /></i>
      </span>
    );
  }
  return (
    <div className="axp-block" aria-label={`Account Level ${v.level}`}>
      <div className="axp-head">
        <span className="axp-badge">LV {v.level}</span>
        <span className="axp-k">Account Level</span>
        <span className="axp-need">{v.into.toLocaleString()} / {v.need.toLocaleString()} XP</span>
      </div>
      <div className="axp-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
      <div className="axp-foot">
        <span>Next milestone <b>L{v.nextMilestone}</b></span>
        <span title="XP earned this week / this month">week {v.weekXp.toLocaleString()} · month {v.monthXp.toLocaleString()}</span>
      </div>
    </div>
  );
}

/** Menu toaster: celebrates level-ups earned outside a run settle. Queued, one at a time. */
export function AccountLevelToast(): JSX.Element | null {
  meta.use(); // re-render on any persist (grants land through meta actions)
  const [queue, setQueue] = useState<AccountLevelUp[]>([]);
  useEffect(() => {
    const fresh = meta.drainAccountLevelUps();
    if (fresh.length > 0) setQueue((q) => [...q, ...fresh]);
  });
  const lu = queue.length > 0 ? queue[0] : null;
  useEffect(() => {
    if (!lu) return;
    audio.cue('levelup');
    const t = setTimeout(() => setQueue((q) => q.slice(1)), lu.milestone ? 5200 : 3400);
    return () => clearTimeout(t);
  }, [lu?.level]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lu) return null;
  return (
    <div className={`axp-toast${lu.milestone ? ' is-milestone' : ''}`} role="status" onClick={() => setQueue((q) => q.slice(1))}>
      <span className="axp-toast-badge">{lu.milestone ? '✦ MILESTONE ✦' : 'ACCOUNT LEVEL UP'}</span>
      <span className="axp-toast-lv">Level {lu.level}</span>
      <span className="axp-toast-r">{rewardLine(lu.reward)}</span>
    </div>
  );
}
