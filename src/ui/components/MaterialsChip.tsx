// MATERIALS CHIP (docs/ECONOMY.md §player-facing) — every secondary crafting wallet in ONE
// top-bar chip: Mutagen · Scrap · Catalyst from the Armory reveal, Chitin and Mulligan Tissue
// joining as their systems reveal (state/rewardVisibility.materialWallets). The chip shows the
// group total; tapping it opens the per-wallet breakdown. Silent until something is held — a
// zero chip is top-bar noise (docs/INFO-HIERARCHY.md §3).

import { useEffect, useRef, useState } from 'react';
import type { SaveData } from '../../save/saveStore';
import { materialWallets } from '../../state/rewardVisibility';

export function MaterialsChip({ save }: { save: SaveData }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const wallets = materialWallets(save);
  const total = wallets.reduce((n, w) => n + w.amount, 0);
  if (wallets.length === 0 || total <= 0) return null;
  const breakdown = wallets.map((w) => `${w.name} ${w.amount.toLocaleString('en-US')}`).join(' · ');
  return (
    <span className="hub-cur mats-chip" data-cur="mats" ref={ref}>
      <button
        type="button"
        className="mats-chip-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Materials ${total.toLocaleString('en-US')} — ${breakdown}`}
        title={breakdown}
      >
        ⊕ {total.toLocaleString('en-US')} <span className="hub-cur-l">Materials</span>
      </button>
      {open && (
        <span className="mats-chip-pop panel" role="dialog" aria-label="Materials">
          {wallets.map((w) => (
            <span key={w.key} className="mats-chip-row">
              <span aria-hidden>{w.glyph}</span> {w.name} <b>{w.amount.toLocaleString('en-US')}</b>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
