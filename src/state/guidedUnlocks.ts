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

  // ── The later wings (stage 5+): same contract, gentler practice — modes and spend-decision
  //    screens never force a run or a purchase; the walkthrough points, the player chooses. ──
  {
    mech: 'daily-run', nav: 'daily', reward: 15,
    steps: [
      { anchor: '[data-guide="daily-deploy"]', title: 'One seed, worldwide',
        text: 'Everyone plays the same run today — same map, same waves, same hero.' },
      { anchor: '[data-guide="daily-deploy"]', title: 'Come back tomorrow',
        text: 'One reward per day, a fresh seed at midnight UTC — a quick daily ritual.' },
    ],
  },
  {
    mech: 'collection-codex', nav: 'collection', reward: 15,
    steps: [
      { anchor: '[data-guide="collection-tiles"]', title: 'Discovery itself pays',
        text: 'Everything you meet is catalogued — filling ranks mints real rewards.' },
      { anchor: '[data-guide="collection-tiles"]', interact: true, title: 'Open a wing',
        text: 'Tap any category to browse what you have found — and what is still hiding.' },
    ],
  },
  {
    mech: 'season-pass', nav: 'season', reward: 15,
    steps: [
      { anchor: '[data-guide="bp-track"]', title: 'Everything feeds the season',
        text: 'Runs, achievements, expeditions — all of it banks Season XP. You never grind FOR the pass.' },
      { anchor: '[data-guide="bp-claim"]', interact: true, title: 'Claim as you level',
        text: 'Unclaimed rewards mail themselves at rollover — but claiming now feels better.' },
    ],
  },
  {
    mech: 'idle-harvest', nav: 'harvest', reward: 15,
    steps: [
      { anchor: '[data-guide="hv-advice"]', title: 'The Hive works while you rest',
        text: 'Time away banks a harvest — your first return pays a ceremony.' },
      { anchor: '[data-guide="hv-arrive"]', title: 'Collect on arrival',
        text: 'The arrival card holds what accrued — it brims after long absences, so visit daily.' },
    ],
  },
  {
    mech: 'expeditions', nav: 'expeditions', reward: 15,
    steps: [
      { anchor: '[data-guide="exb-board"]', title: 'Benched heroes forage',
        text: 'Champions you are not fielding can work the ruins — nothing idle, ever.' },
      { anchor: '[data-guide="exb-board"]', interact: true, title: 'Open a mission',
        text: 'Tap a mission to read its risk, duration and finds — then send who fits.' },
    ],
  },
  {
    mech: 'gear-codex', nav: 'gearcodex', reward: 15,
    steps: [
      { anchor: '[data-guide="gearcodex-root"]', title: 'The full armory gallery',
        text: 'Every item that exists — owned pieces in color, undiscovered ones as silhouettes.' },
      { anchor: '[data-guide="gearcodex-root"]', title: 'Silhouettes are goals',
        text: 'Set pages show what each completed set pays — chase the missing piece.' },
    ],
  },
  {
    mech: 'mulligans', nav: 'mulligans', reward: 15,
    steps: [
      { anchor: '[data-guide="mulligan-rail"]', title: 'Graft living organisms',
        text: 'Modifiers from containers graft onto towers — assembled organisms grow real Power.' },
      { anchor: '[data-guide="mulligan-rail"]', interact: true, title: 'Pick a host',
        text: 'Select a specimen to see its graft slots and what each discovered piece would add.' },
    ],
  },
  {
    mech: 'adaptation', nav: 'adaptation', reward: 15,
    steps: [
      { anchor: '[data-guide="adapt-root"]', title: 'Rewrite behavior with Antigen',
        text: 'Adaptations change HOW a strain fights — build-defining picks, not stat bumps.' },
      { anchor: '[data-guide="adapt-advisor"]', title: 'Spend with counsel',
        text: 'Antigen is scarce — the advisor names the strongest pick before you commit.' },
    ],
  },
  {
    mech: 'phenotype-lab', nav: 'phenotypes', reward: 15,
    steps: [
      { anchor: '[data-guide="wardrobe-boutique"]', title: 'Pure style, zero stats',
        text: 'Phenotypes reskin your strains and champions — cosmetic only, forever yours.' },
      { anchor: '[data-guide="wardrobe-boutique"]', title: 'Essence buys looks too',
        text: 'Spare Gene Essence has a luxury sink here once your upgrades are ahead.' },
    ],
  },
  {
    mech: 'metabolism', nav: 'metabolism', reward: 15,
    steps: [
      { anchor: '[data-guide="mtb-cats"]', title: 'Everything you did, banked',
        text: 'Milestones track lifetime feats across every system — tiers fill from play you already logged.' },
      { anchor: '[data-guide="mtb-cats"]', interact: true, title: 'Digest a tier',
        text: 'Claim a ready tier — your history since day one just paid out.' },
    ],
  },
  {
    mech: 'infestation', nav: 'infestation', reward: 15,
    steps: [
      { anchor: '[data-guide="front-tribute"]', title: 'Held ground pays tribute',
        text: 'Sectors you hold pay a weekly tribute — territory is income, not a trophy.' },
      { anchor: '[data-guide="front-deploy"]', title: 'Fight where you feed',
        text: 'Deploying into a region twists the run by its rules — and advances your hold there.' },
    ],
  },
  {
    mech: 'boss-rush', nav: 'bossrush', reward: 15,
    steps: [
      { anchor: '[data-guide="rush-start"]', title: 'The gauntlet',
        text: 'Wave N is N bosses — no swarm filler, just the column growing every wave.' },
      { anchor: '[data-guide="rush-start"]', title: 'Records bleed Ichor',
        text: 'New 5-boss records pay Ichor, new 10-boss records drop containers — push past, never match.' },
    ],
  },
  {
    mech: 'specimens', nav: 'specimens', reward: 15,
    steps: [
      { anchor: '[data-guide="sv-grid"]', title: 'Cosmetics wait here',
        text: 'Won specimens arrive UNCLAIMED — nothing applies until you assimilate it.' },
      { anchor: '[data-guide="sv-grid"]', interact: true, title: 'Inspect a specimen',
        text: 'Tap one to see its provenance and claim it into your wardrobe.' },
    ],
  },
  {
    mech: 'arena', nav: 'arena', reward: 15,
    steps: [
      { anchor: '[data-guide="arena-console"]', title: 'Prove the build',
        text: 'Live head-to-head — same seed, same waves, your account against theirs.' },
      { anchor: '[data-guide="arena-console"]', title: 'Ranked or friendly',
        text: 'Season matches move your ladder; private bouts settle nothing — spar freely.' },
    ],
  },
  {
    mech: 'auction-house', nav: 'auction', reward: 15,
    steps: [
      { anchor: '[data-guide="ah-market"]', title: 'The player market',
        text: 'Real listings from real accounts — bid or buy out with Ichor.' },
      { anchor: '[data-guide="ah-market"]', interact: true, title: 'Open a listing',
        text: 'Tap any listing to read it — bids escrow safely, losers are refunded in full.' },
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
// While a guide is on screen, screens that fold content (SectionNav) must keep every anchor in
// the DOM — a guide pointing into a section the player folded would otherwise lose its target.
let guideActive = false;
const activeSubs = new Set<(active: boolean) => void>();

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
  /** Set by the guide overlay while it is mounted (ui/GuidedUnlock.tsx). */
  setActive(active: boolean): void {
    if (guideActive === active) return;
    guideActive = active;
    for (const fn of activeSubs) fn(active);
  },
  isActive(): boolean {
    return guideActive;
  },
  onActive(fn: (active: boolean) => void): () => void {
    activeSubs.add(fn);
    return () => { activeSubs.delete(fn); };
  },
};
