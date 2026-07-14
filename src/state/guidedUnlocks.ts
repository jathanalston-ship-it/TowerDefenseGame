// GUIDED UNLOCKS (docs/GUIDED-UNLOCKS.md — Foundation #3 of the UX consolidation pass): when a
// wing unlocks, the What's New card's "Show me ▸" hands the player to a SHORT anchored walkthrough
// ON the new screen — spotlight the heart of the wing, spotlight its primary control, invite the
// first real interaction, pay a small one-time reward, offer the way home. The sequence is data:
// one GuideDef per taught mechanic, rendered by ui/GuidedUnlock with the same Spotlight/Callout
// primitives the Combat Tutorial uses. Anti-wordiness is a TESTED contract (playtest finding:
// wordy = skipped): each step is one verb-first sentence, ≤4 steps, skippable at every moment.
//
// COALESCING CONTRACT: guides key off the mechanics registry rows that FEATURES.teach already
// announces (one unlock, one teaching chain: reveal latch → What's New card → this guide), anchor
// the SAME `[data-guide]` marks the screens themselves declare, and the interact steps on spend
// screens point at the Power Advisor's Best-Value strip — the guide teaches the advisor, not a
// parallel truth. Rewards ride meta.grantTutorialMilestone('guided', mech) — the tutorial's own
// idempotence ledger, so replays re-teach but never re-grant.
//
// SCOPE: every screen the learning curve GUARANTEES by campaign stage 4 (the new-player window)
// must carry a guide — enforced in guidedUnlocks.test.ts against FEATURES itself, so a future
// early-game wing demands a guide the moment it's registered. Excluded by design: `campaign`
// (the Combat Tutorial + Mission Control own it) and the Premium Store (never guide-push a shop).
// Later wings (stage 5+) may add rows here any time — the framework is content-agnostic.

export interface GuideStep {
  /** `[data-guide="…"]` selector on the destination screen. Missing/absent element degrades to a
   *  centered callout with no dim — a guide can never black out or trap the player. */
  anchor?: string;
  title: string; // verb-first headline
  text: string; // ONE sentence — the anti-wordiness contract (length-tested)
  /** Advance on the player's first real click inside the anchor (the practice objective). The
   *  callout keeps a "Got it" escape so a disabled/empty control never traps. */
  interact?: boolean;
}

export interface GuideDef {
  mech: string; // mechanics-registry id (== a FEATURES.teach value) — the What's New card that arms it
  nav: string; // destination wing (the feature id / hub NavKey)
  reward: number; // Genome Cores granted once on completion (ledger-idempotent)
  steps: GuideStep[];
}

export const GUIDES: GuideDef[] = [
  {
    mech: 'containers', nav: 'vault', reward: 15,
    steps: [
      { anchor: '[data-guide="vault-ready"]', title: 'Your banked loot lives here',
        text: 'Every run banks sealed Bio-Containers — they do nothing until you crack them.' },
      { anchor: '[data-guide="vault-crack"]', interact: true, title: 'Crack one open',
        text: 'Open a container now — Strain Samples, materials and gear pour out.' },
    ],
  },
  {
    mech: 'towers', nav: 'towers', reward: 15,
    steps: [
      { anchor: '[data-guide="lab-rail"]', title: 'Pick a specimen',
        text: 'Every tower you field is bred here — select one to see its evolution path.' },
      { anchor: '[data-guide="lab-buy"]', interact: true, title: 'Mutate it',
        text: 'Spend Strain Samples on a star — each one is a permanent transformation.' },
    ],
  },
  {
    mech: 'genome-core', nav: 'evolution', reward: 15,
    steps: [
      { anchor: '[data-guide="evo-treasury"]', title: 'Permanent account power',
        text: 'Genome Cores buy upgrades that apply to every future run — nothing here resets.' },
      { anchor: '[data-guide="bbs"]', interact: true, title: 'Trust the strip',
        text: 'BEST VALUE always names your strongest Power per Core — buy it when you can.' },
    ],
  },
  {
    mech: 'heroes', nav: 'heroes', reward: 15,
    steps: [
      { anchor: '[data-guide="hero-roster"]', title: 'Your champions',
        text: 'Heroes fight beside your towers — develop them here as their shards drop.' },
      { anchor: '[data-guide="bbs"]', interact: true, title: 'Grow your champion',
        text: 'The BEST VALUE strip ranks hero upgrades too — take the top pick.' },
    ],
  },
  {
    mech: 'infinite', nav: 'infinite', reward: 15,
    steps: [
      { anchor: '[data-guide="inf-start"]', title: 'The endless descent',
        text: 'No victory down here — only depth, and the richest loot faucet in the game.' },
      { anchor: '[data-guide="inf-start"]', title: 'Farm when walled',
        text: 'When a Campaign stage stops you, dive here — banked loot buys the way through.' },
    ],
  },
  {
    mech: 'splice-market', nav: 'market', reward: 15,
    steps: [
      { anchor: '[data-guide="market-grid"]', title: 'The rotating bazaar',
        text: 'Stock refreshes on a timer — Cores and Ichor buy cards, materials and gear.' },
      { anchor: '[data-guide="market-grid"]', interact: true, title: 'Browse an offer',
        text: 'Tap any offer to inspect it — sold-out slots return at the next refresh.' },
    ],
  },
  {
    mech: 'gene-archive', nav: 'genes', reward: 15,
    steps: [
      { anchor: '[data-guide="gene-loadout"]', title: 'Cards collect forever',
        text: 'Every card you draft lands here permanently — equip Starting Genes to open runs with them.' },
      { anchor: '[data-guide="bbs"]', interact: true, title: 'Level a card',
        text: 'Gene Essence upgrades a card permanently — the strip names the best one.' },
    ],
  },
  {
    mech: 'equipment', nav: 'equipment', reward: 15,
    steps: [
      { anchor: '[data-guide="armory-loadouts"]', title: 'Gear your heroes',
        text: 'Each hero carries a weapon, armor and a relic — an empty slot is wasted Power.' },
      { anchor: '[data-guide="armory-grid"]', interact: true, title: 'Inspect an item',
        text: 'Tap a piece in the inventory to examine and equip it.' },
    ],
  },
  {
    mech: 'quests', nav: 'quests', reward: 15,
    steps: [
      { anchor: '[data-guide="quest-weekly"]', title: 'Your weekly to-do list',
        text: 'Directives bank progress from everything you already do — claim as they fill.' },
      { anchor: '[data-guide="quest-story"]', title: 'The story contracts',
        text: 'Chapter contracts pay the biggest one-time rewards — check them between runs.' },
    ],
  },
  {
    mech: 'hive-construction', nav: 'hive', reward: 15,
    steps: [
      { anchor: '[data-guide="hive-grid"]', title: 'Build the organism',
        text: 'Organs are grand projects — each one permanently transforms how your base works.' },
      { anchor: '[data-guide="hive-grid"]', title: 'Feed it everything',
        text: 'Organs drink Cores, Essence and materials — a long goal worth saving toward.' },
    ],
  },
];

const BY_MECH: ReadonlyMap<string, GuideDef> = new Map(GUIDES.map((g) => [g.mech, g]));

/** The guide for a just-announced mechanic, if one exists (What's New's "Show me ▸" arms it). */
export function guideFor(mechId: string): GuideDef | null {
  return BY_MECH.get(mechId) ?? null;
}

// Tiny arm-a-guide bus (mirrors navBus): components that can't reach the App's overlay state —
// the What's New card, the Help wiki's replay button — ask the shell to run a guide. The App
// subscribes on mount; emits before a subscriber exists are dropped (all callers render on the
// menu, where the App is always listening). Replays re-teach; the ledger keeps them unpaid.
type StartFn = (mechId: string) => void;
const guideSubs = new Set<StartFn>();

export const guideBus = {
  /** Ask the shell to run the guide for a mechanic (no-op if none exists or nothing listens). */
  start(mechId: string): void {
    if (!BY_MECH.has(mechId)) return;
    for (const fn of guideSubs) fn(mechId);
  },
  onStart(fn: StartFn): () => void {
    guideSubs.add(fn);
    return () => { guideSubs.delete(fn); };
  },
};
