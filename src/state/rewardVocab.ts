// REWARD VOCABULARY (docs/NOTIFICATIONS.md §vocab) — the configuration registry behind every
// claim receipt: one row per reward KIND defines its glyph, display name, ceremony TIER, merge
// behavior and label format. The receipt pipeline (meta.applyRewardList stamps `kind`/`qty`
// on its lines; rewardToast derives the ceremony tier and coalesces rapid identical receipts;
// RewardToaster scales presentation and audio by tier) reads ONLY this table — a future reward
// type inherits its whole toast presentation from one new row, never a hardcoded display.
// Pure data + helpers: no React, no save, no imports from the toast layer (one-way dependency).

export type RewardTier = 'common' | 'rare' | 'epic' | 'legendary';

/** The structural line shape the vocabulary formats/merges. rewardToast's RewardToastLine and
 *  meta's PremiumReceiptLine both satisfy it (structural typing — no import cycle). */
export interface RewardLineShape {
  icon: string;
  label: string;
  rarity?: string; // container/equipment rarity — tints the line AND can raise the tier
  kind?: string; // vocabulary id — presence makes the line tierable + mergeable
  qty?: number; // quantity — mergeable lines sum this
}

export interface RewardKindDef {
  id: string;
  icon: string;
  name: string; // display name, written for a quantity label ("Genome Cores")
  tier: RewardTier; // base ceremony tier (a line's rarity can raise it — containers/equipment)
  mergeable: boolean; // rapid identical receipts combine quantities (docs/NOTIFICATIONS.md §merge)
  /** 'qty' → "12,500 Genome Cores" · 'count' → "3× Rare Bio-Container" (rarity-prefixed). */
  fmt: 'qty' | 'count';
}

// One row per reward kind the receipts speak today. Glyphs match the single-sourced icons in
// meta.applyRewardList / battlePass.rewardLabel (the DESTINATIONS map keys on the same set).
export const REWARD_KINDS: readonly RewardKindDef[] = [
  { id: 'cores', icon: '⬡', name: 'Genome Cores', tier: 'common', mergeable: true, fmt: 'qty' },
  { id: 'ichor', icon: '◆', name: 'Ichor', tier: 'rare', mergeable: true, fmt: 'qty' },
  { id: 'essence', icon: '⌬', name: 'Gene Essence', tier: 'common', mergeable: true, fmt: 'qty' },
  { id: 'towerShards', icon: '✦', name: 'Strain Samples', tier: 'common', mergeable: true, fmt: 'qty' },
  { id: 'heroShards', icon: '✦', name: 'Apex Genome', tier: 'common', mergeable: true, fmt: 'qty' },
  { id: 'container', icon: '◈', name: 'Bio-Container', tier: 'rare', mergeable: true, fmt: 'count' },
  { id: 'cache', icon: '⬢', name: 'Run Cache', tier: 'common', mergeable: true, fmt: 'count' },
  { id: 'mutagen', icon: '⊕', name: 'Mutagen', tier: 'common', mergeable: true, fmt: 'qty' },
  { id: 'scrap', icon: '◳', name: 'Scrap', tier: 'common', mergeable: true, fmt: 'qty' },
  { id: 'catalyst', icon: '✷', name: 'Catalyst', tier: 'rare', mergeable: true, fmt: 'qty' },
  { id: 'stamina', icon: '☠', name: 'Rush Stamina', tier: 'common', mergeable: true, fmt: 'qty' },
  { id: 'seasonXp', icon: '❁', name: 'Season XP', tier: 'common', mergeable: true, fmt: 'qty' },
  { id: 'antigen', icon: '☣', name: 'Antigen', tier: 'rare', mergeable: true, fmt: 'qty' },
  { id: 'cosmetic', icon: '❖', name: 'Cosmetic', tier: 'epic', mergeable: false, fmt: 'count' },
  { id: 'phenotype', icon: '🧬', name: 'Phenotype', tier: 'epic', mergeable: false, fmt: 'count' },
  { id: 'title', icon: '❈', name: 'Title', tier: 'epic', mergeable: false, fmt: 'count' },
  { id: 'equipment', icon: '⛨', name: 'Bio-Gear', tier: 'rare', mergeable: false, fmt: 'count' },
  { id: 'modifier', icon: '⊛', name: 'Mulligan Modifier', tier: 'rare', mergeable: false, fmt: 'count' },
] as const;

const BY_ID = new Map(REWARD_KINDS.map((k) => [k.id, k] as const));
export const rewardKind = (id: string | undefined): RewardKindDef | undefined =>
  id !== undefined ? BY_ID.get(id) : undefined;

const TIER_RANK: Record<RewardTier, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const tierRank = (t: RewardTier): number => TIER_RANK[t];

/** Container/equipment rarity → ceremony tier (legendary presentation for legendary+ pulls). */
export function tierForRarity(rarity: string | undefined): RewardTier | undefined {
  switch (rarity) {
    case 'common': return 'common';
    case 'uncommon': case 'rare': return 'rare';
    case 'epic': return 'epic';
    case 'legendary': case 'exotic': return 'legendary';
    default: return undefined;
  }
}

const cap = (s: string): string => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s);

/** The canonical label for (kind, qty[, rarity]) — regenerated after every merge. */
export function vocabLabel(def: RewardKindDef, qty: number, rarity?: string): string {
  if (def.fmt === 'count') {
    const what = rarity ? `${cap(rarity)} ${def.name}` : def.name;
    return `${qty}× ${what}`;
  }
  return `${qty.toLocaleString()} ${def.name}`;
}

/** Build a fully-vocabularized receipt line — the one call a NEW claim site needs. */
export function vocabLine(kindId: string, qty: number, rarity?: string): RewardLineShape {
  const def = BY_ID.get(kindId);
  if (!def) return { icon: '◈', label: `${qty.toLocaleString()} ${kindId}`, kind: kindId, qty };
  return { icon: def.icon, label: vocabLabel(def, qty, rarity), kind: def.id, qty, ...(rarity ? { rarity } : null) };
}

/** A single line's ceremony tier: rarity override first, else its kind's base, else common. */
export function lineTier(line: RewardLineShape): RewardTier {
  return tierForRarity(line.rarity) ?? rewardKind(line.kind)?.tier ?? 'common';
}

/** A whole receipt's tier = its loudest line (drives dwell, treatment and audio). */
export function receiptTier(lines: readonly RewardLineShape[]): RewardTier {
  let best: RewardTier = 'common';
  for (const l of lines) {
    const t = lineTier(l);
    if (TIER_RANK[t] > TIER_RANK[best]) best = t;
  }
  return best;
}
