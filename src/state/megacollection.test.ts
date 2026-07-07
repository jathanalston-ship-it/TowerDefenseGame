// Mega Boss progression wiring (docs/MEGA-BOSS.md §collection/§achievements): the megaKilled /
// megaWeakPointDown events land in the lifetime ledger, the Mega Bosses codex category tiers up
// (Slain → Mastered → Dominated), milestones pay permanent passives, and achievements read it all.

import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { gameEvents } from '../core/events';
import { checkAchievements } from './achievements';
import { megaBossRegistry } from '../core/megaboss';

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
