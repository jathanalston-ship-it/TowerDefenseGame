// PREMIUM FORMAT — the Premium Store's small formatters, shared with the hub's FlashOfferPopup.
// Kept apart from ui/PremiumStore.tsx so the popup (boot) doesn't pull the whole store screen into
// the boot bundle (docs/DEPLOYMENT.md §boot-budget). Pure: no React, no meta.

import type { PremiumGrant } from '../core/premium';

export const fmtUsd = (v: number): string => `$${v.toFixed(2)}`;
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

/** Human line per grant — the card preview (the receipt carries its own resolved lines). */
export function grantLine(g: PremiumGrant): { icon: string; label: string; rarity?: string } {
  switch (g.grant) {
    case 'ichor': return { icon: '◆', label: `${g.qty} Ichor` };
    case 'cores': return { icon: '⬡', label: `${g.qty} Genome Cores` };
    case 'geneEssence': return { icon: '⌬', label: `${g.qty} Gene Essence` };
    case 'mats': return { icon: '⚒', label: `Materials ⊕${g.mutagen ?? 0} ◳${g.scrap ?? 0} ✷${g.catalyst ?? 0}` };
    case 'towerShardsAll': return { icon: '✦', label: `${g.qtyEach} Strain Samples × every tower` };
    case 'heroShardsAll': return { icon: '✦', label: `${g.qtyEach} Apex Genome × every hero` };
    case 'container': return { icon: '◈', label: `${g.count}× ${g.rarity} Bio-Container`, rarity: g.rarity };
    case 'runCache': return { icon: '⬢', label: `${g.count}× Run Cache` };
    case 'equipment': return { icon: '⛨', label: `${g.count}× ${g.rarity} Equipment`, rarity: g.rarity };
    case 'rushStamina': return { icon: '☠', label: `${g.qty} Rush Stamina` };
    case 'battlePassPremium': return { icon: '❁', label: 'Premium track — current season' };
  }
}
