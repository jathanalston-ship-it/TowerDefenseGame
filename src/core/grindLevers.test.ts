// Batch G grind levers (track GR1): the Campaign opening safety rules, EARLY CALL, the live
// adaptive threat (docs/DIFFICULTY_DIRECTOR.md §6a) and the Infinite SQUEEZE. Each lever is OFF
// unless a run opts in, so the golden `stage` path and the Arena are untouched — pinned below too.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import type { RunOptions } from './game';
import { CAMPAIGN_OPENING, DIRECTOR_ADAPTIVE, EARLY_CALL, ENDLESS_SQUEEZE, ENEMY_DEFS, SIM_DT, TOWER_ABILITIES, TOWER_DEFS, TOWER_ORDER } from './config';
import { OPENING_ANSWER_TIERS, OPENING_THREAT_RULES, damagesArea, dragsAndDamages, openingAnswerKinds } from './conveyor';
import { LIVE_PROBE_ROLES, generateStage, liveProbe, promoteEliteShare, swapInProbe } from './campaign';
import { COVERAGE_AXIS_NAME, ROSTER_COVERAGE, TOWER_COVERAGE, boardCoverage, coverageGap, towerCoverage } from './coverage';
import type { StageConfig } from './campaign';
import type { WaveDef } from './config';
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
  it('answers are derived from tower data (no per-tower list): damage over an area, never pure control', () => {
    const answers = (def: (typeof TOWER_DEFS)[keyof typeof TOWER_DEFS], kit: (typeof TOWER_ABILITIES)[keyof typeof TOWER_ABILITIES]): boolean =>
      OPENING_ANSWER_TIERS.some((t) => t.answers(def, kit));
    for (const k of TOWER_ORDER) {
      const def = TOWER_DEFS[k];
      const kit = TOWER_ABILITIES[k];
      if (def.splash > 0) expect(damagesArea(def, kit), k).toBe(true);
      if (kit.some((c) => c.type === 'aura' && (c.pull ?? 0) > 0 && (c.damage ?? 0) > 0)) expect(dragsAndDamages(kit), k).toBe(true);
      if (def.damage <= 0) expect(answers(def, kit), `${k} deals no damage`).toBe(false); // stalling isn't answering
      if (def.firing === 'homing' && def.splash === 0 && !kit.some((c) => 'radius' in c)) expect(answers(def, kit), `${k} is single-target`).toBe(false);
      if (def.firing === 'summon') expect(OPENING_THREAT_RULES.air(def), `${k} can't block fliers`).toBe(false);
    }
  });

  it('a deep stage gift is always an answer; Stages 1–3 keep the plain roll', () => {
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
    // Play it out, taking every draft as it comes: one per called-over wave + the cleared wave's own.
    let picks = 0;
    let guard = 0;
    while (g.phase !== 'prep' && guard++ < 400) {
      if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); picks++; continue; }
      step(g, 0.25);
    }
    expect(picks).toBe(EARLY_CALL.maxAhead + 1);
    expect(g.waveIndex).toBe(1 + EARLY_CALL.maxAhead);
  });

  it('§owed: a called-over wave\'s draft is dealt the moment ITS last unit falls — mid-fight — and the pick resumes the fight', () => {
    const g = boot();
    g.startWave();
    step(g, EARLY_CALL.minElapsed + 0.1);
    expect(g.callWaveEarly()).toBe(true); // wave 1 called over → wave 2 overlaps it
    expect(g.getSnapshot().draftsOwed).toBe(1);
    const enemies = (): { owedWave?: number; alive: boolean }[] => anyG(g).enemies as { owedWave?: number; alive: boolean }[];
    let guard = 0;
    while (g.phase === 'wave' && guard++ < 4000) step(g, SIM_DT);
    // The draft opened for WAVE 1 while wave 2 still had units on the field (or due) — not at the clear.
    expect(g.phase).toBe('draft');
    expect(g.getSnapshot().owedDraftWave).toBe(1);
    const wave2Left = enemies().filter((e) => e.alive).length + (anyG(g).spawnQueue as unknown[]).length;
    expect(wave2Left).toBeGreaterThan(0);
    expect(enemies().some((e) => e.owedWave === 1)).toBe(false); // wave 1 is spent
    expect(g.getSnapshot().draftsOwed).toBe(0);
    g.chooseCard(g.getSnapshot().draft![0].id);
    expect(g.phase).toBe('wave'); // back to the fight it paused — not to build
    expect(g.getSnapshot().owedDraftWave).toBeUndefined();
    // …and wave 2's own draft arrives at its clear, alone (no back-to-back backlog).
    guard = 0;
    while (g.phase === 'wave' && guard++ < 8000) step(g, SIM_DT);
    expect(g.phase).toBe('draft');
    expect(g.getSnapshot().owedDraftWave).toBeUndefined();
    g.chooseCard(g.getSnapshot().draft![0].id);
    expect(g.phase).toBe('prep');
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

  type LiveDd = {
    liveThreatParts: (m: number, staticSpeed?: number) => { hp: number; pace: number; speed: number };
    liveRatio: (base: number, temp: number, towers: number) => number;
  };
  const ddOf = (g: Game): LiveDd => anyG(g).dd as LiveDd;

  it('spares the opening, scales waves ≥ liveFromWave and the boss body, capped — the chip shows the APPLIED multiplier', () => {
    const off = playTo({});
    const on = playTo({ livePowerBase: 1e6 }); // a hugely over-powered board ⇒ the caps bind
    const g = new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: tinyStage(), livePowerBase: 1e6 });
    const p = ddOf(g).liveThreatParts(DIRECTOR_ADAPTIVE.liveCap, anyG(g).stageSpeedMult as number);
    for (let w = 1; w <= on.launched.length; w++) {
      if (w < DIRECTOR_ADAPTIVE.liveFromWave) expect(on.launched[w - 1]).toBe(1);
      else expect(on.launched[w - 1]).toBeCloseTo(p.hp * p.pace * p.speed, 9);
    }
    // a boss body takes the WHOLE live multiplier up to its own cap — it can't be paced or pulled
    expect(on.bossHp / off.bossHp).toBeCloseTo(DIRECTOR_ADAPTIVE.liveBossCap, 6);
  });

  it('the live multiplier splits HP × pace × speed; ×1 is exactly {1, 1, 1}; speed never breaks the readability ceiling', () => {
    const dd = ddOf(new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(12), livePowerBase: 1e6 }));
    expect(dd.liveThreatParts(1)).toEqual({ hp: 1, pace: 1, speed: 1 });
    expect(dd.liveThreatParts(1, 1.6)).toEqual({ hp: 1, pace: 1, speed: 1 });
    for (const staticSpeed of [1, 1.3, 1.6, 1.9]) {
      const p = dd.liveThreatParts(64, staticSpeed);
      expect(p.speed).toBeGreaterThanOrEqual(1);
      expect(staticSpeed * p.speed).toBeLessThanOrEqual(Math.max(staticSpeed, DIRECTOR_ADAPTIVE.liveSpeedCeiling) + 1e-9);
      expect(p.hp).toBeGreaterThanOrEqual(1);
      expect(p.pace).toBeGreaterThanOrEqual(1);
    }
  });

  it('the board term counts towers fielded vs the opening build (upward only)', () => {
    const dd = ddOf(new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(12), livePowerBase: 1 }));
    const open = DIRECTOR_ADAPTIVE.liveBoardOpening;
    expect(dd.liveRatio(1, 1, 0)).toBe(1); // an empty board is never a discount
    expect(dd.liveRatio(1, 1, open)).toBe(1);
    expect(dd.liveRatio(2, 3, open * 4)).toBeCloseTo(2 * 3 * Math.pow(4, DIRECTOR_ADAPTIVE.liveBoardExp), 12);
  });

  it('starts at liveFromStage — the onboarding Stages 1–3 keep their calibrated curve', () => {
    for (let st = 1; st <= 6; st++) {
      const g = new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(st), livePowerBase: 1e6 });
      expect(anyG(g).livePowerBase === null, `stage ${st}`).toBe(st < DIRECTOR_ADAPTIVE.liveFromStage);
    }
  });

  it('the live speed rides the queued spawn (absent on every non-adaptive run — golden-safe)', () => {
    const plain = new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: tinyStage() });
    plain.startWave();
    expect((anyG(plain).spawnQueue as { speedMult?: number }[]).every((q) => q.speedMult === undefined)).toBe(true);
  });

  it('an under-powered board is never propped up', () => {
    expect(playTo({ livePowerBase: 0.2 }).launched.every((m) => m === 1)).toBe(true);
  });
});

describe('LIVE threat v3 — cards out of the ratio, threat by composition (§6a v3)', () => {
  it('promoteEliteShare: largest groups first, fewer-but-stronger, exploders never, a copy; share 0 ⇒ the same array', () => {
    const exploder = (Object.keys(ENEMY_DEFS) as (keyof typeof ENEMY_DEFS)[]).find((k) => ENEMY_DEFS[k].explodeDamage)!;
    const wave: WaveDef = [
      { kind: 'runner' as const, count: 4, spacing: 0.5, delay: 0.3 },
      { kind: exploder, count: 9, spacing: 0.5, delay: 1 },
      { kind: 'brute' as const, count: 7, spacing: 0.9, delay: 2 },
      { kind: 'runner' as const, count: 7, spacing: 0.5, delay: 3 },
    ];
    expect(promoteEliteShare(wave, 0)).toBe(wave);
    const out = promoteEliteShare(wave, 0.5); // 3 eligible ⇒ round(1.5) = 2 promoted: the two 7s (spawn order breaks the tie)
    expect(out).not.toBe(wave);
    expect(out.map((g) => [g.count, g.elite === true])).toEqual([[4, false], [9, false], [4, true], [4, true]]);
    expect(wave[2].elite).toBeUndefined(); // the stage plan is never mutated
    expect(promoteEliteShare(wave, 0.5)).toEqual(out); // deterministic
  });

  it('liveProbe grades roles by the board coverage GAP (data on both sides), ties in table order', () => {
    const board = (...ks: (typeof TOWER_ORDER)[number][]) => ks.map((kind) => ({ kind, strain: 1 }));
    // a needle board reaches the whole lane but covers no area ⇒ the airborne pack, not the artillery
    expect(liveProbe(['runner', 'wisp', 'spitter'], board('needle'))?.role).toBe('air-pack');
    // a mortar board splashes and outranges but cannot cut plating ⇒ the armored body
    const armored = liveProbe(['runner', 'wisp', 'spitter', 'scuttler'], board('mortar'));
    expect(armored?.role).toBe('armored');
    expect(ENEMY_DEFS[armored!.kind].armor).toBeGreaterThanOrEqual(12);
    // the pick is ALWAYS the largest gap among the roles the pool fields
    const pool = ['runner', 'wisp', 'spitter', 'scuttler', 'rusher', 'mender', 'molerat'] as const;
    for (const b of [board('needle', 'mortar'), board('lancet', 'obelisk', 'spire'), board('maw', 'polyp', 'roost'), board('quill', 'coil')]) {
      const p = liveProbe([...pool], b)!;
      for (const r of LIVE_PROBE_ROLES) expect(p.gap).toBeGreaterThanOrEqual(coverageGap(b, r.axis));
      expect(p.gap).toBe(coverageGap(b, p.axis));
    }
    expect(liveProbe(['runner', 'mite'], board('needle'))).toBeNull(); // no probe role in the pool ⇒ no swap
    // a TIE band: gaps within it of the largest count as tied, and the table (harm) order breaks it
    const needle = board('needle');
    const air = coverageGap(needle, 'area');
    const art = coverageGap(needle, 'burst');
    expect(air).toBeGreaterThan(art);
    expect(liveProbe(['runner', 'wisp', 'spitter'], needle, air - art + 1e-9)?.role).toBe('artillery');
  });

  it('coverage is DERIVED from tower data (no per-tower list): area, reach, pierce, burst, control', () => {
    for (const k of TOWER_ORDER) {
      const c = TOWER_COVERAGE[k];
      for (const v of Object.values(c)) expect(v >= 0 && v <= 1).toBe(true);
      if (damagesArea(TOWER_DEFS[k], TOWER_ABILITIES[k])) expect(c.area).toBe(1);
    }
    // a hypothetical new tower is graded by its numbers alone
    const lob = towerCoverage({ ...TOWER_DEFS.needle, range: 600, damage: 90, splash: 50 }, [{ type: 'projectile', behavior: 'splash', damage: 90, speed: 400, range: 600, splash: 50 }]);
    expect(lob).toMatchObject({ reach: 1, area: 1, burst: 1, control: 0 });
    expect(lob.pierce).toBeGreaterThan(0.8);
    const poke = towerCoverage({ ...TOWER_DEFS.needle, range: 150, damage: 4, splash: 0 }, [{ type: 'aura', radius: 150, damage: 4, status: { kind: 'Freeze', amount: 1 } }]);
    expect(poke).toMatchObject({ reach: 0, pierce: 0, control: 1 });
    // a hit that shreds plating pierces more than the same hit that does not
    const raw = towerCoverage({ ...TOWER_DEFS.needle, damage: 16 }, [{ type: 'projectile', behavior: 'splash', damage: 16, speed: 600, range: 700 }]);
    const shredding = towerCoverage({ ...TOWER_DEFS.needle, damage: 16 }, [{ type: 'projectile', behavior: 'homing', damage: 16, speed: 600, range: 700 }]);
    expect(shredding.pierce).toBeGreaterThan(raw.pierce);
    // the board fold: Strain-weighted mean; an empty board covers nothing
    expect(boardCoverage([], 'area')).toBe(0);
    expect(boardCoverage([{ kind: 'mortar', strain: 3 }, { kind: 'needle', strain: 1 }], 'area')).toBeCloseTo(0.75, 12);
    expect(Object.keys(COVERAGE_AXIS_NAME).sort()).toEqual(Object.keys(TOWER_COVERAGE.needle).sort());
    // the GAP reads the board against the roster's mean coverage: 1 with none of it, 0 at or above it
    expect(coverageGap([{ kind: 'needle', strain: 1 }], 'area')).toBe(1);
    expect(coverageGap([{ kind: 'mortar', strain: 1 }], 'area')).toBe(0);
    for (const a of Object.keys(ROSTER_COVERAGE) as (keyof typeof ROSTER_COVERAGE)[]) {
      const mean = TOWER_ORDER.reduce((n, k) => n + TOWER_COVERAGE[k][a], 0) / TOWER_ORDER.length;
      expect(ROSTER_COVERAGE[a]).toBeCloseTo(mean, 12);
    }
  });

  it('the probe share is 0 at ×1 and weights toward the finale at liveProbeFinaleWeight (0 ⇒ the flat v3 shape)', () => {
    const dd = anyG(new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(12), livePowerBase: 1 })).dd as {
      liveProbeShare: (m: number, progress?: number) => number;
    };
    expect(dd.liveProbeShare(1, 1)).toBe(0);
    expect(dd.liveProbeShare(0.5, 1)).toBe(0);
    expect(dd.liveProbeShare(8, 1)).toBeCloseTo(DIRECTOR_ADAPTIVE.liveProbeShare * (1 - 1 / 8), 12); // the finale carries the full share
    const f0 = DIRECTOR_ADAPTIVE.liveProbeFinaleWeight;
    try {
      DIRECTOR_ADAPTIVE.liveProbeFinaleWeight = 0;
      expect(dd.liveProbeShare(3, 0.25)).toBe(dd.liveProbeShare(3, 1));
      DIRECTOR_ADAPTIVE.liveProbeFinaleWeight = 1;
      expect(dd.liveProbeShare(3, 0.25)).toBeCloseTo(dd.liveProbeShare(3, 1) * 0.25, 12);
    } finally {
      DIRECTOR_ADAPTIVE.liveProbeFinaleWeight = f0;
    }
  });

  it('swapInProbe hands share × the plain threat budget to the probe — largest group first, delays kept, a copy', () => {
    const wave: WaveDef = [
      { kind: 'runner', count: 8, spacing: 0.5, delay: 0.4 },
      { kind: 'mite', count: 12, spacing: 0.5, delay: 2 },
    ];
    expect(swapInProbe(wave, null, 1)).toBe(wave);
    expect(swapInProbe(wave, 'spitter', 0)).toBe(wave);
    expect(swapInProbe(wave, 'spitter', 0.01)).toBe(wave); // under half a body ⇒ unchanged
    const out = swapInProbe(wave, 'spitter', 0.5);
    expect(out).not.toBe(wave);
    expect(out.filter((g) => g.kind === 'spitter').every((g) => g.count >= 1 && [0.4, 2].includes(g.delay))).toBe(true);
    const units = (w: WaveDef, k: string): number => w.reduce((n, g) => n + (g.kind === k ? g.count : 0), 0);
    expect(units(out, 'runner') + units(out, 'mite')).toBeLessThan(20); // chaff handed over …
    expect(units(out, 'spitter')).toBeGreaterThanOrEqual(1); // … to the probe
    expect(wave.map((g) => g.count)).toEqual([8, 12]); // the stage plan is never mutated
    expect(swapInProbe(wave, 'spitter', 0.5)).toEqual(out); // deterministic
    // a 1-group wave probes too (v3 swapped whole groups: round(0.26 × 1) = 0 ⇒ never)
    const one: WaveDef = [{ kind: 'lasher', count: 7, spacing: 0.45, delay: 0.4 }];
    const probed = swapInProbe(one, 'scuttler', 0.26);
    expect(probed.map((g) => g.kind)).toEqual(['lasher', 'scuttler']); // the probe rides beside what is left
    expect(probed[0].count).toBe(5); // round(0.26 × 7) = 2 lashers handed over
    expect(probed[1].delay).toBe(0.4);
    expect(swapInProbe(one, 'scuttler', 1).map((g) => g.kind)).toEqual(['scuttler']); // the whole budget ⇒ the whole group
  });

  it('the elite share is 0 at ×1 and grows toward liveEliteShare as the board runs away', () => {
    const g = new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(12), livePowerBase: 1 });
    const dd = anyG(g).dd as { liveEliteShare: (m: number) => number };
    expect(dd.liveEliteShare(1)).toBe(0);
    expect(dd.liveEliteShare(0.5)).toBe(0);
    let prev = 0;
    for (const m of [1.5, 2, 4, 8, 64]) {
      const e = dd.liveEliteShare(m);
      expect(e).toBeGreaterThanOrEqual(prev);
      expect(e).toBeLessThanOrEqual(DIRECTOR_ADAPTIVE.liveEliteShare);
      prev = e;
    }
  });

  it('the live ratio counts drafted cards only ^liveCardExp — a stronger pick does not raise the threat when excluded', () => {
    const dd = anyG(new Game(3, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(12), livePowerBase: 1 })).dd as {
      liveRatio: (base: number, temp: number, towers: number, cards?: number) => number;
    };
    const weak = dd.liveRatio(1, 2, 9, 1.5);
    const strong = dd.liveRatio(1, 2, 9, 6);
    expect(strong / weak).toBeCloseTo(Math.pow(6 / 1.5, DIRECTOR_ADAPTIVE.liveCardExp), 12);
  });

  it('preview == outcome: the prep preview lists exactly the groups (and elites) the wave launches with', () => {
    const g = new Game(5, NO_META, undefined, undefined, undefined, { mode: 'campaign', stage: generateStage(14), livePowerBase: 1e6 });
    g.god = true;
    for (let i = 0; i < 6; i++) { g.selectTower('needle'); g.click(towerSlots[i].x, towerSlots[i].y); }
    let guard = 0;
    let probed = 0;
    while (g.waveIndex < DIRECTOR_ADAPTIVE.liveFromWave + 1 && g.phase !== 'won' && g.phase !== 'lost' && guard++ < 600) {
      if (g.phase === 'draft') { g.chooseCard(g.getSnapshot().draft![0].id); continue; }
      if (g.phase === 'prep') {
        const preview = g.getNextWavePreview()!;
        g.startWave();
        const q = anyG(g).spawnQueue as { kind: string; elite?: boolean }[];
        const counted = new Map<string, { count: number; elite: number }>();
        for (const s of q) { const c = counted.get(s.kind) ?? { count: 0, elite: 0 }; c.count++; if (s.elite) c.elite++; counted.set(s.kind, c); }
        for (const e of preview) {
          expect(counted.get(e.kind)?.count, `wave ${g.waveIndex} ${e.kind}`).toBe(e.count);
          expect(counted.get(e.kind)?.elite ?? 0, `wave ${g.waveIndex} ${e.kind} elites`).toBe(e.elite ?? 0);
        }
        const probes = preview.filter((e) => e.probe);
        expect(probes.length).toBeLessThanOrEqual(1); // at most one probe, named with the coverage it tests
        if (probes[0]) expect(Object.values(COVERAGE_AXIS_NAME)).toContain(probes[0].probe!.lacks);
        if (g.waveIndex + 1 >= DIRECTOR_ADAPTIVE.liveFromWave) probed += probes.length;
      }
      step(g, 1);
    }
    expect(probed).toBeGreaterThan(0); // a runaway needle board meets its probe, named in the briefing
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

  it('the pressure band rises on flawless waves past fromDepth, eases on a bleeding one (to its floor)', () => {
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
    expect(on.squeezePressure).toBe(ENDLESS_SQUEEZE.floor);
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
