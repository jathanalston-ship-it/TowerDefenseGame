// Expansion roster contracts (docs/TOWERS.md §expansion): the Carrion Maw cleaves everything
// in its jaws, the Amber Chrysalis hard-locks the biggest threat (with the engine-level
// refractory window making perma-CC impossible), the Wailing Effigy panics siegers OFF the
// Hive crust and they re-converge when it fades — plus the strain verbs unique to the trio.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_DEFS } from './config';
import { towerSlots } from './map';
import { applyStatus, tickStatuses, statusRegistry, STATUS_EFFECTS } from './status';
import type { ActiveStatus } from './status';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

function gameWith(kind: TowerKind, strain = 1, seed = 7, slot = 0): Game {
  // Legacy sim (disableIdle): the expansion kits' choreography (flee/refreeze/spit windows)
  // is pinned without idle openers — the idle layer is covered by towerIdle.test.ts.
  const g = new Game(seed, NO_META, undefined, undefined, undefined, { disableIdle: true });
  const sl = towerSlots[slot];
  expect(g.placeTower(kind, sl.x, sl.y)).toBe(true);
  const t = g.towers[0];
  t.strain = strain;
  (g as unknown as { recomputeTowerCaches: () => void }).recomputeTowerCaches();
  return g;
}

describe('the refractory window (status.ts — no perma-CC by construction)', () => {
  it('an expired freeze leaves an inert marker that BLOCKS re-application until it clears', () => {
    const list: ActiveStatus[] = [];
    const freeze = statusRegistry.get('freeze')!;
    applyStatus(list, freeze);
    expect(list[0].stacks).toBe(1);
    // tick past the hold → the marker (stacks 0, counting the refractory window)
    const t1 = tickStatuses(list, STATUS_EFFECTS.freeze.baseDuration + 0.01);
    expect(t1.expired).toContain('freeze');
    expect(list[0].stacks).toBe(0);
    // a re-application BOUNCES while the marker holds
    applyStatus(list, freeze);
    expect(list[0].stacks).toBe(0);
    // the window clears → the entry drops (silently — not a second expiry event) → can re-apply
    const t2 = tickStatuses(list, STATUS_EFFECTS.freeze.refractorySec! + 0.01);
    expect(t2.expired ?? []).not.toContain('freeze');
    expect(list.length).toBe(0);
    applyStatus(list, freeze);
    expect(list[0].stacks).toBe(1);
  });
});

describe('Carrion Maw — the crust brawler', () => {
  it('one bite damages MULTIPLE enemies inside the jaws (cleave, not single-target)', () => {
    const g = gameWith('maw', 1);
    g.startWave();
    // PIN a picket inside the jaws (§gaits scatter marching spacing, so spawn traffic no
    // longer guarantees overlap): the cleave CONTRACT is "one bite, many victims" — hold
    // four bodies in reach and watch a single bite damage several at once.
    g.debugSpawn('runner', 4);
    const maw = g.towers[0];
    let multiHit = false;
    for (let i = 0; i < Math.round(10 / SIM_DT) && !multiHit; i++) {
      const picket = g.enemies.slice(-4);
      for (let j = 0; j < picket.length; j++) { picket[j].x = maw.x + (j - 1.5) * 24; picket[j].y = maw.y - 40; }
      const before = g.enemies.map((e) => ({ id: e.id, hp: e.hp }));
      g.advance(SIM_DT);
      let hit = 0;
      for (const e of g.enemies) {
        const b = before.find((x) => x.id === e.id);
        if (b && e.hp < b.hp) hit++;
      }
      if (hit >= 2) multiHit = true;
    }
    expect(multiHit).toBe(true);
  });

  it('Gorging Gullet (II): kills FEED the maw — glut stacks accumulate', () => {
    const g = gameWith('maw', 2);
    g.startWave();
    for (let i = 0; i < Math.round(45 / SIM_DT); i++) {
      g.advance(SIM_DT);
      if ((g.towers[0].glut ?? 0) > 0) break;
    }
    expect(g.towers[0].glut ?? 0).toBeGreaterThan(0);
    expect(g.kills).toBeGreaterThan(0);
  });

  it('Acid Reflux (IV): the maw eventually SPITS projectiles at distant prey', () => {
    const g = gameWith('maw', 4);
    g.startWave();
    let sawSpit = false;
    for (let i = 0; i < Math.round(45 / SIM_DT) && !sawSpit; i++) {
      g.advance(SIM_DT);
      if ((g as unknown as { projectiles: unknown[] }).projectiles.length > 0) sawSpit = true;
    }
    expect(sawSpit).toBe(true); // a pure-aura tower with reflux now has shots in the air
  });
});

describe('Amber Chrysalis — the elite warden', () => {
  it('encases its victim in amber: a live enemy carries an ACTIVE freeze and fully stops', () => {
    const g = gameWith('chrysalis', 1);
    g.startWave();
    let frozeOne = false;
    for (let i = 0; i < Math.round(30 / SIM_DT) && !frozeOne; i++) {
      const pos = g.enemies.map((e) => ({ id: e.id, y: e.y }));
      g.advance(SIM_DT);
      for (const e of g.enemies) {
        if (!e.alive || !e.statuses?.some((s) => s.id === 'freeze' && s.stacks > 0)) continue;
        const p = pos.find((x) => x.id === e.id);
        if (p && Math.abs(e.y - p.y) < 0.001) frozeOne = true; // held perfectly still
      }
    }
    expect(frozeOne).toBe(true);
  });

  it('Splinter Shards (III): a casing breaking WOUNDS the enemies around the victim', () => {
    const g = gameWith('chrysalis', 3);
    g.startWave();
    // count enemies whose hp drops on the exact tick a freeze expires nearby
    let sawShatter = false;
    for (let i = 0; i < Math.round(45 / SIM_DT) && !sawShatter; i++) {
      const frozen = g.enemies.filter((e) => e.alive && e.statuses?.some((s) => s.id === 'freeze' && s.stacks > 0));
      const hp0 = new Map(g.enemies.map((e) => [e.id, e.hp] as const));
      g.advance(SIM_DT);
      for (const f of frozen) {
        const nowMarker = f.statuses?.some((s) => s.id === 'freeze' && s.stacks === 0);
        if (!nowMarker) continue; // its casing just broke this tick
        for (const o of g.enemies) {
          if (o.id === f.id || !o.alive) continue;
          const d = Math.hypot(o.x - f.x, o.y - f.y);
          const h0 = hp0.get(o.id);
          if (d < 90 && h0 !== undefined && o.hp < h0) sawShatter = true;
        }
      }
    }
    expect(sawShatter).toBe(true);
  });
});

describe('Wailing Effigy — the dread totem', () => {
  // Place near the Hive so the field covers the crust (slot index high = deep placement).
  function effigyNearHive(strain = 1): Game {
    const g = new Game(7, NO_META, undefined, undefined, undefined, { disableIdle: true });
    // deepest available slot = closest to the core
    const slots = towerSlots.filter((s) => s.index < g.unlockedSlots);
    const deep = slots.reduce((a, b) => (a.y > b.y ? a : b));
    expect(g.placeTower('effigy', deep.x, deep.y)).toBe(true);
    g.towers[0].strain = strain;
    (g as unknown as { recomputeTowerCaches: () => void }).recomputeTowerCaches();
    return g;
  }

  it('panics SIEGING attackers off the crust — and every fled enemy is resolved (no stall)', () => {
    const g = effigyNearHive();
    g.startWave();
    let sawFlee = false;
    let guard = 0;
    // run the WHOLE wave: the strongest no-stall contract is that it terminates — a feared
    // enemy can never be held in limbo (the refractory window guarantees the fight resumes)
    while (g.phase === 'wave' && guard++ < Math.round(180 / SIM_DT)) {
      const sieging = new Set(g.enemies.filter((e) => e.sieging).map((e) => e.id));
      g.advance(SIM_DT);
      for (const e of g.enemies) {
        const feared = e.statuses?.some((s) => s.id === 'fear' && s.stacks > 0);
        if (e.alive && sieging.has(e.id) && !e.sieging && feared) sawFlee = true;
      }
    }
    expect(sawFlee).toBe(true); // the peel verb fired: a sieger broke OFF the crust
    expect(g.phase).not.toBe('wave'); // and the wave still RESOLVED — no frozen AI, no stall
  });

  it('deals ZERO damage at Strain I (pure tempo — the identity)', () => {
    const g = effigyNearHive();
    g.startWave();
    let effigyHit = false;
    for (let i = 0; i < Math.round(15 / SIM_DT); i++) {
      g.advance(SIM_DT);
      // kills belong to the HERO here; the effigy itself must never register a hit
      if (g.enemies.some((e) => e.lastHitKind === 'effigy')) effigyHit = true;
    }
    expect(effigyHit).toBe(false);
    expect(TOWER_DEFS.effigy.damage).toBe(0);
  });

  it('Nightmare Feast (IV): the pulse WOUNDS feared minds — terror finally cuts', () => {
    const g = effigyNearHive(4);
    g.startWave();
    let sawFeedDamage = false;
    for (let i = 0; i < Math.round(45 / SIM_DT) && !sawFeedDamage; i++) {
      const feared = g.enemies.filter((e) => e.alive && e.statuses?.some((s) => s.id === 'fear' && s.stacks > 0));
      const hp0 = new Map(feared.map((e) => [e.id, e.hp] as const));
      g.advance(SIM_DT);
      for (const e of feared) {
        const h0 = hp0.get(e.id);
        if (h0 !== undefined && e.alive && e.hp < h0) sawFeedDamage = true;
      }
    }
    expect(sawFeedDamage).toBe(true);
  });
});
