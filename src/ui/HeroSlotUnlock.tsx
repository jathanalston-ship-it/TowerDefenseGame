// Hero Slot Unlock sequence (HEROES.md) — the cinematic, milestone-grade moment when a Campaign
// clear opens a new Hero Slot (1 → 2 → 3). NOT a silent unlock: a full-screen reveal with a screen
// vignette, a bursting slot medallion, the roster growing (avatar pips filling in), an achievement
// banner, and the new account Power Score. Shown by App over Results when a slot opened this run.

import { useEffect } from 'react';
import { audio } from '../audio/sound';
import { formatPower } from '../core/power';
import { MAX_HERO_SLOTS } from '../core/config';
import './HeroSlotUnlock.css';

export interface HeroSlotUnlockData {
  slot: number; // the newly-opened slot (2 or 3)
  name: string; // the milestone's identity (Twin Avatar / Trinity Avatar)
  blurb: string; // what fielding this slot grants (reward preview)
  stage: number; // the campaign stage just cleared that opened it
  powerScore: number; // account Power Score after the unlock
}

export function HeroSlotUnlock({ unlock, onClose }: { unlock: HeroSlotUnlockData; onClose: () => void }): JSX.Element {
  const { slot, name, blurb, stage, powerScore } = unlock;
  // Audio hook — the milestone fanfare (biggest dopamine cue). One-shot on mount; no-op if muted.
  useEffect(() => { audio.cue('jackpot'); }, []);

  const pips = Array.from({ length: MAX_HERO_SLOTS }, (_, i) => i + 1); // roster capacity pips

  return (
    <div className="slot-unlock" role="dialog" aria-label="New Hero Slot Unlocked" onClick={onClose}>
      <div className="slot-vignette" aria-hidden />
      <div className="evo-rays" aria-hidden />
      <div className="slot-card" onClick={(e) => e.stopPropagation()}>
        <div className="slot-badge">★ ACHIEVEMENT ★</div>
        <div className="evo-eyebrow">◆ Hero Slot Unlocked ◆</div>

        {/* Bursting slot medallion — the hero-icon animation. */}
        <div className="slot-medallion">
          <span className="slot-burst" aria-hidden />
          <span className="slot-num">{slot}</span>
        </div>

        <h2 className="evo-title">{name}</h2>
        <div className="slot-cap">Hero Slots&nbsp; <b>{slot - 1} → {slot}</b></div>

        {/* Roster capacity — avatar pips fill in to the new count (anticipation of going wider). */}
        <div className="slot-pips" aria-hidden>
          {pips.map((p) => (
            <span key={p} className={`slot-pip${p <= slot ? ' is-on' : ''}${p === slot ? ' is-new' : ''}`} style={{ animationDelay: `${0.3 + p * 0.12}s` }} />
          ))}
        </div>

        <p className="evo-blurb">{blurb}</p>
        <div className="evo-band">Cleared Campaign Stage {stage} · you now field {slot} heroes at once</div>
        <div className="slot-power">Power Score&nbsp; <b>{formatPower(powerScore)}</b></div>

        <p className="evo-foot">Assign your new hero in the Hero Lab — each keeps its own gear, stars, and mastery.</p>
        <button className="primary evo-continue" onClick={onClose}>Continue</button>
      </div>
    </div>
  );
}
