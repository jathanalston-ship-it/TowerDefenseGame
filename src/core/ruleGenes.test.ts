// RULE GENES (docs/CARDS.md §rules): build-defining gene cards that change HOW a run plays, the
// derived rule-changing classification, THE RULE SLOT draft guarantee, the four rule hook events
// (each fired from one sim seam), and the per-hero fan-out that lets hero rules reach geared heroes.
// Golden safety: every rule gene is progression-gated and the slot is armed only by an EARNED rule
// gene, so a fresh account / the golden sim never sees either (pinned below + by golden.test).

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { CARD_POOL, cardRegistry, draftCards, isRuleChangingCard, RULE_CHANGING_OPS } from './cards';
import type { CardDef, RunModifiers } from './cards';
import { STARTER_GENES } from './geneDiscovery';
import { Rng } from './rng';
import { SIM_DT, TOWER_DEFS } from './config';
import { towerSlots } from './map';
import type { Enemy, Hero, MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** The 25 rule genes this pass added (docs/CARDS.md §rules) — the catalog block, not a gate list. */
const RULE_GENES = [
  'splinter_venom', 'caustic_strikes', 'acid_etching', 'shatter_lattice', 'patient_zero', 'contagion_bloom',
  'septic_breach', 'synaptic_burst', 'cryo_fang', 'dread_spores', 'recycler_glands', 'strain_tithe',
  'mutagenic_shock', 'static_wake', 'lancing_sinew', 'impaling_lattice', 'sapper_cradle', 'bulwark_instinct',
  'pack_leader', 'vanguard_stance', 'chain_reflex', 'blood_tithe', 'trophy_hunter', 'apex_contagion', 'hive_martyrdom',
];

type Internals = {
  hiveStrike(e: Enemy): void;
  castHeroAbility(h: Hero, x: number, y: number): void;
  hmods(h: Hero): RunModifiers;
  hstatuses(h: Hero): { status: string; amount: number }[];
  ruleSlot: boolean;
};
const internals = (g: Game): Internals => g as unknown as Internals;

function boot(genes: string[] = [], extra: Record<string, unknown> = {}): Game {
  return new Game(5, NO_META, undefined, 'ravager', undefined, { startingGenes: genes, ...extra });
}

describe('rule genes — the catalog block', () => {
  it('adds ≥24 rule-changing genes, every one progression-gated on the Campaign (Stage ≥ 2)', () => {
    expect(RULE_GENES.length).toBeGreaterThanOrEqual(24);
    for (const id of RULE_GENES) {
      const c = cardRegistry.get(id);
      expect(c, id).toBeDefined();
      expect(isRuleChangingCard(c!), `${id} rule-changing`).toBe(true);
      expect(c!.unlock?.kind, `${id} gated`).toBe('campaignStage');
      expect((c!.unlock as { stage: number }).stage, `${id} gate stage`).toBeGreaterThanOrEqual(2);
    }
  });

  it('rule-changing is DERIVED from the effect ops (no hand list)', () => {
    expect([...RULE_CHANGING_OPS].sort()).toEqual(['flag', 'grant', 'hook', 'set']);
    expect(isRuleChangingCard(cardRegistry.get('sharpened_needles')!)).toBe(false); // a bare multiplier
    expect(isRuleChangingCard(cardRegistry.get('pierce_protocol')!)).toBe(true); // a grant
    expect(isRuleChangingCard(cardRegistry.get('caustic_catalyst')!)).toBe(true); // a flag
    for (const c of CARD_POOL) {
      expect(isRuleChangingCard(c)).toBe(c.effects.some((e) => e.op === 'flag' || e.op === 'set' || e.op === 'grant' || e.op === 'hook'));
    }
  });
});

describe('THE RULE SLOT — drafts reliably offer a rule-changing card', () => {
  const allUnlocked = new Set(CARD_POOL.filter((c) => c.unlock).map((c) => c.id));

  it('armed: every deal whose eligible pool holds a rule card offers one', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const deal = draftCards(new Rng(seed), 3, seed % 12, undefined, allUnlocked, undefined, true);
      expect(deal).toHaveLength(3);
      expect(deal.some(isRuleChangingCard), `seed ${seed}: ${deal.map((c) => c.id).join(',')}`).toBe(true);
      expect(new Set(deal.map((c) => c.id)).size).toBe(3); // still distinct
    }
  });

  it('armed but no rule card eligible ⇒ the deal (and the rng stream) is untouched', () => {
    const starters = new Set(STARTER_GENES);
    expect([...starters].some((id) => isRuleChangingCard(cardRegistry.get(id)!))).toBe(false);
    for (let seed = 1; seed <= 100; seed++) {
      const a = new Rng(seed);
      const b = new Rng(seed);
      const plain = draftCards(a, 3, 4, undefined, allUnlocked, starters);
      const armed = draftCards(b, 3, 4, undefined, allUnlocked, starters, true);
      expect(armed.map((c) => c.id)).toEqual(plain.map((c) => c.id));
      expect(b.next()).toBe(a.next());
    }
  });

  it('unarmed (the default) is the legacy draft exactly — the golden/fresh-save path', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const legacy = draftCards(new Rng(seed), 3, 6);
      const explicitOff = draftCards(new Rng(seed), 3, 6, undefined, undefined, undefined, false);
      expect(explicitOff.map((c) => c.id)).toEqual(legacy.map((c) => c.id));
    }
  });

  it('the Game arms the slot ONLY once the account has earned a rule-changing gene', () => {
    expect(internals(boot()).ruleSlot).toBe(false); // fresh account / golden
    expect(internals(boot([], { unlockedCardIds: ['apex_swarm'] })).ruleSlot).toBe(false); // earned, but a bare multiplier
    expect(internals(boot([], { unlockedCardIds: ['recycler_glands'] })).ruleSlot).toBe(true);
    // Live discovery-era pool: the starters + one discovered rule gene ⇒ every deal offers it.
    for (let seed = 1; seed <= 25; seed++) {
      const g = new Game(seed, NO_META, undefined, 'ravager', undefined, {
        unlockedCardIds: ['recycler_glands'], draftPool: [...STARTER_GENES, 'recycler_glands'],
      });
      g.debugOpenDraft();
      expect(g.draft!.map((c) => c.id), `seed ${seed}`).toContain('recycler_glands');
    }
  });
});

describe('rule hook events — each fires from its one sim seam', () => {
  const slot = [...towerSlots].sort((a, b) => a.y - b.y)[0];

  it('towerDeployed — Recycler Glands refunds every deployment', () => {
    const g = boot(['recycler_glands']);
    g.debugAddBiomass(1000);
    const before = g.biomass;
    expect(g.placeTower('needle', slot.x, slot.y)).toBe(true);
    expect(g.biomass).toBe(before - TOWER_DEFS.needle.cost + 25);
  });

  it('strainRaised — Strain Tithe refunds every Strain raise', () => {
    const g = boot(['strain_tithe']);
    g.debugAddBiomass(1000);
    g.placeTower('needle', slot.x, slot.y);
    const t = g.towers[0];
    const before = g.biomass;
    expect(g.raiseStrain(t.id)).toBe('ok');
    expect(g.biomass).toBe(before + 45);
  });

  it('nucleusHit — Blood Tithe pays per blow; Dread Spores panics the attacker itself', () => {
    const g = boot(['blood_tithe', 'dread_spores']);
    g.startWave();
    g.debugSpawn('runner', 1);
    g.advance(SIM_DT); // the grid indexes the spawn
    const e = g.enemies[g.enemies.length - 1];
    const before = g.biomass;
    internals(g).hiveStrike(e);
    expect(g.biomass).toBe(before + 15);
    expect((e.statuses ?? []).some((s) => s.id === 'fear')).toBe(true);
  });

  it('eliteKilled — Trophy Hunter pays on an ELITE kill only', () => {
    const run = (genes: string[], elite: boolean): number => {
      const g = boot(genes);
      g.startWave();
      g.debugSpawn('runner', 1);
      const e = g.enemies[g.enemies.length - 1];
      e.elite = elite;
      e.hp = 0;
      const before = g.biomass;
      g.advance(SIM_DT);
      return g.biomass - before;
    };
    expect(run(['trophy_hunter'], true) - run([], true)).toBe(60);
    expect(run(['trophy_hunter'], false) - run([], false)).toBe(0);
  });

  it('abilityCast — Synaptic Burst disrupts foes at the CAST POINT', () => {
    const disruptAfterCast = (genes: string[]): number => {
      const g = boot(genes);
      g.startWave();
      g.debugSpawn('runner', 1);
      g.advance(SIM_DT);
      const e = g.enemies[g.enemies.length - 1];
      internals(g).castHeroAbility(g.heroes[0], e.x, e.y);
      return e.disrupt;
    };
    expect(disruptAfterCast(['synaptic_burst'])).toBeGreaterThan(disruptAfterCast([]));
  });
});

describe('per-hero fan-out — hero rules reach GEARED heroes', () => {
  const gear = { ravager: [{ op: 'mul' as const, field: 'heroDamageMult' as const, value: 1.1 }] };

  it('a stance (set) and an on-hit grant fold into the geared hero’s own bundle', () => {
    const g = boot(['bulwark_instinct', 'splinter_venom'], { heroEquip: gear });
    const h = g.heroes[0];
    expect(internals(g).hmods(h).heroAnchor).toBe('nucleus');
    expect(internals(g).hstatuses(h).some((s) => s.status === 'Fracture')).toBe(true);
    // Gear is still honored (the clone kept its own fold).
    expect(internals(g).hmods(h).heroDamageMult).toBeCloseTo(1.1, 10);
  });

  it('a gear-less roster has no bundles — the globals carry the rule (golden-safe no-op)', () => {
    const g = boot(['bulwark_instinct']);
    expect(internals(g).hmods(g.heroes[0]).heroAnchor).toBe('nucleus');
  });
});

describe('rule genes stay sound under the existing validators', () => {
  it('every rule gene carries authored, Power-visible permanent levels', () => {
    for (const id of RULE_GENES) {
      const c = cardRegistry.get(id) as CardDef;
      expect(c.upgrades?.length ?? 0, id).toBeGreaterThanOrEqual(3);
    }
  });
});
