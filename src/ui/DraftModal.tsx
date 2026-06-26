// Gene Card draft — pick 1 of 3 between waves. Doubles as the WAVE-CLEARED beat:
// it leads with a celebratory eyebrow + fanfare so finishing a wave feels earned,
// then gets out of the way fast (rarity color, a flagged best pick, number-key
// drafting). Data-driven over CardOption, so it scales to hundreds of cards.

import { useEffect } from 'react';
import { audio } from '../audio/sound';
import type { CardOption } from '../core/types';

// Higher = rarer. Unknown tiers sort as 0, so new rarities slot in by adding a key.
const RARITY_RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, exotic: 4 };

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

  // Wave-cleared fanfare on open (the sim also deals a 'draft' sound).
  useEffect(() => {
    audio.cue('clear');
  }, []);

  const pick = (id: string): void => {
    audio.cue('select');
    onPick(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.key >= '1' && e.key <= String(options.length)) {
        pick(options[Number(e.key) - 1].id);
      } else if (e.key === 'Enter') {
        pick(options[best].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, best, onPick]);

  return (
    <div className="overlay">
      <div className="draft-head">
        {clearedWave ? <div className="wave-cleared">◆ WAVE {clearedWave} CLEARED ◆</div> : null}
        <h2>DRAFT A GENE CARD</h2>
        <p className="draft-sub">
          Powers this run only — press <kbd>1</kbd>–<kbd>{options.length}</kbd> or <kbd>Enter</kbd> for the pick.
        </p>
      </div>
      <div className="cards">
        {options.map((o, i) => (
          <button
            key={o.id}
            className={`card r-${o.rarity}${i === best ? ' is-rec' : ''}`}
            style={{ animationDelay: `${i * 70}ms` }}
            onPointerEnter={() => audio.cue('ui')}
            onClick={() => pick(o.id)}
          >
            <span className="card-hotkey">{i + 1}</span>
            <span className="card-top">
              <span className="card-rarity">{o.rarity}</span>
              {i === best && <span className="card-rec">◆ PICK</span>}
            </span>
            <span className="card-cat">{o.category}</span>
            <span className="card-name">{o.name}</span>
            <span className="card-desc">{o.description}</span>
            <span className="card-pick">DRAFT</span>
          </button>
        ))}
      </div>
      <div className="hint">Gene Cards reset when you extract or fall.</div>
    </div>
  );
}
