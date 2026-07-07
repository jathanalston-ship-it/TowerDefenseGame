// Marrow Siphon (docs/SIPHON.md) — the Deep-Strain beam tower. Covers the two things the
// data-driven parametric suites (cards/branches/stars/registry) don't: the BESPOKE beam mechanic
// (lock → Gorge ramp → continuous drain → kill) and the PROGRESSION GATE (deep gene cards + the
// tower's shard eligibility only open at DEEP_STRAIN_STAGE). The golden suite already pins that a
// default run — which never fields the shard-locked siphon — stays byte-identical.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { CARD_POOL, cardSubject, draftCards } from './cards';
import { DEEP_STRAIN_STAGE, SIM_DT, TOWER_DEFS } from './config';
import { towerSlots } from './map';
import { Rng } from './rng';
import type { MetaModifiers } from './types';
import { defaultSave } from '../save/saveStore';
import { eligibleTowerShardPool, isTowerUnlocked } from '../state/meta';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const GATED_IDS = CARD_POOL.filter((c) => c.unlock !== undefined).map((c) => c.id);

describe('Marrow Siphon — the tower definition + gate', () => {
  it('is a beam tower, double-gated (shard-locked AND deep-gated), not a starter', () => {
    const d = TOWER_DEFS.siphon;
    expect(d.firing).toBe('beam');
    expect(d.combatClass).toBe('Vital');
    expect(d.unlockShards).toBeGreaterThan(0); // locked by default
    expect(d.shardGateStage).toBe(DEEP_STRAIN_STAGE); // shards don't drop until the gate
    expect(isTowerUnlocked(defaultSave(), 'siphon')).toBe(false); // a fresh account does not own it
  });

  it('the tower ships 5 gated gene cards + 2 siphon-subject cards (all gated at the deep stage)', () => {
    expect(GATED_IDS.length).toBe(7);
    for (const c of CARD_POOL) if (c.unlock !== undefined) expect(c.unlock).toBe(DEEP_STRAIN_STAGE);
    const siphonCards = CARD_POOL.filter((c) => { const s = cardSubject(c); return s.kind === 'tower' && s.tower === 'siphon'; });
    expect(siphonCards.length).toBe(2);
    for (const c of siphonCards) expect(c.unlock).toBe(DEEP_STRAIN_STAGE); // roster- AND stage-gated
  });
});

describe('shard-drop gate — the siphon is invisible to the loot pool until the stage clears', () => {
  it('eligibleTowerShardPool excludes the siphon below the gate and includes it at/above', () => {
    const fresh = defaultSave();
    expect(eligibleTowerShardPool(fresh)).not.toContain('siphon');
    // every OTHER (ungated) tower is always eligible, even on a fresh account
    for (const k of ['needle', 'maw', 'chrysalis', 'effigy'] as const) expect(eligibleTowerShardPool(fresh)).toContain(k);
    const deep = defaultSave();
    deep.campaign.cleared.standard = DEEP_STRAIN_STAGE;
    expect(eligibleTowerShardPool(deep)).toContain('siphon');
  });
});

describe('draft gate — the deep gene cards only enter the pool once unlocked', () => {
  it('progressStage 0 NEVER drafts a gated card; the deep stage lets them appear', () => {
    const roster = new Set(['needle', 'mortar', 'reactor', 'parasite', 'obelisk', 'maw', 'chrysalis', 'effigy', 'siphon'] as const);
    // Ungated: sample a lot of drafts at progressStage 0 — a gated id must never surface.
    const rng0 = new Rng(12345);
    for (let i = 0; i < 400; i++) {
      for (const c of draftCards(rng0, 3, i % 40, roster, 0)) expect(GATED_IDS).not.toContain(c.id);
    }
    // Unlocked: at the deep stage the gated cards DO appear across enough draws.
    const rng1 = new Rng(777);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const c of draftCards(rng1, 3, 30, roster, DEEP_STRAIN_STAGE)) if (c.unlock !== undefined) seen.add(c.id);
    expect(seen.size).toBeGreaterThan(0); // the gate opened
  });
});

describe('the beam mechanic — lock, Gorge ramp, continuous drain, kill', () => {
  it('locks a target, RAMPS its heat while held, and melts the lane', () => {
    const game = new Game(2, NO_META);
    game.debugAddBiomass(1_000_000);
    let placed = false;
    for (const s of towerSlots) if (game.placeTower('siphon', s.x, s.y)) { placed = true; break; }
    expect(placed).toBe(true);
    const t = game.towers.find((x) => x.kind === 'siphon')!;
    game.startWave();
    let sawLock = false;
    let maxHeat = 0;
    for (let i = 0; i < 3600 && game.phase === 'wave'; i++) { // up to ~60s of wave 1
      game.advance(SIM_DT);
      if ((t.beamTarget ?? -1) >= 0) sawLock = true;
      maxHeat = Math.max(maxHeat, t.beamHeat ?? 0);
    }
    expect(sawLock).toBe(true); // the beam fastened onto a target
    expect(maxHeat).toBeGreaterThan(0); // the Gorge ramp built while it held
    expect(game.kills).toBeGreaterThan(0); // the continuous drain actually kills
  });

  it('a lone siphon feeds the hive — biomass climbs while it drains (income beyond bounty)', () => {
    const game = new Game(5, NO_META);
    game.debugAddBiomass(1_000_000);
    for (const s of towerSlots) if (game.placeTower('siphon', s.x, s.y)) break;
    game.startWave();
    const start = game.biomass;
    for (let i = 0; i < 1800 && game.phase === 'wave'; i++) game.advance(SIM_DT);
    expect(game.biomass).toBeGreaterThan(start); // siphon drain + bounty grew the pool
  });
});
