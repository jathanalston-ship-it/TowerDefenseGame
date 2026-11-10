// Account Level surfaces (docs/ACCOUNT-LEVEL.md §presentation) — the shared XP bar (Profile,
// Command strip, hub top bar) + the menu LEVEL-UP toaster. The bar always shows the same three
// facts: the level, the fill toward the next, and (full mode) the next milestone. The toaster
// drains meta's level-up queue so a level earned ANYWHERE outside a run settle (buying a star,
// molting …) still celebrates — the run-settle levels celebrate on the Results screen instead.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { meta } from '../../state/meta';
import { rewardVisible } from '../../state/rewardVisibility';
import type { AccountLevelUp } from '../../state/meta';
import { ACCOUNT_TITLE_BY_ID } from '../../core/accountLevel';
import type { AccountLevelReward } from '../../core/accountLevel';
import { audio } from '../../audio/sound';
import { ChipPopover } from './ChipPopover';

/** One-line reward summary for a level's payout (toast, Results, and the Profile preview).
 *  Shard grants BANK even on max-Star units (Prime fuel — docs/PRIME-STRAINS.md §economy). */
export function rewardLine(r: AccountLevelReward): string {
  const parts: string[] = [];
  // Kinds whose system hasn't revealed bank silently (state/rewardVisibility.ts — never named early).
  const vis = (k: string): boolean => rewardVisible(meta.get(), k);
  if (r.cores > 0) parts.push(`+${r.cores} Cores`);
  if (r.essence > 0 && vis('geneEssence')) parts.push(`+${r.essence} Essence`);
  if (r.towerShards > 0) parts.push(`+${r.towerShards} Strain Samples`);
  if (r.heroShards > 0) parts.push(`+${r.heroShards} Apex Genome`);
  const mats = r.mats.mutagen + r.mats.scrap + r.mats.catalyst;
  if (mats > 0 && vis('mutagen')) parts.push(`+${mats} Materials`);
  if (r.ichor > 0 && vis('ichor')) parts.push(`+${r.ichor} Ichor`);
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
    // A top-bar essential answers on TAP (docs/UI-STANDARDS.md §touch-info) — not a hover title.
    return (
      <ChipPopover
        className="axp-chip"
        ariaLabel={`Account Level ${v.level} — ${v.into}/${v.need} XP`}
        popLabel="Account Level"
        face={<><b className="axp-lv">LV {v.level}</b><i className="axp-mini" aria-hidden><i style={{ width: `${pct}%` }} /></i></>}
      >
        {() => (
          <>
            <span className="chip-pop-h">Account Level <b>{v.level}</b></span>
            <span className="chip-pop-p">{v.into.toLocaleString()} / {v.need.toLocaleString()} XP to the next level — every run, upgrade and achievement feeds it.</span>
            <span className="chip-pop-k">Next milestone · L{v.nextMilestone}</span>
          </>
        )}
      </ChipPopover>
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
export function AccountLevelToast({ held = false }: { held?: boolean } = {}): JSX.Element | null {
  meta.use(); // re-render on any persist (grants land through meta actions)
  const [queue, setQueue] = useState<AccountLevelUp[]>([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const sounded = useRef<AccountLevelUp | null>(null);
  const focusedControl = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  // `held` (an unlock announcement is up — the same gate as the RewardToaster): level-ups stay
  // banked and a showing one pauses, then the queue flushes the moment the summary closes.
  useEffect(() => {
    if (held) return;
    const fresh = meta.drainAccountLevelUps();
    if (fresh.length > 0) setQueue((q) => [...q, ...fresh]);
  });
  const lu = !held && queue.length > 0 ? queue[0] : null;
  useEffect(() => {
    if (!lu) { setHovered(false); setFocused(false); return; }
    if (sounded.current !== lu) { audio.cue('levelup'); sounded.current = lu; }
  }, [lu]);
  useEffect(() => {
    if (!lu || hovered || focused) return;
    const timer = setTimeout(() => setQueue((q) => q[0] === lu ? q.slice(1) : q), lu.milestone ? 5200 : 3400);
    return () => clearTimeout(timer);
  }, [lu, hovered, focused]);
  useLayoutEffect(() => {
    if (lu) return;
    if (focusedControl.current && !focusedControl.current.isConnected && document.activeElement === document.body) {
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    }
    focusedControl.current = null;
  }, [lu]);
  if (!lu) return null;
  return (
    <div className={`axp-toast${lu.milestone ? ' is-milestone' : ''}`} role="status"
      onClick={() => setQueue((q) => q.slice(1))}
      onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        setFocused(true);
        focusedControl.current = event.target as HTMLElement;
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          previousFocus.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
        }
      }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    >
      <button type="button" className="axp-toast-dismiss" aria-label={`Dismiss account level ${lu.level} notification`}
        onClick={(event) => { event.stopPropagation(); setQueue((q) => q.slice(1)); }}>✕</button>
      <span className="axp-toast-badge">{lu.milestone ? '✦ MILESTONE ✦' : 'ACCOUNT LEVEL UP'}</span>
      <span className="axp-toast-lv">Level {lu.level}</span>
      <span className="axp-toast-r">{rewardLine(lu.reward)}</span>
    </div>
  );
}
