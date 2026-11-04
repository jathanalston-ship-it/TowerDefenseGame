// Default notification sources — wires the shipped menus to the generic engine
// (notifications.ts). Each is a pure count(save); the engine handles seen/clear/re-light.
// This is the ONE place menu notifications are declared — menus themselves stay logic-free,
// and a new feature adds a badge with a single registerNotification() call here (or from its
// own module). Channels match Hub nav keys (src/ui/Hub.tsx).
//
// Imported for its side effects (the registrations run on load); Hub.tsx pulls it in.
//
// DECISIONS, NOT CHORES (docs/NOTIFICATIONS.md §decisions, 2026-11): a badge exists only where
// the player has a DECISION to make — an affordable upgrade, an unopened container, a pending
// choice, a gear swap that raises Power. Pure novelty (achievements unlocked, codex entries
// discovered, memories recovered, the store's daily rotation) no longer badges, no-choice claims
// settle themselves at run end (state/autoClaim.ts), and a sealed screen never badges at all.

import { registerNotification, setChannelGate } from './notifications';
import { featureRevealed, FEATURE_BY_ID } from './unlocks';
import { equipUpgrades } from './equipAdvisor';
import type { SaveData } from '../save/saveStore';
import { geneArchiveRows } from './geneArchive';
import { HIVE_ORGANS, hiveCost } from '../core/hiveOrgans';
import { labEra, labScore } from '../ui/homeBaseTiers';
import { sumValues } from '../core/math';
import { adaptationView, isHeroUnlocked, isTowerUnlocked, nextStarCost } from './meta';
import { HERO_ORDER, IDLE, TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { marketWindow } from '../core/market';
import { dailyKey } from '../core/daily';
import { MAIN_QUESTLINE, questComplete, weeklyQuestFor } from '../core/quests';
import { ALL_SECTORS, CLAIMABLE_TIERS, REGIONS, TRIBUTE_MIN_TIERS, effectiveLevel, incursionSectorId, regionHeldTiers, tierOf } from '../core/infestation';
import { weekKey } from '../core/accountLevel';
import { BP, levelOf } from '../core/battlePass';
import { evolutionRosterSignal } from '../ui/evolutionTrackModel';
import { activeLiveEvents, eventTrack } from '../core/liveEvents';
import { metabolismClaimable } from './metabolism';

// Sealed screens count 0 (their backlog surfaces at the reveal). Channels outside the unlock
// registry (none today) stay open.
setChannelGate((save, channel) => !FEATURE_BY_ID.has(channel) || featureRevealed(save, channel));

// Genetic Vault — unopened bio-containers banked from runs, waiting to be cracked.
registerNotification({
  id: 'vault.containers',
  channel: 'vault',
  count: (s) => s.pendingContainers.length,
  reason: (_s, n) => `${n} Bio-Container${n === 1 ? '' : 's'} to open`,
});

// Daily Bio-Cache — today's cache is still sealed (docs/DAILY-LOGIN.md). Lexical ISO-key
// compare mirrors the claim gate, so a forged future key shows no badge either.
// Channel is the VAULT (where the player cracks containers — the cache renders there too),
// NOT 'home': the player lands on home every session, so a home badge acknowledged itself
// before it was ever seen — the "no notification for the daily cache" bug.
registerNotification({
  id: 'login.cache',
  channel: 'vault',
  count: (s) => (s.login.last < dailyKey() ? 1 : 0),
  reason: () => 'Daily Bio-Cache sealed',
});

// Bio-Roulette bank — banked spores wait on the Vault's Roulette bay (docs/BOSS-RUSH.md
// §roulette). Same channel logic as the cache: the bay renders on the vault, so the badge
// clears where the action is.
registerNotification({
  id: 'vault.spores',
  channel: 'vault',
  count: (s) => (s.bioSpores > 0 && featureRevealed(s, 'bossrush') ? 1 : 0), // the bay arrives with Boss Rush
  reason: (s) => `${s.bioSpores} Bio-Spore${s.bioSpores === 1 ? '' : 's'} banked for the Roulette`,
});

// Metabolism — lifetime milestones reached but undigested (docs/METABOLISM.md). Derive-first:
// normal play crosses thresholds on its own, so this lights up without any dedicated grind.
registerNotification({
  id: 'metabolism.claimable',
  channel: 'metabolism',
  count: (s) => metabolismClaimable(s),
  reason: (_s, n) => `${n} milestone${n === 1 ? '' : 's'} ready to digest`,
});

// Specimen Vault — unclaimed cosmetics wait on the claim-or-trade decision (v53,
// docs/COSMETICS.md §claiming). Counts ITEMS not instances: five dupes of one piece are
// one decision, not five badges.
registerNotification({
  id: 'cosmetic.unclaimed',
  channel: 'specimens',
  count: (s) => new Set(s.wardrobe.inventory.map((i) => i.item)).size,
  reason: (_s, n) => `${n} specimen${n === 1 ? '' : 's'} await assimilation`,
});

// Boss Rush — today's FREE gauntlet entry is still unused (docs/BOSS-RUSH.md §stamina).
// The quick-finisher surface (docs/REWARD-FREQUENCY.md §wind-down): a ~6-minute mode the
// recommendation layer can hand a short session tail to once claims run dry. ISO keys
// compare lexically, so a forged future freeDay simply waits (same rule as the claim gate).
registerNotification({
  id: 'rush.freeEntry',
  channel: 'bossrush',
  count: (s) => (s.rushStamina.freeDay < dailyKey() ? 1 : 0),
  reason: () => 'Free gauntlet entry — expires at reset',
  // The count is 1 today AND 1 tomorrow (a fresh free entry every reset) — a persistent
  // watermark from one un-acted visit would suppress the badge FOREVER (the reported
  // "no notification for the free run"). Daily volatility re-lights it each reset.
  volatile: 'daily',
});

// Idle Harvest — the Hive has banked a ceremony-worthy haul (docs/IDLE-HARVEST.md). Cheap
// timestamp math only (no collection/power folds — this runs on every badge poll).
registerNotification({
  id: 'idle.ripe',
  channel: 'harvest',
  count: (s) => {
    const last = s.idle.lastCollect;
    if (!last || last > Date.now()) return 0;
    return (Date.now() - last) / 60_000 >= IDLE.ceremonyMinutes ? 1 : 0;
  },
  reason: () => 'Hive yield ready to harvest',
});

// The Hive — organs whose NEXT tier is affordable right now (era met, every recipe line
// covered). Drops as you build or spend; pure recomputation of the board's affordability.
registerNotification({
  id: 'hive.affordable',
  channel: 'hive',
  count: (s) => {
    const era = labEra(labScore(s));
    const wallet = {
      cores: s.shards, essence: s.geneEssence, strain: sumValues(s.towerShards), apex: sumValues(s.heroShards),
      mutagen: s.mats.mutagen, scrap: s.mats.scrap, catalyst: s.mats.catalyst,
    };
    return HIVE_ORGANS.reduce((n, def) => {
      const built = Math.min(s.hive?.built[def.id] ?? 0, def.tiers);
      if (era < def.era || built >= def.tiers) return n;
      return n + (hiveCost(def, built + 1).every((l) => wallet[l.key] >= l.amount) ? 1 : 0);
    }, 0);
  },
  reason: (_s, n) => `${n} Hive organ${n === 1 ? '' : 's'} affordable`,
});

// Splice Market — a stock window the player hasn't seen yet (fresh goods landed). Uses the
// max-window rule so a rewound clock can't strobe the badge; viewing the market stamps
// seenWindow (meta.openMarket) and clears it.
registerNotification({
  id: 'market.stock',
  channel: 'market',
  count: (s) => (Math.max(marketWindow(Date.now()), s.market.window) > s.market.seenWindow ? 1 : 0),
  reason: () => 'Fresh market stock landed',
});

// (Premium Store: no badge. "Today's rotation unseen" was a daily view-count nag, not a
// decision — removed 2026-11, docs/NOTIFICATIONS.md §decisions.)

// Tower Lab — towers whose next star you can afford right now (drops as you buy them),
// plus DORMANT towers whose synthesis is claimable (docs/TOWERS.md §expansion unlock gate).
registerNotification({
  id: 'towers.stars',
  channel: 'towers',
  count: (s) =>
    TOWER_ORDER.reduce((n, k) => {
      if (!isTowerUnlocked(s, k)) {
        const unlock = TOWER_DEFS[k].unlockShards ?? 0;
        return n + ((s.towerShards[k] ?? 0) >= unlock ? 1 : 0); // synthesis ready
      }
      const cost = nextStarCost(s, k);
      return n + (cost !== null && (s.towerShards[k] ?? 0) >= cost ? 1 : 0);
    }, 0),
  reason: (_s, n) => `${n} tower Star${n === 1 ? '' : 's'} affordable`,
});

// Equipment — FREE gear upgrades waiting: unequipped pieces that raise a fielded hero's Power
// (state/equipAdvisor — the exact same picks the Armory strip offers). Was "every piece in the
// inventory", a novelty count that never went dark on a full rack. Memoized per save revision
// (the advisor exact-diffs Power; badges/reasons/live all poll the same snapshot).
const gearPicks = new WeakMap<SaveData, number>();
registerNotification({
  id: 'heroes.equipment',
  channel: 'equipment',
  count: (s) => {
    let n = gearPicks.get(s);
    if (n === undefined) { n = s.equipment.inventory.length > 0 ? equipUpgrades(s, 6).length : 0; gearPicks.set(s, n); }
    return n;
  },
  reason: (_s, n) => `${n} gear upgrade${n === 1 ? '' : 's'} ready to equip`,
});

// Adaptation — unlocked units holding unspent Antigen (docs/ADAPTATION.md; a tier-1 rung is
// always pickable while free points exist, so "free points" is actionable).
registerNotification({
  id: 'adaptation.points',
  channel: 'adaptation',
  count: (s) => {
    let n = 0;
    for (const k of TOWER_ORDER) if (isTowerUnlocked(s, k) && adaptationView(s, 'tower', k).pointsAvailable > 0) n++;
    for (const h of HERO_ORDER) if (isHeroUnlocked(s, h) && adaptationView(s, 'hero', h).pointsAvailable > 0) n++;
    return n;
  },
  reason: (_s, n) => `${n} unit${n === 1 ? '' : 's'} holding unspent Antigen`,
});

// Expeditions — teams back from the field with unclaimed spoils (docs/EXPEDITIONS.md). Wall-clock
// read: the badge refreshes on any save write / ack tick, which is exactly when it matters.
registerNotification({
  id: 'expeditions.claimable',
  channel: 'expeditions',
  count: (s) => s.expeditions.active.filter((e) => e.endsAt <= Date.now()).length,
  reason: (_s, n) => `${n} expedition${n === 1 ? '' : 's'} returned with spoils`,
});

// (Profile achievements, Bio-Dex discoveries and recovered memories: no badge. Their rewards
// are auto-granted and the toasts already announced them — "N new since you looked" is a view
// count, not a decision. Removed 2026-11, docs/NOTIFICATIONS.md §decisions.)

// Gene Archive — cards you can permanently upgrade RIGHT NOW (owned + gate met + affordable).
registerNotification({
  id: 'genes.upgradeable',
  channel: 'genes',
  count: (s) => geneArchiveRows(s).reduce((n, r) => n + (r.upgradeable ? 1 : 0), 0),
  reason: (_s, n) => `${n} gene card${n === 1 ? '' : 's'} upgradeable now`,
});

// Season Pass — earned-but-unclaimed reward cells (docs/BATTLEPASS.md). Mirrors the claim
// gates in meta.battlePass()/claimPassLevel exactly: every earned free level + every earned
// premium level when the pass is owned (the 1/50/99 free-taste levels count for everyone).
// Cheap array math per poll; no window rollover here — a season-end backlog is precisely when
// the badge should glow, and visiting the screen polls the rollover.
registerNotification({
  id: 'season.claimable',
  channel: 'season',
  count: (s) => {
    const bp = s.battlePass;
    const level = Math.min(levelOf(bp.xp).level, BP.levels);
    let n = 0;
    for (let l = 1; l <= level; l++) {
      if (!bp.claimedFree.includes(l)) n++;
      if ((bp.premium || BP.freePremiumLevels.includes(l)) && !bp.claimedPremium.includes(l)) n++;
    }
    return n;
  },
  reason: (_s, n) => `${n} pass reward${n === 1 ? '' : 's'} earned, unclaimed`,
});

// Quest Board — missions + finales claimable RIGHT NOW across both lanes (docs/QUESTS.md).
// Claims drop the count; the weekly reset lowers it and the watermark clamps down with it.
// Pure over the save: the RECORDED window's quest is the one holding claimable progress.
registerNotification({
  id: 'quests.claimable',
  channel: 'quests',
  count: (s) => {
    const q = s.quests;
    const weekly = weeklyQuestFor(q.weekly.window);
    let n = weekly.missions.reduce((a, m) => a + ((q.weekly.progress[m.id] ?? 0) >= m.target && !q.weekly.claimed.includes(m.id) ? 1 : 0), 0);
    if (questComplete(weekly, q.weekly.progress) && !q.weekly.completionClaimed) n++;
    const chapter = MAIN_QUESTLINE.find((c) => !q.main.completions.includes(c.id));
    if (chapter) {
      n += chapter.missions.reduce((a, m) => a + ((q.main.progress[m.id] ?? 0) >= m.target && !q.main.claimed.includes(m.id) ? 1 : 0), 0);
      if (questComplete(chapter, q.main.progress)) n++;
    }
    return n;
  },
  reason: (_s, n) => `${n} quest reward${n === 1 ? '' : 's'} claimable`,
});

// Mastery Evolution Tracks (docs/MASTERY.md §evolution track) — units whose helix holds
// reached-unclaimed nodes, or a completed loop ready to EVOLVE. One badge per lab wing;
// claiming (or evolving) drops the count, and the watermark clamps down with it.
registerNotification({
  id: 'evolution.towers',
  channel: 'towers',
  count: (s) => TOWER_ORDER.reduce((n, k) => {
    const sig = evolutionRosterSignal(s, 'tower', k);
    return n + (sig.claimable > 0 || sig.ready ? 1 : 0);
  }, 0),
  reason: (_s, n) => `${n} tower evolution track${n === 1 ? '' : 's'} ready`,
});
registerNotification({
  id: 'evolution.heroes',
  channel: 'heroes',
  count: (s) => HERO_ORDER.reduce((n, k) => {
    const sig = evolutionRosterSignal(s, 'hero', k);
    return n + (sig.claimable > 0 || sig.ready ? 1 : 0);
  }, 0),
  reason: (_s, n) => `${n} hero evolution track${n === 1 ? '' : 's'} ready`,
});

// THE FRONT (docs/INFESTATION.md §front) — unclaimed tier spoils, an uncollected weekly
// tribute, or a live undefended incursion. Cheap: 16 effective-level reads per poll, no
// meta folds. Channel = the map's own screen (a real nav — the readyChain contract).
registerNotification({
  id: 'front.war',
  channel: 'infestation',
  count: (s) => {
    const now = Date.now();
    let n = 0;
    for (const x of ALL_SECTORS) {
      const cur = tierOf(effectiveLevel(s.infestation.sectors[x.id], now)).index;
      if (CLAIMABLE_TIERS.some((t) => t <= cur && t > (s.infestation.tierClaims[x.id] ?? 0))) n += 1;
    }
    const wk = weekKey(now);
    for (const r of REGIONS) {
      if (s.infestation.tributeWeeks[r.id] === wk) continue;
      if (regionHeldTiers(r, s.infestation.sectors, now) >= TRIBUTE_MIN_TIERS) n += 1;
    }
    const inc = incursionSectorId(dailyKey(), s.infestation.sectors, now);
    if (inc && s.infestation.defenses[dailyKey()] !== inc) n += 1;
    return n;
  },
  reason: (_s, n) => `${n} Front action${n === 1 ? '' : 's'} waiting`,
});

// Live Events (docs/LIVE-EVENTS.md §6) — the claim console lives on the Command Center, so
// both sources ride the 'home' channel. Landing on home self-acks the badge dot, but the
// watermark-free live() lane keeps the Ready Chain lit — a claimable milestone never goes dark.
registerNotification({
  id: 'event.claimable',
  channel: 'home',
  count: (s) => {
    let n = 0;
    for (const a of activeLiveEvents(Date.now())) {
      if (!a.def.currency) continue;
      const bank = s.liveEvents.tokens[a.key] ?? 0;
      const claimed = s.liveEvents.claimed[a.key] ?? [];
      for (const m of eventTrack(a.def)) if (bank >= m.at && !claimed.includes(m.at)) n++;
    }
    return n;
  },
  reason: (_s, n) => `${n} event milestone${n === 1 ? '' : 's'} claimable`,
});

// The use-it-or-lose-it warning (docs/LIVE-EVENTS.md §3): a window closing within a day while
// the token bank still buys something — an unclaimed reached milestone or a stocked shop row.
registerNotification({
  id: 'event.endingSoon',
  channel: 'home',
  count: (s) => {
    const now = Date.now();
    let n = 0;
    for (const a of activeLiveEvents(now)) {
      if (!a.def.currency || a.endsAt - now > 86_400_000) continue;
      const bank = s.liveEvents.tokens[a.key] ?? 0;
      const claimed = s.liveEvents.claimed[a.key] ?? [];
      const claimable = eventTrack(a.def).some((m) => bank >= m.at && !claimed.includes(m.at));
      const buyable = (a.def.shop ?? []).some((r) => bank >= r.costTokens && (s.liveEvents.shopBought[a.key]?.[r.id] ?? 0) < r.stock);
      if (claimable || buyable) n++;
    }
    return n;
  },
  reason: (_s, n) => `${n} event window${n === 1 ? '' : 's'} closing on unspent rewards`,
});
