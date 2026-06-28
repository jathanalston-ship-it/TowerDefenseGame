// Gene Card draft — pick 1 of 3 between waves. Doubles as the WAVE-CLEARED beat:
// it leads with a celebratory eyebrow + fanfare so finishing a wave feels earned,
// then gets out of the way fast (rarity color, a flagged best pick, number-key
// drafting). Data-driven over CardOption, so it scales to hundreds of cards.

import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/sound';
import { autoGenePref } from '../state/prefs';
import { affectsOf } from './cardAffects';
import type { CardOption } from '../core/types';

// Higher = rarer. Unknown tiers sort as 0, so new rarities slot in by adding a key.
const RARITY_RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, exotic: 4 };

// Auto Gene Selection: seconds the recommended card is offered before it auto-drafts.
const AUTO_SECONDS = 10;

// Ignore picks for a beat after the modal opens, so a click/keypress already in flight as a
// wave clears can't blow through the draft. Covers the card entry animation (card-in 0.32s).
const DRAFT_ARM_MS = 260;

export function DraftModal({
  options,
  clearedWave,
  onPick,
}: {
  options: CardOption[];
  clearedWave?: number;
  onPick: (id: string) => void;
}): JSX.Element {
  // Recommend the highest-rarity option (first on ties) to speed the call.
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    if ((RARITY_RANK[options[i].rarity] ?? 0) > (RARITY_RANK[options[best].rarity] ?? 0)) best = i;
  }

  // Auto Gene Selection (opt-in, persisted): a visible countdown that auto-drafts the
  // recommended card unless the player picks first. Fixed for the life of this draft.
  const auto = useRef(autoGenePref()).current;
  const [remaining, setRemaining] = useState(auto ? AUTO_SECONDS : 0);

  // Exactly one selection ever fires (manual OR auto). getSnapshot() hands us a fresh
  // options array / onPick closure every ~80ms, so handlers read the latest values via
  // refs and the timer runs from a single mount effect — depending on those identities
  // would restart the countdown forever.
  const picked = useRef(false);
  const armed = useRef(false); // input ignored until the open settles (anti click-through)
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const recIdRef = useRef(options[best].id);
  recIdRef.current = options[best].id;

  const pick = (id: string): void => {
    if (!armed.current || picked.current) return; // ignore pre-arm clicks; one pick only
    picked.current = true;
    audio.cue('select');
    onPickRef.current(id);
  };

  // Wave-cleared fanfare on open (the sim also deals a 'draft' sound) + the input-arm beat.
  useEffect(() => {
    audio.cue('clear');
    const id = window.setTimeout(() => { armed.current = true; }, DRAFT_ARM_MS);
    return () => window.clearTimeout(id);
  }, []);

  // Countdown → auto-pick the recommended card. A manual pick unmounts the modal, whose
  // cleanup clears the interval — i.e. selecting "immediately cancels the timer".
  useEffect(() => {
    if (!auto) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const left = Math.max(0, AUTO_SECONDS - (performance.now() - start) / 1000);
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(id);
        pick(recIdRef.current);
      }
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.key >= '1' && e.key <= String(options.length)) {
        pick(options[Number(e.key) - 1].id);
      } else if (e.key === 'Enter') {
        pick(recIdRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  return (
    <div className="overlay">
      <div className="draft-head">
        {clearedWave ? <div className="wave-cleared">◆ WAVE {clearedWave} CLEARED ◆</div> : null}
        <h2>DRAFT A GENE CARD</h2>
        <p className="draft-sub">
          Powers this run only — press <kbd>1</kbd>–<kbd>{options.length}</kbd> or <kbd>Enter</kbd> for the pick.
        </p>
        {auto && (
          <div className="draft-auto" role="timer">
            <span className="draft-auto-k">◆ AUTO-DRAFT</span>
            <span className="draft-auto-bar">
              <span className="draft-auto-fill" style={{ width: `${(remaining / AUTO_SECONDS) * 100}%` }} />
            </span>
            <span className="draft-auto-n">{Math.ceil(remaining)}s</span>
            <span className="draft-auto-hint">pick any card to override</span>
          </div>
        )}
      </div>
      <div className="cards">
        {options.map((o, i) => {
          const aff = affectsOf(o.subject);
          return (
          <button
            key={o.id}
            className={`card r-${o.rarity}${i === best ? ' is-rec' : ''}${auto && i === best ? ' auto-target' : ''}`}
            style={{ animationDelay: `${i * 70}ms` }}
            onPointerEnter={() => audio.cue('ui')}
            onClick={() => pick(o.id)}
          >
            <span className="card-hotkey">{i + 1}</span>
            <span className="card-top">
              <span className="card-rarity">{o.rarity}</span>
              {i === best && <span className="card-rec">◆ PICK</span>}
            </span>
            {/* "What it affects" — immediately recognizable: tower icon+color+name, or
                HERO / GLOBAL / ECONOMY / HIVE. The synergy tag rides along, muted. */}
            <span className="card-affects-row">
              <span className="card-affects" style={{ color: aff.color }}>
                {aff.icon}
                <span className="card-affects-name">{aff.label}</span>
              </span>
              <span className="card-syn">{o.category}</span>
            </span>
            <span className="card-name">{o.name}</span>
            <span className="card-desc">{o.description}</span>
            <span className="card-pick">DRAFT</span>
          </button>
          );
        })}
      </div>
      <div className="hint">Gene Cards reset when you extract or fall.</div>
    </div>
  );
}
