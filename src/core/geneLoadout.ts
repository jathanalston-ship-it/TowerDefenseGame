// Starting Gene Loadouts (docs/GENE-EVOLUTION.md §Loadouts, Task 7) — the pure data + sanitizers.
// Players equip Gene Cards that AUTO-ACTIVATE when every run begins. One slot is free; each further
// slot (max five) needs Campaign progression AND a Genome Core investment. All ladder values are
// data — rebalance = edit rows. No DOM/save/meta here.

import { cardRegistry } from './cards';

export const GENE_LOADOUT_MAX = 5;

/** The slot ladder: slot 1 is free from the start; 2–5 unlock with Campaign progress + Genome
 *  Cores (both required — the spec's dual gate). Locked slots always DISPLAY these requirements. */
export const GENE_LOADOUT_SLOTS: { slot: number; campaignStage: number; coreCost: number }[] = [
  { slot: 1, campaignStage: 0, coreCost: 0 },
  { slot: 2, campaignStage: 10, coreCost: 300 },
  { slot: 3, campaignStage: 25, coreCost: 900 },
  { slot: 4, campaignStage: 45, coreCost: 2000 },
  { slot: 5, campaignStage: 70, coreCost: 4500 },
];

/** Coerce a saved unlocked-slot count into 1..GENE_LOADOUT_MAX (slot 1 is always owned). */
export function sanitizeGeneSlots(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1;
  return Math.max(1, Math.min(GENE_LOADOUT_MAX, n));
}

/** Coerce a saved loadout into exactly GENE_LOADOUT_MAX entries: registered card ids or null, with
 *  duplicates dropped (a card may occupy only ONE slot — the spec's no-duplicates rule). */
export function sanitizeGeneLoadout(raw: unknown): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: GENE_LOADOUT_MAX }, () => null);
  if (!Array.isArray(raw)) return out;
  const seen = new Set<string>();
  for (let i = 0; i < GENE_LOADOUT_MAX; i++) {
    const v = raw[i];
    if (typeof v !== 'string' || seen.has(v) || !cardRegistry.has(v)) continue;
    seen.add(v);
    out[i] = v;
  }
  return out;
}
