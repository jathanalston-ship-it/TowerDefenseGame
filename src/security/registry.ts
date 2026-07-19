// CENTRAL SECURITY REGISTRY (docs/SECURITY.md §registry) — every guarded player action,
// declared as DATA: what it is, how fast it may run, how duplicates collapse, how sensitive
// it is, and WHERE its guard() call site lives. securityRegistry.test.ts enforces the
// contract both ways — every entry's `at` file must contain guard('<id>'), and every
// high-risk meta mutator must appear here — so future content cannot ship unguarded and
// this registry cannot rot into fiction.
//
// Rate-limit standards (docs/SECURITY.md §standards — pick the LEVEL, inherit the shape):
//   permissive — UI-adjacent actions a fast player legitimately spams (opens, toggles)
//   moderate   — repeatable economy ops (crafting, upgrades, salvage)
//   strict     — value-dense claims/purchases with ceremonies (one at a time)
//   critical   — money, account surgery, network budgets (heavily spaced)

export type SecurityCategory =
  | 'economy' // spends/claims persistent resources
  | 'claim' // reward collection (one-way grants)
  | 'progression' // permanent account state changes
  | 'network' // leaves the device (server budgets apply)
  | 'purchase' // real or premium currency
  | 'account'; // save surgery (import/reset/restore)

export type SecurityLevel = 'permissive' | 'moderate' | 'strict' | 'critical';

export interface ActionPolicy {
  id: string;
  category: SecurityCategory;
  level: SecurityLevel;
  limit: { count: number; perMs: number }; // token bucket: count per window, burst = count
  cooldownMs?: number; // hard spacing between accepted actions
  dedupeMs?: number; // identical payload key inside this window = duplicate (blocked free)
  analytics: string; // event tag a blocked/accepted action reports under
  doc: string; // one-line contract — what this action does and why it is limited
  at: string; // repo-relative file that must contain the guard('<id>') call site
}

const META = 'src/state/meta.ts';

/** The level → default-shape helpers keep entries honest and comparable. */
const P = (over: Partial<ActionPolicy['limit']> = {}): ActionPolicy['limit'] => ({ count: 12, perMs: 10_000, ...over }); // permissive
const M = (over: Partial<ActionPolicy['limit']> = {}): ActionPolicy['limit'] => ({ count: 8, perMs: 10_000, ...over }); // moderate
const S = (over: Partial<ActionPolicy['limit']> = {}): ActionPolicy['limit'] => ({ count: 3, perMs: 10_000, ...over }); // strict
const C = (over: Partial<ActionPolicy['limit']> = {}): ActionPolicy['limit'] => ({ count: 2, perMs: 60_000, ...over }); // critical

export const SECURITY_ACTIONS: Record<string, ActionPolicy> = {
  // ── Purchases (real + premium currency) ──
  'purchase.checkout': {
    id: 'purchase.checkout', category: 'purchase', level: 'critical', limit: C(), cooldownMs: 3000, dedupeMs: 10_000,
    analytics: 'sec_purchase_checkout', doc: 'Begin a real-money Stripe Checkout redirect (pending marker persisted first).', at: 'src/net/checkout.ts',
  },
  'purchase.offer': {
    id: 'purchase.offer', category: 'purchase', level: 'strict', limit: S(), cooldownMs: 1200, dedupeMs: 2500,
    analytics: 'sec_purchase_offer', doc: 'Sandbox/premium store offer purchase (server path re-validates via receipts).', at: META,
  },
  'ichor.spend': {
    id: 'ichor.spend', category: 'economy', level: 'moderate', limit: M(), analytics: 'sec_ichor_spend',
    doc: 'Spend premium Ichor (all sinks funnel through spendIchor).', at: META,
  },
  'market.buy': {
    id: 'market.buy', category: 'economy', level: 'strict', limit: S({ count: 4 }), cooldownMs: 700, dedupeMs: 1500,
    analytics: 'sec_market_buy', doc: 'Splice Market slot purchase (windowed stock).', at: META,
  },
  'market.ichorOffer': {
    id: 'market.ichorOffer', category: 'economy', level: 'strict', limit: S({ count: 4 }), cooldownMs: 700, dedupeMs: 1500,
    analytics: 'sec_market_ichor', doc: 'Ichor Exchange barter lot purchase (reserve-scaled).', at: META,
  },
  'auction.list': {
    id: 'auction.list', category: 'economy', level: 'strict', limit: S({ count: 4 }), cooldownMs: 700, dedupeMs: 1500,
    analytics: 'sec_auction_list', doc: 'Auction House escrow-out: a server-accepted listing removes the local copy (docs/AUCTION-HOUSE.md §client).', at: META,
  },
  'auction.deliver': {
    id: 'auction.deliver', category: 'claim', level: 'moderate', limit: M({ count: 20 }), dedupeMs: 400,
    analytics: 'sec_auction_deliver', doc: 'Materialize Auction House deliveries/returns (server-confirmed payloads only).', at: META,
  },
  'auction.wallet': {
    id: 'auction.wallet', category: 'network', level: 'strict', limit: S({ count: 6 }), cooldownMs: 1000, dedupeMs: 2000,
    analytics: 'sec_auction_wallet', doc: 'Market-wallet deposit/withdraw round-trip (exactly-once by op id server-side).', at: 'src/state/auctionHouse.ts',
  },

  // ── Claims (one-way grants — ceremonies happen once) ──
  'research.claim': {
    id: 'research.claim', category: 'claim', level: 'strict', limit: S(), cooldownMs: 1000, dedupeMs: 3000,
    analytics: 'sec_research_claim', doc: 'Field Research (rewarded-ad lane) claim — provider callback is the eligibility source.', at: META,
  },
  'pass.claim': {
    id: 'pass.claim', category: 'claim', level: 'moderate', limit: M({ count: 60 }), dedupeMs: 800,
    analytics: 'sec_pass_claim', doc: 'Battle Pass level claim — claim-all iterates this, so the bucket fits a deep backlog in one burst.', at: META,
  },
  'pass.ad': {
    id: 'pass.ad', category: 'claim', level: 'strict', limit: S({ count: 2 }), cooldownMs: 20_000,
    analytics: 'sec_pass_ad', doc: 'Rewarded-ad pass advance — never grantable faster than ads can actually play.', at: META,
  },
  'wardrobe.claim': {
    id: 'wardrobe.claim', category: 'claim', level: 'strict', limit: S(), cooldownMs: 800, dedupeMs: 2000,
    analytics: 'sec_wardrobe_claim', doc: 'Wardrobe milestone claim.', at: META,
  },
  'mastery.claim': {
    id: 'mastery.claim', category: 'claim', level: 'moderate', limit: M({ count: 60 }),
    analytics: 'sec_mastery_claim', doc: 'Mastery Evolution Track claim-all for one unit (idempotent; a full roster sweep fits one burst).', at: META,
  },
  'mastery.prestige': {
    id: 'mastery.prestige', category: 'progression', level: 'strict', limit: S(), cooldownMs: 800,
    analytics: 'sec_mastery_prestige', doc: 'Mastery Evolution prestige (EVOLVE) — re-arms a completed loop; the auto-claim precedes it.', at: META,
  },
  'directive.claim': {
    id: 'directive.claim', category: 'claim', level: 'strict', limit: S({ count: 4 }), cooldownMs: 600, dedupeMs: 2000,
    analytics: 'sec_directive_claim', doc: 'Weekly Directive / capstone reward claim (cores/essence/container).', at: META,
  },
  'expedition.claim': {
    id: 'expedition.claim', category: 'claim', level: 'strict', limit: S(), cooldownMs: 800, dedupeMs: 2000,
    analytics: 'sec_exped_claim', doc: 'Expedition completion claim (timed mission payout).', at: META,
  },
  'tutorial.claim': {
    id: 'tutorial.claim', category: 'claim', level: 'moderate', limit: M(), dedupeMs: 1500,
    analytics: 'sec_tutorial_claim', doc: 'Tutorial completion rewards (id-idempotent at the domain layer).', at: META,
  },
  'container.open': {
    id: 'container.open', category: 'claim', level: 'permissive', limit: P({ count: 20 }), cooldownMs: 250,
    analytics: 'sec_container_open', doc: 'Open pending Bio-Container(s) — a multi-open (Five/Ten/All) is ONE guarded action (reveal ceremony pacing).', at: META,
  },
  'quest.claim': {
    id: 'quest.claim', category: 'claim', level: 'moderate', limit: M({ count: 30 }), dedupeMs: 600,
    analytics: 'sec_quest_claim', doc: 'Quest mission/finale claim — clearing a full board in one burst is legitimate (docs/QUESTS.md).', at: META,
  },
  'arena.settle': {
    id: 'arena.settle', category: 'progression', level: 'strict', limit: S({ count: 2, perMs: 30_000 }), cooldownMs: 3000, dedupeMs: 60_000,
    analytics: 'sec_arena_settle', doc: 'Arena match settlement (docs/ARENA.md §7) — a match takes minutes; the matchId dedupe makes replayed results free. Server path re-validates (functions/api/arena/report.ts).', at: META,
  },
  'arena.claim': {
    id: 'arena.claim', category: 'claim', level: 'moderate', limit: M({ count: 60 }), dedupeMs: 800,
    analytics: 'sec_arena_claim', doc: 'Arena Pass level claim — claim-all sweeps a deep backlog in one burst (the pass.claim shape).', at: META,
  },
  'arena.premium': {
    id: 'arena.premium', category: 'purchase', level: 'strict', limit: S({ count: 2 }), cooldownMs: 1200, dedupeMs: 5000,
    analytics: 'sec_arena_premium', doc: 'Arena Pass premium unlock (Ichor) — once per season; the guard blunts double-click spends.', at: META,
  },

  // ── Repeatable economy operations ──
  // NOTE (§standards): grants that land AFTER a paid ceremony (roulette results, run outcomes)
  // are deliberately NOT hard-guarded — blocking one would eat value the player already paid
  // for. Their upstream SPEND/ceremony is the pace; the domain layer stays idempotent.
  'craft.mulligan': {
    id: 'craft.mulligan', category: 'economy', level: 'moderate', limit: M({ count: 20 }), dedupeMs: 400,
    analytics: 'sec_mulligan', doc: 'Mulligan equip/upgrade/ascend/reforge family (essence sinks).', at: META,
  },
  'craft.equipment': {
    id: 'craft.equipment', category: 'economy', level: 'moderate', limit: M({ count: 15 }), dedupeMs: 400,
    analytics: 'sec_equipment', doc: 'Equipment reforge operations (material sinks).', at: META,
  },
  'equipment.salvage': {
    id: 'equipment.salvage', category: 'economy', level: 'moderate', limit: M({ count: 10 }), dedupeMs: 500,
    analytics: 'sec_salvage', doc: 'Salvage item(s) — mass ops route through one batch call.', at: META,
  },
  'gene.upgrade': {
    id: 'gene.upgrade', category: 'economy', level: 'moderate', limit: M({ count: 20 }), dedupeMs: 400,
    analytics: 'sec_gene', doc: 'Gene Archive card level purchase (rapid essence-dumping is legitimate).', at: META,
  },
  'wardrobe.buy': {
    id: 'wardrobe.buy', category: 'economy', level: 'moderate', limit: M(), cooldownMs: 400, dedupeMs: 1200,
    analytics: 'sec_wardrobe_buy', doc: 'Wardrobe item purchase.', at: META,
  },
  'idle.collect': {
    id: 'idle.collect', category: 'economy', level: 'moderate', limit: M(), cooldownMs: 1500, dedupeMs: 2000,
    analytics: 'sec_idle', doc: 'Idle Harvest collect (docs/IDLE-HARVEST.md) — time-gated upstream by minCollectMinutes; the guard stops replay hammering.', at: META,
  },
  'front.claim': {
    id: 'front.claim', category: 'economy', level: 'moderate', limit: M({ count: 20 }), dedupeMs: 400,
    analytics: 'sec_front', doc: 'The Front claims (docs/INFESTATION.md §front) — tier spoils are exactly-once per sector ledger, tributes once per ISO week; the guard stops replay hammering.', at: META,
  },

  // ── Permanent progression ──
  'progress.star': {
    id: 'progress.star', category: 'progression', level: 'moderate', limit: M(), dedupeMs: 600,
    analytics: 'sec_star', doc: 'Tower/Hero star evolution + Prime Strain ladder purchases (docs/PRIME-STRAINS.md).', at: META,
  },
  'progress.unlock': {
    id: 'progress.unlock', category: 'progression', level: 'moderate', limit: M(), dedupeMs: 800,
    analytics: 'sec_unlock', doc: 'Tower/Hero unlock purchases.', at: META,
  },
  'progress.upgrade': {
    id: 'progress.upgrade', category: 'progression', level: 'permissive', limit: P({ count: 30 }),
    analytics: 'sec_upgrade', doc: 'Genome upgrade tree purchase (rapid ladder-buying is legitimate).', at: META,
  },
  'progress.ascendant': {
    id: 'progress.ascendant', category: 'progression', level: 'moderate', limit: M(), dedupeMs: 600,
    analytics: 'sec_ascendant', doc: 'Ascendant tree node purchase (prestige cells).', at: META,
  },
  'prestige.molt': {
    id: 'prestige.molt', category: 'progression', level: 'strict', limit: S({ count: 1, perMs: 8000 }), cooldownMs: 5000,
    analytics: 'sec_molt', doc: 'The Ascension molt — resets the cycle; the ceremony is the pace.', at: META,
  },
  'trophy.equip': {
    id: 'trophy.equip', category: 'progression', level: 'permissive', limit: P({ count: 20 }), dedupeMs: 200,
    analytics: 'sec_trophy_equip', doc: 'Mount/unmount a Trophy Rack organ (reversible loadout toggle — docs/NEMESIS.md §rack).', at: META,
  },
  'prestige.vow': {
    id: 'prestige.vow', category: 'progression', level: 'moderate', limit: M(), cooldownMs: 400, dedupeMs: 1200,
    analytics: 'sec_vow', doc: 'Arm/break a Molt Vow (docs/VOWS.md) — arming sinks Genome Cores on the geometric curve; costs never refund.', at: META,
  },
  'hive.build': {
    id: 'hive.build', category: 'economy', level: 'strict', limit: S({ count: 4 }), cooldownMs: 700, dedupeMs: 1500,
    analytics: 'sec_hive_build', doc: 'Build a Hive organ (docs/HIVE-CONSTRUCTION.md) — one atomic multi-currency spend; the ceremony is the pace.', at: META,
  },
  'nucleus.grow': {
    id: 'nucleus.grow', category: 'economy', level: 'moderate', limit: M({ count: 20 }), dedupeMs: 400,
    analytics: 'sec_nucleus_grow', doc: 'Grow/level a Nucleus organ (docs/NUCLEUS.md) — Gene Essence sink; rapid essence-dumping is legitimate.', at: META,
  },
  'nucleus.slot': {
    id: 'nucleus.slot', category: 'progression', level: 'permissive', limit: P({ count: 20 }), dedupeMs: 200,
    analytics: 'sec_nucleus_slot', doc: 'Slot/clear a Nucleus chamber organ (reversible loadout move — docs/NUCLEUS.md §chambers).', at: META,
  },
  'nucleus.unlock': {
    id: 'nucleus.unlock', category: 'progression', level: 'strict', limit: S({ count: 3 }), cooldownMs: 700, dedupeMs: 1500,
    analytics: 'sec_nucleus_unlock', doc: 'Open a Nucleus chamber (docs/NUCLEUS.md §gates) — a once-per-account milestone; chamber 3 spends Ichor.', at: META,
  },
  'symbiote.graft': {
    id: 'symbiote.graft', category: 'economy', level: 'moderate', limit: M({ count: 20 }), dedupeMs: 400,
    analytics: 'sec_symbiote_graft', doc: 'Graft/level a Hero Symbiote organ (docs/HERO-SYMBIOTES.md) — Gene Essence sink; rapid essence-dumping is legitimate.', at: META,
  },
  'symbiote.slot': {
    id: 'symbiote.slot', category: 'progression', level: 'permissive', limit: P({ count: 20 }), dedupeMs: 200,
    analytics: 'sec_symbiote_slot', doc: 'Seat/clear a Hero Symbiote organ (reversible loadout move — docs/HERO-SYMBIOTES.md §slots).', at: META,
  },
  'symbiote.unlock': {
    id: 'symbiote.unlock', category: 'progression', level: 'strict', limit: S({ count: 3 }), cooldownMs: 700, dedupeMs: 1500,
    analytics: 'sec_symbiote_unlock', doc: 'Open a Hero Symbiote slot (docs/HERO-SYMBIOTES.md §gates) — a per-hero milestone; slots II/III spend Ichor.', at: META,
  },
  'login.claim': {
    id: 'login.claim', category: 'economy', level: 'strict', limit: S({ count: 3 }), cooldownMs: 1000, dedupeMs: 2500,
    analytics: 'sec_login_claim', doc: 'Open the Daily Bio-Cache (docs/DAILY-LOGIN.md) — once per UTC day by the save-side key gate; the guard just blunts spam.', at: META,
  },
  'event.claim': {
    id: 'event.claim', category: 'claim', level: 'moderate', limit: M({ count: 20 }), dedupeMs: 600,
    analytics: 'sec_event_claim', doc: 'Live-event track milestone claim (docs/LIVE-EVENTS.md §6) — threshold-gated by the token bank; clearing a backlog in one burst is legitimate.', at: META,
  },
  'event.buy': {
    id: 'event.buy', category: 'economy', level: 'moderate', limit: M({ count: 20 }), dedupeMs: 400,
    analytics: 'sec_event_buy', doc: 'Live-event shop purchase (docs/LIVE-EVENTS.md §6) — spends window-scoped tokens against finite stock.', at: META,
  },
  'metabolism.claim': {
    id: 'metabolism.claim', category: 'claim', level: 'moderate', limit: M({ count: 30 }), dedupeMs: 400,
    analytics: 'sec_metabolism_claim', doc: 'Metabolism milestone claim (docs/METABOLISM.md) — threshold-gated by lifetime ledgers; one call clears a whole track, and clearing every track in a burst is legitimate.', at: META,
  },
  'cosmetic.claim': {
    id: 'cosmetic.claim', category: 'claim', level: 'moderate', limit: M({ count: 40 }), dedupeMs: 250,
    analytics: 'sec_cosmetic_claim', doc: 'Cosmetic account-bind (docs/COSMETICS.md §claiming) — consumes one unclaimed Vault instance, irreversibly; a collector binding a backlog in a burst is legitimate.', at: META,
  },

  // ── Network (server budgets — client-side courtesy limits on top of server truth) ──
  'sync.push': {
    id: 'sync.push', category: 'network', level: 'critical', limit: C({ count: 6, perMs: 600_000 }),
    analytics: 'sec_sync_push', doc: 'Cloud save upload (engine also enforces MIN_INTERVAL + backoff).', at: 'src/net/syncEngine.ts',
  },
  'leaderboard.submit': {
    id: 'leaderboard.submit', category: 'network', level: 'critical', limit: C({ count: 4, perMs: 300_000 }), dedupeMs: 30_000,
    analytics: 'sec_lb_submit', doc: 'Leaderboard submission (server re-simulates replays; this is the client budget).', at: 'src/net/leaderboard.ts',
  },
  'arena.report': {
    id: 'arena.report', category: 'network', level: 'critical', limit: C({ count: 6, perMs: 600_000 }), dedupeMs: 60_000,
    analytics: 'sec_arena_report', doc: 'Arena match report to the server ladder (docs/ARENA.md §7) — matches take minutes; the matchId dedupe makes double delivery free on both sides.', at: 'src/net/arenaReport.ts',
  },

  // ── Account surgery ──
  'save.import': {
    id: 'save.import', category: 'account', level: 'strict', limit: S({ count: 3, perMs: 30_000 }),
    analytics: 'sec_import', doc: 'Import a save blob (checksum-validated by the store).', at: META,
  },
  'save.restore': {
    id: 'save.restore', category: 'account', level: 'strict', limit: S({ count: 3, perMs: 30_000 }),
    analytics: 'sec_restore', doc: 'Restore a rolling backup.', at: META,
  },
  'account.reset': {
    id: 'account.reset', category: 'account', level: 'critical', limit: C({ count: 1, perMs: 10_000 }), cooldownMs: 5000,
    analytics: 'sec_reset', doc: 'Full account reset — destructive; UI double-confirms, this spaces it.', at: META,
  },
};

/** High-risk meta mutators that MUST carry a guard (securityRegistry.test.ts reflects the
 *  meta object against this map — adding such a method without registering it fails the
 *  build). Maps method name → the action id its body guards with. */
export const GUARDED_META_METHODS: Record<string, string> = {
  purchaseOffer: 'purchase.offer',
  spendIchor: 'ichor.spend',
  buyMarketSlot: 'market.buy',
  buyIchorOffer: 'market.ichorOffer',
  claimResearch: 'research.claim',
  claimPassLevel: 'pass.claim',
  adAdvancePass: 'pass.ad',
  claimWardrobeMilestone: 'wardrobe.claim',
  claimDirective: 'directive.claim',
  claimEventMilestone: 'event.claim',
  buyEventShopRow: 'event.buy',
  claimMetabolism: 'metabolism.claim',
  claimCosmetic: 'cosmetic.claim',
  claimExpedition: 'expedition.claim',
  claimQuestMission: 'quest.claim',
  claimQuestFinale: 'quest.claim',
  settleArenaMatch: 'arena.settle',
  claimArenaPassLevel: 'arena.claim',
  buyArenaPassPremium: 'arena.premium',
  grantTutorialRewards: 'tutorial.claim',
  openContainer: 'container.open',
  openContainers: 'container.open',
  upgradeMulligan: 'craft.mulligan',
  ascendMulligan: 'craft.mulligan',
  reforgeMulligan: 'craft.mulligan',
  reforgeOp: 'craft.equipment',
  salvageItem: 'equipment.salvage',
  salvageItems: 'equipment.salvage',
  upgradeGene: 'gene.upgrade',
  buyWardrobeItem: 'wardrobe.buy',
  buyStar: 'progress.star',
  buyHeroStar: 'progress.star',
  buyTowerPrime: 'progress.star',
  buyHeroPrime: 'progress.star',
  collectIdleHarvest: 'idle.collect',
  buyIdleNode: 'progress.upgrade',
  claimFrontTier: 'front.claim',
  claimFrontTribute: 'front.claim',
  unlockTower: 'progress.unlock',
  unlockHero: 'progress.unlock',
  buyUpgrade: 'progress.upgrade',
  buyAscendantNode: 'progress.ascendant',
  molt: 'prestige.molt',
  equipTrophy: 'trophy.equip',
  armVow: 'prestige.vow',
  disarmVow: 'prestige.vow',
  buildOrgan: 'hive.build',
  growNucleusOrgan: 'nucleus.grow',
  upgradeNucleusOrgan: 'nucleus.grow',
  setNucleusSlot: 'nucleus.slot',
  unlockNucleusChamber: 'nucleus.unlock',
  graftHeroSymbiote: 'symbiote.graft',
  upgradeHeroSymbiote: 'symbiote.graft',
  setHeroSymbioteSeat: 'symbiote.slot',
  unlockHeroSymbioteSlot: 'symbiote.unlock',
  claimLogin: 'login.claim',
  claimMasteryEvolution: 'mastery.claim',
  prestigeMasteryEvolution: 'mastery.prestige',
  importText: 'save.import',
  restoreBackup: 'save.restore',
  reset: 'account.reset',
};

/** Registry-level validation (mirrors the content-registry pattern): complete, sane, unique. */
export function securityActionProblems(p: ActionPolicy): string[] {
  const out: string[] = [];
  if (!p.id) out.push('missing id');
  if (!(p.limit.count > 0 && p.limit.perMs > 0)) out.push(`${p.id}: limit must be positive`);
  if (p.cooldownMs !== undefined && p.cooldownMs <= 0) out.push(`${p.id}: cooldownMs must be positive when set`);
  if (p.dedupeMs !== undefined && p.dedupeMs <= 0) out.push(`${p.id}: dedupeMs must be positive when set`);
  if (!p.analytics.startsWith('sec_')) out.push(`${p.id}: analytics tag must be namespaced sec_*`);
  if (!p.doc || p.doc.length < 12) out.push(`${p.id}: doc contract required`);
  if (!p.at.startsWith('src/')) out.push(`${p.id}: at must reference a src/ file`);
  const perSec = (p.limit.count / p.limit.perMs) * 1000;
  if (p.level === 'critical' && perSec > 0.5) out.push(`${p.id}: critical actions must stay ≤ 0.5/s sustained`);
  if (p.level === 'strict' && perSec > 2) out.push(`${p.id}: strict actions must stay ≤ 2/s sustained`);
  return out;
}
