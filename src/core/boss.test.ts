import { describe, it, expect } from 'vitest';
import { Rng } from './rng';
import { assembleBoss, bossDef, bossProblems, campaignBossFor, epithetFor, CAMPAIGN_BOSSES, BOSS_DEFS, CHASSIS_IDENTITY, MODULE_LABEL, SIGNATURE_OWNER, SIGNATURE_TL } from './boss';
import type { BossChassis } from './boss';

const mk = (seed: number): (() => number) => {
  const r = new Rng(seed);
  return () => r.next();
};

describe('boss framework', () => {
  it('the authored Progenitor is a real composition (phases + modules)', () => {
    const d = bossDef('progenitor')!;
    expect(d.phases.length).toBeGreaterThanOrEqual(2);
    expect(d.modules.length).toBeGreaterThanOrEqual(3);
    expect(d.phases[0].threshold).toBe(1); // first phase from full HP
  });

  it('procedural assembly scales module + phase count with Threat Level', () => {
    const low = assembleBoss(mk(1), 2);
    const high = assembleBoss(mk(1), 40);
    expect(high.modules.length).toBeGreaterThanOrEqual(low.modules.length);
    expect(high.phases.length).toBeGreaterThanOrEqual(low.phases.length);
    expect(high.phases.length).toBeLessThanOrEqual(4); // capped (fairness; §phases full arc)
  });

  it('every assembled boss has ≥2 modules and a from-full first phase (fair)', () => {
    for (const seed of [3, 7, 11, 42]) {
      const b = assembleBoss(mk(seed), 18);
      expect(b.modules.length).toBeGreaterThanOrEqual(2);
      expect(b.phases[0].threshold).toBe(1);
    }
  });

  it('assembly is deterministic from the rng seed', () => {
    expect(assembleBoss(mk(5), 20).name).toBe(assembleBoss(mk(5), 20).name);
  });

  it('every authored boss is a valid composition (bossProblems clean)', () => {
    for (const d of Object.values(BOSS_DEFS)) expect(bossProblems(d)).toEqual([]);
  });

  it('bossProblems catches malformed defs (each module invariant)', () => {
    const base = bossDef('brood_cyst')!;
    expect(bossProblems({ ...base, hpMult: 0 })).toContain('hpMult must be > 0');
    expect(bossProblems({ ...base, phases: [{ threshold: 0.5, modules: [0] }] })).toContain('phases must start at threshold 1 (from full HP)');
    expect(bossProblems({ ...base, modules: [{ kind: 'healer', cooldown: 4, amount: 100 }], phases: [{ threshold: 1, modules: [0] }] })).toContain('healer needs a radius');
    expect(bossProblems({ ...base, modules: [{ kind: 'splitter', cooldown: 9, amount: 2 }], phases: [{ threshold: 1, modules: [] }] })).toContain('splitter needs generations ≥ 1');
  });
});

describe('campaign boss line (docs/BOSS-DESIGN §4 — Milestones 1–3)', () => {
  it('pins twelve authored bosses to their campaign stages (Act-1 5..30, Act-2 35..45, Act-3 50..60)', () => {
    expect(Object.keys(CAMPAIGN_BOSSES).map(Number).sort((a, b) => a - b)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(campaignBossFor(5)!.id).toBe('first_antibody');
    expect(campaignBossFor(30)!.id).toBe('purge_engine');
    expect(campaignBossFor(12)).toBeUndefined(); // non-milestone stages stay procedural
    // The Act-2 siege line: positioning / layered defense / total suppression.
    expect(campaignBossFor(35)!.id).toBe('sunken_chorus');
    expect(campaignBossFor(35)!.modules.some((m) => m.kind === 'gravitas')).toBe(true); // drags YOUR heroes
    expect(campaignBossFor(40)!.id).toBe('vault_of_teeth');
    expect(campaignBossFor(40)!.modules.some((m) => m.kind === 'bulwark')).toBe(true); // layered defense
    expect(campaignBossFor(40)!.modules.some((m) => m.kind === 'corecrush')).toBe(true); // the endgame grip
    expect(campaignBossFor(45)!.id).toBe('unmaker');
    expect(campaignBossFor(45)!.modules.some((m) => m.kind === 'corruptor')).toBe(true); // ground rot
    expect(campaignBossFor(45)!.phases.length).toBe(4); // the full suppression arc
    // Act-3: the graduation line — brood flood / control lockdown / the final siege.
    expect(campaignBossFor(50)!.id).toBe('hollow_matriarch');
    expect(campaignBossFor(50)!.modules.some((m) => m.kind === 'splitter')).toBe(true); // her death is not the end
    expect(campaignBossFor(55)!.id).toBe('null_tyrant');
    expect(campaignBossFor(55)!.modules.some((m) => m.kind === 'gravitas')).toBe(true); // champions DRAGGED
    expect(campaignBossFor(60)!.id).toBe('worldbreaker');
    expect(campaignBossFor(60)!.modules.some((m) => m.kind === 'corecrush')).toBe(true); // THE GRIP
  });

  it('each teaches its lesson through a real module (not just more HP)', () => {
    expect(campaignBossFor(15)!.modules.some((m) => m.kind === 'healer')).toBe(true); // The Mender
    expect(campaignBossFor(20)!.modules.some((m) => m.kind === 'carapace')).toBe(true); // Chitin Colossus
    expect(campaignBossFor(25)!.modules.some((m) => m.kind === 'splitter')).toBe(true); // Mitotic Horror
    expect(campaignBossFor(30)!.phases.length).toBe(4); // The Purge Engine — the full siege arc (desperation CRUSH finale)
  });
});

describe('chassis identity (docs/BOSS-DESIGN.md §identity)', () => {
  it('signatures ↔ chassis form a bijection, and CHASSIS_IDENTITY agrees with SIGNATURE_OWNER', () => {
    const owners = Object.values(SIGNATURE_OWNER);
    expect(new Set(owners).size).toBe(5); // five signatures, five distinct owners
    for (const [chassis, id] of Object.entries(CHASSIS_IDENTITY)) {
      expect(SIGNATURE_OWNER[id.signature.kind]).toBe(chassis as BossChassis);
      expect(bossProblems({ ...bossDef('progenitor')!, chassis: chassis as BossChassis, modules: [id.signature], phases: [{ threshold: 1, modules: [0] }] })).toEqual([]);
    }
  });

  it('bossProblems refuses a def wearing another body plan’s signature', () => {
    const base = bossDef('brood_cyst')!; // swarmlord
    const stolen = { ...base, modules: [...base.modules, CHASSIS_IDENTITY.juggernaut.signature] };
    expect(bossProblems(stolen)).toContain('unstoppable is the juggernaut signature — a swarmlord cannot field it');
  });

  it('from SIGNATURE_TL the assembled kit anchors on the signature, and desperation fields it', () => {
    for (const seed of [3, 7, 11, 42]) {
      const b = assembleBoss(mk(seed), 12); // TL 12 ⇒ 3 phases ⇒ a desperation finale exists
      const sig = CHASSIS_IDENTITY[b.chassis].signature.kind;
      expect(b.modules[0].kind).toBe(sig); // the signature anchors the composition
      const last = b.phases[b.phases.length - 1];
      expect(last.modules).toContain(0);
      expect(last.cadenceMult).toBe(CHASSIS_IDENTITY[b.chassis].desperation.cadenceMult); // runs the kit HOT
      expect(bossProblems(b)).toEqual([]);
    }
  });

  it('below SIGNATURE_TL no signature appears (early bosses stay teachable)', () => {
    for (const seed of [3, 7, 11, 42]) {
      const b = assembleBoss(mk(seed), SIGNATURE_TL - 2);
      expect(b.modules.some((m) => SIGNATURE_OWNER[m.kind] !== undefined)).toBe(false);
    }
  });

  it('every boss carries an epithet — authored bosses author it, assembly derives it from the kit', () => {
    for (const d of Object.values(BOSS_DEFS)) expect(d.epithet).toBeTruthy();
    expect(assembleBoss(mk(9), 20).epithet).toBeTruthy();
    // Priority: the signature names the boss before support verbs do.
    expect(epithetFor('juggernaut', [
      { kind: 'healer', cooldown: 5, amount: 50, radius: 100 },
      { kind: 'unstoppable', cooldown: 15, duration: 4, frac: 0.35 },
    ])).toBe('the Inevitable March');
    // No kit match ⇒ the chassis creed stands in (never an empty byline).
    expect(epithetFor('bruiser', [])).toBe(CHASSIS_IDENTITY.bruiser.creed);
  });

  it('cadenceMult is clamped to the fairness band [0.4, 1]', () => {
    const base = bossDef('worldbreaker')!;
    expect(base.phases[base.phases.length - 1].cadenceMult).toBeLessThan(1); // the authored finale runs hot
    const tooHot = { ...base, phases: base.phases.map((p, i) => (i === 0 ? { ...p, cadenceMult: 0.1 } : p)) };
    expect(bossProblems(tooHot)).toContain('cadenceMult must sit in [0.4, 1] (hotter than 0.4 is a fairness break)');
  });

  it('MODULE_LABEL names every module kind (kit chips can never render blank)', () => {
    for (const [k, v] of Object.entries(MODULE_LABEL)) {
      expect(v.length, `label for ${k}`).toBeGreaterThan(0);
    }
  });
});
