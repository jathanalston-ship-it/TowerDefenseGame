// Shared headless auto-player used by the sim + golden characterization tests.
// Not a test file itself (no *.test suffix) — just the harness both import.

import { Game } from './game';
import type { RunOptions } from './game';
import { SIM_DT } from './config';
import { towerSlots } from './map';
import { hiveBestSlot } from './hivemind';
import { deployCost } from './conveyor';
import type { MetaModifiers, TowerKind } from './types';

const NO_META: MetaModifiers = {
  towerDamageMult: 1,
  biomassMult: 1,
  heroDamageMult: 1,
  integrityBonus: 0,
  bonusSlots: 0,
};

const KINDS: TowerKind[] = ['needle', 'mortar', 'reactor'];

export interface AutoOutcome {
  wave: number;
  kills: number;
  integrity: number;
  biomass: number;
  phase: string;
  sawShred: boolean;
}

/** Deterministic strategy: build 3 towers each prep, auto-draft card 0, run waves. */
export function autoplay(seed: number, maxSeconds = 600, opts: RunOptions = {}): AutoOutcome {
  const game = new Game(seed, NO_META, undefined, undefined, undefined, opts);
  let t = 0;
  let sawShred = false;
  let guard = 0;
  while (t < maxSeconds && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 500000) {
    if (game.phase === 'draft') {
      game.chooseCard(game.getSnapshot().draft![0].id);
      continue;
    }
    if (game.phase === 'prep') {
      let placed = 0;
      for (let i = 0; i < towerSlots.length && placed < 3; i++) {
        if (game.placeTower(KINDS[i % 3], towerSlots[i].x, towerSlots[i].y)) placed++;
      }
      game.startWave();
    }
    game.advance(SIM_DT);
    t += SIM_DT;
    for (const f of game.floats) if (f.text === 'SHRED') sawShred = true;
  }
  return {
    wave: game.waveIndex,
    kills: game.kills,
    integrity: Math.round(game.integrity),
    biomass: Math.round(game.biomass),
    phase: game.phase,
    sawShred,
  };
}

// ── Fresh-account campaign PERSONAS (docs/CAMPAIGN.md §curve) ────────────────────────────────
// The Stage 1–3 curve pin (state/campaignCurve.test.ts) and the curve probe drive a campaign Game
// with these. Both place through the PUBLIC deploy APIs onto Hive Intelligence's slot rule.
//   • modest  — the playtest persona: the free gift + the favorite until a 5-tower board, then it
//               banks the rest (the "trivial, trivial, wall" evidence was this player).
//   • builder — spends every prep: each ready belt organism, then the favorite while affordable.
export type CampaignPersona = 'modest' | 'builder';
export interface PersonaOutcome { won: boolean; integrity: number; wave: number; towers: number; biomass: number }

function personaBuild(game: Game, persona: CampaignPersona, favorite: TowerKind): void {
  const cap = persona === 'modest' ? 5 : Infinity;
  for (let guard = 0; guard < 8 && game.towers.length < cap; guard++) {
    const ready = game.conveyor.filter((c) => c.readyAt <= game.time);
    const item = ready.find((c) => c.free === true) ?? (persona === 'builder' ? ready[0] : undefined);
    if (!item || (item.free !== true && game.biomass < deployCost(game.deployments))) break;
    const slot = hiveBestSlot(game, item.kind);
    if (!slot || !game.deployFromConveyor(item.id, slot.x, slot.y)) break;
  }
  for (let guard = 0; guard < 30 && game.towers.length < cap && game.biomass >= deployCost(game.deployments); guard++) {
    const slot = hiveBestSlot(game, favorite);
    if (!slot || !game.deployTower(favorite, slot.x, slot.y)) break;
  }
}

/** Play a (campaign) Game to its end as `persona`; draft pick 0; start each wave right after building. */
export function playPersona(game: Game, persona: CampaignPersona, favorite: TowerKind, maxSeconds = 1800): PersonaOutcome {
  let wasPrep = false;
  for (let t = 0, guard = 0; t < maxSeconds && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 2_000_000; ) {
    if (game.phase === 'draft') {
      game.chooseCard(game.getSnapshot().draft![0].id);
      continue;
    }
    if (game.phase === 'prep') {
      if (!wasPrep) personaBuild(game, persona, favorite);
      wasPrep = true;
      game.startWave();
    } else wasPrep = false;
    game.advance(SIM_DT);
    t += SIM_DT;
  }
  return { won: game.phase === 'won', integrity: game.integrity / game.maxIntegrity, wave: game.waveIndex, towers: game.towers.length, biomass: Math.round(game.biomass) };
}
