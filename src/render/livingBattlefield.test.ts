// LIVING BATTLEFIELD (docs/LIVING-BATTLEFIELD.md) — the hidden-biomass accumulator + the data-driven
// influence registry. The DRAW path is verified live (headless render); here we pin the pure logic:
// monotonic accumulation, correct stage banding, an always-present core anchor, the dev override, and
// the future-proof hash-default so unknown/future content resolves to a coherent profile with no code.

import { describe, it, expect, afterEach } from 'vitest';
import {
  computeAssimilation, profileForTower, profileForHero, profileForMulligan, profileForGene,
  setStageOverride, STAGE_NAMES, STAGE_COUNT,
} from './livingBattlefield';
import { tierAt } from '../core/assimilation';
import type { RenderState } from '../core/game';
import type { LBContext } from './livingBattlefield';

function rs(over: Partial<RenderState> = {}): RenderState {
  return {
    towers: [], heroes: [], megaBoss: null,
    emergency: false, emergencyRamp: 0, emergencyFocusX: 0, emergencyFocusY: 0,
    biome: { id: 'neutral', name: 'Neutral', accent: '#5ad1ff' },
    assimilation: { wave: 0, kills: 0, bossKills: 0, megaKills: 0 },
    ...over,
  } as unknown as RenderState;
}
const ctx = (power = 0): LBContext => ({ power, mulligans: {}, heroGear: {}, cosmeticTiers: {}, starTiers: {} });
const tower = (kind: string, i: number, extra: Record<string, unknown> = {}): unknown =>
  ({ id: i + 1, kind, x: 100 + i * 12, y: 200, strain: 1, branchId: null, tier: 0, ...extra });
const towers = (n: number, kind = 'mortar', extra = {}): unknown[] => Array.from({ length: n }, (_, i) => tower(kind, i, extra));

afterEach(() => setStageOverride(null)); // the override is a module global — never leak it between tests

describe('Living Battlefield — assimilation accumulator', () => {
  it('an empty early run is Stage 0 (clean arena, effect inert)', () => {
    const a = computeAssimilation(rs(), ctx());
    expect(a.stage).toBe(0);
    expect(a.value).toBeLessThan(1);
  });

  it('always anchors a core region on the nucleus (nucleus evolution)', () => {
    const a = computeAssimilation(rs({ towers: towers(2) as RenderState['towers'] }), ctx());
    expect(a.regions.some((r) => r.kind === 'core')).toBe(true);
    // and one region per tower
    expect(a.regions.filter((r) => r.kind === 'tower')).toHaveLength(2);
  });

  it('biomass is MONOTONIC — a deeper build never scores lower', () => {
    const small = computeAssimilation(rs({ towers: towers(2) as RenderState['towers'] }), ctx());
    const more = computeAssimilation(rs({ towers: towers(8) as RenderState['towers'] }), ctx());
    const upgraded = computeAssimilation(
      rs({ towers: towers(8, 'mortar', { strain: 5, branchId: 'x', tier: 5 }) as RenderState['towers'] }),
      { ...ctx(), starTiers: { mortar: 5 }, cosmeticTiers: { mortar: 4 } },
    );
    expect(more.value).toBeGreaterThan(small.value);
    expect(upgraded.value).toBeGreaterThan(more.value);
  });

  it('combat + progress push the stage up the band', () => {
    const early = computeAssimilation(rs({ towers: towers(3) as RenderState['towers'] }), ctx(100));
    const late = computeAssimilation(rs({
      towers: towers(12, 'mortar', { strain: 5, branchId: 'x', tier: 5 }) as RenderState['towers'],
      heroes: [{ kind: 'ravager' }, { kind: 'shepherd' }] as RenderState['heroes'],
      assimilation: { wave: 40, kills: 1200, bossKills: 6, megaKills: 2 },
      biome: { id: 'caustic', name: 'Caustic', accent: '#9be84a' },
    }), { ...ctx(9000), starTiers: { mortar: 5 }, cosmeticTiers: { mortar: 4 } });
    expect(late.stage).toBeGreaterThan(early.stage);
    expect(late.stage).toBe(STAGE_COUNT - 1); // a maxed run reaches the final "Living" stage
    expect(late.intensity).toBeGreaterThan(early.intensity);
    expect(STAGE_NAMES[late.stage]).toBe('Living');
  });

  it('a mega body adds a battlefield-scale region + weight', () => {
    const base = computeAssimilation(rs({ towers: towers(4) as RenderState['towers'] }), ctx());
    const mega = computeAssimilation(rs({
      towers: towers(4) as RenderState['towers'],
      megaBoss: { anchorY: 60, palette: { accent: '#ffd24d' } } as RenderState['megaBoss'],
    }), ctx());
    expect(mega.regions.some((r) => r.kind === 'mega')).toBe(true);
    expect(base.regions.some((r) => r.kind === 'mega')).toBe(false);
  });

  it('takes the STAGE from the canonical Assimilation Index tier when supplied (one source of truth)', () => {
    for (const idx of [0, 0.15, 0.35, 0.55, 0.72, 0.95]) {
      const a = computeAssimilation(rs({ towers: towers(4) as RenderState['towers'] }), ctx(500), idx);
      expect(a.stage).toBe(tierAt(idx).tier.index); // terrain stage == the mood-FX tier ⇒ coherent
      expect(a.intensity).toBeCloseTo(idx, 5);
      expect(a.regions.filter((r) => r.kind === 'tower')).toHaveLength(4); // regions still computed locally
    }
    setStageOverride(2); // the dev override still wins over the index
    expect(computeAssimilation(rs(), ctx(), 0.95).stage).toBe(2);
    setStageOverride(null);
  });

  it('the dev stage override forces a stage regardless of biomass', () => {
    setStageOverride(5);
    const a = computeAssimilation(rs(), ctx()); // empty run would be Stage 0
    expect(a.stage).toBe(5);
    expect(a.progress).toBe(1);
    setStageOverride(null);
    expect(computeAssimilation(rs(), ctx()).stage).toBe(0);
  });
});

describe('Living Battlefield — Environmental Influence Profiles (future-proof)', () => {
  it('curated content keeps its authored motif', () => {
    expect(profileForTower('mortar').motif).toBe('ember');
    expect(profileForTower('siphon').motif).toBe('vein');
    expect(profileForHero('overseer').motif).toBe('crystal');
    expect(profileForMulligan('biological').motif).toBe('flesh');
    expect(profileForGene('defense').motif).toBe('bone');
  });

  it('UNKNOWN/future content resolves to a stable, valid profile with NO code change', () => {
    const KNOWN = ['vein', 'flesh', 'bone', 'crystal', 'spore', 'root', 'chitin', 'ember'];
    for (const id of ['tower_from_2027', 'brand_new_hero', 'mystery_axis', 'x']) {
      const p = profileForTower(id);
      expect(KNOWN).toContain(p.motif); // always a real motif
      expect(p.hue).toMatch(/^#[0-9a-f]{6}$/i); // always a canvas-usable hue
      expect(profileForTower(id).motif).toBe(p.motif); // deterministic (stable across calls)
    }
  });
});
