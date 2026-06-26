import type { CardOption } from '../core/types';

export function DraftModal({
  options,
  onPick,
}: {
  options: CardOption[];
  onPick: (id: string) => void;
}): JSX.Element {
  return (
    <div className="overlay">
      <div className="draft-head">
        <h2>DRAFT A GENE CARD</h2>
        <p className="draft-sub">Choose one — it powers this run only.</p>
      </div>
      <div className="cards">
        {options.map((o, i) => (
          <button
            key={o.id}
            className={`card r-${o.rarity}`}
            style={{ animationDelay: `${i * 70}ms` }}
            onClick={() => onPick(o.id)}
          >
            <span className="card-rarity">{o.rarity}</span>
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
