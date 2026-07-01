// End-of-run reward presentation engine — the "progression capsule" reveal. Categories animate in
// ONE AT A TIME (each auto-expands while its numbers count up, then collapses to a one-line
// summary), so the screen never scrolls and stays readable as new progression systems are added —
// each is just another RewardCategory in the array Results.tsx builds. After the sequence, newly
// unlocked achievements play SEQUENTIALLY in a strip below the stats (never covering them). The
// player can Skip/reveal-all, click to fast-forward a beat, and manually expand any category to
// inspect it. Pure presentation: the rewards are already decided + applied upstream.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ACCOUNT_CURRENCY } from '../core/currencies';

const prefersReduced = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const CATEGORY_MS = 1000; // gap between category reveals → ~5 categories lands in the 5–7s window
const COUNT_MS = 700; // per-number count-up duration
const SETTLE_MS = COUNT_MS + 220; // beat the last category holds open before the sequence settles
const ACHV_MS = 1800; // each post-sequence achievement spotlight holds this long before the next

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

/** Ease a number 0→target (easeOutCubic). `instant` (skip / reduced-motion) snaps to the value. */
function useCountUp(target: number, instant: boolean): number {
  const [n, setN] = useState(instant ? target : 0);
  useEffect(() => {
    if (instant || target <= 0) {
      setN(Math.max(0, target));
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / COUNT_MS);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, instant]);
  return n;
}

function StatRow({ s, instant }: { s: RewardStat; instant: boolean }): JSX.Element {
  const n = useCountUp(s.value, instant);
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
      <button type="button" className="rr-cat-head" onClick={onToggle} aria-expanded={expanded}>
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
  categories,
  achievements,
  onContinue,
  cliffhanger,
  onReplay,
}: {
  title: ReactNode;
  categories: RewardCategory[];
  achievements: AchievementItem[];
  onContinue: () => void;
  cliffhanger?: ReactNode; // the "1 run from …" tease, shown once the rewards have all landed
  onReplay?: () => void; // one-tap "Infect Again" — re-run the same mode without a menu round-trip
}): JSX.Element {
  const reduced = useRef(prefersReduced()).current;
  const [instant, setInstant] = useState(reduced);
  const [revealed, setRevealed] = useState(reduced ? categories.length : 0); // # categories revealed so far
  const [settled, setSettled] = useState(reduced); // last category's beat finished
  const [achvShown, setAchvShown] = useState(reduced ? achievements.length : 0); // # achievements spotlit
  const [manual, setManual] = useState<string | null>(null); // user override: id | '' (all collapsed) | null (auto)

  const allRevealed = revealed >= categories.length;
  const achvDone = achvShown >= achievements.length;
  const hasAchv = achievements.length > 0;
  const sequenceDone = allRevealed && settled && achvDone;

  // Pace the category reveals.
  useEffect(() => {
    if (instant || allRevealed) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), revealed === 0 ? 320 : CATEGORY_MS);
    return () => clearTimeout(t);
  }, [revealed, allRevealed, instant]);

  // Hold the final category open for its count-up, then settle into the collapsed summary state.
  useEffect(() => {
    if (instant || !allRevealed || settled) return;
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [allRevealed, settled, instant]);

  // After the stats settle, spotlight achievements one at a time.
  useEffect(() => {
    if (instant || !settled || achvDone) return;
    const t = setTimeout(() => setAchvShown((a) => a + 1), achvShown === 0 ? 420 : ACHV_MS);
    return () => clearTimeout(t);
  }, [settled, achvShown, achvDone, instant]);

  const revealAll = useCallback(() => {
    setInstant(true);
    setRevealed(categories.length);
    setSettled(true);
    setAchvShown(achievements.length);
  }, [categories.length, achievements.length]);

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

      {!sequenceDone && (
        <button type="button" className="rr-skip" onClick={(e) => { e.stopPropagation(); revealAll(); }}>
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
          <button type="button" className="rr-btn rr-replay" onClick={onReplay}>↻ Infect Again</button>
        )}
        <button
          type="button"
          className={`primary rr-continue${sequenceDone ? ' is-ready' : ''}`}
          onClick={(e) => { e.stopPropagation(); onContinue(); }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
