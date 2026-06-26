// Gene Card draft — pick 1 of 3 between waves. Tuned for FAST decisions: rarity is
// color-coded, the strongest option is flagged, and number keys (or Enter for the
// recommended pick) draft instantly. Fully data-driven over CardOption, so it scales
// to hundreds of cards and any number of rarity tiers without code changes here.

import { useEffect } from 'react';
import type { CardOption } from '../core/types';

// Higher = rarer. Unknown tiers sort as 0, so new rarities slot in by adding a key.
const RARITY_RANK: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, exotic: 4 };

export function DraftModal({
  options,
  onPick,
}: {
  options: CardOption[];
  onPick: (id: string) => void;
}): JSX.Element {
  // Recommend the highest-rarity option (first on ties) to speed the call.
  let best = 0;
  for (let i = 1; i < options.length; i++) {
    if ((RARITY_RANK[options[i].rarity] ?? 0) > (RARITY_RANK[options[best].rarity] ?? 0)) best = i;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.key >= '1' && e.key <= String(options.length)) {
        onPick(options[Number(e.key) - 1].id);
      } else if (e.key === 'Enter') {
        onPick(options[best].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options, best, onPick]);

  return (
    <div className="overlay">
      <div className="draft-head">
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
            onClick={() => onPick(o.id)}
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
