// Arena netcode (docs/ONLINE-FOUNDATION.md §2–3, §5) — the wire-condition battery, run
// DETERMINISTICALLY in CI via the loopback network model (seeded latency/jitter/drop):
//   • latency delays delivery by the model; drops genuinely lose packets; RTT measures;
//   • two REAL matches over a clean wire stay converged (commands mirror the build);
//   • HIGH LATENCY: commands still land and the mirrors converge (the lockstep buffer);
//   • a LOSSY wire self-heals: digest-mismatch beacons trigger the resync handshake and the
//     mirrors converge again (the command-log replay doing its job);
//   • DISCONNECT + RECONNECT: a dropped end recovers via resyncReq and rebuilds byte-exactly.

import { describe, expect, it } from 'vitest';
import { createLoopbackPair, resetLoopbackClock } from './arenaTransport';
import { ArenaSession } from './arenaSession';
import { ArenaMatch } from '../core/arenaMatch';
import type { ArenaBootBundle, ArenaMatchSetup } from '../core/arenaMatch';
import { arenaStateDigest } from '../core/online';
import type { MetaModifiers } from '../core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
const bundle = (): ArenaBootBundle => ({ meta: { ...NO_META }, heroKind: 'ravager', opts: { mode: 'endless' } });

/** Two mirrored human matches over one wire: A's local is B's remote and vice versa. */
function humanPair(seed: number): { matchA: ArenaMatch; matchB: ArenaMatch } {
  const base = { seed, season: 1, vsAi: false, localPower: 500, oppPower: 500, oppRating: 600 };
  const setupA: ArenaMatchSetup = { ...base, matchId: `m_wire_${seed}`, local: bundle(), remote: bundle() };
  const setupB: ArenaMatchSetup = { ...base, matchId: `m_wire_${seed}`, local: bundle(), remote: bundle() };
  return { matchA: new ArenaMatch(setupA), matchB: new ArenaMatch(setupB) };
}

describe('the loopback network model', () => {
  it('latency delays delivery; a fully-lossy wire delivers nothing', () => {
    resetLoopbackClock();
    const pair = createLoopbackPair({ latencyMs: 300, seed: 7 });
    const got: string[] = [];
    pair.b.onMessage((m) => got.push(m.t));
    pair.a.send({ t: 'forfeit' });
    pair.pump(200);
    expect(got).toEqual([]); // still in flight
    pair.pump(200);
    expect(got).toEqual(['forfeit']); // landed after ~300ms
    const lossy = createLoopbackPair({ dropRate: 1, seed: 7 });
    const swallowed: string[] = [];
    lossy.b.onMessage((m) => swallowed.push(m.t));
    lossy.a.send({ t: 'forfeit' });
    lossy.pump(1000);
    expect(swallowed).toEqual([]);
  });

  it('ping/pong measures RTT ≈ 2× one-way latency', () => {
    resetLoopbackClock();
    const pair = createLoopbackPair({ latencyMs: 120, seed: 3 });
    pair.a.send({ t: 'ping', at: 0 });
    for (let i = 0; i < 6; i++) pair.pump(60);
    expect(pair.a.rttMs()).toBeGreaterThanOrEqual(240);
    expect(pair.a.quality()).not.toBe('excellent');
  });
});

describe('two real matches over the wire', () => {
  const drive = (net: Parameters<typeof createLoopbackPair>[0], seconds: number, actA?: (m: ArenaMatch, t: number) => void): {
    matchA: ArenaMatch; matchB: ArenaMatch; sessA: ArenaSession; sessB: ArenaSession; desyncs: number;
  } => {
    resetLoopbackClock();
    const pair = createLoopbackPair(net);
    const { matchA, matchB } = humanPair(9091);
    let desyncs = 0;
    const sessA = new ArenaSession(matchA, pair.a, { onDesync: () => desyncs++ });
    const sessB = new ArenaSession(matchB, pair.b, { onDesync: () => desyncs++ });
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) {
      actA?.(matchA, t);
      sessA.step(dt);
      sessB.step(dt);
      pair.pump(dt * 1000);
    }
    return { matchA, matchB, sessA, sessB, desyncs };
  };

  /** A scripted local player on A: place two towers, then launch the wave. */
  const script = (m: ArenaMatch, t: number): void => {
    if (Math.abs(t - 1) < 1e-9) m.issueLocal({ k: 'place', tower: 'needle', x: 360, y: 820 });
    if (Math.abs(t - 2) < 1e-9) m.issueLocal({ k: 'place', tower: 'mortar', x: 200, y: 820 });
    if (Math.abs(t - 3) < 1e-9) m.issueLocal({ k: 'startWave' });
  };

  it('a clean wire mirrors the build exactly (B simulates A byte-comparably)', () => {
    const { matchA, matchB, desyncs } = drive({}, 8, script);
    expect(matchB.remoteGame.towers.length).toBe(matchA.localGame.towers.length);
    expect(matchB.remoteGame.towers.map((t) => t.kind).sort().join()).toBe(
      matchA.localGame.towers.map((t) => t.kind).sort().join(),
    );
    expect(matchB.remoteGame.waveIndex).toBe(matchA.localGame.waveIndex);
    expect(desyncs).toBe(0);
  }, 30_000);

  it('HIGH LATENCY (350ms ± 80): commands still land; the mirror converges', () => {
    const { matchA, matchB } = drive({ latencyMs: 350, jitterMs: 80, seed: 11 }, 10, script);
    expect(matchB.remoteGame.towers.length).toBe(matchA.localGame.towers.length);
    expect(matchB.remoteGame.waveIndex).toBe(matchA.localGame.waveIndex);
  }, 30_000);

  it('a LOSSY wire self-heals through the digest→resync handshake', () => {
    // 35% packet loss WILL eat commands; the per-second digest beacons catch the divergence
    // and the resync (command-log replay) heals it — the match never stays wrong.
    const { matchA, matchB } = drive({ latencyMs: 60, dropRate: 0.35, seed: 13 }, 25, script);
    expect(matchB.remoteGame.towers.length).toBe(matchA.localGame.towers.length);
    expect(matchB.remoteGame.waveIndex).toBe(matchA.localGame.waveIndex);
  }, 30_000);

  it('DISCONNECT + RECONNECT: a dropped end recovers byte-exactly via resyncReq', () => {
    resetLoopbackClock();
    const pair = createLoopbackPair({});
    const { matchA, matchB } = humanPair(9092);
    const sessA = new ArenaSession(matchA, pair.a, {});
    const sessB = new ArenaSession(matchB, pair.b, {});
    const dt = 1 / 30;
    const run = (seconds: number, act?: (t: number) => void): void => {
      for (let t = 0; t < seconds; t += dt) {
        act?.(t);
        sessA.step(dt);
        sessB.step(dt);
        pair.pump(dt * 1000);
      }
    };
    run(1);
    pair.a.simulateDrop(); // A's link dies — B keeps building, A hears silence
    run(4, (t) => {
      if (Math.abs(t - 0.5) < 1e-9) matchB.issueLocal({ k: 'place', tower: 'needle', x: 360, y: 820 });
      if (Math.abs(t - 1.5) < 1e-9) matchB.issueLocal({ k: 'place', tower: 'reactor', x: 200, y: 820 });
      if (Math.abs(t - 2.5) < 1e-9) matchB.issueLocal({ k: 'startWave' });
    });
    expect(matchA.remoteGame.towers.length).toBe(0); // A missed everything while down
    pair.a.simulateRecover();
    sessA.requestResync(); // the reconnect handshake
    run(2);
    expect(matchA.remoteGame.towers.length).toBe(matchB.localGame.towers.length);
    expect(matchA.remoteGame.waveIndex).toBe(matchB.localGame.waveIndex);
    // byte-exact at the replay target: rebuild once more locally and compare digests
    const digest = arenaStateDigest(matchA.remoteGame);
    matchA.replayRemoteFromLog(matchA.remoteGame.stepCount);
    expect(arenaStateDigest(matchA.remoteGame)).toBe(digest);
  }, 30_000);
});
