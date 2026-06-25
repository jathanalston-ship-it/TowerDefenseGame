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
      <h2>DRAFT A GENE CARD</h2>
      <div className="cards">
        {options.map((o) => (
          <button key={o.id} className={`card ${o.rarity}`} onClick={() => onPick(o.id)}>
            <span className="badge">{o.rarity}</span>
            <span className="cat">{o.category}</span>
            <span className="cname">{o.name}</span>
            <span className="cdesc">{o.description}</span>
          </button>
        ))}
      </div>
      <div className="hint">Gene Cards last for this run only — they reset when you extract or fall.</div>
    </div>
  );
}
