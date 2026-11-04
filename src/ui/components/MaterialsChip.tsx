// MATERIALS CHIP (docs/ECONOMY.md §player-facing) — every secondary crafting wallet in ONE
// top-bar chip: Mutagen · Scrap · Catalyst from the Armory reveal, Chitin and Mulligan Tissue
// joining as their systems reveal (state/rewardVisibility.materialWallets). The chip shows the
// group total; tapping it opens the per-wallet breakdown (the shared ChipPopover — fixed-
// positioned, so the narrow shells' scrolling top bar never clips it). Silent until something
// is held — a zero chip is top-bar noise (docs/INFO-HIERARCHY.md §3).

import type { SaveData } from '../../save/saveStore';
import { materialWallets } from '../../state/rewardVisibility';
import { ChipPopover } from './ChipPopover';

export function MaterialsChip({ save }: { save: SaveData }): JSX.Element | null {
  const wallets = materialWallets(save);
  const total = wallets.reduce((n, w) => n + w.amount, 0);
  if (wallets.length === 0 || total <= 0) return null;
  const breakdown = wallets.map((w) => `${w.name} ${w.amount.toLocaleString('en-US')}`).join(' · ');
  return (
    <ChipPopover
      className="hub-cur mats-chip"
      dataCur="mats"
      ariaLabel={`Materials ${total.toLocaleString('en-US')} — ${breakdown}`}
      popLabel="Materials"
      face={<>⊕ {total.toLocaleString('en-US')} <span className="hub-cur-l">Materials</span></>}
    >
      {() => wallets.map((w) => (
        <span key={w.key} className="mats-chip-row">
          <span aria-hidden>{w.glyph}</span> {w.name} <b>{w.amount.toLocaleString('en-US')}</b>
        </span>
      ))}
    </ChipPopover>
  );
}
