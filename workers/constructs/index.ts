// MARKET CONSTRUCTS WORKER (docs/CONSTRUCTS.md) — the always-on host for the game's AI players.
// A Cron Trigger (wrangler.toml) runs the roster every few minutes; each run ticks every construct
// once (play the time owed, visit the market when due, commit the save). GET /status shows the
// roster's latest reports (no credentials). Deployed by the `constructs` job in
// .github/workflows/deploy.yml next to the Pages site, bound to the SAME D1 database.

import { runRoster, rosterStatus } from './roster';

interface WorkerEnv {
  DB: D1Database;
  /** "off" pauses every construct without a redeploy (wrangler.toml [vars] or the dashboard). */
  CONSTRUCTS_ENABLED?: string;
}

// Constructs speak to the backend ONLY through router.ts (in-process). Game code that would
// fetch on its own inside this Worker (sync, telemetry, live events) is refused here, so a
// construct can never leak into player analytics or reach an endpoint off the allowlist.
const refuse = (): Promise<Response> => Promise.reject(new TypeError('constructs: network disabled'));
globalThis.fetch = refuse as typeof fetch;

export default {
  async scheduled(_event: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    if (env.CONSTRUCTS_ENABLED === 'off') return;
    ctx.waitUntil((async () => {
      const reports = await runRoster(env.DB, Date.now());
      // One log line per construct — Workers Logs is the operator's window.
      for (const r of reports) console.log(JSON.stringify(r));
    })());
  },

  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json({ enabled: env.CONSTRUCTS_ENABLED !== 'off', constructs: await rosterStatus(env.DB) });
    }
    return new Response('Not found', { status: 404 });
  },
};
