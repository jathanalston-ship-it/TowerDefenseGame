// Spawn Director (STAGES.md §6 — the emission layer). It owns the MECHANICS of putting
// enemies onto the field — spawn spacing, spawn timing, spawn pacing, elite timing, boss
// timing, and special events — and nothing else. It is deliberately decoupled from:
//   • WHAT spawns (composition) — handed in as a scripted WaveDef or an AI-Director wave.
//   • HOW enemies behave (enemy AI / movement) — that lives in game.ts's move system.
// So the same scheduler serves Stage (authored WAVES) and Endless (Director) identically,
// and a future mode/event reuses it by handing it groups. Pure + deterministic: no rng, no
// sim state, no DOM — it just turns "these groups, at this time" into an ordered spawn queue.
//
// Gameplay is preserved EXACTLY: the scheduled queue is byte-identical to the former inline
// spawn code (same arithmetic, same sort), and the difficulty spawn-rate knob defaults to ×1.

import { SPAWN, spawnCount } from './config';
import type { WaveDef } from './config';
import type { DirectorWave } from './director';
import type { EnemyKind } from './types';

/** A single scheduled spawn (sim-time `at`). The Game drains these as `time` advances. */
export interface QueuedSpawn {
  kind: EnemyKind;
  at: number; // sim-time to spawn
  hpMult: number;
  bountyMult: number;
  elite?: boolean; // director-promoted elite (buffed stats) — endless only
}

/** A telegraphed mid-wave event the director can inject (swarm flood is the first). The
 * list is the seam for future special events (e.g. ambush, eruption) — each compiles down
 * to a set of `QueuedSpawn`s, so the Game needs no new spawn code to support them. */
export interface SpecialEvent {
  kind: 'swarm';
  at: number; // sim-time the event begins
  enemyKind: EnemyKind;
  count: number;
  spacing: number; // seconds between the event's spawns (already rate-adjusted)
}

/**
 * Pure spawn scheduler. One instance per run; it carries no state of its own (so it can't
 * drift a deterministic run) — every method is a function of its arguments.
 */
export class SpawnDirector {
  /**
   * Schedule a SCRIPTED wave (Stage mode / golden path). Reproduces the authored timing
   * exactly: each group's i-th member spawns at `now + delay + i*spacing`. `rateMult` (from
   * difficulty) compresses spacing (>1 = faster); at the default 1 the queue is byte-identical.
   */
  scheduleScripted(def: WaveDef, now: number, hpMult: number, bountyMult: number, rateMult = 1): QueuedSpawn[] {
    const out: QueuedSpawn[] = [];
    for (const group of def) {
      const spacing = group.spacing / rateMult;
      const n = spawnCount(group.count); // integer reality — a fractional budget count can't spawn a fraction
      for (let i = 0; i < n; i++) {
        out.push({ kind: group.kind, at: now + group.delay + i * spacing, hpMult, bountyMult, elite: group.elite });
      }
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  /**
   * Schedule a DIRECTED wave (Endless mode). Lays the Director's groups out on the endless
   * cadence (start offset, intra-group spacing, inter-group pacing) and appends the swarm
   * event when flagged. Boss timing is carried on `wave.spawnBoss` (the Game spawns it). At
   * `rateMult` 1 with the default SPAWN tunables the queue is byte-identical to the prior code.
   */
  scheduleDirected(wave: DirectorWave, now: number, hpMult: number, bountyMult: number, rateMult = 1): QueuedSpawn[] {
    const out: QueuedSpawn[] = [];
    let t0 = now + SPAWN.endlessStartOffset;
    const intra = SPAWN.endlessIntraGroup / rateMult;
    for (const g of wave.groups) {
      const n = spawnCount(g.count); // integer reality (director counts are already whole; defensive + uniform)
      for (let i = 0; i < n; i++) {
        out.push({ kind: g.kind, at: t0 + i * intra, hpMult, bountyMult, elite: g.elite });
      }
      t0 += SPAWN.endlessInterGroup;
    }
    for (const ev of this.eventsFor(wave, now, rateMult)) {
      const spacing = ev.spacing;
      for (let i = 0; i < ev.count; i++) {
        out.push({ kind: ev.enemyKind, at: ev.at + i * spacing, hpMult, bountyMult });
      }
    }
    out.sort((a, b) => a.at - b.at);
    return out;
  }

  /** Special events a directed wave injects (extensible). Today: the swarm-event flood. */
  eventsFor(wave: DirectorWave, now: number, rateMult = 1): SpecialEvent[] {
    const events: SpecialEvent[] = [];
    if (wave.swarmEvent) {
      events.push({
        kind: 'swarm',
        at: now + SPAWN.swarmDelay,
        enemyKind: SPAWN.swarmKind,
        count: SPAWN.swarmCount,
        spacing: SPAWN.swarmSpacing / rateMult,
      });
    }
    return events;
  }
}
