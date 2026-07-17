// The arena matchmaker (docs/ONLINE-FOUNDATION.md §relay) — two layers:
//   • peerProblem, the pure peer gate: protocol / season / live-bracket fairness / boot
//     bounds / fingerprint honesty (unit).
//   • the REAL wire: a live ws relay (the same RelayBroker `npm run relay` binds) on an
//     ephemeral port, two RelayTransports pairing through findArenaOpponent, agreeing on ONE
//     matchId/seed — then a mini ArenaSession exchange proving commands + beacons + digests
//     flow through the relay end to end (integration; node's global WebSocket is the client).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { RelayBroker } from '../../functions/lib/arenaRelayRoom';
import type { RelayAction } from '../../functions/lib/arenaRelayRoom';
import { findArenaOpponent, mmRoomKey, peerProblem } from './arenaMatchmaker';
import type { MatchmakerArgs } from './arenaMatchmaker';
import { ArenaSession } from './arenaSession';
import { ArenaMatch } from '../core/arenaMatch';
import type { ArenaBootBundle } from '../core/arenaMatch';
import { PROTOCOL_VERSION, loadoutFingerprint } from '../core/online';
import type { ArenaHello } from '../core/online';
import type { MetaModifiers } from '../core/types';

const NO_META: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0, bonusSlots: 0 };
function boot(): ArenaBootBundle {
  return { meta: { ...NO_META }, heroKind: 'ravager', opts: { mode: 'endless' } };
}
function hello(over: Partial<ArenaHello> = {}): ArenaHello {
  return { proto: PROTOCOL_VERSION, playerId: 'p1', name: 'A', tag: '#0001', power: 1000, rating: 700, season: 3, heroKind: 'ravager', ...over };
}
function card(power: number, over: Partial<ArenaHello> = {}) {
  const h = hello({ power, ...over });
  const b = boot();
  return { hello: h, boot: b, loadout: { fingerprint: loadoutFingerprint([], [b.heroKind], h.power), towerKinds: [], heroKinds: [b.heroKind] } };
}

describe('peerProblem — the pure peer gate', () => {
  const me = { season: 3, power: 1000, elapsedSec: 0 };
  it('accepts a fair same-season peer and rejects protocol/season drift', () => {
    expect(peerProblem(me, card(1000))).toBeNull();
    expect(peerProblem(me, card(1000, { proto: 99 }))).toBe('proto');
    expect(peerProblem(me, card(1000, { season: 4 }))).toBe('season');
  });
  it('enforces the LIVE bracket: tight at 0s, wide at the window end', () => {
    expect(peerProblem(me, card(1400))).toBe('bracket'); // outside ±15% at t=0
    expect(peerProblem({ ...me, elapsedSec: 20 }, card(1400))).toBeNull(); // inside ±60% at t=20
  });
  it('rejects a forged boot bundle and a dishonest loadout fingerprint', () => {
    const forged = card(1000);
    forged.boot.meta = { ...forged.boot.meta, towerDamageMult: 9999 };
    expect(peerProblem(me, forged)).toContain('boot:');
    const lying = card(1000);
    lying.loadout.fingerprint = 12345;
    expect(peerProblem(me, lying)).toBe('fingerprint');
  });
  it('bands by power: same-band players share a key, distant powers do not', () => {
    expect(mmRoomKey(3, 1000)).toBe(mmRoomKey(3, 1100));
    expect(mmRoomKey(3, 1000)).not.toBe(mmRoomKey(3, 4000));
    expect(mmRoomKey(3, 1000)).not.toBe(mmRoomKey(4, 1000)); // seasons never cross
  });
});

describe('the real wire — relay pairing + a live session exchange', () => {
  let http: Server;
  let url = '';
  const sockets = new Map<number, import('ws').WebSocket>();

  beforeAll(async () => {
    const broker = new RelayBroker();
    let nextId = 1;
    http = createServer();
    const wss = new WebSocketServer({ server: http });
    const run = (actions: RelayAction[]): void => {
      for (const a of actions) {
        const ws = sockets.get(a.to);
        if (!ws) continue;
        if (a.kind === 'send') ws.send(a.raw);
        else ws.close(a.code);
      }
    };
    wss.on('connection', (ws, req) => {
      const id = nextId++;
      const room = new URL(req.url ?? '/', 'http://x').searchParams.get('room') ?? '';
      sockets.set(id, ws);
      run(broker.join(id, room));
      ws.on('message', (d, bin) => { if (!bin) run(broker.message(id, d.toString())); });
      ws.on('close', () => { sockets.delete(id); run(broker.leave(id)); });
    });
    await new Promise<void>((res) => http.listen(0, res));
    const addr = http.address();
    url = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });

  afterAll(async () => {
    for (const ws of sockets.values()) ws.terminate();
    await new Promise<void>((res) => http.close(() => res()));
  });

  function mmArgs(name: string, playerId: string): MatchmakerArgs {
    const b = boot();
    const h = hello({ name, playerId });
    return { url, season: 3, power: 1000, hello: h, boot: b, loadout: { fingerprint: loadoutFingerprint([], [b.heroKind], h.power), towerKinds: [], heroKinds: [b.heroKind] } };
  }

  it('two queued clients pair, agree on ONE matchId/seed, and a live session exchange flows', async () => {
    const a = findArenaOpponent(mmArgs('Alpha', 'pa'));
    const b = findArenaOpponent(mmArgs('Beta', 'pb'));
    const [ra, rb] = await Promise.all([a.promise, b.promise]);
    expect(ra).not.toBeNull();
    expect(rb).not.toBeNull();
    expect(ra!.matchId).toBe(rb!.matchId);
    expect(ra!.seed).toBe(rb!.seed);
    expect(ra!.oppHello.name).toBe('Beta');
    expect(rb!.oppHello.name).toBe('Alpha');

    // A short REAL match slice over the relay: both sides sim, A starts its wave (a command
    // across the wire), beacons ride, and B's mirror of A converges on A's own tick.
    const setup = (r: NonNullable<typeof ra>, mine: ArenaBootBundle, theirs: ArenaBootBundle) => new ArenaMatch({
      matchId: r.matchId, seed: r.seed, season: 3, local: mine, remote: theirs, vsAi: false, localPower: 1000, oppPower: 1000, oppRating: 700,
    });
    const matchA = setup(ra!, boot(), ra!.remoteBoot);
    const matchB = setup(rb!, boot(), rb!.remoteBoot);
    const sessA = new ArenaSession(matchA, ra!.transport);
    const sessB = new ArenaSession(matchB, rb!.transport);
    matchA.issueLocal({ k: 'startWave' });
    const t0 = Date.now();
    while (Date.now() - t0 < 1500) {
      sessA.step(1 / 30);
      sessB.step(1 / 30);
      await new Promise((res) => setTimeout(res, 8)); // real sockets need the event loop
    }
    expect(matchA.localGame.stepCount).toBeGreaterThan(0);
    // B's mirror received A's startWave over the relay: its remote sim left prep.
    expect(matchB.remoteGame.waveIndex).toBeGreaterThanOrEqual(matchA.localGame.waveIndex - 1);
    expect(matchB.remoteGame.stepCount).toBeGreaterThan(0);
    expect(sessA.desyncTick).toBeNull();
    expect(sessB.desyncTick).toBeNull();
    sessA.close();
    sessB.close();
    ra!.transport.close();
    rb!.transport.close();
  }, 20_000);

  it('a lone queued client cancels cleanly into the AI fallback (resolves null)', async () => {
    const lone = findArenaOpponent(mmArgs('Gamma', 'pg'));
    setTimeout(() => lone.cancel(), 150);
    expect(await lone.promise).toBeNull();
  });
});
