// PROGRESSION GATING FRAMEWORK (docs/PROGRESSION-GATING.md) — the single registry deciding WHEN
// every hub surface (screen or currency) reveals itself, WHY (each row carries its design
// justification), and HOW its reveal is presented (via the mechanics registry → What's New).
//
// The philosophy: the game already contains every system — progression is the act of REVEALING
// them one learnable beat at a time. A fresh account sees FOUR nav entries; a veteran sees all
// twenty. Conditions are DECLARATIVE (not closures) so the UI can render live progress toward a
// locked feature, the persona simulator can replay the whole timeline, and tests can prove pacing.
//
// Reveals LATCH: once a feature's condition has been true it stays revealed forever (recorded in
// save.director.revealed by meta.latchNewReveals), so a non-monotonic signal — salvaging your last
// gear, opening your last container — never re-seals a screen. Veterans auto-pass: conditions are
// pure over SaveData, so an existing account's history reveals everything it has already earned.
//
// Pure over SaveData (no meta import — read-model rules, like nextGoal.ts / mechanics.ts).
import { antigenEarned } from '../core/adaptation';

import type { SaveData } from '../save/saveStore';
import { highestCampaignStage } from '../save/derive';
import { MODE_UNLOCKS } from '../core/config';

// ── Conditions ──────────────────────────────────────────────────────────────

/** Declarative unlock conditions. `stage`/`runs` are the timeline backbone (simulatable);
 *  resource kinds fire the moment the economy actually produces the thing a screen manages
 *  (economy coherence: no screen before its currency, no currency before its purpose). */
export type UnlockCondition =
  | { kind: 'always' }
  | { kind: 'runs'; runs: number } // totalRuns ≥ n
  | { kind: 'stage'; stage: number } // highestCampaignStage ≥ n
  | { kind: 'cores' } // first Genome Cores ever earned (lifetimeShards > 0)
  | { kind: 'gear' } // any equipment currently owned
  | { kind: 'containers' } // a Bio-Container is banked and waiting
  | { kind: 'cards'; count: number } // distinct Gene Cards DRAFTED ≥ n — an ENGAGEMENT signal (discovery starts at 16 starters, so the discovered count would gate nothing)
  | { kind: 'mulligans' } // first Mulligan modifier discovered
  | { kind: 'ichor' } // any Ichor ever bled
  | { kind: 'mats' } // any crafting material held
  | { kind: 'molted' } // has prestiged at least once
  | { kind: 'antigen' } // any account-faucet Antigen earned (achievements/depth/traces — mastery-sourced income reveals via the stage backbone)
  | { kind: 'cosmeticInventory' } // an unclaimed cosmetic specimen sits in the Vault (v53 — reveal-on-need)
  | { kind: 'rushHistory' } // pre-gate Boss Rush accounts (grandfather)
  | { kind: 'dailyHistory' } // pre-gate Daily accounts (grandfather)
  | { kind: 'any'; of: UnlockCondition[] }; // first satisfied wins (progress = max)

export interface ConditionView {
  done: boolean;
  /** 0..1 toward the condition (teaser progress bars). Resource conditions are 0-or-1. */
  progress: number;
  /** Human requirement, e.g. "Clear Campaign Stage 4 · 2 to go". Empty when done. */
  label: string;
}

export function evalCondition(c: UnlockCondition, save: SaveData): ConditionView {
  switch (c.kind) {
    case 'always': return { done: true, progress: 1, label: '' };
    case 'runs': {
      const have = save.totalRuns;
      return { done: have >= c.runs, progress: Math.min(1, have / c.runs), label: `Finish ${c.runs === 1 ? 'your first run' : `${c.runs} runs`} · ${Math.max(0, c.runs - have)} to go` };
    }
    case 'stage': {
      const have = highestCampaignStage(save);
      return { done: have >= c.stage, progress: Math.min(1, have / c.stage), label: `Clear Campaign Stage ${c.stage} · ${Math.max(0, c.stage - have)} to go` };
    }
    case 'cores': return flag((save.lifetimeShards ?? 0) > 0, 'Earn your first Genome Cores');
    case 'gear': return flag(save.equipment.inventory.length > 0, 'Find your first Bio-Gear');
    case 'containers': return flag(save.pendingContainers.length > 0, 'Bank a Bio-Container');
    case 'cards': {
      const have = save.stats?.uniqueCards?.length ?? 0;
      return { done: have >= c.count, progress: Math.min(1, have / c.count), label: `Draft ${c.count} different Gene Cards · ${Math.max(0, c.count - have)} to go` };
    }
    case 'mulligans': return flag(Object.keys(save.mulliganDex ?? {}).length > 0, 'Discover a Mulligan modifier');
    case 'cosmeticInventory': return flag((save.wardrobe.inventory ?? []).length > 0, 'Receive a cosmetic specimen');
    case 'ichor': return flag((save.lifetimeIchor ?? 0) > 0 || save.ichor > 0, 'Bleed your first Ichor');
    case 'mats': return flag(save.mats.mutagen + save.mats.scrap + save.mats.catalyst > 0, 'Find crafting materials');
    case 'molted': return flag((save.prestige?.molts ?? 0) > 0, 'Molt for the first time');
    case 'antigen': return flag(
      antigenEarned({ masteryLevel: 0, campaignStage: highestCampaignStage(save), containerAntigen: save.antigen, achievementCount: save.achievements.length }) > 0,
      'Earn your first Antigen');
    case 'rushHistory': return flag(save.rushBestWave > 0 || (save.stats?.rushRuns ?? 0) > 0, '');
    case 'dailyHistory': return flag(save.daily.completions > 0 || save.daily.lastKey !== '', '');
    case 'any': {
      const views = c.of.map((sub) => evalCondition(sub, save));
      const done = views.some((v) => v.done);
      const best = views.reduce((a, b) => (b.progress > a.progress ? b : a));
      return { done, progress: best.progress, label: done ? '' : best.label };
    }
  }
}

function flag(done: boolean, label: string): ConditionView {
  return { done, progress: done ? 1 : 0, label: done ? '' : label };
}

// ── The registry ────────────────────────────────────────────────────────────

export interface FeatureDef {
  /** 'screen' rows gate a Hub NavKey; 'currency' rows gate a top-bar wallet chip. */
  kind: 'screen' | 'currency';
  /** The Hub NavKey (screens) or `cur:<id>` (currencies). */
  id: string;
  name: string;
  glyph: string; // teaser row + locked-screen sigil
  /** One-line anticipation hook shown while locked ("why you'll want this"). */
  blurb: string;
  condition: UnlockCondition;
  /** Intended reveal order — the learning curve itself. Validated against conditions in tests. */
  order: number;
  /** WHY this timing — the design justification (rendered into docs/UNLOCK-TREE.md). */
  because: string;
  /** The mechanics-registry row that TEACHES it on reveal (What's New). Omitted only for
   *  self-evident surfaces (home/help/settings/profile) — enforced by tests. */
  teach?: string;
}

/** Earliest campaign stage at which a condition can POSSIBLY pass (0 = immediately / resource
 *  luck). Drives the generated unlock tree + the pacing tests. */
export function earliestStage(c: UnlockCondition): number {
  switch (c.kind) {
    case 'stage': return c.stage;
    case 'any': return Math.min(...c.of.map(earliestStage));
    default: return 0;
  }
}

/** The stage by which a condition is GUARANTEED, luck aside — resource kinds alone never
 *  guarantee (Infinity), which the registry tests reject for screens: every screen must carry a
 *  stage/runs backbone so no player can be permanently locked out by drop luck. */
export function guaranteedByStage(c: UnlockCondition): number {
  switch (c.kind) {
    case 'always': return 0;
    case 'stage': return c.stage;
    case 'runs': return 1; // finishing runs precedes clearing stages
    case 'any': return Math.min(...c.of.map(guaranteedByStage));
    default: return Infinity;
  }
}

// The learning curve, one row per surface. Ordering rule: at most TWO related reveals per beat,
// each building on the previous ("I understand this — now here's something new").
// RE-PACED 2026-11 (docs/PROGRESSION-GATING.md §timeline): the deep wings used to all open by
// stage 9 (≈ the first hour); they now spread across stages 3–30 ≈ the first ~10 hours of play
// (stage → hours from the progression simulator). Past the core block every row is a pure
// STAGE gate — resource "luck" branches revealed systems before their backstop, so drops that
// arrive early bank silently and surface at the reveal (state/rewardVisibility.ts).
export const REVEAL_CEILING_STAGE = 30; // every surface is guaranteed open by this stage (tests enforce)
export const FEATURES: FeatureDef[] = [
  // ── Foundational (minute 0): the hook loop is play → clear → collect. ──
  { kind: 'screen', id: 'home', name: 'Command Center', glyph: '⌂', order: 0,
    blurb: 'The hive’s living heart.', condition: { kind: 'always' },
    because: 'The shell itself — every session starts and ends here.' },
  { kind: 'screen', id: 'campaign', name: 'Campaign', glyph: '⬡', order: 1,
    blurb: 'The Descent — the spine of all progression.', condition: { kind: 'always' },
    because: 'The foundational mode: the first minutes ARE the campaign; every other gate keys off its depth.', teach: 'campaign' },
  { kind: 'screen', id: 'help', name: 'Help', glyph: '?', order: 2,
    blurb: 'The living wiki.', condition: { kind: 'always' },
    because: 'Self-teach surface — must exist before any question does. The wiki itself only lists unlocked mechanics.' },
  { kind: 'screen', id: 'store', name: 'Premium Store', glyph: '✷', order: 2.5,
    blurb: 'Optional support — never the path.', condition: { kind: 'always' },
    because: 'Operator decision (2026-07): the supporter door is open from minute 0 — buying is always a choice, never the path, and nothing sold gates progression.', teach: 'premium-store' },
  { kind: 'screen', id: 'settings', name: 'Settings', glyph: '⚙', order: 3,
    blurb: 'Audio, account, saves.', condition: { kind: 'always' },
    because: 'Accessibility, audio and account controls can never be gated.' },

  // ── Session 1 → Stage 2: the first runs pay out — meet your stats, your loot, and learn to SPEND (the core early block). ──
  { kind: 'screen', id: 'profile', name: 'Player Profile', glyph: '◑', order: 4,
    blurb: 'Your commander identity and lifetime record.', condition: { kind: 'runs', runs: 1 },
    because: 'Empty before the first run; reveals the moment there are stats to show.' },
  { kind: 'screen', id: 'vault', name: 'Genetic Vault', glyph: '◈', order: 5,
    blurb: 'Crack your banked Bio-Containers.', condition: { kind: 'any', of: [{ kind: 'containers' }, { kind: 'stage', stage: 2 }] },
    because: 'The session-1 payoff: the first run banks a container — the Vault reveals exactly when there is something to open (the lootbox hook). Stage 2 backstops a no-cache start.', teach: 'containers' },
  { kind: 'screen', id: 'towers', name: 'Tower Lab', glyph: 'T', order: 6,
    blurb: 'Evolve your strains with Stars and Samples.', condition: { kind: 'stage', stage: 1 },
    because: 'Stage 1’s first-clear pays Strain Samples + a container — the Lab opens the moment it has something to do.', teach: 'towers' },
  { kind: 'screen', id: 'evolution', name: 'Evolution HQ', glyph: '✷', order: 7,
    blurb: 'Permanent account upgrades with Genome Cores.', condition: { kind: 'any', of: [{ kind: 'cores' }, { kind: 'stage', stage: 2 }] },
    because: 'Reveals with the first Genome Cores (usually stage 1) — the other half of the same lesson: currency → permanent power.', teach: 'genome-core' },
  { kind: 'screen', id: 'heroes', name: 'Hero Hall', glyph: 'H', order: 8,
    blurb: 'Develop the champions who fight beside you.', condition: { kind: 'stage', stage: 2 },
    because: 'The hero already fights from run 1; the HALL matters once shards start dropping — one beat after towers so the two spend-screens don’t land together.', teach: 'heroes' },

  // ── Stages 3–8 (~first 40 min): one new wing per stage — the second pillar, the archive, the daily rhythm, gear, directives, the first shop. ──
  { kind: 'screen', id: 'infinite', name: 'Infinite', glyph: '∞', order: 9,
    blurb: 'Endless descent — the farm and the proving ground.', condition: { kind: 'stage', stage: MODE_UNLOCKS.infinite },
    because: 'The established mode gate (docs/MODE-IDENTITY.md): three stages teach the loop before the loop’s farm-half opens.', teach: 'infinite' },
  { kind: 'screen', id: 'genes', name: 'Gene Archive', glyph: '⌬', order: 10,
    blurb: 'Your discovered strands, collected forever — and leveled.', condition: { kind: 'stage', stage: 4 },
    because: 'The starter archive exists from minute 0, but the screen teaches best once drafting is familiar — stage 4, one beat after Infinite. (Re-paced 2026-11: the old six-drafts trigger fired on run 2, inside the first-session flood; Gene Essence banks silently until this reveal.)', teach: 'gene-archive' },
  { kind: 'screen', id: 'daily', name: 'Daily Run', glyph: '☀', order: 11,
    blurb: 'One seed per day, worldwide.', condition: { kind: 'any', of: [{ kind: 'stage', stage: MODE_UNLOCKS.daily }, { kind: 'dailyHistory' }] },
    because: 'The established gate (docs/DAILY-RUN.md): the retention rhythm starts once the core loop is fluent. History grandfathers.', teach: 'daily-run' },
  { kind: 'screen', id: 'equipment', name: 'Armory', glyph: '⛨', order: 12,
    blurb: 'Weapons, armor and relics for your heroes.', condition: { kind: 'stage', stage: 6 },
    because: 'Stage 6 (~30 min in): by then several containers have dropped gear, so the Armory opens onto a real choice. Gear found earlier BANKS SILENTLY (no luck-reveal — re-paced 2026-11) and is waiting in the racks at the reveal.', teach: 'equipment' },
  { kind: 'screen', id: 'quests', name: 'Quest Board', glyph: '✪', order: 13,
    blurb: 'Weekly directives and the story questline.', condition: { kind: 'stage', stage: 7 },
    because: 'Directives give the mid-early game its to-do list: by stage 7 enough systems exist for missions to point at, and progress banked since run 1 lands as one batch (rewards auto-claim at run end — docs/NOTIFICATIONS.md §auto-claim).', teach: 'quests' },
  { kind: 'screen', id: 'market', name: 'Splice Market', glyph: '◆', order: 14,
    blurb: 'A refreshing bazaar for Cores and Ichor.', condition: { kind: 'stage', stage: 8 },
    because: 'Opens once Core income is steady (stage 8, ~35 min) so its stock means something — and Ichor reveals WITH its sink: Ichor bled earlier banks silently and the chip appears here with the whole balance.', teach: 'splice-market' },

  // ── Stages 10–18 (~45 min → 1h45): the season, the third pillar, the collection layers, the Hive and its tabs. ──
  { kind: 'screen', id: 'season', name: 'Season Pass', glyph: '❁', order: 15,
    blurb: 'A rotating reward season fed by everything you play.', condition: { kind: 'stage', stage: 10 },
    because: 'XP accrues silently from run 1 (rollover mail keeps it lossless) — the track REVEALS at stage 10 (~45 min) once the loop is fluent and several faucets exist to feed it; the banked levels auto-claim as one batch at the next run end.', teach: 'season-pass' },
  { kind: 'screen', id: 'bossrush', name: 'Boss Rush', glyph: '☠', order: 16,
    blurb: 'The gauntlet: wave N is N bosses.', condition: { kind: 'any', of: [{ kind: 'stage', stage: MODE_UNLOCKS.bossRush }, { kind: 'rushHistory' }] },
    because: 'The established gate (MODE_UNLOCKS.bossRush, stage 12 ≈ 1h): the skill-check pillar arrives once builds are real. History grandfathers (rush records, or a reveal latched under the old stage-9 gate).', teach: 'boss-rush' },
  { kind: 'screen', id: 'collection', name: 'Bio-Dex', glyph: '▤', order: 17,
    blurb: 'Rank badges and bonuses for everything you catalogue.', condition: { kind: 'stage', stage: 13 },
    because: 'By stage 13 (~1h) two Mega Bosses, a dozen enemy families and the first gear sets exist to catalogue — rank bonuses stop being abstract.', teach: 'collection-codex' },
  { kind: 'screen', id: 'hive', name: 'The Hive', glyph: '⬡', order: 18,
    blurb: 'Build the laboratory organism — organs that transform your base.', condition: { kind: 'stage', stage: 14 },
    because: 'A composite sink needs wallets to sink — by stage 14 (~1h15) Cores/Essence/materials have pooled long enough that the first organs are affordable on arrival; the Hive then grows its Production and Expedition tabs over the next stages.', teach: 'hive-construction' },
  { kind: 'screen', id: 'gearcodex', name: 'Gear Codex', glyph: '❑', order: 19,
    blurb: 'The full equipment gallery, sets and all.', condition: { kind: 'stage', stage: 15 },
    because: 'A collection layer OVER gear — an Armory tab that lands at stage 15 (~1h15), long after the Armory habit forms; undiscovered silhouettes become goals.', teach: 'gear-codex' },
  { kind: 'screen', id: 'harvest', name: 'Hive Production', glyph: '⬣', order: 20,
    blurb: 'The Hive keeps harvesting while you are away.', condition: { kind: 'stage', stage: 16 },
    because: 'Idle exists to soften RETURN friction — it opens as a tab inside The Hive two stages after the Hive itself (~1h30), when sessions start to end mid-progress and the first away-session banks something worth a ceremony.', teach: 'idle-harvest' },
  { kind: 'screen', id: 'expeditions', name: 'Expedition Command', glyph: '⇢', order: 21,
    blurb: 'Benched heroes forage the ruins while you fight.', condition: { kind: 'stage', stage: 18 },
    because: 'The away-game beat, second half: Hive Production banks TIME, Expeditions bank BENCHED HEROES — a Hive tab at stage 18 (~1h45), when a bench of champions exists to send.', teach: 'expeditions' },

  // ── Stages 20–30 (~2h → 10h): the war, the ledger, deep specialization, cosmetics, then PvP and trade last. ──
  { kind: 'screen', id: 'infestation', name: 'The Front', glyph: '⛬', order: 22,
    blurb: 'The territory war — hold sectors, collect tribute, answer incursions.', condition: { kind: 'stage', stage: 20 },
    because: 'Territory only means something once runs are flowing and every farm mode exists to feed it — stage 20 (~2h), after Boss Rush completes the farm ring (docs/INFESTATION.md §front).', teach: 'infestation' },
  { kind: 'screen', id: 'metabolism', name: 'Milestones', glyph: '✹', order: 23,
    blurb: 'The organism digests everything — lifetime feats pay forever.', condition: { kind: 'stage', stage: 22 },
    because: 'Metabolism is a gratitude ledger over EVERYTHING the account has done, so it reveals (as a Quest Board tab) only after the claim rhythm exists (quests s7, harvest s16) — at stage 22 (~2h) its derive-first back-fill hands the player a genuine bundle at the reveal (docs/METABOLISM.md).', teach: 'metabolism' },
  { kind: 'screen', id: 'adaptation', name: 'Adaptation Chamber', glyph: '☣', order: 24,
    blurb: 'Rewrite how your strains and champions behave — Antigen specialization.',
    condition: { kind: 'stage', stage: 24 },
    because: 'Specialization after fluency: stage 24 (~3h, where the first Molt usually lands) opens the deep-specialization beat. Antigen earned earlier (achievements/depth/traces) BANKS SILENTLY and arrives as a ready budget at the reveal (re-paced 2026-11).', teach: 'adaptation' },
  { kind: 'screen', id: 'mulligans', name: 'Mulligan Lab', glyph: '⊛', order: 25,
    blurb: 'Graft living organisms onto your towers.', condition: { kind: 'stage', stage: 25 },
    because: 'The deepest tower system waits for tower fluency: stage 25 (~3–5h, the first Molt plateau). Modifiers sequenced earlier BANK SILENTLY (no luck-reveal — re-paced 2026-11) and are waiting in the Lab at the reveal.', teach: 'mulligans' },
  { kind: 'screen', id: 'phenotypes', name: 'Phenotype Lab', glyph: '❖', order: 26,
    blurb: 'Cosmetic phenotypes for every strain and champion.', condition: { kind: 'stage', stage: 26 },
    because: 'Pure luxury — cosmetics wait (stage 26, ~5–6h) until the mechanical wardrobe is full and Gene Essence has a purpose beyond upgrades.', teach: 'phenotype-lab' },
  { kind: 'screen', id: 'specimens', name: 'Specimen Vault', glyph: '⧉', order: 27,
    blurb: 'Unclaimed cosmetics — tradable stock until you bind them.', condition: { kind: 'stage', stage: 27 },
    because: 'A Phenotype Lab tab one stage after the Lab itself (~6h). Specimens received earlier BANK SILENTLY — nothing strands: unclaimed stock waits in the inventory and its arrival card holds until this reveal (docs/COSMETICS.md §claiming; re-paced 2026-11 from reveal-on-need).', teach: 'specimens' },
  { kind: 'screen', id: 'arena', name: 'The Proving Grounds', glyph: '⚔', order: 28,
    blurb: 'Live PvP: two hives, one assault, one survivor.', condition: { kind: 'stage', stage: 28 },
    because: 'PvP demands a REAL build to be fair or fun — it reveals at stage 28 (~8h), after the first Molt and the deep-specialization beat, so the first ranked match is fought with towers, genes and a hero worth ranking (docs/ARENA.md).', teach: 'arena' },
  { kind: 'screen', id: 'auction', name: 'Auction House', glyph: '⚖', order: 29,
    blurb: 'Trade gene cards, gear, cosmetics and mulligan organs with other players.', condition: { kind: 'stage', stage: 30 },
    because: 'Trading is an EARNED capability (docs/TRADING-PREP.md fraud friction) and the last wing to open: stage 30 (~10h), when the account owns gear, cosmetics and organs worth trading. TRADE.minCampaignStage (10, server-enforced) is long satisfied by then.', teach: 'auction-house' },

  // ── Currencies (top bar) — appear WITH the system that spends them; earlier drops bank silently. ──
  { kind: 'currency', id: 'cur:ichor', name: 'Ichor', glyph: '🩸', order: 30,
    blurb: 'The organism’s black blood.', condition: { kind: 'stage', stage: 8 },
    because: 'Shows WITH the Splice Market (its sink) — a currency chip never precedes its purpose. Ichor bled earlier (achievements, Mega Boss bounties) banks silently and appears as one balance at the reveal (re-paced 2026-11).' },
  { kind: 'currency', id: 'cur:mats', name: 'Materials', glyph: '⊕', order: 31,
    blurb: 'Every secondary wallet in one chip — Gene Essence, then Mutagen · Scrap · Catalyst, Chitin, Tissue.', condition: { kind: 'stage', stage: 4 },
    because: 'The ONE Materials chip (docs/ECONOMY.md §player-facing) opens with the Gene Archive — the first system that spends a secondary wallet (Gene Essence). Later wallets (Armory crafting mats at stage 6, Chitin, Mulligan Tissue) join the same chip as their systems reveal instead of adding counters.' },
  { kind: 'currency', id: 'cur:cells', name: 'Ascendant Cells', glyph: '✦', order: 32,
    blurb: 'The prestige currency.', condition: { kind: 'any', of: [{ kind: 'molted' }, { kind: 'stage', stage: 24 }] },
    because: 'Appears with the first Molt (the Cells it mints) — a chip never precedes its purpose; the Molt pitch itself lives in Evolution HQ. Stage 24 (the typical first-Molt plateau) backstops an account that has not molted yet (re-paced 2026-11 from a stage-9 tease).' },
];

export const FEATURE_BY_ID: ReadonlyMap<string, FeatureDef> = new Map(FEATURES.map((f) => [f.id, f]));

// ── Queries ─────────────────────────────────────────────────────────────────

export interface FeatureView {
  def: FeatureDef;
  /** True when the condition holds NOW or the reveal was latched earlier. */
  revealed: boolean;
  progress: number; // 0..1 toward the condition (1 when revealed)
  label: string; // remaining requirement ('' when revealed)
}

/** One feature's live view (latch-aware — save.director.revealed pins past reveals). */
export function featureView(save: SaveData, id: string): FeatureView {
  const def = FEATURE_BY_ID.get(id);
  if (!def) throw new Error(`unlocks: unknown feature '${id}'`);
  const latched = save.director?.revealed?.[id] !== undefined;
  const v = evalCondition(def.condition, save);
  return { def, revealed: latched || v.done, progress: latched || v.done ? 1 : v.progress, label: latched || v.done ? '' : v.label };
}

/** True when a surface is available (Hub nav rows, top-bar chips, screen bodies). */
export function featureRevealed(save: SaveData, id: string): boolean {
  return featureView(save, id).revealed;
}

/** May guidance point HERE? (docs/NOTIFICATIONS.md §recommendations — never advise a sealed
 *  destination.) A gated screen must be revealed; navs outside the registry (sub-routes,
 *  always-on surfaces) are open by definition. Every advice surface asks this one question. */
export function isOpenNav(save: SaveData, nav: string): boolean {
  return !FEATURE_BY_ID.has(nav) || featureRevealed(save, nav);
}

/** Feature ids whose conditions hold now but were never latched — meta.latchNewReveals persists
 *  these (the moment a reveal ceremony may fire). */
export function unlatchedReveals(save: SaveData): string[] {
  const latched = save.director?.revealed ?? {};
  return FEATURES.filter((f) => latched[f.id] === undefined && evalCondition(f.condition, save).done).map((f) => f.id);
}

/** The next `n` UNrevealed screens in learning-curve order — the nav's anticipation teasers. */
export function nextReveals(save: SaveData, n: number): FeatureView[] {
  return FEATURES
    .filter((f) => f.kind === 'screen')
    .sort((a, b) => a.order - b.order)
    .map((f) => featureView(save, f.id))
    .filter((v) => !v.revealed)
    .slice(0, n);
}

/** Cognitive-load estimate (docs/PROGRESSION-GATING.md §load): how much surface area the player
 *  currently manages. Bands gate the pacing tests — a fresh account must sit in 'calm'. */
export interface CognitiveLoad { screens: number; currencies: number; mechanics: number; band: 'calm' | 'learning' | 'full' }
export function cognitiveLoad(save: SaveData, unlockedMechanicCount: number): CognitiveLoad {
  const screens = FEATURES.filter((f) => f.kind === 'screen' && featureRevealed(save, f.id)).length;
  const currencies = 2 + FEATURES.filter((f) => f.kind === 'currency' && featureRevealed(save, f.id)).length; // Cores + Biomass are always live
  const band = screens <= 6 ? 'calm' : screens <= 13 ? 'learning' : 'full';
  return { screens, currencies, mechanics: unlockedMechanicCount, band };
}

/** The whole timeline at a glance: for each feature, the earliest stage its condition can pass
 *  (0 = resource luck / immediately) and the stage by which it is guaranteed. Used by the
 *  generated unlock tree + the persona pacing tests. */
export function unlockTimeline(): { def: FeatureDef; possibleAt: number; guaranteedBy: number }[] {
  return FEATURES
    .map((def) => ({ def, possibleAt: earliestStage(def.condition), guaranteedBy: guaranteedByStage(def.condition) }))
    .sort((a, b) => a.guaranteedBy - b.guaranteedBy || a.def.order - b.def.order);
}
