// Batch G grind levers (track GR1): the Campaign opening safety rules, EARLY CALL, the live
// adaptive threat (docs/DIFFICULTY_DIRECTOR.md §6a) and the Infinite SQUEEZE. Each lever is OFF
// unless a run opts in, so the golden `stage` path and the Arena are untouched — pinned below too.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import type { RunOptions } from './game';
import { CAMPAIGN_OPENING, DIRECTOR_ADAPTIVE, EARLY_CALL, ENDLESS_SQUEEZE, ENEMY_DEFS, SIM_DT, TOWER_ABILITIES, TOWER_DEFS, TOWER_ORDER } from './config';
import { OPENING_ANSWER_TIERS, openingAnswerKinds } from './conveyor';
import { generateStage } from './campaign';
import type { StageConfig } from './campaign';
import { campaignMegaFor, MEGA } from './megaboss';
import { towerSlots } from './map';
import { attachRecorder, replayRun } from './replay';
import type { ReplayCtorArgs } from './replay';
import type { HeroProgress, MetaModifiers, TowerProgress } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const flyingUnits = (wave: { kind: keyof typeof ENEMY_DEFS; count: number }[]): number =>
  wave.reduce((n, g) => n + (ENEMY_DEFS[g.kind].behavior.flying ? g.count : 0), 0);
const step = (g: Game, seconds: number): void => {
  for (let i = 0, n = Math.round(seconds / SIM_DT); i < n && g.phase !== 'won' && g.phase !== 'lost'; i++) g.advance(SIM_DT);
};
const anyG = (g: Game): Record<string, unknown> => g as unknown as Record<string, unknown>;

describe('Campaign opening safety (CAMPAIGN_OPENING)', () => {
  it('generated stages field no fliers in wave 1 and at most the cap in wave 2', () => {
    let sawFliersLater = false;
    for (let st = 1; st <= 160; st++) {
      const cfg = generateStage(st, 'standard');
      expect(flyingUnits(cfg.waves[0]), `stage ${st} wave 1`).toBe(0);
      expect(flyingUnits(cfg.waves[1]), `stage ${st} wave 2`).toBeLessThanOrEqual(CAMPAIGN_OPENING.flyingUnitCap[1]);
      if (cfg.waves.slice(2).some((w) => flyingUnits(w) > 0)) sawFliersLater = true;
    }
    expect(sawFliersLater).toBe(true); // fliers still arrive — just not in the opening
  });

  it('a Mega-hosting stage surfaces its organism with wave megaArrivalWave, not wave 1', () => {
    const st = MEGA.campaignEvery; // the first Mega-hosting stage
    expect(campaignMegaFor(st)).toBeTruthy();
    const g = new Game(5, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(st), earlyCall: true });
    g.god = true;
    g.startWave();
    expect(g.waveIndex).toBe(1);
    expect(anyG(g).mega).toBeNull();
    for (let w = 2; w <= CAMPAIGN_OPENING.megaArrivalWave; w++) {
      step(g, EARLY_CALL.minElapsed + 0.2);
      expect(g.callWaveEarly()).toBe(true);
      expect(g.waveIndex).toBe(w);
      if (w < CAMPAIGN_OPENING.megaArrivalWave) expect(anyG(g).mega).toBeNull();
    }
    expect(anyG(g).mega).not.toBeNull();
  });
});

describe('Opening ANSWER gift (docs/STRAIN.md §opening)', () => {
  const owned = new Set(TOWER_ORDER);
  it('answer classes are derived from tower data (no per-tower list)', () => {
    for (const k of TOWER_ORDER) {
      const def = TOWER_DEFS[k];
      const kit = TOWER_ABILITIES[k];
      const pulls = kit.some((c) => c.type === 'aura' && (c.pull ?? 0) > 0);
      if (pulls) expect(OPENING_ANSWER_TIERS[0].answers(def, kit), k).toBe(true);
      if (def.splash > 0) expect(OPENING_ANSWER_TIERS[1].answers(def, kit), k).toBe(true);
      if (def.firing === 'homing' && def.splash === 0 && !kit.some((c) => 'radius' in c)) {
        for (const t of OPENING_ANSWER_TIERS) expect(t.answers(def, kit), `${k} is single-target`).toBe(false);
      }
    }
  });

  it('a deep stage gift is always a best-class answer; Stages 1–3 keep the plain roll', () => {
    const st = 40;
    const cfg = generateStage(st);
    const answers = openingAnswerKinds(cfg.waves, owned, 'needle')!;
    expect(answers.size).toBeGreaterThan(0);
    for (let seed = 1; seed <= 40; seed++) {
      const g = new Game(seed, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: cfg, favorite: 'needle' });
      g.advance(SIM_DT); // the first tick seeds the gift
      const gift = g.conveyor.find((c) => c.free);
      expect(gift && answers.has(gift.kind), `seed ${seed}: ${gift?.kind}`).toBe(true);
    }
    const early = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const g = new Game(seed, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(2), favorite: 'needle' });
      g.advance(SIM_DT);
      early.add(g.conveyor.find((c) => c.free)!.kind);
    }
    expect([...early].some((k) => !answers.has(k as never))).toBe(true); // onboarding stays a plain roll
  });

  it('falls back to the plain roll when no owned kind answers', () => {
    const cfg = generateStage(40);
    expect(openingAnswerKinds(cfg.waves, new Set(['needle', 'parasite'] as const), 'needle')).toBeNull();
  });
});

describe('EARLY CALL (docs/EARLY-CALL.md)', () => {
  const boot = (opts: RunOptions = {}): Game => {
    const g = new Game(11, NO_META, undefined, undefined, undefined, { earlyCall: true, ...opts });
    g.god = true;
    for (let i = 0; i < 2; i++) { g.selectTower('needle'); g.click(towerSlots[i].x, towerSlots[i].y); }
    return g;
  };

  it('is OFF unless the run opts in (golden / Arena / probes unchanged)', () => {
    const g = new Game(11, NO_META);
    g.startWave();
    step(g, EARLY_CALL.minElapsed + 1);
    expect(g.earlyCallBonus()).toBe(-1);
    expect(g.callWaveEarly()).toBe(false);
    expect(g.getSnapshot().earlyCall).toBe(-1);
  });

  it('opens after minElapsed seconds of a wave, pays the bonus, overlaps the waves', () => {
    const g = boot();
    expect(g.earlyCallBonus()).toBe(-1); // prep — Start Wave's job
    g.startWave();
    step(g, EARLY_CALL.minElapsed - 0.5);
    expect(g.earlyCallBonus()).toBe(-1); // a double-tapped launch can't stack waves
    step(g, 1);
    const bonus = g.earlyCallBonus();
    expect(bonus).toBeGreaterThan(0);
    const queued = (anyG(g).spawnQueue as unknown[]).length;
    const biomass = g.biomass;
    expect(g.callWaveEarly()).toBe(true);
    expect(g.waveIndex).toBe(2);
    expect(g.biomass).toBe(biomass + bonus);
    expect((anyG(g).spawnQueue as unknown[]).length).toBeGreaterThan(queued); // old tail + the new wave, merged
    const times = (anyG(g).spawnQueue as { at: number }[]).map((q) => q.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times); // still time-ordered
  });

  it('caps the stack at maxAhead calls until the field clears, and deals every owed card', () => {
    const g = boot();
    g.startWave();
    for (let i = 0; i < EARLY_CALL.maxAhead; i++) {
      step(g, EARLY_CALL.minElapsed + 0.1);
      expect(g.callWaveEarly()).toBe(true);
    }
    step(g, EARLY_CALL.minElapsed + 0.1);
    expect(g.earlyCallBonus()).toBe(-1);
    expect(g.callWaveEarly()).toBe(false);
    let guard = 0;
    while (g.phase === 'wave' && guard++ < 200) step(g, 1);
    expect(g.phase).toBe('draft');
    // the cleared wave's card + one per called-over wave, back to back
    for (let i = 0; i < EARLY_CALL.maxAhead + 1; i++) {
      expect(g.phase).toBe('draft');
      g.chooseCard(g.getSnapshot().draft![0].id);
    }
    expect(g.phase).toBe('prep');
    expect(g.waveIndex).toBe(1 + EARLY_CALL.maxAhead);
  });

  it('never on the final scripted wave, never in the tutorial', () => {
    const t = boot();
    t.tutorialMode = true;
    t.startWave();
    step(t, EARLY_CALL.minElapsed + 1);
    expect(t.earlyCallBonus()).toBe(-1);
    const stage: StageConfig = { ...generateStage(2), waveCount: 2 };
    stage.waves = stage.waves.slice(0, 2);
    const g = boot({ mode: 'campaign', stage });
    g.startWave();
    step(g, EARLY_CALL.minElapsed + 0.1);
    expect(g.callWaveEarly()).toBe(true); // 1 → 2 (the finale)
    step(g, EARLY_CALL.minElapsed + 0.1);
    expect(g.earlyCallBonus()).toBe(-1); // nothing after the finale
  });

  it('is a recorded input: a session with early calls replays to the identical outcome', () => {
    // JSON-safe ctor tuple (the record round-trips through JSON): empty progress maps fill neutral.
    const args: ReplayCtorArgs = [4242, NO_META, {} as TowerProgress, 'ravager', {} as HeroProgress, { earlyCall: true }];
    const g = new Game(...args);
    const rec = attachRecorder(g, args);
    let placed = 0;
    let calls = 0;
    let guard = 0;
    while (g.waveIndex < 5 && g.phase !== 'won' && g.phase !== 'lost' && guard++ < 40_000) {
      if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); continue; }
      if (g.phase === 'prep') {
        for (let i = 0; i < 2 && placed < towerSlots.length; i++) { g.selectTower('needle'); g.click(towerSlots[placed].x, towerSlots[placed].y); placed++; }
        g.startWave();
      }
      for (let i = 0; i < 30; i++) g.advance(SIM_DT);
      if (g.phase === 'wave' && g.callWaveEarly()) calls++;
    }
    expect(calls).toBeGreaterThan(0);
    const record = rec.finish({ wave: g.waveIndex, kills: g.kills });
    const replayed = replayRun(record, 1_200);
    expect(replayed.wave).toBe(g.waveIndex);
    expect(replayed.kills).toBe(g.kills);
    expect(replayed.integrity).toBe(Math.round(g.integrity));
    expect(replayed.biomass).toBe(Math.round(g.biomass));
  });
});

describe('LIVE adaptive threat (§6a)', () => {
  // A tiny 5-wave stage a 4-needle board clears fast — the multiplier is what's under test.
  const tinyStage = (): StageConfig => {
    const cfg = generateStage(12);
    cfg.waveCount = 5;
    cfg.waves = Array.from({ length: 5 }, () => [{ kind: 'runner' as const, count: 2, spacing: 0.4, delay: 0.3 }]);
    cfg.miniBoss = null;
    return cfg;
  };
  const playTo = (opts: RunOptions): { launched: number[]; bossHp: number } => {
    const g = new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: tinyStage(), ...opts });
    g.god = true;
    for (let i = 0; i < 4; i++) { g.selectTower('needle'); g.click(towerSlots[i].x, towerSlots[i].y); }
    const launched: number[] = [];
    let bossHp = 0;
    let guard = 0;
    while (g.phase !== 'won' && g.phase !== 'lost' && guard++ < 400) {
      if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); continue; }
      if (g.phase === 'prep') {
        g.startWave();
        launched.push(g.getSnapshot().liveThreat);
        const boss = g.enemies.find((e) => e.boss);
        if (boss) bossHp = boss.maxHp;
      }
      step(g, 1);
    }
    return { launched, bossHp };
  };

  it('is exactly ×1 without RunOptions.livePowerBase', () => {
    expect(playTo({}).launched.every((m) => m === 1)).toBe(true);
  });

  it('spares the opening, scales waves ≥ liveFromWave and the boss body, capped', () => {
    const off = playTo({});
    const on = playTo({ livePowerBase: 1e6 }); // a hugely over-powered board ⇒ the cap binds
    for (let w = 1; w <= on.launched.length; w++) {
      expect(on.launched[w - 1]).toBe(w >= DIRECTOR_ADAPTIVE.liveFromWave ? DIRECTOR_ADAPTIVE.liveCap : 1);
    }
    expect(on.bossHp).toBeCloseTo(off.bossHp * DIRECTOR_ADAPTIVE.liveCap, 6);
  });

  it('an under-powered board is never propped up', () => {
    expect(playTo({ livePowerBase: 0.2 }).launched.every((m) => m === 1)).toBe(true);
  });
});

describe('INFINITE SQUEEZE (ENDLESS_SQUEEZE)', () => {
  const boot = (squeeze: boolean): Game => new Game(9, NO_META, undefined, undefined, undefined, { mode: 'endless', squeeze });

  it('the breach ceiling: identity when off; past waveLossCap a hit lands at ×overflowMult', () => {
    const off = boot(false);
    const brace = (g: Game, dmg: number): number => (anyG(g).braceHiveDamage as (d: number) => number).call(g, dmg);
    expect(brace(off, 37)).toBe(37);
    const on = boot(true);
    const g = anyG(on);
    const max = on.maxIntegrity;
    g.waveStartIntegrity = max;
    on.integrity = max; // nothing lost yet this wave
    expect(brace(on, 10)).toBe(10);
    on.integrity = max - ENDLESS_SQUEEZE.waveLossCap * max; // the ceiling is reached
    expect(brace(on, 50)).toBe(Math.round(50 * ENDLESS_SQUEEZE.overflowMult));
  });

  it('the pressure band rises on flawless waves past fromDepth, eases on a bleeding one (floor 1)', () => {
    const on = boot(true);
    const g = anyG(on);
    const update = (): void => (g.updateSqueeze as () => void).call(on);
    g.waveStartIntegrity = on.integrity;
    on.waveIndex = ENDLESS_SQUEEZE.fromDepth - 1;
    update();
    expect(on.squeezePressure).toBe(1); // before the band measures
    on.waveIndex = ENDLESS_SQUEEZE.fromDepth;
    for (let i = 0; i < 60; i++) update();
    expect(on.squeezePressure).toBe(ENDLESS_SQUEEZE.cap);
    on.integrity = (g.waveStartIntegrity as number) - ENDLESS_SQUEEZE.easeAt * on.maxIntegrity;
    update();
    expect(on.squeezePressure).toBeCloseTo(ENDLESS_SQUEEZE.cap * (1 - ENDLESS_SQUEEZE.ease), 12);
    for (let i = 0; i < 60; i++) update();
    expect(on.squeezePressure).toBe(1);
  });

  it('pressure multiplies the scheduled endless HP (and is ignored outside Infinite)', () => {
    const a = boot(true);
    const b = boot(true);
    b.squeezePressure = 1.5;
    a.startWave();
    b.startWave();
    const qa = anyG(a).spawnQueue as { hpMult: number }[];
    const qb = anyG(b).spawnQueue as { hpMult: number }[];
    expect(qb[0].hpMult / qa[0].hpMult).toBeCloseTo(1.5, 12);
    const camp = new Game(9, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(4), squeeze: true });
    expect((anyG(camp).squeezeOn as boolean)).toBe(false);
  });
});
