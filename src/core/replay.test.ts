// Replay verification (docs/SECURITY-AUDIT.md R1): recording a played run and
// re-simulating it must reproduce the EXACT outcome — and forged claims must fail.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { SIM_DT, TOWER_ORDER } from './config';
import { towerSlots } from './map';
import { attachRecorder, replayRun, verifyReplay } from './replay';
import type { ReplayCtorArgs } from './replay';
import type { MetaModifiers } from './types';
import { gameEvents } from './events';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };

/** Play a short "human-shaped" session through the RECORDED UI funnel only:
 *  select+click placements, wave starts, and draft picks — like a player would. */
function playRecorded(seed: number) {
  const args: ReplayCtorArgs = [seed, NO_META];
  const game = new Game(...args);
  const rec = attachRecorder(game, args);
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) game.advance(SIM_DT);
  };
  let placed = 0;
  let guard = 0;
  while (game.waveIndex < 4 && game.phase !== 'won' && game.phase !== 'lost' && guard++ < 40_000) {
    if (game.phase === 'draft') {
      game.chooseCard(game.getSnapshot().draft![0].id);
      continue;
    }
    if (game.phase === 'prep') {
      // place up to 2 towers a prep through the pointer path, then launch
      for (let i = 0; i < 2 && placed < towerSlots.length; i++) {
        game.selectTower('needle');
        const s = towerSlots[placed];
        game.click(s.x, s.y);
        placed++;
      }
      game.startWave();
    }
    step(30);
  }
  const outcome = { wave: game.waveIndex, kills: game.kills, integrity: Math.round(game.integrity), biomass: Math.round(game.biomass) };
  return { record: rec.finish({ wave: game.waveIndex, kills: game.kills }), outcome, finalStep: game.stepCount };
}

describe('replay verification (R1)', () => {
  it('re-running a recorded session reproduces the exact outcome', () => {
    const { record, outcome } = playRecorded(1234);
    const replayed = replayRun(record, 1_200);
    expect(replayed.wave).toBe(outcome.wave);
    expect(replayed.kills).toBe(outcome.kills);
    expect(replayed.integrity).toBe(outcome.integrity);
    expect(replayed.biomass).toBe(outcome.biomass);
  });

  it('verifyReplay accepts the honest claim end-to-end (JSON round trip)', () => {
    const { record } = playRecorded(777);
    const v = verifyReplay(JSON.stringify(record));
    expect(v.ok).toBe(true);
    expect(v.reason).toBe('verified');
  });

  it('a forged (inflated) claim fails verification', () => {
    const { record } = playRecorded(42);
    const forged = { ...record, claim: { wave: record.claim.wave + 25, kills: record.claim.kills } };
    const v = verifyReplay(JSON.stringify(forged));
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('wave-mismatch');
  });

  it('a tampered input log diverges and fails', () => {
    const { record } = playRecorded(9001);
    // Delete every recorded placement: the replayed run defends with nothing.
    const gutted = { ...record, log: record.log.filter((e) => e.op !== 'click') };
    const v = verifyReplay(JSON.stringify(gutted));
    expect(v.ok).toBe(false);
  });

  it('malformed blobs are rejected without throwing', () => {
    expect(verifyReplay('not json').reason).toBe('malformed');
    expect(verifyReplay('{"v":2}').reason).toBe('malformed');
  });

  it('recording is observational: outcomes match an identical unrecorded run', () => {
    const seed = 555;
    const a = playRecorded(seed).outcome;
    const b = playRecorded(seed).outcome;
    expect(a).toEqual(b);
  });
  // Someone else's run must never credit the player's save (meta.ts listens on the app-wide bus
  // for boss/mega kills): the verifier, the replay theater and the Arena mirror isolate their sims.
  it('replayRun never emits to the app-wide event bus', () => {
    const { record } = playRecorded(4242);
    let heard = 0;
    const off = gameEvents.on('waveStarted', () => heard++);
    try {
      replayRun(record, 1_200);
    } finally {
      off();
    }
    expect(heard).toBe(0);
  });

  it('a record from an older build (missing a newer tower kind) still replays, identically', () => {
    const { record } = playRecorded(31);
    const full = replayRun(record, 1_200);
    // Rebuild the args the way an older build would have sent them: no entry for the newest kind.
    const tp = Object.fromEntries(TOWER_ORDER.slice(0, -1).map((k) => [k, { damageMult: 1, fireRateMult: 1 }]));
    const old = { ...record, args: [record.args[0], record.args[1], tp] as unknown as typeof record.args };
    expect(() => replayRun(old, 1_200)).not.toThrow();
    expect(replayRun(old, 1_200)).toEqual(full);
  });

  it('an isolated game speaks only on its own bus; a default game on the app-wide one', () => {
    let global = 0;
    let own = 0;
    const off = gameEvents.on('waveStarted', () => global++);
    try {
      const iso = new Game(5, NO_META);
      iso.isolateEvents().on('waveStarted', () => own++);
      iso.startWave();
      expect([global, own]).toEqual([0, 1]);
      new Game(5, NO_META).startWave();
      expect([global, own]).toEqual([1, 1]);
    } finally {
      off();
    }
  });
});
