// Field Orientation (docs/HELP.md) — the anchored HUD tour of the Command Center. Each stop
// SPOTLIGHTS the real element it teaches and answers four things: WHAT it is, WHY it matters,
// WHEN you'll use it, and what it unlocks LATER — purpose over location. Runs once after the
// Combat Tutorial; finishing grants the one-time Tutorial Bio-Container (a Skip marks the tour
// seen but never pays). Replayable any time from Help or Settings — replays re-teach, never
// re-grant. Advances only on confirmed clicks (Back/Next) — never a timer.

import { useState, type CSSProperties } from 'react';
import { meta } from '../state/meta';
import type { TutorialRewardSummary } from '../state/meta';
import { TutorialRewardReveal } from './tutorial/TutorialRewardReveal';
import { Spotlight } from './tutorial/primitives';
import { useTargetRect } from './tutorial/useTargetRect';

interface TourStop {
  area: string;
  anchor?: string; // spotlighted element (fallback: centered card, no dim hole)
  what: string;
  why: string;
  when: string;
  later: string;
}

const TOUR: TourStop[] = [
  { area: 'Resource Bar', anchor: '[data-tour="topbar"]',
    what: 'Your permanent account currencies — Genome Cores, Ascendant Cells, and crafting materials.',
    why: 'Unlike in-run Biomass, these never reset. Everything here compounds across every future run.',
    when: 'Glance at it whenever you return from a run — it’s the score that persists.',
    later: 'New currencies join the bar as you unlock deeper systems (Antigen, Gene Essence…).' },
  { area: 'Power Score', anchor: '[data-tour="power"]',
    what: 'One number that folds every permanent investment — upgrades, stars, gear, mastery — into account strength.',
    why: 'It’s how you KNOW you got stronger, and it drives your progress predictions.',
    when: 'Watch it jump after any purchase; if a stage wall stops you, Power is what you raise.',
    later: 'Progress predictions use it to estimate exactly how far your next push will reach.' },
  { area: 'Campaign', anchor: '[data-nav="campaign"]',
    what: 'The main path — authored stages descending ever deeper into the world.',
    why: 'Depth is the master key: your Star Cap, Hero Slots, Adaptation gates, and Prestige all unlock by Campaign stage.',
    when: 'Push it whenever your Power feels ahead of the wall; it’s always the highest-value goal.',
    later: 'Milestone stages hide bosses with first-kill rewards — and Stage 10 opens Prestige itself.' },
  { area: 'Infinite', anchor: '[data-nav="infinite"]',
    what: 'Endless, escalating waves under an AI director — no win, only how deep you hold.',
    why: 'It’s the richest loot faucet and the truest test of a build.',
    when: 'Farm it when the Campaign wall stops you — the loot you bank buys your way through.',
    later: 'Depth records feed achievements and scale your Loot Meter payouts.' },
  { area: 'Evolution', anchor: '[data-nav="evolution"]',
    what: 'Your permanent-progression HQ: Genome Core upgrades, and later Prestige (Molt).',
    why: 'This is the steadiest Power growth in the game — every Core spent here works forever.',
    when: 'Spend Cores after most runs; check for newly affordable tiers.',
    later: 'Molting resets the Genome engine for a compounding multiplier — the deep loop.' },
  { area: 'Tower Lab', anchor: '[data-nav="towers"]',
    what: 'Permanent tower development — Stars, the Evolution Codex, and Adaptation trees.',
    why: 'Stars are your backbone damage scaling; Adaptation adds build-defining behavior.',
    when: 'Visit when Strain Samples pile up, or a specific tower feels weak.',
    later: 'The Star Cap rises with Campaign depth; Adaptation gates open at Stages 15/30/50.' },
  { area: 'Hero Lab', anchor: '[data-nav="heroes"]',
    what: 'Hero development — stars, mastery, and which heroes you field.',
    why: 'Heroes are your mobile burst; their growth multiplies every run they join.',
    when: 'After earning Apex Genome shards, and when new heroes unlock.',
    later: 'A second and third Hero Slot open at Campaign Stages 25 and 90.' },
  { area: 'Equipment', anchor: '[data-nav="equipment"]',
    what: 'The Armory — weapon, armor, and relic loadouts for each hero.',
    why: 'Gear is a huge Power source, and set bonuses + affixes enable whole archetypes.',
    when: 'After cracking Bio-Containers; slot upgrades the moment they drop.',
    later: 'Reforging with materials turns a good base item into a perfect one.' },
  { area: 'Genetic Vault', anchor: '[data-nav="vault"]',
    what: 'Where your banked Bio-Containers get cracked open.',
    why: 'Containers are the reward loop — equipment, shards, and materials pour out of them.',
    when: 'After runs: your Loot Meter converts survival into containers automatically.',
    later: 'Rarer containers carry pity protection — a legendary is always coming.' },
  { area: 'Gene Archive', anchor: '[data-nav="genes"]',
    what: 'Every Gene Card you have ever drafted, collected permanently.',
    why: 'Cards level up with Gene Essence — a leveled card is stronger EVERY time you draft it.',
    when: 'Between runs: spend Essence, and equip Starting Genes that auto-activate at wave 1.',
    later: 'Deeper Archive levels unlock at Campaign milestones; Ascension arrives beyond that.' },
  { area: 'Collection', anchor: '[data-nav="collection"]',
    what: 'Your codex — every tower, enemy, boss, and card you have discovered.',
    why: 'Discovery itself pays: collection tiers grant rewards as entries fill in.',
    when: 'Browse after runs that met something new.',
    later: 'Boss and biome entries deepen as the world grows.' },
  { area: 'Help & Settings', anchor: '[data-nav="help"]',
    what: 'The Field Manual — a living wiki of every system you have unlocked (plus this tour, replayable).',
    why: 'New mechanics announce themselves once, then live here forever with the full picture.',
    when: 'Whenever a system surprises you — search it, read the Watch-out notes.',
    later: 'Entries appear automatically the moment you unlock each new system.' },
];

export function HudTour({ onClose }: { onClose: () => void }): JSX.Element {
  const [i, setI] = useState(0);
  const [reward, setReward] = useState<TutorialRewardSummary | null>(null);
  const [ended, setEnded] = useState(false);
  const step = TOUR[i];
  const rect = useTargetRect(step.anchor);

  const finish = (): void => {
    const r = meta.completeHudTour(true); // grants the container (idempotent; null on replay)
    if (r) { setReward(r); setEnded(true); } else onClose();
  };
  const skip = (): void => {
    meta.completeHudTour(false); // seen, but a skip never pays out
    onClose();
  };

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
  const last = i === TOUR.length - 1;

  return (
    <div className="hudtour" role="dialog" aria-label="Field Orientation">
      <Spotlight rect={rect} />
      <div className="hudtour-card is-anchored" style={cardStyle}>
        <div className="hudtour-step">Field Orientation · {i + 1} / {TOUR.length}</div>
        <h3 className="hudtour-area">{step.area}</h3>
        <div className="hudtour-rows">
          <div className="hudtour-row"><span className="hudtour-k">What</span><span className="hudtour-v">{step.what}</span></div>
          <div className="hudtour-row"><span className="hudtour-k">Why</span><span className="hudtour-v">{step.why}</span></div>
          <div className="hudtour-row"><span className="hudtour-k">When</span><span className="hudtour-v">{step.when}</span></div>
          <div className="hudtour-row"><span className="hudtour-k">Later</span><span className="hudtour-v">{step.later}</span></div>
        </div>
        <div className="hudtour-dots" aria-hidden>
          {TOUR.map((_, n) => <span key={n} className={`hudtour-dot ${n === i ? 'on' : n < i ? 'past' : ''}`} />)}
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
