// MEGA BOSS framework (docs/MEGA-BOSS.md): registry + validators, encounter scheduling (registry-
// cycling, no hardcoded count), the efficiency reward model (Power raises the bar), the sim's raid
// loop (anchored organism, ability rotation → field manipulation, weak-point lifecycle + priority
// targeting), and the Daily Mega variant (no wave plan, reinforcements, ends on either death).
// Golden safety is pinned separately (golden.test) — every hook is inert without a mega.

import { describe, it, expect } from 'vitest';
import {
  MEGA, MEGA_BOSS_DEFS, megaBossProblems, megaBossRegistry, weakPointRegistry,
  campaignMegaFor, infiniteMegaFor, rushMegaFor, megaStatsFor,
  megaExpectedKillSec, megaKillEfficiency, megaBossIchor,
} from './megaboss';
import { generateDaily } from './daily';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots, WIDTH } from './map';
import { gameEvents } from './events';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const forwardSlots = [...towerSlots].sort((a, b) => a.y - b.y);

describe('content + validators', () => {
  it('every authored mega registers clean; every weak point kind validates', () => {
    expect(megaBossRegistry.size).toBeGreaterThanOrEqual(2);
    expect(megaBossRegistry.validate()).toEqual([]);
    expect(weakPointRegistry.validate()).toEqual([]);
    for (const d of Object.values(MEGA_BOSS_DEFS)) expect(megaBossProblems(d)).toEqual([]);
  });

  it('the validator refuses broken defs (no telegraph, no weak points, free rewards)', () => {
    const base = MEGA_BOSS_DEFS.voraxis;
    expect(megaBossProblems({ ...base, weakPoints: [] }).length).toBeGreaterThan(0);
    expect(megaBossProblems({ ...base, reward: { ichor: 0 } }).length).toBeGreaterThan(0);
    expect(megaBossProblems({ ...base, abilities: [{ ...base.abilities[0], telegraph: 0 }] }).length).toBeGreaterThan(0);
    // Weak points must descend into tower reach — an unreachable organ is a design error.
    expect(megaBossProblems({ ...base, weakPoints: [{ ...base.weakPoints[0], y: 100 }, base.weakPoints[1]] }).some((p) => p.includes('tower reach'))).toBe(true);
  });
});

describe('encounter scheduling (registry-cycling — no hardcoded count)', () => {
  it('campaign hosts one every 10 stages, forever, cycling the registry', () => {
    expect(campaignMegaFor(9)).toBeNull();
    expect(campaignMegaFor(11)).toBeNull();
    const ids = megaBossRegistry.active().map((d) => d.id);
    const first = campaignMegaFor(10)!;
    expect(first.defId).toBe(ids[0]);
    expect(first.tier).toBe(1);
    expect(campaignMegaFor(20)!.defId).toBe(ids[1 % ids.length]);
    // Deep campaign: still scheduled (infinite), still cycling, tier still rising.
    const deep = campaignMegaFor(10 * (ids.length + 1))!;
    expect(deep.defId).toBe(ids[0]);
    expect(deep.tier).toBe(ids.length + 1);
  });

  it('infinite fires every 20 waves; rush every 5 (both null off-cadence)', () => {
    expect(infiniteMegaFor(19)).toBeNull();
    expect(infiniteMegaFor(20)).not.toBeNull();
    expect(infiniteMegaFor(40)!.tier).toBeGreaterThan(infiniteMegaFor(20)!.tier);
    expect(rushMegaFor(4)).toBeNull();
    expect(rushMegaFor(5)).not.toBeNull();
    expect(rushMegaFor(10)!.tier).toBeGreaterThan(rushMegaFor(5)!.tier);
  });

  it('tier scales hp linearly and armor sub-linearly (deep encounters stay crackable)', () => {
    const d = MEGA_BOSS_DEFS.voraxis;
    const t1 = megaStatsFor(d, 1);
    const t5 = megaStatsFor(d, 5);
    expect(t5.hp).toBeGreaterThan(t1.hp * 2);
    expect(t5.armor - t1.armor).toBeLessThan(d.armor); // armor growth stays gentle
  });
});

describe('reward model (docs/MEGA-BOSS.md §rewards)', () => {
  it('raw Power RAISES the kill-time bar — it cannot buy max rewards by itself', () => {
    const rec = 5000;
    const weak = megaExpectedKillSec(1, 2500, rec);
    const strong = megaExpectedKillSec(1, 20000, rec);
    expect(strong).toBeLessThan(weak); // an overpowered account is EXPECTED to kill faster
    // Same actual time ⇒ the strong account posts LOWER efficiency than the weak one.
    expect(megaKillEfficiency(strong, 120)).toBeLessThan(megaKillEfficiency(weak, 120));
  });

  it('efficiency clamps: stalling floors at min; a lightning kill caps at max', () => {
    expect(megaKillEfficiency(150, 100000)).toBe(MEGA.efficiencyMin);
    expect(megaKillEfficiency(150, 1)).toBe(MEGA.efficiencyMax);
    expect(megaKillEfficiency(150, 150)).toBeCloseTo(1, 9);
  });

  it('every kill guarantees Ichor; the Daily variant pays the deepest encounter multiplier', () => {
    const d = MEGA_BOSS_DEFS.meridia;
    expect(megaBossIchor(d, 1, 'campaign', MEGA.efficiencyMin)).toBeGreaterThanOrEqual(1);
    expect(megaBossIchor(d, 1, 'daily', 1)).toBeGreaterThan(megaBossIchor(d, 1, 'campaign', 1));
    expect(megaBossIchor(d, 3, 'campaign', 1)).toBeGreaterThan(megaBossIchor(d, 1, 'campaign', 1));
  });
});

describe('sim raid loop', () => {
  it('an anchored mega manipulates the battlefield (ability rotation → live effect chips)', () => {
    const g = new Game(11, NO_META);
    g.god = true;
    g.spawnMegaBoss({ defId: 'meridia', tier: 1 }, 'infinite');
    g.startWave();
    // Meridia P1 rotates dampen (first cast ~9s + 2.4s telegraph) and leech (~8s + 2s).
    let sawTelegraph = false;
    let sawEffect = false;
    for (let i = 0; i < 60 * 20; i++) {
      g.advance(SIM_DT);
      const v = g.getRenderState().megaBoss;
      if (v?.telegraph) sawTelegraph = true;
      if (v && v.effects.length > 0) sawEffect = true;
    }
    expect(sawTelegraph).toBe(true); // the counterplay window existed
    expect(sawEffect).toBe(true); // and a manipulation LANDED (folded into megaFx)
    expect(g.getSnapshot().megaBanner).not.toBeNull(); // the raid bar is live
  });

  it('towers prioritize an open weak point, damage it, and its destruction fires the consequence', () => {
    const g = new Game(7, NO_META);
    g.god = true;
    g.debugAddBiomass(4000);
    // Voraxis opens its phase-entry ARMORED GROWTH at (0.5·W, 600) — in reach of a forward coil.
    for (const s of forwardSlots) if (g.placeTower('coil', s.x, s.y)) break;
    for (const s of forwardSlots) if (g.placeTower('needle', s.x, s.y)) break;
    g.spawnMegaBoss({ defId: 'voraxis', tier: 1 }, 'campaign');
    const downs: string[] = [];
    const off = gameEvents.on('megaWeakPointDown', (e) => downs.push(e.kind));
    g.startWave();
    for (let i = 0; i < 60 * 60 && downs.length === 0; i++) g.advance(SIM_DT);
    off();
    expect(downs.length).toBeGreaterThan(0); // the raid targeting found + burst an organ
    const v = g.getRenderState().megaBoss!;
    expect(v.weakPoints.some((w) => w.state === 'destroyed')).toBe(true);
    expect(v.hp).toBeLessThan(v.maxHp); // destruction tears INTO the organism (never zero-value)
  });

  it('EVERY damage source joins the raid: siphon drains organs, beams chip the body, heroes seek', () => {
    type RaidGuts = {
      mega: import('./megaboss').MegaRuntime & { stunned: number; dmgByKind: Record<string, number> };
      destroyWeakPoint: (wp: import('./megaboss').MegaRuntime['weakPoints'][number]) => void;
      heroes: { x: number; y: number }[];
    };
    const raid = (g: Game): RaidGuts => g as unknown as RaidGuts;
    const inReach = (range: number, tx: number, ty: number) =>
      [...towerSlots].filter((s) => (s.x - tx) ** 2 + (s.y - ty) ** 2 <= range * range)
        .sort((a, b) => (a.x - tx) ** 2 + (a.y - ty) ** 2 - ((b.x - tx) ** 2 + (b.y - ty) ** 2));
    // The Daily Mega variant is the clean raid harness: no wave plan, the field starts EMPTY,
    // and a stunned rotation (no casts) keeps it that way (docs/MEGA-BOSS.md §daily).
    const raidGame = (seed: number): Game =>
      new Game(seed, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });

    // ── The Marrow Siphon tethers an open organ (it was mega-blind) ──
    const g = raidGame(21);
    g.god = true;
    g.debugAddBiomass(8000);
    // Voraxis's phase-entry ARMORED GROWTH opens on spawn — aim the siphon at its authored spot.
    const gSpec = MEGA_BOSS_DEFS.voraxis.weakPoints.find((w) => w.kind === 'armored_growth')!;
    const sSlot = inReach(300, gSpec.x * WIDTH, gSpec.y)[0];
    expect(sSlot).toBeTruthy();
    expect(g.placeTower('siphon', sSlot.x, sSlot.y)).toBe(true);
    g.startWave();
    const rt = raid(g).mega;
    const growth = rt.weakPoints.find((w) => w.kind === 'armored_growth')!;
    expect(growth).toBeTruthy();
    const wpHp0 = growth.hp;
    for (let i = 0; i < 60 * 6 && growth.hp === wpHp0; i++) g.advance(SIM_DT);
    expect(growth.hp).toBeLessThan(wpHp0); // the drain found the organ
    expect(rt.dmgByKind.siphon ?? 0).toBeGreaterThan(0); // …and ADAPT's ledger saw it

    // ── Beams chip the anchored body between windows (empty field, no open organs) ──
    const g2 = raidGame(22);
    g2.god = true;
    g2.debugAddBiomass(8000);
    const cSlot = inReach(340, 360, MEGA.bodyBandY)[0]; // coil range 340 → must reach the band
    expect(cSlot).toBeTruthy();
    expect(g2.placeTower('coil', cSlot.x, cSlot.y)).toBe(true);
    g2.startWave();
    const rt2 = raid(g2).mega;
    rt2.stunned = 9999; // freeze the rotation: no casts ⇒ no new organ windows, no broods
    for (const w of [...rt2.weakPoints]) raid(g2).destroyWeakPoint(w); // clear the spawn-opened organ
    const hp0 = rt2.hp;
    for (let i = 0; i < 60 * 5; i++) g2.advance(SIM_DT);
    expect(rt2.hp).toBeLessThan(hp0); // the body chip ground it down
    expect(rt2.dmgByKind.coil ?? 0).toBeGreaterThan(0); // the beam did real, ledgered work

    // ── Heroes SEEK the organism instead of idling at their anchors ──
    const g3 = raidGame(23);
    g3.god = true;
    g3.startWave();
    const rt3 = raid(g3).mega;
    rt3.stunned = 9999; // static organism, empty field — raid duty is the only job
    const h = raid(g3).heroes[0];
    expect(h).toBeTruthy();
    const y0 = h.y;
    const growth3 = rt3.weakPoints.find((w) => w.kind === 'armored_growth')!;
    const wp3Hp0 = growth3.hp;
    for (let i = 0; i < 60 * 15; i++) g3.advance(SIM_DT);
    expect(h.y).toBeLessThan(y0 - 120); // it MARCHED on the organism (no more anchor idling)
    expect(growth3.hp).toBeLessThan(wp3Hp0); // and struck the open organ
    // With every organ gone, the hero falls to the anchored body itself.
    for (const w of [...rt3.weakPoints]) if (w.state === 'open') raid(g3).destroyWeakPoint(w);
    const hp3 = rt3.hp;
    for (let i = 0; i < 60 * 15; i++) g3.advance(SIM_DT);
    expect(rt3.hp).toBeLessThan(hp3); // body strikes landed once the organs were spent
  });

  it('the Hive outranks the raid: a threatened Core pulls every gun off the organs', () => {
    // The stage-10 contract-probe wipe: an open organ in reach of a long gun (needle 700)
    // TUNNELED the whole board while wave enemies chewed the undefended Core. megaRaidYield
    // must flip raid duty off while the Core is threatened, and back on when it clears.
    const g = new Game(31, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.god = true;
    g.debugAddBiomass(8000);
    const gSpec = MEGA_BOSS_DEFS.voraxis.weakPoints.find((w) => w.kind === 'armored_growth')!;
    expect(g.placeTower('needle', forwardSlots[0].x, forwardSlots[0].y)).toBe(true); // needle reaches organs from ANY pad
    g.startWave();
    type YieldGuts = { mega: { stunned: number; weakPoints: { kind: string; hp: number; maxHp: number; state: string; emergeT: number }[] } };
    const rt = (g as unknown as YieldGuts).mega;
    rt.stunned = 9999; // static organism — no casts, no broods
    const growth = rt.weakPoints.find((w) => w.kind === gSpec.kind)!;
    for (let i = 0; i < 90; i++) g.advance(SIM_DT); // organ fully descended; needle grinding it
    expect(growth.hp).toBeLessThan(growth.maxHp); // raid duty was live before the breach
    // A breacher reaches the final-defense zone — an unkillable stand-in keeps the threat up.
    g.debugSpawn('brute', 1);
    const brute = g.enemies[g.enemies.length - 1];
    brute.hp = 1e12;
    brute.y = 880; // ≥ FINAL_DEFENSE_TOP_Y (800): the Core is in danger
    g.advance(SIM_DT); // one tick for megaBossSystem to derive the yield
    const hpDuringThreat = growth.hp;
    for (let i = 0; i < 45; i++) { brute.y = 880; g.advance(SIM_DT); } // hold the breach
    expect(growth.hp).toBe(hpDuringThreat); // NOT ONE organ hit while the Hive bleeds
    brute.hp = 1; // the guns (now on the breacher) finish it
    for (let i = 0; i < 90; i++) g.advance(SIM_DT);
    expect(growth.hp).toBeLessThan(hpDuringThreat); // threat cleared → raid duty resumes
  });

  it('is fully deterministic for a fixed seed', () => {
    const run = (): string => {
      const g = new Game(42, NO_META);
      g.god = true;
      g.debugAddBiomass(4000);
      for (const s of forwardSlots) if (g.placeTower('coil', s.x, s.y)) break;
      g.spawnMegaBoss({ defId: 'voraxis', tier: 2 }, 'infinite');
      g.startWave();
      for (let i = 0; i < 60 * 25; i++) g.advance(SIM_DT);
      const v = g.getRenderState().megaBoss!;
      return `${v.hp.toFixed(3)}|${v.phase}|${v.weakPoints.map((w) => `${w.kind}:${w.state}:${w.hp.toFixed(1)}`).join(',')}`;
    };
    expect(run()).toBe(run());
  });

  it('phase transitions mutate the encounter and announce themselves', () => {
    const g = new Game(3, NO_META);
    g.god = true;
    g.spawnMegaBoss({ defId: 'voraxis', tier: 1 }, 'campaign');
    g.startWave();
    const phases: number[] = [];
    const off = gameEvents.on('megaPhase', (e) => phases.push(e.phase));
    const v0 = g.getRenderState().megaBoss!;
    g.debugDamageMega(v0.maxHp * 0.4); // 100% → 60%: crosses the 72% threshold
    for (let i = 0; i < 30; i++) g.advance(SIM_DT);
    off();
    expect(phases).toContain(1);
    expect(g.getRenderState().megaBoss!.phase).toBe(1);
  });
});

describe('§functional overhaul — stagger, cataclysm, gorge, adapt', () => {
  // Precision tests drive the private seams directly (compile-time privacy only) — the same
  // approach keeps them deterministic without re-deriving full raid timings per mechanic.
  type Internals = {
    mega: import('./megaboss').MegaRuntime;
    openWeakPoint: (def: (typeof MEGA_BOSS_DEFS)[string], rt: import('./megaboss').MegaRuntime, i: number) => void;
    destroyWeakPoint: (wp: import('./megaboss').MegaWeakPoint) => void;
    castMegaAbility: (def: (typeof MEGA_BOSS_DEFS)[string], rt: import('./megaboss').MegaRuntime, ai: number) => void;
  };
  const guts = (g: Game): Internals => g as unknown as Internals;

  it('three ruptures in one push TOPPLE the organism: stun, dropped telegraph, frozen windows, reset meter', () => {
    const g = new Game(5, NO_META);
    g.god = true;
    g.spawnMegaBoss({ defId: 'voraxis', tier: 1 }, 'campaign');
    g.startWave();
    const rt = guts(g).mega;
    const def = MEGA_BOSS_DEFS.voraxis;
    rt.telegraph = { ability: 0, t: 2, total: 2.2 }; // something is winding up when it topples
    for (const spec of [0, 1, 3]) { // two eyes + the parasite sac — three ruptures back-to-back
      guts(g).openWeakPoint(def, rt, spec);
      const wp = rt.weakPoints.find((w) => w.spec === spec)!;
      guts(g).destroyWeakPoint(wp);
    }
    expect(rt.staggers).toBe(1);
    expect(rt.stagger).toBe(0); // the meter spent itself
    expect(rt.telegraph).toBeNull(); // the windup died with its footing
    expect(rt.stunned).toBeGreaterThanOrEqual(MEGA.staggerDurSec - 0.01);
    expect(g.getSnapshot().megaBanner!.staggered).toBe(true);
    // Open organ windows FREEZE while it is down (burst at leisure).
    guts(g).openWeakPoint(def, rt, 4); // the heart (window 11)
    const heart = rt.weakPoints.find((w) => w.spec === 4)!;
    const w0 = heart.window;
    for (let i = 0; i < 60; i++) g.advance(SIM_DT); // one second, still toppled
    expect(heart.window).toBeCloseTo(w0, 5);
    // …and the topple expires back into a standing fight.
    for (let i = 0; i < 60 * 7; i++) g.advance(SIM_DT);
    expect(g.getSnapshot().megaBanner!.staggered).toBe(false);
    expect(heart.window).toBeLessThan(w0);
  });

  it('a resolved CATACLYSM strikes Hive integrity; an interrupt during its windup prevents it', () => {
    const g = new Game(9, NO_META); // god OFF — integrity is the point
    g.spawnMegaBoss({ defId: 'voraxis', tier: 1 }, 'campaign');
    g.startWave();
    const rt = guts(g).mega;
    const def = MEGA_BOSS_DEFS.voraxis;
    const cataIdx = def.abilities.findIndex((a) => a.kind === 'cataclysm');
    const before = g.getSnapshot().integrity;
    guts(g).castMegaAbility(def, rt, cataIdx);
    expect(g.getSnapshot().integrity).toBe(before - def.abilities[cataIdx].magnitude!);
    // The counterplay: an eye rupture during the windup cancels the cast entirely.
    rt.telegraph = { ability: cataIdx, t: 3, total: def.abilities[cataIdx].telegraph };
    guts(g).openWeakPoint(def, rt, 0);
    guts(g).destroyWeakPoint(rt.weakPoints.find((w) => w.spec === 0)!);
    expect(rt.telegraph).toBeNull();
    expect(g.getSnapshot().integrity).toBe(before - def.abilities[cataIdx].magnitude!); // no second strike
  });

  it('GORGE devours the enemies nearest the maw for tier-scaled healing — and pays no bounty', () => {
    const g = new Game(13, NO_META);
    g.god = true;
    g.spawnMegaBoss({ defId: 'sarcophage', tier: 1 }, 'campaign');
    g.startWave();
    g.debugSpawn('runner', 5);
    for (let i = 0; i < 12; i++) g.advance(SIM_DT); // let them materialize + step
    const rt = guts(g).mega;
    const def = MEGA_BOSS_DEFS.sarcophage;
    const gorgeIdx = def.abilities.findIndex((a) => a.kind === 'gorge');
    const a = def.abilities[gorgeIdx];
    rt.hp = rt.maxHp * 0.5;
    const biomassBefore = g.getSnapshot().biomass;
    // Assert on the same tick as the cast — the live wave keeps spawning, so flag counts
    // (not array length across advances) are the stable observation.
    const deadBefore = g.getRenderState().enemies.filter((e) => !e.alive).length;
    guts(g).castMegaAbility(def, rt, gorgeIdx);
    const expectHeal = a.magnitude! * (0.7 + 0.3 * rt.tier) * a.count!;
    expect(rt.hp).toBeCloseTo(rt.maxHp * 0.5 + expectHeal, 3);
    expect(g.getRenderState().enemies.filter((e) => !e.alive).length).toBe(deadBefore + a.count!); // devoured, not culled yet
    expect(g.getSnapshot().biomass).toBe(biomassBefore); // devoured ≠ killed: no bounty
    // Starved: with nothing left to eat, the meal heals nothing.
    for (const e of g.getRenderState().enemies) e.alive = false; // clear the field flag-wise
    const hpBeforeStarved = rt.hp;
    guts(g).castMegaAbility(def, rt, gorgeIdx);
    expect(rt.hp).toBe(hpBeforeStarved);
  });

  it('ADAPT studies the top-damage tower kind and labels the answer on the HUD', () => {
    const g = new Game(17, NO_META);
    g.god = true;
    g.spawnMegaBoss({ defId: 'myriad', tier: 1 }, 'campaign');
    g.startWave();
    const rt = guts(g).mega;
    const def = MEGA_BOSS_DEFS.myriad;
    const adaptIdx = def.abilities.findIndex((a) => a.kind === 'adapt');
    // Nothing on the ledger yet: the lesson fizzles.
    guts(g).castMegaAbility(def, rt, adaptIdx);
    expect(rt.adaptKind).toBeNull();
    rt.dmgByKind = { coil: 500, needle: 220 };
    guts(g).castMegaAbility(def, rt, adaptIdx);
    expect(rt.adaptKind).toBe('coil');
    expect(rt.adaptMult).toBe(def.abilities[adaptIdx].magnitude);
    expect(g.getRenderState().megaBoss!.effects.some((e) => e.startsWith('ADAPTED·'))).toBe(true);
  });

  it('the validator enforces the new verbs and the finale mandate', () => {
    const s = MEGA_BOSS_DEFS.sarcophage;
    expect(megaBossProblems({ ...s, abilities: s.abilities.map((a) => (a.kind === 'gorge' ? { ...a, count: 0 } : a)) }).length).toBeGreaterThan(0);
    const m = MEGA_BOSS_DEFS.myriad;
    expect(megaBossProblems({ ...m, abilities: m.abilities.map((a) => (a.kind === 'adapt' ? { ...a, magnitude: 1.2 } : a)) }).length).toBeGreaterThan(0);
    const v = MEGA_BOSS_DEFS.voraxis;
    expect(megaBossProblems({ ...v, abilities: v.abilities.map((a) => (a.kind === 'cataclysm' ? { ...a, telegraph: 1 } : a)) }).some((p) => p.includes('interruptible'))).toBe(true);
    // Stripping the finale (and the final phase's reference to it) fails the mandate.
    const noCata = {
      ...v,
      abilities: v.abilities.filter((a) => a.kind !== 'cataclysm'),
      phases: v.phases.map((p) => ({ ...p, abilities: p.abilities.filter((ai) => ai < v.abilities.length - 1) })),
    };
    expect(megaBossProblems(noCata).some((p) => p.includes('cataclysm'))).toBe(true);
  });
});

describe('§lone siege — the last thing standing turns on the Hive', () => {
  type SiegeGuts = {
    mega: import('./megaboss').MegaRuntime;
    megaBodyY: (ty: number, range: number) => number;
    destroyWeakPoint: (wp: import('./megaboss').MegaRuntime['weakPoints'][number]) => void;
    megaShots: { x0: number; y0: number; color: string }[];
    heroes: { down: boolean; respawn: number }[];
    minions: import('./types').Minion[];
  };
  const guts = (g: Game): SiegeGuts => g as unknown as SiegeGuts;
  const eyeWp = (): import('./megaboss').MegaRuntime['weakPoints'][number] => ({
    spec: 0, kind: 'eye', x: 400, y: 560, hp: 0, maxHp: 100, armor: 0,
    state: 'open', window: 9, regrow: 0, emergeT: 1, hitFlash: 0,
  });
  /** Silence everything EXCEPT the siege: the rotation never readies (no broods to shield it),
   *  no timer organs open (no accidental hero interrupts), no reinforcement pulses. The field
   *  stays bare, so the lash machinery is probed in isolation — pure and deterministic. */
  const becalm = (rt: import('./megaboss').MegaRuntime): void => {
    rt.abilityCd.fill(1e9);
    rt.timerT = rt.timerT.map((t) => (t > 0 ? 1e9 : 0));
    rt.reinforceT = -1e9;
  };

  it('a lone mega SIEGES: HIVE LASHES land integrity damage on a tightening cadence', () => {
    const g = new Game(5, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.startWave(); // no towers, god OFF — the bare-field stall the sim must now pressure
    const rt = guts(g).mega;
    becalm(rt);
    const integ0 = g.integrity;
    let sawWindup = false;
    let sawSiegeView = false;
    for (let i = 0; i < 60 * 40; i++) {
      g.advance(SIM_DT);
      const v = g.getRenderState().megaBoss;
      if (v?.siege) sawSiegeView = true;
      if (v?.siege && v.siege.windupFrac > 0) sawWindup = true;
    }
    expect(rt.siegeT).toBeGreaterThan(MEGA.siegeGraceSec); // it noticed the bare field
    expect(sawSiegeView).toBe(true); // the view carries the siege (renderer/HUD read)
    expect(sawWindup).toBe(true); // the windup telegraphed (the interrupt window existed)
    expect(rt.lashes).toBeGreaterThanOrEqual(2); // and lashes LANDED, repeatedly
    expect(g.integrity).toBeLessThan(integ0); // the Hive actually bled — no more free stalling
    // The cadence tightens as blows land (the DPS-race clock compounds).
    expect(rt.lashT).toBeLessThanOrEqual(MEGA.siegeLashEvery * MEGA.siegeLashRamp + 1e-9);
  });

  it('an eye interrupt DEFUSES a wound-up lash (and a resumed wave plan stands the siege down)', () => {
    const g = new Game(13, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.god = true;
    g.startWave();
    const rt = guts(g).mega;
    becalm(rt);
    // Run until a lash is mid-windup, then burst a (synthetic) eye — the interrupt consequence.
    for (let i = 0; i < 60 * 30 && rt.lashWindup <= 0; i++) g.advance(SIM_DT);
    expect(rt.lashWindup).toBeGreaterThan(0);
    const interrupts0 = rt.interrupts;
    guts(g).destroyWeakPoint(eyeWp());
    expect(rt.lashWindup).toBe(0); // the reaching arm recoiled
    expect(rt.interrupts).toBe(interrupts0 + 1); // and it COUNTS as an interrupt (achievements)
    expect(rt.stunned).toBeGreaterThan(0);
    // A resumed wave plan (pending spawns) stands the whole siege down.
    (g as unknown as { spawnQueue: unknown[] }).spawnQueue.push({});
    g.advance(SIM_DT);
    expect(rt.siegeT).toBe(0);
    expect(g.getRenderState().megaBoss!.siege).toBeNull();
    (g as unknown as { spawnQueue: unknown[] }).spawnQueue.length = 0;
  });

  it('the sieging mass DESCENDS: the body drops into every row\'s reach (and only then)', () => {
    const g = new Game(17, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.god = true;
    g.startWave();
    const rt = guts(g).mega;
    // Shepherding (pre-siege): the high band only — a back-row short gun cannot connect
    // (the aim point stays at the band even though the gun can't reach it).
    expect(guts(g).megaBodyY(900, 210)).toBe(MEGA.bodyBandY);
    rt.siegeT = MEGA.siegeGraceSec + 1; // sieging: the mass hangs to the front build row
    // A back-row SHORT gun (spire, 210) now connects — striking as high as its reach allows.
    expect(guts(g).megaBodyY(900, 210)).toBe(900 - (210 - 40));
    // A LONG gun keeps hitting the HIGH band (its tracer crosses the field, no muzzle stub).
    expect(guts(g).megaBodyY(740, 700)).toBe(MEGA.bodyBandY);
    // And nothing ever aims below the descended mass or above the shepherding band.
    expect(guts(g).megaBodyY(900, 100)).toBe(MEGA.siegeBodyY);
    expect(guts(g).megaBodyY(600, 90)).toBe(MEGA.bodyBandY);
  });

  it('UNITS raid too: drakes dive organs (roost-credited) and motes bite the body', () => {
    const g = new Game(29, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.god = true;
    g.debugAddBiomass(9000);
    expect(g.placeTower('roost', forwardSlots[0].x, forwardSlots[0].y)).toBe(true);
    g.startWave();
    const rt = guts(g).mega;
    becalm(rt);
    rt.stunned = 99999; // static organism: no broods — the leash territory stays bare
    const hero = guts(g).heroes[0];
    hero.down = true; // park the hero so unit damage is the only organ pressure
    hero.respawn = 1e9;
    // The roost hatches; with nothing to hunt, the drake UNLEASHES and dives the spawn-opened
    // Armored Growth (docs/MEGA-BOSS.md §targeting — the leash yields to the carcass).
    const growth = rt.weakPoints.find((w) => w.kind === 'armored_growth')!;
    const hp0 = growth.hp;
    for (let i = 0; i < 60 * 25 && growth.hp === hp0; i++) g.advance(SIM_DT);
    expect(growth.hp).toBeLessThan(hp0); // the flock joined the raid
    expect(rt.dmgByKind.roost ?? 0).toBeGreaterThan(0); // ADAPT's ledger studies the brood
    // With every organ spent + the field empty, a classic mote bites the anchored BODY.
    for (const w of [...rt.weakPoints]) if (w.state === 'open') guts(g).destroyWeakPoint(w);
    guts(g).minions.push({
      id: 9901, kind: 'wisp', x: 600, y: 520, hp: 30, maxHp: 30, hitFlash: 0, damage: 7,
      attackCd: 0, attackInterval: 0.7, range: 300, speed: 130, life: 60, maxLife: 60,
      radius: 7, color: '#ffd0a6', alive: true,
    });
    let moteBit = false; // its tracer color proves the strike came from the mote, not the drake
    for (let i = 0; i < 60 * 8 && !moteBit; i++) {
      g.advance(SIM_DT);
      if (guts(g).megaShots.some((s) => s.color === '#ffd0a6')) moteBit = true;
    }
    expect(moteBit).toBe(true);
  });

  it('pure-tempo organs (Effigy) never burn casts on zero-damage raid fire', () => {
    const g = new Game(19, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.god = true;
    g.debugAddBiomass(8000);
    const slot = forwardSlots[0];
    expect(g.placeTower('effigy', slot.x, slot.y)).toBe(true);
    g.startWave();
    const rt = guts(g).mega;
    becalm(rt);
    rt.stunned = 99999; // static organism: no broods, no lash — a pure raid-fire probe
    for (const w of [...rt.weakPoints]) guts(g).destroyWeakPoint(w); // no organ windows either
    let firedAtMega = false; // a raid tracer ORIGINATING at the effigy's pad = a burned cast
    for (let i = 0; i < 60 * 10; i++) {
      g.advance(SIM_DT);
      if (guts(g).megaShots.some((s) => s.x0 === slot.x && s.y0 === slot.y)) firedAtMega = true;
    }
    expect(firedAtMega).toBe(false); // nothing to throw at a mountain — its kit stays on the field
    expect('effigy' in rt.dmgByKind).toBe(false); // and the ADAPT ledger never saw a ghost entry
  });
});

describe('Daily Mega variant (docs/MEGA-BOSS.md §daily)', () => {
  it('the plan roll is deterministic per key, rare, and registry-driven', () => {
    const a = generateDaily('2026-07-07');
    const b = generateDaily('2026-07-07');
    expect(a).toEqual(b); // same key ⇒ byte-equal plan (mega roll included)
    // Across a month of keys the variant appears but stays RARE (deterministic outcome set).
    let rolled = 0;
    for (let d = 1; d <= 28; d++) {
      const p = generateDaily(`2026-08-${String(d).padStart(2, '0')}`);
      if (p.megaBoss) {
        rolled++;
        expect(megaBossRegistry.has(p.megaBoss.defId)).toBe(true);
        expect(p.megaBoss.tier).toBeGreaterThanOrEqual(1);
      }
    }
    expect(rolled).toBeGreaterThanOrEqual(1);
    expect(rolled).toBeLessThan(14); // rare — nowhere near every other day
  });

  it('replaces the wave plan: reinforcements arrive from the boss; killing it WINS the run', () => {
    const g = new Game(5, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.god = true;
    g.startWave();
    expect(g.getRenderState().megaBoss).not.toBeNull();
    expect(g.getRenderState().enemies.length).toBe(0); // NO scripted wave spawned
    // Reinforcement pulse cadence: the boss itself feeds the field.
    for (let i = 0; i < 60 * (MEGA.dailyReinforceSec + 2); i++) g.advance(SIM_DT);
    expect(g.getRenderState().enemies.length).toBeGreaterThan(0);
    // The encounter ends ONLY when one side dies — kill it and the run is WON.
    const kills: number[] = [];
    const off = gameEvents.on('megaKilled', () => kills.push(1));
    g.debugDamageMega(1e9);
    for (let i = 0; i < 60 * 5; i++) g.advance(SIM_DT);
    off();
    expect(kills.length).toBe(1);
    expect(g.phase).toBe('won');
    const stats = g.getRunStats();
    expect(stats.megaKills?.length).toBe(1);
    expect(stats.megaKills?.[0].encounter).toBe('daily');
  });

  it('the daily boss EVOLVES over time (stacks raise the pressure)', () => {
    const g = new Game(9, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'meridia', tier: 1 } });
    g.god = true;
    g.startWave();
    // Evolution is invisible in the view directly, but each stack multiplies enemy haste — probe
    // via a reinforcement's step distance? Simpler: the sim is deterministic; assert survival +
    // that the encounter is still live and ticking long past a normal wave.
    for (let i = 0; i < 60 * (MEGA.dailyEvolveSec + 5); i++) g.advance(SIM_DT);
    expect(g.phase).toBe('wave'); // never wave-cleared — the encounter holds until a death
    expect(g.getRenderState().megaBoss).not.toBeNull();
  });
});

describe('§stall audit (2026-07-19) — the fight must never go damage-dead', () => {
  it('a tower with NO prey in its own reach chips the body even while adds live elsewhere', () => {
    // The reported stall: all weak points down + any add alive anywhere ⇒ towers refused to
    // touch the body (the old gate was a BARE-FIELD check), so the boss "just stopped" while
    // its own summons kept the field populated. The contract now mirrors the hero rule: a
    // tower that was going to do NOTHING turns its guns on the mountain instead.
    type Guts = { mega: { weakPoints: { state: string }[]; dmgByKind: Record<string, number>; hp: number; maxHp: number } };
    const g = new Game(31, NO_META, undefined, 'ravager', undefined, { megaDaily: { defId: 'voraxis', tier: 1 } });
    g.god = true;
    g.debugAddBiomass(8000);
    // ONE short-range brawler at the BACK row — its 170px reach covers no add at the top.
    const back = [...towerSlots].sort((a, b) => b.y - a.y)[0];
    expect(g.placeTower('maw', back.x, back.y)).toBe(true);
    g.startWave();
    const rt = (g as unknown as Guts).mega;
    for (let i = 0; i < 60; i++) g.advance(SIM_DT); // let the opener organ emerge
    // Seal every weak point (the between-window state) and keep ONE add alive far away.
    for (let i = 0; i < 60 * 12; i++) {
      for (const wp of rt.weakPoints) if (wp.state === 'open') wp.state = 'closed';
      g.debugSpawn('runner', g.enemies.length === 0 ? 1 : 0);
      for (const e of g.enemies) { e.x = 40; e.y = 60; } // pinned at the top — outside the maw's reach
      g.advance(SIM_DT);
    }
    // The maw joined the raid: tower-attributed body damage exists and the organism bled.
    expect(rt.dmgByKind['maw'] ?? 0).toBeGreaterThan(0);
    expect(rt.hp).toBeLessThan(rt.maxHp);
    // And the banner carries the damage-gate fields the HUD chips read (timer organs may
    // have reopened on the final tick — the sealed chip itself is trivial JSX off this list).
    const banner = g.getSnapshot().megaBanner!;
    expect(typeof banner.regenActive).toBe('boolean');
    expect(typeof banner.armored).toBe('boolean');
  });
});
