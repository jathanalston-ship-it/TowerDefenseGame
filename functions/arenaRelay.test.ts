// The relay room broker (docs/ONLINE-FOUNDATION.md §relay) — pure pairing/forwarding
// contract, no sockets: matchmaking keys pair exactly two clients (waiter = role 0), paired
// traffic forwards VERBATIM, unpaired pings are answered by the broker (a waiting client's
// heartbeat must not starve), a leaver's peer holds the room for the reconnect rejoin, and
// direct rooms cap at two occupants.

import { describe, expect, it } from 'vitest';
import { RELAY_CLOSE_FULL, RelayBroker } from './lib/arenaRelayRoom';
import { decodeArenaMessage, encodeArenaMessage } from '../src/core/online';

function paired(actions: ReturnType<RelayBroker['join']>, to: number): { room: string; role: 0 | 1 } {
  const a = actions.find((x) => x.kind === 'send' && x.to === to);
  expect(a, `no send to ${to}`).toBeDefined();
  const msg = decodeArenaMessage((a as { raw: string }).raw);
  expect(msg?.t).toBe('paired');
  return msg as unknown as { room: string; role: 0 | 1 };
}

describe('matchmaking keys (mm:*)', () => {
  it('first client waits; the second pairs both into a fresh room — waiter is role 0', () => {
    const b = new RelayBroker();
    expect(b.join(1, 'mm:s3.p10')).toEqual([]);
    const actions = b.join(2, 'mm:s3.p10');
    const p1 = paired(actions, 1);
    const p2 = paired(actions, 2);
    expect(p1.role).toBe(0);
    expect(p2.role).toBe(1);
    expect(p1.room).toBe(p2.room);
  });

  it('different keys never pair; a third client under the key starts a NEW wait', () => {
    const b = new RelayBroker();
    expect(b.join(1, 'mm:s3.p10')).toEqual([]);
    expect(b.join(2, 'mm:s3.p11')).toEqual([]); // other band — waits separately
    expect(b.join(3, 'mm:s3.p10').length).toBe(2); // pairs with 1
    expect(b.join(4, 'mm:s3.p10')).toEqual([]); // fresh wait
  });

  it('a waiter that disconnects is cleaned up — the next joiner waits instead of pairing a ghost', () => {
    const b = new RelayBroker();
    b.join(1, 'mm:k');
    expect(b.leave(1)).toEqual([]);
    expect(b.join(2, 'mm:k')).toEqual([]); // no ghost pair
  });
});

describe('paired forwarding + unpaired liveness', () => {
  it('forwards paired traffic verbatim and only to the peer', () => {
    const b = new RelayBroker();
    b.join(1, 'mm:k');
    b.join(2, 'mm:k');
    const raw = encodeArenaMessage({ t: 'cmd', tick: 4, seq: 0, cmd: { k: 'startWave' } });
    expect(b.message(1, raw)).toEqual([{ kind: 'send', to: 2, raw }]);
    // The relay is a PIPE for paired sockets — even a non-protocol frame passes untouched.
    expect(b.message(2, 'not-even-json')).toEqual([{ kind: 'send', to: 1, raw: 'not-even-json' }]);
  });

  it('answers an UNPAIRED ping itself (waiting heartbeats never starve) and drops the rest', () => {
    const b = new RelayBroker();
    b.join(1, 'mm:k');
    const out = b.message(1, encodeArenaMessage({ t: 'ping', at: 123 }));
    expect(out).toHaveLength(1);
    expect(decodeArenaMessage((out[0] as { raw: string }).raw)).toMatchObject({ t: 'pong', at: 123 });
    expect(b.message(1, encodeArenaMessage({ t: 'bye' }))).toEqual([]);
  });
});

describe('leave + reconnect (the room HOLDS for the rejoin)', () => {
  it('tells the surviving peer bye, keeps the room, and re-links a direct rejoin', () => {
    const b = new RelayBroker();
    b.join(1, 'mm:k');
    const room = paired(b.join(2, 'mm:k'), 1).room;
    const onLeave = b.leave(2);
    expect(decodeArenaMessage((onLeave[0] as { raw: string }).raw)?.t).toBe('bye');
    // The peer is alone but the room persists — the rejoiner comes back by ROOM id.
    expect(b.join(3, room)).toEqual([]);
    const raw = encodeArenaMessage({ t: 'resyncReq' });
    expect(b.message(3, raw)).toEqual([{ kind: 'send', to: 1, raw }]);
  });

  it('a full direct room refuses a third occupant with 4001', () => {
    const b = new RelayBroker();
    b.join(1, 'mm:k');
    const room = paired(b.join(2, 'mm:k'), 1).room;
    expect(b.join(3, room)).toEqual([{ kind: 'close', to: 3, code: RELAY_CLOSE_FULL }]);
  });

  it('an emptied room is garbage-collected', () => {
    const b = new RelayBroker();
    b.join(1, 'mm:k');
    b.join(2, 'mm:k');
    b.leave(1);
    b.leave(2);
    expect(b.stats()).toEqual({ conns: 0, waiting: 0, rooms: 0 });
  });
});
