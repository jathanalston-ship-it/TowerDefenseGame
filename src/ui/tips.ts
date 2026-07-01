// Loading tips (docs/HELP.md) — one-line teachers rotated on the Play screen as the player heads
// into a run. Pure data: adding a tip is one row, so the pool scales with the game. Kept short
// (one sentence each) and weighted toward the systems new players miss — the Gene Evolution loop
// especially (docs/GENE-EVOLUTION.md).

export const TIPS: string[] = [
  // ── Gene Evolution — the loop new players should absorb ──
  'Every Gene Card you draft is collected FOREVER — level it up in the Gene Archive.',
  'Gene Essence comes mainly from duplicate shards once a tower or hero is max Star — cracking containers always advances you.',
  'A Gene Card’s permanent levels apply every single time you draft it — in every future run.',
  'Deeper Gene levels unlock globally at Campaign milestones: L2 at Stage 15, up to L5 at Stage 75.',
  'Equip Starting Genes in the Archive — they auto-activate at their permanent level when every run begins.',
  'Rare Bio-Containers can carry a trace of bonus Gene Essence — rarer containers, better odds.',
  'Card Ascension is coming: your Gene collection is already built for it.',
  // ── The wider loops ──
  'Power Score folds every permanent system into one number — if it went up, you got stronger.',
  'Bio-Containers bank unopened in the Genetic Vault — crack them for gear, shards, and materials.',
  'Different towers fill different battlefield roles — layering single-target, splash, and support wins waves.',
  'Your Hero fights on its own, but the Active Ability is yours — spend it on the wave’s worst moment.',
  'Push the Campaign: depth unlocks the Star Cap, Hero Slots, Prestige, and Gene levels.',
];

/** Pick a tip for this visit — random is fine here (UI-only; the sim never reads this). */
export function pickTip(): string {
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}
