// End-of-run reward presentation engine — the "progression capsule" reveal. Categories animate in
// ONE AT A TIME (each auto-expands while its numbers count up, then collapses to a one-line
// summary), so the screen never scrolls and stays readable as new progression systems are added —
// each is just another RewardCategory in the array Results.tsx builds. After the sequence, newly
// unlocked achievements play SEQUENTIALLY in a strip below the stats (never covering them). The
// player can Skip/reveal-all, click to fast-forward a beat, and manually expand any category to
// inspect it. Pure presentation: the rewards are already decided + applied upstream. Each landing
// category plucks the climbing `reveal` cue; a stat's own `cue` (the level-up) follows its row.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCountUp } from './components/useCountUp';
import type { CSSProperties, ReactNode } from 'react';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { audio } from '../audio/sound';
import { motionPrefs, onMotionPrefs, resolveMotion, systemReducedMotion } from '../state/prefs';

const prefersReduced = (): boolean => resolveMotion(motionPrefs(), systemReducedMotion()).motion === 0;

const CATEGORY_MS = 1000; // gap between category reveals → ~5 categories lands in the 5–7s window
const COUNT_MS = 700; // per-number count-up duration
const SETTLE_MS = COUNT_MS + 220; // beat the last category holds open before the sequence settles
const ACHV_MS = 1800; // each post-sequence achievement spotlight holds this long before the next
const STAT_CUE_MS = 260; // a stat's own cue trails its category's reveal pluck by this beat

/** One animated stat row inside a category. `bar` (0..1) draws a fill that grows with the count. */
export interface RewardStat {
  id: string;
  label: string;
  value: number;
  format?: (n: number) => string; // defaults to a locale integer
  icon?: ReactNode;
  accent?: string;
  note?: string; // small badge, e.g. "NEW BEST"
  bar?: number; // 0..1 target fill (a progress bar that fills as the number counts up)
  celebrate?: boolean; // larger pop — a new unlock / level-up / record
  cue?: string; // audio.cue tag played as this row lands (e.g. 'levelup')
  from?: number; // the honest starting value the count-up climbs FROM (previous level / Power); default 0
}

/** A reward category — the unit of the paced reveal. Add a progression system = add one of these. */
export interface RewardCategory {
  id: string;
  title: string;
  icon?: ReactNode;
  accent?: string;
  summary: string; // the concise one-liner shown when collapsed
  stats: RewardStat[]; // headline animated numbers
  extra?: ReactNode; // detail shown when expanded (breakdowns / lists)
}

export interface AchievementItem {
  id: string;
  name: string;
  desc: string;
  reward?: number;
}

function StatRow({ s, instant }: { s: RewardStat; instant: boolean }): JSX.Element {
  const base = s.from == null ? 0 : Math.min(s.from, s.value); // counts the GAIN on top of where it was
  const n = base + useCountUp(s.value - base, { ms: COUNT_MS, instant });
  const text = s.format ? s.format(n) : n.toLocaleString();
  const fill = s.bar == null ? null : s.value > 0 ? (n / s.value) * s.bar : s.bar;
  return (
    <div className={`rr-stat${s.celebrate ? ' is-celebrate' : ''}`}>
      <span className="rr-stat-label">
        {s.label}
        {s.note && <span className="rr-note">{s.note}</span>}
      </span>
      {fill != null && (
        <span className="rr-bar">
          <span className="rr-bar-fill" style={{ width: `${Math.round(fill * 100)}%`, background: s.accent }} />
        </span>
      )}
      <span className="rr-stat-value" style={s.accent ? { color: s.accent } : undefined}>
        {text}
        {s.icon}
      </span>
    </div>
  );
}

function CategoryView({
  cat,
  expanded,
  revealed,
  instant,
  onToggle,
}: {
  cat: RewardCategory;
  expanded: boolean;
  revealed: boolean;
  instant: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div className={`rr-cat${expanded ? ' is-open' : ''}${revealed ? ' is-in' : ''}`}>
      <button type="button" className="rr-cat-head" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-expanded={expanded}>
        <span className="rr-cat-icon" style={cat.accent ? { color: cat.accent } : undefined}>{cat.icon}</span>
        <span className="rr-cat-title">{cat.title}</span>
        <span className="rr-cat-summary">{cat.summary}</span>
        <span className="rr-cat-chev" aria-hidden>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="rr-cat-body">
          <div className="rr-stats">
            {cat.stats.map((s) => (
              <StatRow key={s.id} s={s} instant={instant} />
            ))}
          </div>
          {cat.extra}
        </div>
      )}
    </div>
  );
}

function AchievementSpotlight({ a, index, total }: { a: AchievementItem; index: number; total: number }): JSX.Element {
  return (
    <div className="rr-achv" key={a.id}>
      <span className="rr-achv-icon" aria-hidden>{a.name.charAt(0).toUpperCase()}</span>
      <span className="rr-achv-body">
        <span className="rr-achv-eyebrow">
          Achievement Unlocked{a.reward ? ` · +${a.reward} ${ACCOUNT_CURRENCY.name}` : ''}
          {total > 1 && <span className="rr-achv-count">{index + 1}/{total}</span>}
        </span>
        <span className="rr-achv-name">{a.name}</span>
        <span className="rr-achv-desc">{a.desc}</span>
      </span>
    </div>
  );
}

export function RewardReveal({
  title,
  banner,
  categories,
  achievements,
  onContinue,
  cliffhanger,
  onReplay,
  replayLabel = '↻ Infect Again',
  next,
  paused = false,
}: {
  title: ReactNode;
  banner?: ReactNode; // always-visible panel under the title (the defeat debrief) — outside the paced sequence
  categories: RewardCategory[];
  achievements: AchievementItem[];
  onContinue: () => void;
  cliffhanger?: ReactNode; // the "1 run from …" tease, shown once the rewards have all landed
  onReplay?: () => void; // one-tap "Infect Again" — re-run the same mode without a menu round-trip
  replayLabel?: string; // the replay button's words ("↻ Try again" on a loss, "↻ Replay" beside a next step)
  /** The PRIMARY forward step (Campaign win → "Stage N+1 ▸"). `choices` (a stage event's boons)
   *  render a pick beside it — the first is pre-selected — and the pick rides `onClick`. */
  next?: { label: string; onClick: (choiceId?: string) => void; choices?: { id: string; name: string; desc: string }[]; choiceLabel?: string; accent?: string };
  paused?: boolean; // a milestone cinematic is over the capsule — the sequence (and its audio) waits for it
}): JSX.Element {
  const continueRef = useRef<HTMLButtonElement>(null);
  const skipFocused = useRef(false);
  const reduced = useRef(prefersReduced()).current;
  const [instant, setInstant] = useState(reduced);
  const [choice, setChoice] = useState<string | undefined>(next?.choices?.[0]?.id);
  const [revealed, setRevealed] = useState(reduced ? categories.length : 0); // # categories revealed so far
  const [settled, setSettled] = useState(reduced); // last category's beat finished
  const [achvShown, setAchvShown] = useState(reduced ? achievements.length : 0); // # achievements spotlit
  const [manual, setManual] = useState<string | null>(null); // user override: id | '' (all collapsed) | null (auto)

  const allRevealed = revealed >= categories.length;
  const achvDone = achvShown >= achievements.length;
  const hasAchv = achievements.length > 0;
  const sequenceDone = allRevealed && settled && achvDone;

  // Keep keyboard position when the focused Skip control disappears at completion.
  useLayoutEffect(() => {
    if (!sequenceDone) return;
    if (skipFocused.current && document.activeElement === document.body) continueRef.current?.focus({ preventScroll: true });
    skipFocused.current = false;
  }, [sequenceDone]);

  // Pace the category reveals.
  useEffect(() => {
    if (instant || allRevealed || paused) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), revealed === 0 ? 320 : CATEGORY_MS);
    return () => clearTimeout(t);
  }, [revealed, allRevealed, instant, paused]);

  // Hold the final category open for its count-up, then settle into the collapsed summary state.
  useEffect(() => {
    if (instant || !allRevealed || settled || paused) return;
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [allRevealed, settled, instant, paused]);

  // Reveal audio: the capsule unseals with the lid thunk (which also re-roots the climbing pluck),
  // then every category that LANDS plucks `reveal` once; a stat's own `cue` trails its row by a
  // beat. A skip (or reduced motion) lands the rest as ONE beat — one pluck, each cue once.
  const voiced = useRef(-1); // # categories already voiced (-1 = not yet unsealed)
  const pendingStatCues = useRef(new Set<string>());
  useEffect(() => {
    if (paused) return;
    if (voiced.current < 0) { voiced.current = 0; audio.cue('chest'); }
    const shown = Math.min(revealed, categories.length);
    if (shown > voiced.current) {
      const landed = categories.slice(voiced.current, shown);
      voiced.current = shown;
      audio.cue('reveal');
      for (const cat of landed) for (const stat of cat.stats) {
        if (stat.cue) pendingStatCues.current.add(stat.cue);
      }
    }
    if (pendingStatCues.current.size === 0) return;
    const timer = window.setTimeout(() => {
      for (const tag of pendingStatCues.current) audio.cue(tag);
      pendingStatCues.current.clear();
    }, STAT_CUE_MS);
    // A milestone can interrupt between the pluck and stat cue. Keep its pending tags,
    // but cancel the timer: they resume once, after the covering cinematic releases us.
    return () => window.clearTimeout(timer);
  }, [revealed, categories, paused]);

  // After the stats settle, spotlight achievements one at a time.
  useEffect(() => {
    if (instant || !settled || achvDone || paused) return;
    const t = setTimeout(() => setAchvShown((a) => a + 1), achvShown === 0 ? 420 : ACHV_MS);
    return () => clearTimeout(t);
  }, [settled, achvShown, achvDone, instant, paused]);

  const revealAll = useCallback(() => {
    setInstant(true);
    setRevealed(categories.length);
    setSettled(true);
    setAchvShown(achievements.length);
  }, [categories.length, achievements.length]);

  // Motion reduction completes presentation only; rewards were already applied upstream.
  useEffect(() => {
    let prefs = motionPrefs();
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const sync = (): void => {
      if (resolveMotion(prefs, media?.matches ?? false).motion === 0) revealAll();
    };
    const offPrefs = onMotionPrefs((next) => { prefs = next; sync(); });
    media?.addEventListener('change', sync);
    sync();
    return () => {
      offPrefs();
      media?.removeEventListener('change', sync);
    };
  }, [revealAll]);

  // Click anywhere on the capsule fast-forwards exactly one beat (reveal next / settle / next achv).
  const nudge = useCallback(() => {
    if (!allRevealed) setRevealed((r) => Math.min(categories.length, r + 1));
    else if (!settled) setSettled(true);
    else if (!achvDone) setAchvShown((a) => Math.min(achievements.length, a + 1));
  }, [allRevealed, settled, achvDone, categories.length, achievements.length]);

  // Which category is open: a manual choice wins; otherwise the latest-revealed one auto-expands
  // (and the final one holds open until the stats settle), then everything collapses to summaries.
  const autoOpen = !allRevealed
    ? revealed > 0 ? categories[revealed - 1].id : null
    : !settled ? categories[categories.length - 1].id : null;
  const openId = manual === null ? autoOpen : manual === '' ? null : manual;

  return (
    <div className={`rr-capsule${sequenceDone ? ' is-done' : ''}`} onClick={nudge}>
      <div className="rr-cinematic">{title}</div>
      {banner}

      {!sequenceDone && (
        <button type="button" className="rr-skip"
          onFocus={() => { skipFocused.current = true; }}
          onBlur={() => { skipFocused.current = false; }}
          onClick={(e) => { e.stopPropagation(); revealAll(); }}>
          Skip ▸▸
        </button>
      )}

      <div className="rr-cats">
        {categories.slice(0, Math.max(revealed, reduced ? categories.length : 0)).map((cat) => {
          const isOpen = openId === cat.id;
          return (
            <CategoryView
              key={cat.id}
              cat={cat}
              expanded={isOpen}
              revealed
              instant={instant}
              onToggle={() => { setManual(isOpen ? '' : cat.id); }}
            />
          );
        })}
      </div>

      {/* Achievement spotlight — plays only AFTER the stats settle, one at a time, in its own slot
          below the categories so it never covers a number. The Discoveries category lists them all. */}
      {settled && hasAchv && (
        <div className="rr-achv-strip" onClick={(e) => e.stopPropagation()}>
          {achvShown > 0 && (
            <AchievementSpotlight
              a={achievements[Math.min(achvShown, achievements.length) - 1]}
              index={Math.min(achvShown, achievements.length) - 1}
              total={achievements.length}
            />
          )}
        </div>
      )}

      {/* The cliffhanger — the nearest NEXT reward — lands once the rewards have all revealed, so the
          player is looking at "you're almost at X" at the exact moment they'd otherwise quit. */}
      {sequenceDone && cliffhanger && (
        <div className="rr-cliff-slot" onClick={(e) => e.stopPropagation()}>{cliffhanger}</div>
      )}

      <div className="rr-actions" onClick={(e) => e.stopPropagation()}>
        {sequenceDone && onReplay && (
          <button type="button" className="rr-btn rr-replay" onClick={onReplay}>{replayLabel}</button>
        )}
        {/* The forward step outranks Continue: once it appears, Continue steps down to a plain
            button (still last in the row — the hub door) and the next step wears the primary. */}
        {sequenceDone && next?.choices && next.choices.length > 1 && (
          <div className="rr-choice" role="radiogroup" aria-label={next.choiceLabel ?? 'Choose'} style={next.accent ? ({ ['--ev']: next.accent } as CSSProperties) : undefined}
            onKeyDown={(e) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
              const options = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
              const current = options.findIndex((button) => button === document.activeElement);
              if (current < 0) return;
              e.preventDefault();
              const index = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1
                : (current + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
              options[index].focus();
              options[index].click();
            }}>
            <span className="rr-choice-k">{next.choiceLabel ?? 'Choose'}</span>
            {next.choices.map((c) => (
              <button key={c.id} type="button" role="radio" tabIndex={choice === c.id ? 0 : -1} aria-checked={choice === c.id} className={`rr-choice-opt${choice === c.id ? ' on' : ''}`} onClick={() => setChoice(c.id)}>
                <b>{c.name}</b>
                <span>{c.desc}</span>
              </button>
            ))}
          </div>
        )}
        {sequenceDone && next && (
          <button type="button" className="primary rr-next" onClick={() => next.onClick(choice)}>{next.label}</button>
        )}
        <button
          ref={continueRef}
          type="button"
          className={`${next && sequenceDone ? 'rr-btn' : 'primary'} rr-continue${sequenceDone ? ' is-ready' : ''}`}
          onClick={(e) => { e.stopPropagation(); onContinue(); }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
