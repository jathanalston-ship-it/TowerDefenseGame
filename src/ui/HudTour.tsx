// Field Orientation (docs/HELP.md) — the anchored HUD tour of the Command Center. Each stop
// SPOTLIGHTS the real element it teaches and answers four things: WHAT it is, WHY it matters,
// WHEN you'll use it, and what it unlocks LATER — purpose over location. Runs once after the
// Combat Tutorial and is deliberately SHORT (docs/TUTORIAL.md §onboarding-flow): only the stops a
// new commander needs on minute one — where to play, where rewards land, where to spend, where
// help + the account live. Every other wing introduces itself via its own What's New card. The
// tour pays nothing of its own (the onboarding payout is the tutorial's ONE graduation reveal),
// so Finish and Skip are identical and a Skip never forfeits anything. Replayable any time from
// Help or Settings. Advances only on confirmed clicks (Back/Next) — never a timer.

import { useState, type CSSProperties } from 'react';
import { meta } from '../state/meta';
import type { TutorialRewardSummary } from '../state/meta';
import { featureRevealed } from '../state/unlocks';
import { TutorialRewardReveal } from './tutorial/TutorialRewardReveal';
import { Spotlight } from './tutorial/primitives';
import { useTargetRect } from './tutorial/useTargetRect';
import './HudTour.css';

interface TourStop {
  area: string;
  anchor?: string; // spotlighted element (fallback: centered card, no dim hole)
  /** Wing stops teach a SCREEN but spotlight its hub's rail door (the compressed rail renders
   *  no per-screen rows) — `nav` carries the screen key so the reveal gate still filters on
   *  the actual feature, not the door. */
  nav?: string;
  what: string;
  why: string;
  when: string;
  later: string;
}

export const TOUR: TourStop[] = [
  // ── Four stops, in the order a graduate acts (docs/TUTORIAL.md §onboarding-flow): play →
  //    collect → spend → find help. A widget anchor that isn't mounted drops from the snapshot
  //    and a wing stop drops until its screen is revealed — the tour never points at nothing.
  { area: 'Your Next Fight', anchor: '.mc-campaign',
    what: 'Your next Campaign stage — Continue Campaign deploys you straight into it.',
    why: 'Campaign depth is the master key: it unlocks every other system in the hive.',
    when: 'Start every session here. If you ever feel lost, this card holds the next step.',
    later: 'Milestone stages hide bosses with first-kill rewards; Stage 10 opens Prestige.' },
  { area: 'Rewards Hub', anchor: '[data-hub="rewards"]', nav: 'vault',
    what: 'Where winnings land — your graduation Bio-Containers are waiting in the Genetic Vault.',
    why: 'Containers are the reward loop: gear, shards, and materials pour out of them.',
    when: 'After every run — your Loot Meter turns survival into containers automatically.',
    later: 'Quests and season rewards collect here too as they unlock.' },
  { area: 'Evolution Hub', anchor: '[data-hub="progression"]', nav: 'evolution',
    what: 'Where you spend — Genome Cores buy permanent upgrades that work in every future run.',
    why: 'The steadiest Power growth in the game, and your graduation Cores are ready now.',
    when: 'Between runs — spend down what you can afford, then deploy again.',
    later: 'Tower Lab, Hero Hall, and the Gene Archive open here as you descend.' },
  { area: 'Profile & Help', anchor: '[data-hub="account"]', nav: 'help',
    what: 'Your account, settings, and the Field Manual — a living wiki of every system you unlock.',
    why: 'Create an account here any time to keep your hive on every device.',
    when: 'Whenever a system surprises you — or to replay this tour and the combat trial.',
    later: 'New systems announce themselves once, then live here with the full picture.' },
];

export function HudTour({ onClose }: { onClose: () => void }): JSX.Element {
  // Progression gating (docs/PROGRESSION-GATING.md): the tour only visits REVEALED surfaces —
  // a fresh account gets a short, focused orientation; hidden wings are each introduced by
  // their own What's New card when they unlock. Widget stops (class anchors) additionally
  // require their element to be MOUNTED right now — a quiet intel feed or a pre-reveal growth
  // panel drops its stop instead of pointing at nothing. Snapshotted once so a mid-tour
  // reveal can't reshuffle the stops (replays from Settings naturally cover more ground).
  const [stops] = useState(() => TOUR.filter((st) => {
    if (st.nav) return featureRevealed(meta.get(), st.nav);
    if (st.anchor?.startsWith('.')) return document.querySelector(st.anchor) !== null;
    return true;
  }));
  const [i, setI] = useState(0);
  const [reward, setReward] = useState<TutorialRewardSummary | null>(null);
  const [ended, setEnded] = useState(false);
  const step = stops[i];
  const rect = useTargetRect(step.anchor);

  // Finish and Skip end the tour identically: it pays nothing of its own, so nothing can be
  // forfeited. Only a LEGACY save still owed the old tour grant gets a reveal (either way).
  const finish = (): void => {
    const r = meta.completeHudTour(); // null for every post-merge save and on any replay
    if (r) { setReward(r); setEnded(true); } else onClose();
  };
  const skip = finish;

  if (ended) return reward ? <TutorialRewardReveal reward={reward} onClose={onClose} /> : <></>;

  // Anchored: the card sits beside the spotlit element (right of the nav rail, below the top
  // bar), clamped on-screen. No anchor in the DOM (e.g. the mobile drawer is closed) → centered.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardStyle: CSSProperties = rect
    ? rect.width > vw * 0.6
      ? { left: Math.min(vw - 470, Math.max(12, rect.left + 24)), top: Math.min(vh - 380, rect.bottom + 16) }
      : { left: Math.min(vw - 470, rect.right + 18), top: Math.max(12, Math.min(vh - 380, rect.top - 8)) }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  const last = i === stops.length - 1;

  return (
    <div className="hudtour" role="dialog" aria-label="Field Orientation">
      <Spotlight rect={rect} />
      <div className="hudtour-card is-anchored" style={cardStyle}>
        <div className="hudtour-step">Field Orientation · {i + 1} / {stops.length}</div>
        <h3 className="hudtour-area">{step.area}</h3>
        <div className="hudtour-rows">
          <div className="hudtour-row"><span className="hudtour-k">What</span><span className="hudtour-v">{step.what}</span></div>
          <div className="hudtour-row"><span className="hudtour-k">Why</span><span className="hudtour-v">{step.why}</span></div>
          <div className="hudtour-row"><span className="hudtour-k">When</span><span className="hudtour-v">{step.when}</span></div>
          <div className="hudtour-row"><span className="hudtour-k">Later</span><span className="hudtour-v">{step.later}</span></div>
        </div>
        <div className="hudtour-dots" aria-hidden>
          {stops.map((_, n) => <span key={n} className={`hudtour-dot ${n === i ? 'on' : n < i ? 'past' : ''}`} />)}
        </div>
        <div className="hudtour-btns">
          <button className="hudtour-skip" onClick={skip}>Skip</button>
          {i > 0 && <button className="hudtour-back" onClick={() => setI(i - 1)}>◂ Back</button>}
          <button className="primary" onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'Finish ▸' : 'Next ▸'}</button>
        </div>
      </div>
    </div>
  );
}
