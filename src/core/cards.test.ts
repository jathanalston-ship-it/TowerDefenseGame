// Gene Card framework — the rarity-weight engine, the draft, and the unified effect
// vocabulary (CARDS.md). Exact run outcomes live in golden.test; this pins the framework
// invariants that let the catalog scale to hundreds of cards without code changes.

import { describe, it, expect } from 'vitest';
import {
  CARD_POOL,
  CARD_CATEGORY_LABEL,
  CARD_RARITY_DEFS,
  cardProblems,
  cardRegistry,
  cardToOption,
  applyCard,
  defaultRunModifiers,
  draftCards,
  rollCardRarity,
} from './cards';
import type { CardContext } from './cards';
import type { CardRarity } from './types';
import { Rng } from './rng';
import { Game } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import type { MetaModifiers } from './types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };
const ALL_RARITIES: CardRarity[] = ['common', 'rare', 'epic', 'legendary'];

describe('card catalog (data integrity)', () => {
  it('every card is valid and uses a known category', () => {
    for (const c of CARD_POOL) {
      expect(cardProblems(c), `card '${c.id}'`).toEqual([]);
      expect(c.category in CARD_CATEGORY_LABEL, `card '${c.id}' category`).toBe(true);
    }
  });

  it('spans all four rarities (the expansion shipped Epic + Legendary)', () => {
    const present = new Set(CARD_POOL.map((c) => c.rarity));
    for (const r of ALL_RARITIES) expect(present.has(r), `rarity ${r}`).toBe(true);
  });

  it('cardToOption surfaces the human-readable category label', () => {
    const tower = CARD_POOL.find((c) => c.category === 'tower')!;
    expect(cardToOption(tower).category).toBe('Tower');
  });
});

describe('rarity roll (data-driven weights, no hardcoded probabilities)', () => {
  it('only rolls rarities that are actually available', () => {
    const rng = new Rng(1);
    const available = new Set<CardRarity>(['common', 'rare']);
    for (let i = 0; i < 500; i++) expect(available.has(rollCardRarity(rng, 0, available))).toBe(true);
  });

  it('respects the weight ordering at wave 0 (common ≫ legendary)', () => {
    const rng = new Rng(7);
    const all = new Set(ALL_RARITIES);
    const count: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (let i = 0; i < 4000; i++) count[rollCardRarity(rng, 0, all)]++;
    expect(count.common).toBeGreaterThan(count.rare);
    expect(count.rare).toBeGreaterThan(count.epic);
    expect(count.epic).toBeGreaterThan(count.legendary);
  });

  it('depth scaling raises the Epic+Legendary share in deep runs', () => {
    const all = new Set(ALL_RARITIES);
    const highTierShare = (wave: number): number => {
      const rng = new Rng(99); // same stream → isolates the wave variable
      let high = 0;
      for (let i = 0; i < 4000; i++) {
        const r = rollCardRarity(rng, wave, all);
        if (r === 'epic' || r === 'legendary') high++;
      }
      return high;
    };
    expect(highTierShare(30)).toBeGreaterThan(highTierShare(0));
  });

  it('CARD_RARITY_DEFS is the single weight table (one row per rarity)', () => {
    expect(CARD_RARITY_DEFS.map((d) => d.rarity).sort()).toEqual([...ALL_RARITIES].sort());
  });
});

describe('draft', () => {
  it('returns the requested count of DISTINCT, valid cards', () => {
    const rng = new Rng(2024);
    const draft = draftCards(rng, 3, 5);
    expect(draft).toHaveLength(3);
    expect(new Set(draft.map((c) => c.id)).size).toBe(3);
    for (const c of draft) expect(cardRegistry.get(c.id)).toBeTruthy();
  });

  it('is deterministic for a fixed seed + wave', () => {
    const a = draftCards(new Rng(42), 3, 4).map((c) => c.id);
    const b = draftCards(new Rng(42), 3, 4).map((c) => c.id);
    expect(a).toEqual(b);
  });
});

describe('effect application', () => {
  it('folds a multi-effect card into the run modifiers', () => {
    const mods = defaultRunModifiers();
    const ctx: CardContext = { mods, grantBiomass: () => {}, grantIntegrity: () => {}, healHero: () => {} };
    applyCard(cardRegistry.get('caustic_detonation')!, ctx);
    expect(mods.poolDpsMult).toBeCloseTo(1.5, 10);
    expect(mods.mortarPoolDurationMult).toBeCloseTo(1.5, 10);
    expect(mods.mortarAppliesFracture).toBe(true);
  });

  it('a drafted GRANT card adds its run verb mid-run (Pierce Protocol → piercing shots)', () => {
    const game = new Game(5, NO_META);
    game.god = true; // survive the flood so projectiles keep flying
    game.debugAddBiomass(500);
    let placed = false;
    for (const s of towerSlots) if (game.placeTower('needle', s.x, s.y)) { placed = true; break; }
    expect(placed).toBe(true);

    // Drafts are RNG-based; inject a known draft so the wiring (not luck) is under test.
    game.phase = 'draft';
    game.draft = [cardRegistry.get('pierce_protocol')!];
    game.chooseCard('pierce_protocol');

    game.startWave();
    game.debugSpawn('runner', 30);
    let sawPierce = false;
    for (let i = 0; i < 60 * 8 && !sawPierce; i++) {
      game.advance(SIM_DT);
      for (const p of game.projectiles) if ((p.pierce ?? 0) > 0) { sawPierce = true; break; }
    }
    expect(sawPierce).toBe(true); // the card's grant reached the live projectile path
  });
});
