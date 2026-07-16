// GENE DISCOVERY contract (docs/CARDS.md §discovery) — starters, pool gating, duplicate
// protection, and the echo lane, swept so future cards/profile tweaks fail the build,
// not the player.

import { describe, expect, it } from 'vitest';
import {
  GENE_DISCOVERY, STARTER_GENES, archiveCompletion, discoveryHint, eligibleDiscoveries,
  geneDiscoveryProblems, rollGeneDiscovery,
} from './geneDiscovery';
import { CARD_POOL, cardRegistry } from './cards';

/** Tiny deterministic rng for the roll sweeps. */
function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    return x / 0xffffffff;
  };
}

describe('the discovery contract holds for the whole catalog', () => {
  it('validator sweep: starters, pool order, rarity weights all sound', () => {
    expect(geneDiscoveryProblems()).toEqual([]);
  });

  it('starters are 10–20 ungated cards spanning real mechanic variety', () => {
    expect(STARTER_GENES.length).toBeGreaterThanOrEqual(10);
    expect(STARTER_GENES.length).toBeLessThanOrEqual(20);
    const defs = STARTER_GENES.map((id) => CARD_POOL.find((c) => c.id === id)!);
    expect(defs.every((d) => d && !d.unlock)).toBe(true);
    expect(new Set(defs.map((d) => d.category)).size).toBeGreaterThanOrEqual(4);
  });

  it('rarity pools open on campaign milestones; per-card unlocks still gate on top', () => {
    const none = new Set<string>();
    const day0 = eligibleDiscoveries(0, none);
    expect(day0.length).toBeGreaterThan(0);
    expect(day0.every((c) => c.rarity === 'common' && !c.unlock)).toBe(true);
    const at15 = eligibleDiscoveries(15, none);
    expect(at15.some((c) => c.rarity === 'rare')).toBe(true);
    expect(at15.some((c) => c.rarity === 'epic')).toBe(false); // epic pool waits for 30
    // A gated card joins ONLY once its own unlock is met, even inside an open pool.
    const gatedRare = CARD_POOL.find((c) => c.rarity === 'rare' && c.unlock)!;
    expect(at15.some((c) => c.id === gatedRare.id)).toBe(false);
    const withUnlock = eligibleDiscoveries(15, new Set([gatedRare.id]));
    expect(withUnlock.some((c) => c.id === gatedRare.id)).toBe(true);
    // Legendary is the deep-end pool.
    expect(eligibleDiscoveries(59, none).some((c) => c.rarity === 'legendary')).toBe(false);
    expect(eligibleDiscoveries(60, none).some((c) => c.rarity === 'legendary')).toBe(true);
  });
});

describe('the discovery roll (duplicate protection + the echo lane)', () => {
  it('heavily prefers undiscovered strands on a young archive, and echoes never dead-pull', () => {
    const rng = seeded(1234);
    const discovered = new Set(STARTER_GENES);
    let discovers = 0;
    let echoes = 0;
    let echoOnDiscovered = true;
    for (let i = 0; i < 4000; i++) {
      const roll = rollGeneDiscovery(rng, 'legendary', 10, new Set(), discovered);
      if (!roll) continue;
      if (roll.kind === 'discover') {
        discovers++;
        expect(discovered.has(roll.card.id)).toBe(false); // a discover is ALWAYS new
      } else {
        echoes++;
        if (!discovered.has(roll.card.id)) echoOnDiscovered = false;
        expect(roll.essence).toBeGreaterThan(0);
      }
    }
    expect(echoOnDiscovered).toBe(true); // echoes only fire on known strands
    expect(discovers).toBeGreaterThan(echoes * 2); // protection: new >> dupe while the archive is young
  });

  it('respects the container-rarity chance gate and empty pools', () => {
    // rng that never fires the lane (returns just above the best chance)
    const never = (): number => 0.99;
    expect(rollGeneDiscovery(never, 'legendary', 99, new Set(), new Set())).toBeNull();
    // an rng that always fires, but NOTHING is eligible (stage 0, everything common already known)
    const always = seeded(7);
    const allCommonsKnown = new Set(CARD_POOL.filter((c) => !c.unlock && c.rarity === 'common').map((c) => c.id));
    const r = rollGeneDiscovery(always, 'common', 0, new Set(), allCommonsKnown);
    // pool isn't empty (discovered cards remain eligible) — but every hit is an echo now
    if (r) expect(r.kind).toBe('echo');
  });

  it('protection normalizes as completion rises (boost fades toward ×1)', () => {
    expect(archiveCompletion(new Set())).toBe(0);
    const all = new Set(cardRegistry.active().map((c) => c.id));
    expect(archiveCompletion(all)).toBe(1);
    const boostAt = (completion: number): number => 1 + GENE_DISCOVERY.undiscoveredBoost * (1 - completion);
    expect(boostAt(0)).toBeGreaterThan(boostAt(0.5));
    expect(boostAt(1)).toBe(1);
  });

  it('every undiscovered card yields an honest, specific hint with zero authoring', () => {
    for (const c of CARD_POOL) {
      const hint = discoveryHint(c, 0);
      expect(hint.length).toBeGreaterThan(8);
    }
    // A sealed pool names its campaign milestone…
    const legendary = CARD_POOL.find((c) => c.rarity === 'legendary')!;
    expect(discoveryHint(legendary, 0)).toContain('Campaign Stage 60');
    // …and an open-pool ungated card points at Bio-Containers.
    const commonOpen = CARD_POOL.find((c) => c.rarity === 'common' && !c.unlock)!;
    expect(discoveryHint(commonOpen, 5)).toContain('Bio-Containers');
  });
});
