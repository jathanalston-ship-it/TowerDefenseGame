// Mega Boss progression wiring (docs/MEGA-BOSS.md §collection/§achievements): the megaKilled /
// megaWeakPointDown events land in the lifetime ledger, the Mega Bosses codex category tiers up
// (Slain → Mastered → Dominated), milestones pay permanent passives, and achievements read it all.

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { gameEvents } from '../core/events';
import { checkAchievements } from './achievements';
import { huntRank, huntRankAt, huntRankCores, huntWound, megaBossRegistry } from '../core/megaboss';
import type { RunResult } from './meta';
import type { RunStats } from '../core/types';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import { defaultLifetimeStats } from '../save/saveStore';

describe('mega boss collection + achievements', () => {
  it('records kills into the ledger and tiers the codex entry up with mastery', () => {
    meta.reset();
    const before = meta.collection().categories.find((c) => c.id === 'megaBosses')!;
    expect(before.total).toBe(megaBossRegistry.size);
    expect(before.entries.every((e) => e.tier === 0)).toBe(true);

    // A plain kill: tier 1 (Slain). Perfect + fast: tiers 2–3 (the mastery ladder).
    gameEvents.emit('megaKilled', { defId: 'voraxis', tier: 1, encounter: 'campaign', killSec: 500, perfect: false, weakPoints: 3, interrupts: 1 });
    gameEvents.emit('megaKilled', { defId: 'meridia', tier: 1, encounter: 'daily', killSec: 1, perfect: true, weakPoints: 5, interrupts: 2 });

    const save = meta.get();
    expect(save.megaProgress.kills).toBe(2);
    expect(save.megaProgress.slain).toEqual(['voraxis', 'meridia']);
    expect(save.megaProgress.perfect).toEqual(['meridia']);
    expect(save.megaProgress.speed).toContain('meridia'); // killSec 1 beats any expectation
    expect(save.megaProgress.interrupts).toBe(3);
    expect(save.megaProgress.fastestSec.voraxis).toBe(500);

    const after = meta.collection().categories.find((c) => c.id === 'megaBosses')!;
    expect(after.entries.find((e) => e.id === 'voraxis')!.tier).toBe(1);
    expect(after.entries.find((e) => e.id === 'meridia')!.tier).toBe(3); // Slain + Perfect + Swift
    expect(after.completion).toBeGreaterThan(0); // mastery feeds completion → bonuses → Power
  });

  it('weak-point telemetry accumulates (count + distinct kinds)', () => {
    meta.reset();
    gameEvents.emit('megaWeakPointDown', { defId: 'voraxis', kind: 'eye', note: 'x', interrupted: true });
    gameEvents.emit('megaWeakPointDown', { defId: 'voraxis', kind: 'eye', note: 'x', interrupted: false });
    gameEvents.emit('megaWeakPointDown', { defId: 'voraxis', kind: 'heart', note: 'x', interrupted: false });
    const mp = meta.get().megaProgress;
    expect(mp.weakPoints).toBe(3);
    expect(mp.wpKinds.sort()).toEqual(['eye', 'heart']);
  });

  it('achievements unlock off the ledger (first kill / first weak point / registry-driven all-kill)', () => {
    meta.reset();
    gameEvents.emit('megaWeakPointDown', { defId: 'voraxis', kind: 'eye', note: 'x', interrupted: false });
    for (const d of megaBossRegistry.active()) {
      gameEvents.emit('megaKilled', { defId: d.id, tier: 1, encounter: 'campaign', killSec: 200, perfect: false, weakPoints: 1, interrupts: 0 });
    }
    const unlocked = checkAchievements({ save: meta.get() }).map((a) => a.id);
    expect(unlocked).toContain('mega_first');
    expect(unlocked).toContain('wp_first');
    expect(unlocked).toContain('mega_all'); // scales with the registry — no hardcoded roster count
  });
});

// THE MEGA HUNT (docs/MEGA-BOSS.md §hunt): ranks key off the LIFETIME organ ledger with crossing
// semantics — a run's ruptures (live events) pay each crossed rank ONCE; no claim ledger exists.
describe('the Mega Hunt — derived ranks, paid once', () => {
  function huntRun(organs: number, hunt?: RunStats['megaHunt']): RunResult {
    const zero = { kills: 0, damage: 0, activeTime: 0 };
    const mastery = TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['mastery'];
    const heroMastery = HERO_ORDER.reduce((o, k) => ({ ...o, [k]: { ...zero } }), {}) as RunResult['heroMastery'];
    const stats: RunStats = {
      kills: 0, wave: 3, won: false, biomassEarned: 0, damageDealt: 0, integrityLost: 0,
      killsByEnemy: defaultLifetimeStats().killsByEnemy,
      towerBuilds: TOWER_ORDER.reduce((o, k) => ({ ...o, [k]: 0 }), {}) as RunStats['towerBuilds'],
      cardIds: [], heroId: HERO_ORDER[0], weakPointsDestroyed: organs, ...(hunt ? { megaHunt: hunt } : {}),
    };
    return { wave: 3, kills: 0, won: false, mastery, heroMastery, stats, endless: true };
  }
  const rupture = (n: number): void => {
    for (let i = 0; i < n; i++) gameEvents.emit('megaWeakPointDown', { defId: 'voraxis', kind: i % 2 ? 'eye' : 'heart', note: 'x', interrupted: false });
  };

  it('a failed raid that crosses ranks pays each crossed rank once; a later run pays nothing for them', () => {
    meta.reset();
    meta.abandonRun();
    rupture(13); // live ruptures during the run: 0 → 13 crosses rank 1 (4) and rank 2 (12)
    const o = meta.finishRun(huntRun(13, { defId: 'voraxis', tier: 1, hpTorn: 0.42, organs: 13 }));
    expect(o.megaHunt).toBeDefined();
    expect(o.megaHunt!.ranksGained).toBe(2);
    expect(o.megaHunt!.rank).toBe(huntRank(13));
    expect(o.megaHunt!.cores).toBe(2 * huntRankCores(1)); // the frontier of a fresh save is Stage 1
    expect(o.megaHunt!.wound).toBe('crippled'); // 13 organs ≥ the Crippled organ bar
    expect(o.megaHunt!.nextRankAt).toBe(huntRankAt(3));
    expect(o.megaHunt!.nextRankCores).toBe(huntRankCores(1)); // preview == the next payout
    // The dossier names the organs this account has ruptured, and hides the rest.
    expect(o.megaHunt!.dossier.find((d) => d.kind === 'eye')?.known).toBe(true);
    // A follow-up run with NO new ruptures crosses nothing — the ranks are never paid twice.
    const again = meta.finishRun(huntRun(0, { defId: 'voraxis', tier: 1, hpTorn: 0.05, organs: 0 }));
    expect(again.megaHunt!.ranksGained).toBe(0);
    expect(again.megaHunt!.cores).toBe(0);
    expect(again.megaHunt!.wound).toBeNull();
  });

  it('runs without a mega carry no hunt block', () => {
    meta.reset();
    meta.abandonRun();
    expect(meta.finishRun(huntRun(0)).megaHunt).toBeUndefined();
  });

  it('rank + wound math (pure)', () => {
    expect([1, 2, 3, 4].map(huntRankAt)).toEqual([4, 12, 24, 40]);
    expect(huntRank(0)).toBe(0);
    expect(huntRank(3)).toBe(0);
    expect(huntRank(4)).toBe(1);
    expect(huntRank(39)).toBe(3);
    expect(huntRank(40)).toBe(4);
    expect(huntRank(1e9)).toBeGreaterThan(huntRank(1e8)); // O(1) closed form, monotonic, uncapped
    expect(huntWound(0, 0)).toBeNull();
    expect(huntWound(0.12, 0)?.id).toBe('marked');
    expect(huntWound(0.5, 0)?.id).toBe('wounded');
    expect(huntWound(0.2, 6)?.id).toBe('crippled'); // organ play counts as much as raw damage
    expect(huntWound(1, 0)?.id).toBe('felled');
    expect(huntRankCores(80)).toBeGreaterThan(huntRankCores(10)); // the bounty keeps pace with depth
  });
});
