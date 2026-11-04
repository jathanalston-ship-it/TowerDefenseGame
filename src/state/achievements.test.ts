import { describe, it, expect } from 'vitest';
import { defaultSave } from '../save/saveStore';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import { CARD_POOL } from '../core/cards';
import { ACHIEVEMENTS, checkAchievements, collapseLadderRungs } from './achievements';

describe('achievements', () => {
  it('a brand-new save has nothing unlocked', () => {
    expect(checkAchievements({ save: defaultSave() })).toHaveLength(0);
  });

  it('save-state milestones fire (first_run)', () => {
    const ids = checkAchievements({ save: { ...defaultSave(), totalRuns: 1 } }).map((a) => a.id);
    expect(ids).toContain('first_run');
  });

  it('run-scoped milestones fire from the run summary (extract, centurion)', () => {
    const ids = checkAchievements({
      save: defaultSave(),
      run: { wave: 12, kills: 120, won: true },
    }).map((a) => a.id);
    expect(ids).toContain('extract');
    expect(ids).toContain('centurion');
  });

  it('does not re-offer an already-unlocked achievement', () => {
    const save = { ...defaultSave(), totalRuns: 1, achievements: ['first_run'] };
    const ids = checkAchievements({ save }).map((a) => a.id);
    expect(ids).not.toContain('first_run');
  });

  it('strain milestones ride the lifetime ledgers (bestStrain, strainsEvolved)', () => {
    const base = defaultSave();
    const save = { ...base, stats: { ...base.stats, bestStrain: 5, strainsEvolved: 10 } };
    const ids = checkAchievements({ save }).map((a) => a.id);
    expect(ids).toContain('first_strain');
    expect(ids).toContain('strain5');
    expect(ids).toContain('strains10');
    expect(ids).not.toContain('strains50');
  });

  it('doctrine recognition rides the stats ledgers (win, breadth, families, Exemplar)', () => {
    const base = defaultSave();
    const withLedgers = (wins: Record<string, number>, bestWave: Record<string, number> = {}) =>
      ({ ...base, stats: { ...base.stats, doctrineWins: wins, doctrineBestWave: bestWave } });
    expect(checkAchievements({ save: base }).map((a) => a.id)).not.toContain('doctrine_first');
    // one Build-family win
    let ids = checkAchievements({ save: withLedgers({ glasscannon: 1 }) }).map((a) => a.id);
    expect(ids).toContain('doctrine_first');
    expect(ids).not.toContain('doctrine_breadth');
    expect(ids).not.toContain('doctrine_families');
    // five distinct wins spanning all three families (build + protocol + pact)
    ids = checkAchievements({ save: withLedgers({ glasscannon: 1, swarm: 2, titan: 1, frenzy: 1, bloodpact: 1 }) }).map((a) => a.id);
    expect(ids).toContain('doctrine_breadth');
    expect(ids).toContain('doctrine_families');
    // 'none' and unknown ids never count as commitment
    expect(checkAchievements({ save: withLedgers({ none: 50, ghost_doctrine: 9 }) }).map((a) => a.id)).not.toContain('doctrine_first');
    // Exemplar fires from EITHER rank signal — a deep enough wave with zero wins
    expect(checkAchievements({ save: withLedgers({}, { titan: 50 }) }).map((a) => a.id)).toContain('doctrine_exemplar');
  });

  it('arena recognition rides save.arena (docs/ARENA.md §recognition)', () => {
    const base = defaultSave();
    const arena = (over: Partial<typeof base.arena>) => ({ ...base, arena: { ...base.arena, ...over } });
    // A fresh record fires nothing — arena_placed must NOT fire from the default placements=5 @ season 0.
    expect(checkAchievements({ save: base }).map((a) => a.id).filter((id) => id.startsWith('arena_'))).toHaveLength(0);
    // First settles: a loss alone fires the trial but not the win.
    let ids = new Set(checkAchievements({ save: arena({ lifetimeLosses: 1 }) }).map((a) => a.id));
    expect(ids.has('arena_first_match')).toBe(true);
    expect(ids.has('arena_first_win')).toBe(false);
    // Placements done only counts inside a REAL season (season > 0).
    expect(new Set(checkAchievements({ save: arena({ placements: 0 }) }).map((a) => a.id)).has('arena_placed')).toBe(false);
    expect(new Set(checkAchievements({ save: arena({ season: 3, placements: 0 }) }).map((a) => a.id)).has('arena_placed')).toBe(true);
    // Division watermarks ride PEAK (never resets), not the live rating.
    ids = new Set(checkAchievements({ save: arena({ rating: 400, peak: 1800 }) }).map((a) => a.id));
    expect(ids.has('arena_larval')).toBe(true);
    expect(ids.has('arena_chrysalis')).toBe(true);
    expect(ids.has('arena_apex')).toBe(false);
    // Streak, veteran ladder, the crown, and the season shelf.
    ids = new Set(checkAchievements({ save: arena({ streak: 5, lifetimeWins: 25, exclusives: ['tower:basilisk'], history: [{ season: 1, rating: 900, division: 'Spore I', wins: 3, losses: 2 }, { season: 2, rating: 1000, division: 'Larval III', wins: 4, losses: 1 }, { season: 3, rating: 1100, division: 'Larval III', wins: 5, losses: 0 }] }) }).map((a) => a.id));
    for (const id of ['arena_streak5', 'arena_wins25', 'arena_crown', 'arena_perennial']) expect(ids.has(id), id).toBe(true);
    expect(ids.has('arena_wins100')).toBe(false);
  });

  it('every achievement id is unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the 10 Deep-Strain content achievements each fire when their condition is met', () => {
    const base = defaultSave();
    const towerUsage = { ...base.stats.towerUsage };
    for (const k of TOWER_ORDER) towerUsage[k] = 30; // deployed each (Coil/Siphon → beam achievements)
    const heroUsage: Record<string, number> = { ...base.stats.heroUsage };
    for (const k of HERO_ORDER) heroUsage[k] = 10; // fielded each (Vitriol/Revenant → roster achievements)
    const stats = { ...base.stats, towerUsage, heroUsage };
    // deep_genome reads the DISCOVERED archive now (docs/CARDS.md §discovery) — 60 strands deep.
    const save = { ...base, stats, bestWave: 40, towerUnlocked: [...TOWER_ORDER], genesDiscovered: CARD_POOL.slice(0, 60).map((c) => c.id) };
    const ids = new Set(checkAchievements({ save }).map((a) => a.id));
    for (const id of ['deploy_coil', 'deploy_siphon', 'beam_arsenal', 'beam_veteran', 'field_vitriol', 'field_revenant', 'full_menagerie', 'complete_arsenal', 'deep_genome', 'return_from_deep']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('discovery milestones ride the Archive (collector ladder, first legendary, common set, full genome)', () => {
    const base = defaultSave();
    const withArchive = (ids: string[]) => ({ ...base, genesDiscovered: ids });
    const commons = CARD_POOL.filter((c) => c.rarity === 'common').map((c) => c.id);
    const aLegendary = CARD_POOL.find((c) => c.rarity === 'legendary')!.id;
    // Fresh starters (16) sit BELOW every threshold — the fresh-save contract above proves none fire.
    let ids = new Set(checkAchievements({ save: withArchive(CARD_POOL.slice(0, 30).map((c) => c.id)) }).map((a) => a.id));
    expect(ids.has('collector')).toBe(true);
    expect(ids.has('deep_genome')).toBe(false);
    // The first legendary find fires apex_find regardless of archive size.
    ids = new Set(checkAchievements({ save: withArchive([aLegendary]) }).map((a) => a.id));
    expect(ids.has('apex_find')).toBe(true);
    // Every common ⇒ the Baseline Genome set completes.
    ids = new Set(checkAchievements({ save: withArchive(commons) }).map((a) => a.id));
    expect(ids.has('common_set')).toBe(true);
    // The whole registry ⇒ the hidden Complete Genome.
    ids = new Set(checkAchievements({ save: withArchive(CARD_POOL.map((c) => c.id)) }).map((a) => a.id));
    expect(ids.has('full_genome')).toBe(true);
  });
});

describe('collapseLadderRungs (Results read, docs/PROGRESSION-SYSTEMS.md §ladders)', () => {
  it('several rungs of one family read as ONE line: top rung, rung count, summed reward; authored rows untouched', () => {
    const authored = ACHIEVEMENTS.filter((a) => !a.ladder).slice(0, 2);
    const family = ACHIEVEMENTS.filter((a) => a.ladder?.family === 'culling').slice(0, 3);
    const other = ACHIEVEMENTS.find((a) => a.ladder?.family === 'hoard')!;
    expect(family).toHaveLength(3);
    const lines = collapseLadderRungs([authored[0], family[0], family[2], other, family[1], authored[1]]);
    expect(lines.map((l) => l.id)).toEqual([authored[0].id, family[2].id, other.id, authored[1].id]);
    expect(lines[1].name).toBe(`${family[2].name} · 3 rungs`);
    expect(lines[1].reward).toBe(family.reduce((s, a) => s + (a.reward ?? 0), 0));
    expect(lines[2].name).toBe(other.name); // a lone rung keeps its own name
  });
});
