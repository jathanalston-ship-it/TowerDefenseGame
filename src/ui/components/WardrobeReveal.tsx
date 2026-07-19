// WARDROBE UNLOCK CEREMONY (docs/COSMETICS.md §wardrobe) — every cosmetic unlock gets its
// moment: a rarity-lit card blooms out of a spore burst with the kind's icon, the item's
// living preview, name, story and source. The queue is PERSISTED (save.wardrobe.pendingReveal),
// so a run-end unlock still celebrates after a reload. Click advances; the last click closes.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { meta } from '../../state/meta';
import { sourceLabel, WARDROBE_RARITY_COLOR, wardrobeKind } from '../../core/wardrobe';
import type { WardrobeItemDef } from '../../core/wardrobe';
import { audio } from '../../audio/sound';

export function WardrobeReveal(): JSX.Element | null {
  const save = meta.use();
  const [queue, setQueue] = useState<WardrobeItemDef[]>([]);
  const [idx, setIdx] = useState(0);

  const pending = save.wardrobe.pendingReveal.length;
  useEffect(() => {
    if (pending > 0 && queue.length === 0) {
      const defs = meta.takeWardrobeReveals();
      if (defs.length > 0) {
        setQueue(defs);
        setIdx(0);
        audio.cue('chest');
      }
    }
  }, [pending, queue.length]);

  if (queue.length === 0) return null;
  const d = queue[idx];
  const kind = wardrobeKind(d.kind);
  const rc = WARDROBE_RARITY_COLOR[d.rarity];
  const next = (): void => {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      audio.cue('reveal');
    } else {
      setQueue([]);
    }
  };

  // A BACKLOG is a bank statement, not a moment (docs/COSMETICS.md §wardrobe): six-plus
  // queued unlocks (fast progress, restored save) collapse into ONE summary card — every
  // item named, one gesture. Per-card theater stays for the live-play trickle (≤5).
  if (queue.length > 5) {
    return (
      <div className="wdr-veil" role="dialog" aria-label={`${queue.length} cosmetics unlocked`}>
        <div className="wdr-card wdr-batch-card">
          <div className="wdr-burst" aria-hidden><i /><i /><i /><i /><i /><i /></div>
          <div className="wdr-eyebrow">SPECIMENS ACQUIRED</div>
          <div className="wdr-name">{queue.length} specimens landed in the Vault</div>
          <div className="wdr-batch" role="list">
            {queue.map((q) => (
              <span key={q.id} role="listitem" className="wdr-batch-row" style={{ ['--rc' as string]: WARDROBE_RARITY_COLOR[q.rarity] } as CSSProperties}>
                <i aria-hidden>{q.payload.glyph ?? wardrobeKind(q.kind).icon}</i>
                <b>{q.name}</b>
                <em>{q.rarity}</em>
              </span>
            ))}
          </div>
          <button className="primary wdr-next" onClick={() => { setQueue([]); audio.cue('reveal'); }}>
            To the Specimen Vault — claim to bind
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wdr-veil" role="dialog" aria-label={`Cosmetic unlocked — ${d.name}`} onClick={next}>
      <div className={`wdr-card is-${d.rarity}`} style={{ ['--rc' as string]: rc, ['--pc' as string]: d.payload.accent ?? rc } as CSSProperties}>
        <div className="wdr-burst" aria-hidden><i /><i /><i /><i /><i /><i /></div>
        <div className="wdr-eyebrow">SPECIMEN ACQUIRED · {kind.name}</div>
        <div className="wdr-icon" aria-hidden>{d.payload.glyph ?? kind.icon}</div>
        <div className="wdr-rarity" style={{ color: rc }}>{d.rarity.toUpperCase()}</div>
        <div className="wdr-name">{d.name}</div>
        <p className="wdr-desc">{d.desc}</p>
        <div className="wdr-src">{sourceLabel(d.source)}</div>
        <button className="primary wdr-next" onClick={(e) => { e.stopPropagation(); next(); }}>
          {idx + 1 < queue.length ? `Next (${idx + 1}/${queue.length})` : 'Claim it in the Vault'}
        </button>
        {queue.length - idx > 2 && (
          // A backlog (fast progress, restored save) can queue DOZENS of ceremonies — never
          // hold the player hostage to the chain: one tap banks the rest without the theater.
          <button className="wdr-skipall" onClick={(e) => { e.stopPropagation(); setQueue([]); audio.cue('ui'); }}>
            Bank all {queue.length - idx} — skip the ceremony
          </button>
        )}
      </div>
    </div>
  );
}
