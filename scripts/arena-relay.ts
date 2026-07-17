// THE ARENA RELAY (docs/ONLINE-FOUNDATION.md §relay) — a minimal WebSocket room server over
// the pure RelayBroker (functions/lib/arenaRelayRoom.ts). Run it anywhere node runs:
//
//   npm run relay                       # listens on ws://0.0.0.0:8899
//   ARENA_RELAY_PORT=9000 npm run relay
//
// Point clients at it with VITE_ARENA_RELAY_URL=ws://host:8899 at BUILD time — without the
// env the game ships with the relay dormant and every queue resolves to the AI opponent.
// The broker holds ALL the room/pairing semantics; this file only binds sockets, so the same
// logic can move onto a Durable Object without a rewrite (docs/DEPLOYMENT.md §future).

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { RelayBroker } from '../functions/lib/arenaRelayRoom';
import type { RelayAction } from '../functions/lib/arenaRelayRoom';

const port = Number(process.env.ARENA_RELAY_PORT ?? 8899);
const broker = new RelayBroker();
const sockets = new Map<number, WebSocket>();
let nextId = 1;

function run(actions: RelayAction[]): void {
  for (const a of actions) {
    const ws = sockets.get(a.to);
    if (!ws) continue;
    try {
      if (a.kind === 'send') ws.send(a.raw);
      else ws.close(a.code);
    } catch {
      /* a dying socket — its close event cleans up */
    }
  }
}

const http = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`arena-relay ok ${JSON.stringify(broker.stats())}\n`);
});
const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws, req) => {
  const id = nextId++;
  const room = new URL(req.url ?? '/', 'http://relay').searchParams.get('room') ?? '';
  if (room.length === 0 || room.length > 80) {
    ws.close(4000);
    return;
  }
  sockets.set(id, ws);
  run(broker.join(id, room));
  ws.on('message', (data, isBinary) => {
    if (isBinary) return; // the protocol is JSON text frames only
    run(broker.message(id, data.toString()));
  });
  ws.on('close', () => {
    sockets.delete(id);
    run(broker.leave(id));
  });
  ws.on('error', () => {
    /* close follows — the close handler owns cleanup */
  });
});

http.listen(port, () => {
  console.log(`arena-relay listening on ws://0.0.0.0:${port} (rooms via ?room=…)`);
});
