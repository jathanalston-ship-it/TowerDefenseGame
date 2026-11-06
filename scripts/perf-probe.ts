// PERF PROBE (npm run perf) — how much work the battlefield does per frame, measured the same way
// every time (docs/RENDER-PIPELINE.md §6). Serves the dist/ build, boots a developed account into a
// busy campaign fight (every slot built, a steady stream of enemies) and reports:
//   • FROZEN — a DETERMINISTIC scene (fixed run seed, the sim frozen via hitstop and stepped by hand on
//     a fixed schedule): the game loop's per-frame JS (rAF callback) cost. Same battlefield on every
//     build ⇒ the number to compare when you change the renderer.
//   • FIGHT — the live fight, no input: frame times, loop cost, React commit work per second.
//   • SELECT — the same fight while clicking towers / enemies / the hero and toggling the panels:
//     the cost of each click's handling (selection → synchronous HUD render).
// No ?debug: the debug panel is ~400 DOM nodes re-rendering at 2.5–5 Hz — not what a player runs —
// so the live Game is read off GameView's ref through React's fiber (a probe-only reach).
// Software raster (--disable-gpu): absolute frame times are raster-bound and pessimistic; the
// loop/React costs are the main-thread work a loaded desktop pays too. Informational — no budgets.
// Options: --no-build · --port 4330 · --cpu 4 (CDP CPU throttle, a loaded machine) · --secs 8
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { chromePath } from './chromePath';

const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (k: string, d: number): number => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) || d : d; };
const PORT = opt('--port', 4330);
const CPU = opt('--cpu', 1);
const SECS = opt('--secs', 8);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Stats = { n: number; p50: number; p95: number; p99: number; mean: number };
function stats(v: number[]): Stats {
  const a = [...v].sort((x, y) => x - y);
  const q = (p: number): number => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
  const r = (x: number): number => Math.round(x * 100) / 100;
  return { n: a.length, p50: r(q(0.5)), p95: r(q(0.95)), p99: r(q(0.99)), mean: r(a.reduce((s, x) => s + x, 0) / (a.length || 1)) };
}

/** Page instrumentation, installed before the app boots: rAF-callback cost + frame intervals, React
 *  scheduler task time (React's concurrent work runs in MessageChannel tasks) and commit counts (a
 *  devtools-hook stub), click-handling cost (window pointerup capture → bubble, which spans React's
 *  synchronous selection render), and the fiber reach to the live Game. */
function instrument(): void {
  type W = Window & Record<string, unknown>;
  const w = window as unknown as W;
  const pf = { on: false, raf: [] as number[], gap: [] as number[], last: 0, sched: 0, commits: 0, up: [] as number[], upT0: 0 };
  w.__pf = pf;
  const RAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => RAF((ts) => { const t0 = performance.now(); try { cb(ts); } finally { if (pf.on) pf.raf.push(performance.now() - t0); } });
  const tick = (now: number): void => { if (pf.on) { if (pf.last) pf.gap.push(now - pf.last); pf.last = now; } RAF(tick); };
  RAF(tick);
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, isDisabled: false, renderers: new Map(), inject: () => 1, checkDCE() {}, onScheduleFiberRoot() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onCommitFiberRoot() { if (pf.on) pf.commits++; } };
  const MC = window.MessageChannel;
  const onmsg = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage')!;
  window.MessageChannel = function MessageChannelProbe(this: unknown) {
    const ch = new MC();
    let h: ((ev: MessageEvent) => unknown) | null = null;
    Object.defineProperty(ch.port1, 'onmessage', { configurable: true, get: () => h, set(fn) { h = fn; onmsg.set!.call(ch.port1, fn ? (ev: MessageEvent) => { const t0 = performance.now(); try { return fn(ev); } finally { if (pf.on) pf.sched += performance.now() - t0; } } : fn); } });
    return ch;
  } as unknown as typeof MessageChannel;
  window.addEventListener('pointerup', () => { pf.upT0 = performance.now(); }, true);
  window.addEventListener('pointerup', () => { if (pf.on && pf.upT0) pf.up.push(performance.now() - pf.upT0); pf.upT0 = 0; });
  w.__findGame = (): unknown => {
    const cv = document.querySelector('canvas.board') as (HTMLCanvasElement & Record<string, unknown>) | null;
    const key = cv ? Object.keys(cv).find((k) => k.startsWith('__reactFiber$')) : undefined;
    let f = key ? (cv![key] as { memoizedState?: unknown; return?: unknown } | null) : null;
    while (f) {
      let hk = f.memoizedState as { memoizedState?: { current?: { getRenderState?: unknown } }; next?: unknown } | null;
      while (hk && typeof hk === 'object' && 'next' in hk) {
        if (typeof hk.memoizedState?.current?.getRenderState === 'function') return hk.memoizedState.current;
        hk = hk.next as typeof hk;
      }
      f = f.return as typeof f;
    }
    return null;
  };
}

async function clickThrough(page: Page, pattern: RegExp): Promise<boolean> {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const b = [...document.querySelectorAll('button')].find((x) => re.test(x.textContent?.trim() ?? '') && (x as HTMLElement).offsetParent !== null);
    (b as HTMLElement | undefined)?.click();
    return !!b;
  }, pattern.source);
}
async function dismiss(page: Page): Promise<void> {
  for (let i = 0; i < 8 && (await clickThrough(page, /^(continue|got it|close|claim|collect|skip tutorial|skip|onward|begin|ok|later|✕|×)$|^got it\b/)); i++) await sleep(220);
}

async function window_(page: Page, during?: (i: number) => Promise<void>): Promise<{ raf: Stats; gap: Stats; reactMsPerSec: number; commitsPerSec: number; up: Stats }> {
  await page.evaluate(() => { const p = (window as unknown as { __pf: Record<string, unknown> }).__pf; Object.assign(p, { raf: [], gap: [], last: 0, sched: 0, commits: 0, up: [], on: true }); });
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < SECS * 1000; i++) { if (during) { await during(i); await sleep(250); } else await sleep(250); }
  const r = await page.evaluate(() => { const p = (window as unknown as { __pf: { on: boolean; raf: number[]; gap: number[]; sched: number; commits: number; up: number[] } }).__pf; p.on = false; return { raf: p.raf.filter((v) => v > 0.3), gap: p.gap, sched: p.sched, commits: p.commits, up: p.up }; });
  return { raf: stats(r.raf), gap: stats(r.gap), reactMsPerSec: Math.round((r.sched / SECS) * 10) / 10, commitsPerSec: Math.round((r.commits / SECS) * 10) / 10, up: stats(r.up) };
}

async function main(): Promise<void> {
  if (!args.includes('--no-build')) execSync('npm run build', { stdio: 'inherit' });
  // vite itself (resolved, so a worktree without its own node_modules works) — not `npx vite`.
  const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js');
  const server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-gpu'] }).catch((e) => { server.kill('SIGTERM'); throw e; });
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${PORT}/play/`)).ok) break; } catch { /* not up yet */ } await sleep(250); }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(instrument);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(`http://localhost:${PORT}/play/`, { waitUntil: 'networkidle' });
    await sleep(800);
    await dismiss(page); // a fresh profile boots into the combat tutorial
    await page.evaluate(() => { // a developed account (the app's own save blob, checksum recomputed)
      const blob = JSON.parse(localStorage.getItem('assimilate.save') ?? 'null') as { data: Record<string, unknown>; checksum: string } | null;
      if (!blob) return;
      const d = blob.data as { campaign?: object; mats?: Record<string, number>; prestige?: { molts?: number } };
      Object.assign(blob.data, { campaign: { ...(d.campaign ?? {}), cleared: { standard: 30 }, bestTime: {} }, bestWave: 37, totalRuns: 21, ichor: 3, help: { seen: [], primed: false, hudTour: true } });
      if (d.mats) d.mats.scrap = Math.max(1, d.mats.scrap ?? 0);
      if (d.prestige) d.prestige.molts = Math.max(1, d.prestige.molts ?? 0);
      const s = JSON.stringify(blob.data);
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      blob.checksum = (h >>> 0).toString(36);
      localStorage.setItem('assimilate.save', JSON.stringify(blob));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(700);
    await dismiss(page);
    await page.evaluate(() => (document.querySelector('[data-nav="home"]') as HTMLElement | null)?.click());
    await sleep(600);
    // A FIXED run seed: seeded Math.random + a pinned Date.now around the deploy click (App rolls the seed there).
    await page.evaluate(() => {
      let s = 0x2545f491;
      Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
      const now = Date.now;
      Date.now = () => 1790000000000;
      const btns = [...document.querySelectorAll('button')].filter((b) => (b as HTMLElement).offsetParent !== null);
      for (const re of [/Continue Campaign/, /Fight\b.*\banyway/, /Farm Infinite/, /Deploy/, /Begin/]) { const b = btns.find((x) => re.test(x.textContent ?? '')); if (b) { (b as HTMLElement).click(); break; } }
      Date.now = now;
    });
    await sleep(1800);
    await dismiss(page);
    await sleep(600);
    // Every slot built, then 15 s of sim stepped by hand (render frames interleaved so the render-side
    // trackers see the bodies arrive) — then held frozen.
    const scene = await page.evaluate(async () => {
      type G = { hitstop: number; phase: string; draft: { id: string }[] | null; towers: unknown[]; enemies: { x: number; y: number }[]; particles: unknown[]; floats: unknown[]; unlockedKinds: Set<string>;
        debugAddBiomass(n: number): void; unlockSlots(n: number): void; placeTower(k: string, x: number, y: number): boolean; chooseCard(id: string): void; startWave(): void; debugRefillIntegrity(): void; debugSpawn(k: string, n: number): void; advance(dt: number): void };
      const w = window as unknown as { __game?: G; __findGame(): G | null };
      const g = (w.__game = w.__findGame() ?? undefined);
      if (!g) return null;
      g.hitstop = 1e9; // GameView stops stepping the sim; it keeps rendering
      g.debugAddBiomass(5e6);
      g.unlockSlots(6);
      const kinds = [...g.unlockedKinds].sort();
      let k = 0;
      for (let y = 0; y < 960; y += 6) for (let x = 0; x < 720; x += 6) if (g.placeTower(kinds[k % kinds.length], x, y)) k++;
      const pool = ['runner', 'mite', 'brute', 'flyer', 'knitter', 'bulwark', 'rusher', 'wisp', 'mender', 'bomber', 'larva', 'tank'];
      let i = 0;
      for (let st = 0; st < 900; st++) {
        if (g.phase === 'draft' && g.draft?.length) g.chooseCard(g.draft[0].id);
        if (g.phase === 'prep') g.startWave();
        g.debugRefillIntegrity();
        if (st % 42 === 0 && g.enemies.length < 90) for (let j = 0; j < 4; j++) g.debugSpawn(pool[i++ % pool.length], 4);
        g.advance(1 / 60);
        if (st % 3 === 2) await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      let h = 0;
      for (const e of g.enemies) h = (h * 31 + Math.round(e.x * 10) + Math.round(e.y * 10) * 7) | 0;
      return { towers: g.towers.length, enemies: g.enemies.length, particles: g.particles.length, floats: g.floats.length, hash: h };
    });
    if (!scene) throw new Error('could not reach the live Game (board canvas / GameView ref not found)');
    const cdp = await ctx.newCDPSession(page);
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await sleep(2000); // render-local FX settle on the frozen field
    await window_(page); // JIT warm-up window (discarded)
    const frozen = await window_(page);
    // Unfreeze into the live fight + a steady enemy stream.
    await page.evaluate(() => {
      const g = (window as unknown as { __game: { hitstop: number; phase: string; draft: { id: string }[] | null; enemies: unknown[]; chooseCard(id: string): void; startWave(): void; debugRefillIntegrity(): void; debugSpawn(k: string, n: number): void } }).__game;
      g.hitstop = 0;
      const pool = ['runner', 'brute', 'flyer', 'knitter', 'mite', 'wisp'];
      let i = 0;
      setInterval(() => {
        if (g.phase === 'draft' && g.draft?.length) g.chooseCard(g.draft[0].id);
        if (g.phase === 'prep') g.startWave();
        g.debugRefillIntegrity();
        if (g.enemies.length < 90) for (let j = 0; j < 4; j++) g.debugSpawn(pool[i++ % pool.length], 4);
      }, 700);
    });
    await sleep(3000);
    const fight = await window_(page);
    const box = await page.evaluate(() => { const r = document.querySelector('canvas.board')!.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const select = await window_(page, async (i) => {
      if (i % 6 === 4) { await page.evaluate(() => (document.querySelector('.panel-rail') as HTMLElement | null)?.click()); return; }
      if (i % 6 === 5) { await page.keyboard.press('Escape'); return; }
      const pt = await page.evaluate((kind) => {
        const g = (window as unknown as { __game: { towers: { x: number; y: number }[]; enemies: { x: number; y: number }[]; heroes?: { x: number; y: number; down?: boolean }[] } }).__game;
        const pick = <T,>(a: T[]): T | undefined => a[(Math.random() * a.length) | 0];
        return kind < 2 ? pick(g.towers) : kind === 2 ? g.heroes?.find((h) => !h.down) : pick(g.enemies);
      }, i % 6);
      if (pt) await page.mouse.click(box.x + (pt.x * box.w) / 720, box.y + (pt.y * box.h) / 960);
    });
    const row = (name: string, r: Awaited<ReturnType<typeof window_>>, extra = ''): string =>
      `${name.padEnd(7)} loop JS p50 ${r.raf.p50} p95 ${r.raf.p95} p99 ${r.raf.p99} ms · frame p50 ${r.gap.p50} p95 ${r.gap.p95} p99 ${r.gap.p99} ms (${r.gap.n} frames) · React ${r.reactMsPerSec} ms/s, ${r.commitsPerSec} commits/s${extra}`;
    console.log(`perf-probe · CPU ×${CPU} · ${SECS}s windows · scene ${JSON.stringify(scene)}`);
    console.log(row('FROZEN', frozen));
    console.log(row('FIGHT', fight));
    console.log(row('SELECT', select, ` · click handling p50 ${select.up.p50} p95 ${select.up.p95} p99 ${select.up.p99} ms (${select.up.n} clicks)`));
    if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await browser.close().catch(() => undefined);
    server.kill('SIGTERM');
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
