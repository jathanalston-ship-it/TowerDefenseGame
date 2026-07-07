// Marrow Siphon (docs/SIPHON.md) — the Deep-Strain beam tower. Covers the two things the
// data-driven parametric suites (cards/branches/stars/registry) don't: the BESPOKE beam mechanic
// (lock → Gorge ramp → continuous drain → kill) and the PROGRESSION GATE (deep gene cards + the
// tower's shard eligibility only open at DEEP_STRAIN_STAGE). The golden suite already pins that a
// default run — which never fields the shard-locked siphon — stays byte-identical.

import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { CARD_POOL } from './cards';
import { DEEP_STRAIN_STAGE, SIM_DT, TOWER_DEFS } from './config';
import { towerSlots } from './map';
import type { MetaModifiers } from './types';
import { defaultSave } from '../save/saveStore';
import { cardUnlocked, towerShardPool, unlockedCardIds, isTowerUnlocked } from '../state/meta';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
// The five general Deep-Strain cards + the two Marrow Siphon identity cards this feature ships.
const GENERAL_IDS = ['deep_overclock', 'marrow_feast', 'neural_dominion', 'hollow_bastion', 'apex_ascendant'];
const SIPHON_CARD_IDS = ['gorging_instinct', 'hemophage'];
const card = (id: string) => CARD_POOL.find((c) => c.id === id)!;

describe('Marrow Siphon — the tower definition + gate', () => {
  it('is a beam tower, double-gated (shard-locked AND deep-gated), not a starter', () => {
    const d = TOWER_DEFS.siphon;
    expect(d.firing).toBe('beam');
    expect(d.combatClass).toBe('Vital');
    expect(d.unlockShards).toBeGreaterThan(0); // locked by default
    expect(d.unlockStage).toBe(DEEP_STRAIN_STAGE); // shards don't drop until the gate
    expect(isTowerUnlocked(defaultSave(), 'siphon')).toBe(false); // a fresh account does not own it
  });

  it('the five general cards gate on the deep campaign stage; the two identity cards gate on OWNING the siphon', () => {
    for (const id of GENERAL_IDS) {
      const u = card(id).unlock;
      expect(u).toEqual({ kind: 'campaignStage', stage: DEEP_STRAIN_STAGE });
    }
    for (const id of SIPHON_CARD_IDS) {
      expect(card(id).unlock).toEqual({ kind: 'towerUnlocked', tower: 'siphon' });
    }
  });
});

describe('shard-drop gate — the siphon is invisible to the loot pool until the stage clears', () => {
  it('towerShardPool excludes the siphon below the gate and includes it at/above', () => {
    const fresh = defaultSave();
    expect(towerShardPool(fresh)).not.toContain('siphon');
    // every OTHER (ungated) tower is always eligible, even on a fresh account
    for (const k of ['needle', 'maw', 'chrysalis', 'effigy'] as const) expect(towerShardPool(fresh)).toContain(k);
    const deep = defaultSave();
    deep.campaign.cleared.standard = DEEP_STRAIN_STAGE;
    expect(towerShardPool(deep)).toContain('siphon');
  });
});

describe('draft gate — the deep gene cards only enter the pool once unlocked', () => {
  it('a fresh account NEVER earns a Deep-Strain card; the deep stage unlocks the five general cards', () => {
    const fresh = defaultSave();
    for (const id of [...GENERAL_IDS, ...SIPHON_CARD_IDS]) expect(cardUnlocked(fresh, card(id))).toBe(false);
    const deep = defaultSave();
    deep.campaign.cleared.standard = DEEP_STRAIN_STAGE;
    for (const id of GENERAL_IDS) expect(cardUnlocked(deep, card(id))).toBe(true); // stage-gated open
    for (const id of SIPHON_CARD_IDS) expect(cardUnlocked(deep, card(id))).toBe(false); // still need to OWN the siphon
    const owned = { ...deep, towerUnlocked: [...deep.towerUnlocked, 'siphon' as const] };
    for (const id of SIPHON_CARD_IDS) expect(cardUnlocked(owned, card(id))).toBe(true);
    // the unlocked-id set (fed to draftCards) reflects it
    expect(unlockedCardIds(fresh)).not.toContain('deep_overclock');
    expect(unlockedCardIds(deep)).toContain('deep_overclock');
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
      if (t.beamTarget >= 0) sawLock = true;
      maxHeat = Math.max(maxHeat, t.beamHeat);
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
