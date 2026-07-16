// Arena meta integration (docs/ARENA.md) — the persistence-layer contracts:
//   • settleArenaMatch: wins pay a container + Run Cache + pass XP and move rating UP; losses
//     pay cores + salvage only and move rating DOWN; EXACTLY-ONCE per matchId; placements burn;
//   • claimArenaPassLevel: level/ownership/premium gates hold; claims pay through the ONE
//     interpreter; level 100 writes the FOREVER exclusives ledger;
//   • buyArenaPassPremium spends Ichor once;
//   • season polling rolls stale records and materializes decay;
//   • the idle dividend: a fresh account reads EXACTLY ×1 (identity); a ranked account reads
//     a diminishing, capped bonus that scales the real accrual;
//   • arenaBootBundle passes the shared anti-cheat validation and NEVER carries vows/nemesis.

import { beforeEach, describe, expect, it } from 'vitest';
import { meta } from './meta';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';
import { ARENA, arenaMatchRewards, arenaSeasonIndex } from '../core/arena';
import type { ArenaMatchClaim } from '../core/arena';
import { ARENA_PASS, arenaPassTrack, arenaPassXpToReach } from '../core/arenaPass';
import { bootBundleProblem } from '../core/arenaMatch';
import { resetSecurity } from '../security/actionGuard';

const NOW = Date.UTC(2026, 7, 10); // inside season 1 (epoch 2026-08-01)

function seed(over: Partial<SaveData> = {}): void {
  resetSecurity();
  const base = defaultSave();
  meta.importText(serializeExport({ ...base, ...over }));
}

function arenaSeeded(arenaOver: Partial<SaveData['arena']> = {}, saveOver: Partial<SaveData> = {}): void {
  seed({
    ...saveOver,
    arena: { ...defaultSave().arena, season: arenaSeasonIndex(NOW), ...arenaOver },
  });
}

const claim = (over: Partial<ArenaMatchClaim> = {}): ArenaMatchClaim => ({
  matchId: `m_meta_${Math.floor(Math.random() * 1e9)}`,
  season: arenaSeasonIndex(NOW),
  outcome: 'win',
  vsAi: true,
  oppRating: 600,
  oppPower: 900,
  durationSec: 180,
  waveReached: 7,
  power: 1000,
  ...over,
});

describe('settleArenaMatch', () => {
  beforeEach(() => arenaSeeded());

  it('a win banks a container + a Run Cache, pays pass XP, and moves rating up', () => {
    const before = meta.get();
    const r = meta.settleArenaMatch(claim({ matchId: 'm_win_000001' }), NOW)!;
    expect(r).not.toBeNull();
    expect(r.outcome).toBe('win');
    expect(r.delta).toBeGreaterThan(0);
    expect(r.passXp).toBe(ARENA.winPassXp);
    const after = meta.get();
    expect(after.arena.rating).toBe(before.arena.rating + r.delta);
    expect(after.arena.wins).toBe(1);
    expect(after.arena.placements).toBe(ARENA.placementMatches - 1);
    expect(after.arena.streak).toBe(1);
    expect(after.arena.passXp).toBe(ARENA.winPassXp);
    expect(after.pendingContainers.length).toBe(before.pendingContainers.length + 2); // container + run cache
  });

  it('a loss pays standard resources only and never banks containers', () => {
    const before = meta.get();
    const r = meta.settleArenaMatch(claim({ matchId: 'm_loss_000001', outcome: 'loss' }), NOW)!;
    expect(r.delta).toBeLessThan(0);
    expect(r.passXp).toBe(0);
    const after = meta.get();
    expect(after.pendingContainers.length).toBe(before.pendingContainers.length);
    expect(after.shards).toBeGreaterThan(before.shards); // cores paid
    expect(after.mats.scrap).toBeGreaterThan(before.mats.scrap); // salvage paid
    expect(after.arena.rating).toBe(0); // floored — a fresh row can't go negative
    expect(after.arena.streak).toBe(0);
  });

  it('is EXACTLY-ONCE per matchId and rejects forged/stale claims', () => {
    const c = claim({ matchId: 'm_once_000001' });
    expect(meta.settleArenaMatch(c, NOW)).not.toBeNull();
    expect(meta.settleArenaMatch(c, NOW)).toBeNull(); // dedupe
    expect(meta.settleArenaMatch(claim({ matchId: 'm_forged_00001', power: 1e12 }), NOW)).toBeNull(); // shared validator
    expect(meta.settleArenaMatch(claim({ matchId: 'm_stale_000001', season: 999 }), NOW)).toBeNull(); // wrong season
  });
});

describe('the Arena Pass (meta)', () => {
  it('gates claims on level / duplicate / premium; claims pay', () => {
    arenaSeeded({ passXp: arenaPassXpToReach(3) }); // level 3 earned
    expect(meta.claimArenaPassLevel('free', 4, NOW)).toBeNull(); // not reached
    const lines = meta.claimArenaPassLevel('free', 1, NOW);
    expect(lines).not.toBeNull();
    expect(lines!.length).toBeGreaterThan(0);
    expect(meta.claimArenaPassLevel('free', 1, NOW)).toBeNull(); // already claimed
    expect(meta.claimArenaPassLevel('premium', 2, NOW)).toBeNull(); // premium locked
    expect(meta.get().arena.passClaimedFree).toContain(1);
  });

  it('level 100 writes the FOREVER exclusives ledger (the season crown)', () => {
    arenaSeeded({ passXp: arenaPassXpToReach(ARENA_PASS.levels) });
    const row = arenaPassTrack(arenaSeasonIndex(NOW))[ARENA_PASS.levels - 1];
    expect(row.exclusive).toBeTruthy();
    const lines = meta.claimArenaPassLevel('free', ARENA_PASS.levels, NOW)!;
    expect(lines.some((l) => l.label.includes('UNLOCKED'))).toBe(true);
    expect(meta.get().arena.exclusives).toContain(row.exclusive);
    // the ledger survives a season roll (forever)
    meta.pollArenaSeason(NOW + ARENA.seasonMs * 2);
    expect(meta.get().arena.exclusives).toContain(row.exclusive);
  });

  it('buyArenaPassPremium spends Ichor exactly once', () => {
    arenaSeeded({}, { ichor: ARENA_PASS.premiumIchor + 10 });
    expect(meta.buyArenaPassPremium(NOW)).toBe(true);
    expect(meta.get().ichor).toBe(10);
    expect(meta.get().arena.passPremium).toBe(true);
    expect(meta.buyArenaPassPremium(NOW)).toBe(false); // already owned
  });
});

describe('season polling + decay', () => {
  it('rolls a stale record (history archived, pass cleared, placements re-armed)', () => {
    arenaSeeded({ season: 1, rating: 2000, wins: 5, losses: 2, passXp: 300, passPremium: true });
    const later = Date.UTC(2026, 7, 1) + ARENA.seasonMs * 3 + 1000; // season 4
    meta.pollArenaSeason(later);
    const a = meta.get().arena;
    expect(a.season).toBe(arenaSeasonIndex(later));
    expect(a.history.length).toBe(1);
    expect(a.passXp).toBe(0);
    expect(a.passPremium).toBe(false);
    expect(a.placements).toBe(ARENA.placementMatches);
    expect(a.rating).toBeLessThan(2000); // soft reset pulled toward the base
  });

  it('materializes rank decay for idle top-division accounts', () => {
    const idleDays = ARENA.decayIdleDays + 6;
    arenaSeeded({ rating: 2500, lastPlayedAt: NOW - idleDays * 86_400_000 });
    meta.pollArenaSeason(NOW);
    expect(meta.get().arena.rating).toBe(2500 - 6 * ARENA.decayPerDay);
  });
});

describe('the idle rank dividend', () => {
  it('a fresh account reads EXACTLY ×1 (identity — golden-safe)', () => {
    seed();
    const v = meta.idleView(NOW);
    expect(v.arenaDividend).toBe(1);
    expect(v.arenaCapBonusHours).toBe(0);
  });

  it('a ranked account reads a capped bonus that scales the real accrual', () => {
    arenaSeeded({ rating: 2500, lastPlayedAt: NOW }); // Apex II — division index 8
    const ranked = meta.idleView(NOW);
    expect(ranked.arenaDividend).toBeGreaterThan(1);
    expect(ranked.arenaDividend).toBeLessThanOrEqual(1.15);
    expect(ranked.arenaCapBonusHours).toBeGreaterThan(0);
    seed(); // fresh baseline with identical idle state
    const fresh = meta.idleView(NOW);
    expect(ranked.accrual.ratePerHour).toBeGreaterThan(fresh.accrual.ratePerHour);
    expect(ranked.accrual.capHours).toBe(fresh.accrual.capHours + ranked.arenaCapBonusHours);
  });
});

describe('the local boot bundle', () => {
  it('passes the shared anti-cheat validation and never carries vows/nemesis', () => {
    seed({
      nemesis: { defId: 'anything', slain: 3 },
      prestige: { ...defaultSave().prestige, vows: ['famine'] as never },
    });
    const bundle = meta.arenaBootBundle();
    expect(bootBundleProblem(bundle)).toBeNull();
    expect(bundle.opts.vows).toBeUndefined();
    expect(bundle.opts.nemesis).toBeUndefined();
    expect(bundle.opts.daily).toBeUndefined();
  });
});

describe('reward derivation stays shared (client == server table)', () => {
  it('meta pays exactly what arenaMatchRewards derives', () => {
    arenaSeeded({ rating: 1900, lastPlayedAt: NOW }); // Chrysalis II — epic-band wins
    const derived = arenaMatchRewards('win', 6);
    expect(derived.rewards[0]).toMatchObject({ kind: 'container', rarity: 'epic' });
    const before = meta.get().pendingContainers.length;
    meta.settleArenaMatch(claim({ matchId: 'm_epic_000001' }), NOW);
    const containers = meta.get().pendingContainers.slice(before);
    expect(containers.some((c) => c.kind === 'loot' && (c as { rarity?: string }).rarity === 'epic')).toBe(true);
  });
});
