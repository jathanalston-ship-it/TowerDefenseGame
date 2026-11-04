// FIRST-SESSION PROBE (npm run probe:first-session) — a repeatable headless new-player playthrough.
//
// Builds (or reuses --dist), serves `vite preview`, opens /play/ in a FRESH context at 1440x900 and plays:
//   skip cutscene → combat tutorial → commissioning → hub tour → Campaign Stage 1 at 5× (towers, waves,
//   drafts) → results → hub.
// It records how fast the first session feels (time to first tower / wave / reward), how noisy the first
// return to the hub is (modal dialogs + toasts after the first run, nav badges), whether anything threw
// (page + console errors), and what the browser had to download (emitted JS/CSS, boot JS gzip).
// It writes docs/FIRST_SESSION_REPORT.md (generated, dated) and exits 1 when a BUDGET below is violated.
//
// Options:
//   --dist <dir>      reuse a built dir (must contain play/index.html); default: build into a temp dir
//   --port <n>        preview port (default 4331)
//   --offline         after the session, reload /play/ offline (service worker) and start a run again
//   --no-report       don't write docs/FIRST_SESSION_REPORT.md (print only)
//   --shots <dir>     save step screenshots there
// Docs: docs/FIRST-SESSION-PROBE.md. Driver philosophy: react to what is on screen (data-tut / role / text
// selectors with fallbacks); when a step cannot proceed, fail naming the step — never hang.

import { chromium, type Page, type BrowserContext } from 'playwright-core';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// ─────────────────────────── BUDGETS (the one place to tune) ───────────────────────────
const BUDGETS = {
  pageErrors: 0, //                     uncaught exceptions + console.error (ignoring /api/* 404s)
  modalsAfterFirstRun: 3, //            distinct dialogs shown between the first results and the hub going quiet
  timeToFirstTowerSec: 15, //           /play/ navigation → first tower placed, cutscene skipped
  bootJsGzipKb: 560, //                 gzip of the static entry closure (what the HTML must load before ANY screen)
} as const;

const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (n: string): boolean => args.includes(`--${n}`);
const opt = (n: string): string | undefined => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const PORT = Number(opt('port') ?? 4331);
/** Same override env as mobilecheck/cogload; otherwise the newest preinstalled headless shell, else Playwright's own default. */
function chromePath(): string | undefined {
  if (process.env.MOBILECHECK_CHROMIUM) return process.env.MOBILECHECK_CHROMIUM;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const shells = readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of shells) {
    for (const rel of ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) { const p = join(base, d, rel); if (existsSync(p)) return p; }
  }
  const full = readdirSync(base).filter((d) => /^chromium-\d+/.test(d)).sort().reverse();
  for (const d of full) {
    for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) { const p = join(base, d, rel); if (existsSync(p)) return p; }
  }
  return undefined;
}
const ROOT = new URL('..', import.meta.url).pathname;
const SHOTS = opt('shots');
const BASE = `http://localhost:${PORT}`;

// ─────────────────────────────────── helpers ───────────────────────────────────
class StepError extends Error { constructor(public step: string, msg: string) { super(`[${step}] ${msg}`); } }
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const now = (): number => (Date.now() - T0) / 1000;
const log = (m: string): void => console.log(`${now().toFixed(1).padStart(6)}s  ${m}`);

interface Metrics {
  timeToFirstTower: number | null; timeToFirstWave: number | null; timeToFirstReward: number | null;
  cutsceneSkippedAt: number | null; tutorialDoneAt: number | null; hubAt: number | null; firstRunStartAt: number | null; firstRunEndAt: number | null;
  modalsAfterRun: string[]; toastsAfterRun: string[]; toastsTotal: number; badgesHub: string[]; badgeTotal: number;
  errors: string[]; ignored404: number; steps: { name: string; at: number; note?: string }[];
  bootJs: { files: number; gzipKb: number }; firstScreenJs: { files: number; gzipKb: number }; homeJs: { files: number; gzipKb: number }; runJs: { files: number; gzipKb: number };
  offline: string | null; failedStep: string | null; failMessage: string | null; stage1Result: string | null;
}
const M: Metrics = {
  timeToFirstTower: null, timeToFirstWave: null, timeToFirstReward: null, cutsceneSkippedAt: null, tutorialDoneAt: null, hubAt: null,
  firstRunStartAt: null, firstRunEndAt: null, modalsAfterRun: [], toastsAfterRun: [], toastsTotal: 0, badgesHub: [], badgeTotal: 0,
  errors: [], ignored404: 0, steps: [], bootJs: { files: 0, gzipKb: 0 }, firstScreenJs: { files: 0, gzipKb: 0 }, homeJs: { files: 0, gzipKb: 0 }, runJs: { files: 0, gzipKb: 0 },
  offline: null, failedStep: null, failMessage: null, stage1Result: null,
};
let currentStep = 'boot';
let livePage: Page | null = null; // for the blocked-step screenshot
function step(name: string, note?: string): void { currentStep = name; M.steps.push({ name, at: +now().toFixed(1), note }); log(`▶ ${name}${note ? ` — ${note}` : ''}`); }
let shotN = 0;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`) }).catch(() => undefined);
}

/** Installed before any page script: passively records dialogs + toasts as they appear (never alters the page). */
const OBSERVER = `(() => {
  const P = (window.__probe = { dialogs: [], toasts: [], mark: 'boot', firstScreen: 0 });
  const fs = () => { if (!P.firstScreen && document.querySelector('.intro, .tut-overlay, .tut-callout')) P.firstScreen = performance.now(); };
  const NON_MODAL = /hero combat console|status$/i;
  const TOAST = '.rwt2, .loot-toast, .ptoast, .swtoast, .acct-toast, .lvl-toast, [class*="toast" i]';
  const seen = new WeakSet();
  const label = (el) => (el.getAttribute('aria-label') || (el.querySelector('h1,h2,h3,.title,[class*=title]') || {}).textContent || el.className || '').toString().replace(/\\s+/g, ' ').trim().slice(0, 80);
  const scan = (root) => {
    if (!root.querySelectorAll) return;
    const dl = root.matches && root.matches('[role=dialog]') ? [root, ...root.querySelectorAll('[role=dialog]')] : [...root.querySelectorAll('[role=dialog]')];
    for (const el of dl) { if (seen.has(el)) continue; seen.add(el); const hd = ((el.querySelector('h1,h2,h3,[class*=title],[class*=name]') || {}).textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50); const l0 = label(el); const l = hd && !l0.includes(hd) ? l0 + ' | ' + hd : l0; if (NON_MODAL.test(l)) continue; P.dialogs.push({ t: Date.now(), mark: P.mark, label: l, cls: String(el.className).slice(0, 40) }); }
    const tl = root.matches && root.matches(TOAST) ? [root, ...root.querySelectorAll(TOAST)] : [...root.querySelectorAll(TOAST)];
    for (const el of tl) { if (seen.has(el)) continue; if (el.parentElement && el.parentElement.closest(TOAST)) continue; seen.add(el); P.toasts.push({ t: Date.now(), mark: P.mark, label: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 70) }); }
  };
  new MutationObserver((muts) => { fs(); for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); }).observe(document, { childList: true, subtree: true });
})();`;

// ─────────────────────────────── build + serve ───────────────────────────────
function buildDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'probe-dist-'));
  log(`building → ${dir}`);
  execSync(`npx vite build --outDir ${dir} --emptyOutDir`, { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production' } }); // vite-node sets NODE_ENV=development; a dev React build would poison every number
  execSync(`node scripts/stamp-sw.mjs ${dir}`, { cwd: ROOT, stdio: 'ignore' });
  return dir;
}

interface Emitted { file: string; kind: 'js' | 'css'; raw: number; gzip: number }
function emitted(dist: string): Emitted[] {
  const dir = join(dist, 'assets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(js|css)$/.test(f)).map((f) => {
    const buf = readFileSync(join(dir, f));
    return { file: f, kind: f.endsWith('.css') ? 'css' as const : 'js' as const, raw: statSync(join(dir, f)).size, gzip: gzipSync(buf).length };
  }).sort((a, b) => b.raw - a.raw);
}

/** The boot chunk set: scripts the HTML references + their STATIC imports (never dynamic `import()`), recursively.
 *  Deterministic (no timing noise) — this is what code-splitting shrinks and what the boot budget measures. */
function bootClosure(dist: string): { files: number; gzipKb: number } {
  const html = readFileSync(join(dist, 'play', 'index.html'), 'utf8');
  const todo = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const seen = new Set<string>();
  let gz = 0;
  while (todo.length) {
    const u = todo.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    const p = join(dist, u);
    if (!existsSync(p)) continue;
    const buf = readFileSync(p);
    gz += gzipSync(buf).length;
    for (const m of buf.toString('utf8').matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) todo.push(`/assets/${m[1]}`);
  }
  return { files: seen.size, gzipKb: +(gz / 1024).toFixed(1) };
}

// ─────────────────────────────── on-screen primitives ───────────────────────────────
type Pt = { x: number; y: number };
async function clickBox(page: Page, sel: string, opts?: { text?: RegExp; last?: boolean }): Promise<boolean> {
  const handles = await page.$$(sel);
  const list = opts?.last ? handles.reverse() : handles;
  for (const h of list) {
    if (opts?.text) { const tx = (await h.innerText().catch(() => '')) || ''; if (!opts.text.test(tx)) continue; }
    const bb = await h.boundingBox().catch(() => null);
    if (!bb || bb.width < 2 || bb.height < 2) continue;
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    return true;
  }
  return false;
}
const bodyText = (page: Page, n = 4000): Promise<string> => page.evaluate((k) => document.body.innerText.slice(0, k).replace(/\s+/g, ' '), n);
async function waitFor(page: Page, what: string, fn: () => Promise<boolean>, timeoutMs: number, everyMs = 250): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { try { if (await fn()) return; } catch { /* navigation / re-render race: poll again */ } await sleep(everyMs); }
  throw new StepError(currentStep, `timed out after ${(timeoutMs / 1000).toFixed(0)}s waiting for ${what}. Screen: "${(await bodyText(page, 260))}"`);
}

/** The slot grid used by the player AI — lanes the board exposes in the 1440x900 layout (from the prior playtest). */
const SLOTS: Pt[] = [];
for (const y of [672, 623, 722]) for (const x of [720, 670, 768, 622, 818, 572, 866]) SLOTS.push({ x, y });
const usedSlots = new Set<string>();
let slotCursor = 0;
/** Click up to a few untried lane slots with a tower armed; a slot counts as used only when biomass actually fell. */
async function placeTower(page: Page): Promise<boolean> {
  for (let tries = 0; tries < 5; tries++) {
    const free = SLOTS.filter((p) => !usedSlots.has(`${p.x},${p.y}`));
    if (free.length === 0) return false;
    const p = free[slotCursor % free.length];
    slotCursor++;
    const before = await biomass(page);
    await page.mouse.click(p.x, p.y);
    await sleep(350);
    const after = await biomass(page);
    if (before !== null && after !== null && after < before) { usedSlots.add(`${p.x},${p.y}`); return true; } // biomass fell: a tower stands
  }
  return false;
}
async function biomass(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const e = document.querySelector('[data-tut="biomass"]');
    const m = e ? e.textContent?.match(/(\d[\d,]*)/) : null;
    return m ? Number(m[1].replace(/,/g, '')) : null;
  });
}

// ─────────────────────────────── the run player ───────────────────────────────
interface RunOpts { name: string; maxSec: number; speed5: boolean; stopWhen: (page: Page, text: string) => Promise<boolean>; onTick?: (page: Page, text: string) => Promise<void> }
let firstTowerMarked = false;
const modalViews = new Set<string>(); // distinct dialog views seen while draining popups (a queue reuses ONE element)
function markTower(): void { if (!firstTowerMarked) { firstTowerMarked = true; M.timeToFirstTower = +now().toFixed(1); log(`first tower placed @ ${M.timeToFirstTower}s`); } }

/** Reactive player: every tick look at the screen and do the one obvious thing (draft → pick, build phase → spend + start). */
async function playRun(page: Page, o: RunOpts): Promise<void> {
  const end = Date.now() + o.maxSec * 1000;
  let speedSet = false; let lastLog = 0; let idleTicks = 0; let lastCallout = ''; let towersPlaced = 0;
  while (Date.now() < end) {
    await sleep(400);
    const text = await bodyText(page, 1800);
    if (await o.stopWhen(page, text)) return;
    if (o.onTick) await o.onTick(page, text);
    if (!M.timeToFirstWave && /hostiles in the field/i.test(text)) { M.timeToFirstWave = +now().toFixed(1); log(`first wave in combat @ ${M.timeToFirstWave}s`); }
    if (!M.timeToFirstReward && /Genome Cores/i.test(text) && /LINE HOLDS|VICTORY|STAGE CLEAR|\+\d+ Genome/i.test(text)) { M.timeToFirstReward = +now().toFixed(1); log(`first reward @ ${M.timeToFirstReward}s`); }
    // gene-card draft
    if (await page.$('.overlay .cards')) {
      await page.keyboard.press('1');
      await sleep(400);
      if (await page.$('.overlay .cards')) { await clickBox(page, '.overlay .cards button'); await sleep(300); }
      continue;
    }
    // tutorial / generic callout buttons (Continue / Next / Got it) — only plain "advance" buttons
    const calloutBtn = await page.$('.tut-callout button');
    if (calloutBtn) {
      const label = ((await calloutBtn.innerText().catch(() => '')) || '').trim();
      if (!/skip/i.test(label)) { await clickBox(page, '.tut-callout button'); await sleep(350); continue; }
    }
    // build phase: deploy what we can afford, start the wave
    const start = await page.$('button:has-text("Start Wave")');
    if (start) {
      for (let k = 0; k < 4; k++) {
        const free = await page.$('.conveyor button:has-text("Deploy")');
        const bio = await biomass(page);
        const fav = await page.$('[data-tut="tower-card-first"]');
        let armed = false;
        if (free && (await free.isEnabled().catch(() => false))) { await clickBox(page, '.conveyor button:has-text("Deploy")'); armed = true; }
        else if (fav && bio !== null && bio >= (await favCost(page))) { await clickBox(page, '[data-tut="tower-card-first"]'); armed = true; }
        if (!armed) break;
        await sleep(250);
        if (await placeTower(page)) markTower(); else break;
      }
      await page.keyboard.press('Escape');
      if (o.speed5 && !speedSet) { speedSet = await clickBox(page, '.speed-btn', { text: /5×|5x/ }); }
      await page.keyboard.press('Space');
      await sleep(250);
      if (await page.$('button:has-text("Start Wave")')) await clickBox(page, 'button:has-text("Start Wave")');
      continue;
    }
    // Tutorial objectives (no Start Wave button — deployment is scripted): do the one obvious thing per tick.
    const callout = await page.evaluate(() => document.querySelector('.tut-callout')?.textContent?.replace(/\s+/g, ' ').slice(0, 90) ?? '');
    if (callout && callout !== lastCallout) { lastCallout = callout; log(`  tutorial: ${callout}`); }
    if (callout && !/favorite|starred|growth|deploy|place|slot|tower|conveyor|mortar|spitter|ability|apex|leap|cast|hero/i.test(callout)) continue; // a narrated beat: let it finish
    const conv = await page.$('.conveyor button:has-text("Deploy")');
    const bio = await biomass(page);
    if (process.env.PROBE_DEBUG) log(`  tick bio=${bio} conv=${!!conv} fav=${!!(await page.$('[data-tut="tower-card-first"]'))} cost=${await favCost(page)} placed=${towersPlaced} marked=${firstTowerMarked}`);
    const favFirst = !firstTowerMarked && !!(await page.$('[data-tut="tower-card-first"]')) && bio !== null && bio >= (await favCost(page));
    if (!favFirst && conv && (await conv.isEnabled().catch(() => false)) && (callout || towersPlaced < 3)) {
      await clickBox(page, '.conveyor button:has-text("Deploy")');
      await sleep(250);
      if (await placeTower(page)) { markTower(); towersPlaced++; }
    } else if (towersPlaced < 3 && bio !== null && (await page.$('[data-tut="tower-card-first"]')) && bio >= (await favCost(page))) {
      await clickBox(page, '[data-tut="tower-card-first"]');
      await sleep(250);
      if (await placeTower(page)) { markTower(); towersPlaced++; }
    } else if (callout && /ability|apex|leap|cast|hero/i.test(callout) && idleTicks % 3 === 0) {
      await page.keyboard.press('q');
      await sleep(250);
      await page.mouse.click(720, 450);
    }
    if (Date.now() - lastLog > 20_000) { lastLog = Date.now(); log(`  [${o.name}] ${text.slice(0, 110)}`); }
    idleTicks++;
  }
  throw new StepError(currentStep, `${o.name}: not finished after ${o.maxSec}s (idle ticks ${idleTicks}). Screen: "${await bodyText(page, 300)}"`);
}
async function favCost(page: Page): Promise<number> {
  return page.evaluate(() => {
    const f = document.querySelector('[data-tut="tower-card-first"]') as HTMLElement | null;
    const m = f?.innerText.match(/(\d+)\s*\n?\s*\d+\s*dps/);
    return m ? Number(m[1]) : 9999;
  });
}

/** Click through hub popups; counts nothing itself (the page-side observer counts) — returns when the hub is quiet. */
async function drainHubPopups(page: Page, maxSec: number): Promise<number> {
  const end = Date.now() + maxSec * 1000; let clicks = 0; let quiet = 0;
  while (Date.now() < end && quiet < 4) {
    await sleep(600);
    const { pressed, desc } = await page.evaluate(() => {
      const vis = (e: Element): boolean => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.top < innerHeight && r.bottom > 0; };
      const dlgs = [...document.querySelectorAll('[role=dialog], .overlay, .ps-overlay, .whatsnew, .evo-unlock')].filter(vis);
      const desc = dlgs.map((d) => {
        const l0 = (d.getAttribute('aria-label') ?? d.className.toString().slice(0, 24)).replace(/\s+/g, ' ').trim().slice(0, 80);
        const hd = (d.querySelector('h1,h2,h3,[class*=title],[class*=name]')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
        return hd && !l0.includes(hd) ? `${l0} | ${hd}` : l0;
      });
      if (dlgs.length === 0) return { pressed: null, desc };
      const pats = [/^got it/i, /^next \(\d/i, /^continue/i, /^collect/i, /^claim/i, /^done/i, /^close/i, /^dismiss/i, /^later/i, /^ok\b/i, /^onward/i, /^skip/i, /^✕|^×/];
      for (const d of dlgs) {
        const bs = [...d.querySelectorAll('button')].filter(vis) as HTMLButtonElement[];
        for (const p of pats) { const b = bs.find((x) => p.test((x.innerText || x.getAttribute('aria-label') || '').trim())); if (b) { b.click(); return { pressed: (b.innerText || '').trim().slice(0, 30), desc }; } }
      }
      return { pressed: 'none', desc };
    });
    for (const d of desc) if (!/hero combat console|status$/i.test(d)) modalViews.add(d);
    if (pressed === null) { quiet++; continue; }
    quiet = 0;
    if (pressed === 'none') { await page.keyboard.press('Escape'); await sleep(300); }
    clicks++;
  }
  return clicks;
}

// ─────────────────────────────── the session ───────────────────────────────
async function session(ctx: BrowserContext, dist: string): Promise<Page> {
  const page = await ctx.newPage();
  livePage = page;
  let navs = 0;
  page.on('framenavigated', (f) => { if (f === page.mainFrame() && ++navs > 1) log(`  ! main frame navigated again (#${navs}) → ${f.url()}`); });
  await page.addInitScript(OBSERVER);
  page.on('pageerror', (e) => M.errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url ?? '';
    if (/\/api\//.test(loc) || /\/api\//.test(m.text()) || /Failed to load resource.*(404|405|500)/i.test(m.text())) { M.ignored404++; return; }
    M.errors.push(`console.error: ${m.text().slice(0, 200)}`);
  });

  /** JS the PAGE fetched (resource timing — service-worker precache traffic excluded), optionally only up to `untilMs`. */
  const jsAt = async (untilMs?: number): Promise<{ files: number; gzipKb: number }> => {
    const urls = await page.evaluate((until) => [...new Set((performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((r) => /\.js$/.test(new URL(r.name).pathname) && (until === undefined || r.responseEnd <= until))
      .map((r) => new URL(r.name).pathname))], untilMs);
    let g = 0;
    for (const u of urls) { const p = join(dist, u); if (existsSync(p)) g += gzipSync(readFileSync(p)).length; }
    return { files: urls.length, gzipKb: +(g / 1024).toFixed(1) };
  };

  // 1 ── boot + cutscene
  step('boot', 'goto /play/');
  const navStart = now();
  await page.goto(`${BASE}/play/`, { waitUntil: 'load' });
  await waitFor(page, 'the intro cutscene (.intro) or the tutorial to appear', async () => !!(await page.$('.intro, .tut-overlay, .tut-callout')), 25_000);
  M.bootJs = bootClosure(dist);
  M.firstScreenJs = await jsAt();
  log(`boot JS (static entry closure): ${M.bootJs.files} files, ${M.bootJs.gzipKb} KB gzip; first screen up in ${(now() - navStart).toFixed(1)}s with ${M.firstScreenJs.files} files / ${M.firstScreenJs.gzipKb} KB gzip fetched`);
  await shot(page, 'boot');
  step('skip-cutscene');
  if (await page.$('.intro')) {
    await sleep(900); // let the "receive" gate arm
    const skipped = await clickBox(page, '.intro button, .intro [role=button]', { text: /skip/i }) || await clickBox(page, '.intro >> text=Skip');
    if (!skipped) { await page.mouse.click(720, 474); await sleep(600); await clickBox(page, '.intro button', { text: /skip|descend/i }); }
    await waitFor(page, 'the cutscene to close', async () => !(await page.$('.intro')), 15_000);
  }
  M.cutsceneSkippedAt = +now().toFixed(1);

  // 2 ── combat tutorial (reactive player until commissioning appears)
  step('combat-tutorial');
  await playRun(page, {
    name: 'tutorial', maxSec: Number(process.env.PROBE_TUT_SEC ?? 240), speed5: true,
    stopWhen: async (_p, text) => /Begin Commissioning|Confirm designation|COMMISSION/i.test(text),
  });
  await shot(page, 'commissioning');
  M.tutorialDoneAt = +now().toFixed(1);

  // 3 ── commissioning (designation → identity → safeguard → guest)
  step('commissioning');
  const commission = async (): Promise<void> => {
    for (let i = 0; i < 40; i++) {
      const text = await bodyText(page, 2500);
      if (await page.$('[data-nav="home"], .hub, nav')) { if (!/Begin Commissioning|Confirm designation|Swear it|Continue as Guest/i.test(text)) return; }
      if (/Begin Commissioning/i.test(text)) { await clickBox(page, 'button', { text: /Begin Commissioning/i }); }
      else if (await page.$('input')) {
        const inp = await page.$('input[type=text], input:not([type])'); if (inp) await inp.fill('Probe');
        await sleep(200); await clickBox(page, 'button', { text: /Confirm designation/i });
      }
      else if (/Swear it/i.test(text)) { await clickBox(page, 'button', { text: /Swear it/i }); }
      else if (/The Swarm/i.test(text) && /Brood|Cultivator|identity/i.test(text)) { await clickBox(page, 'text=The Swarm'); await sleep(200); await clickBox(page, 'text=Brood Cultivator'); await sleep(200); await clickBox(page, 'button', { text: /Swear it|Confirm|Continue/i }); }
      else if (/Continue as Guest/i.test(text)) { await clickBox(page, 'button', { text: /Continue as Guest/i }); }
      else if (/Confirm designation|designation/i.test(text) && !(await page.$('input'))) { await clickBox(page, 'button', { text: /continue|confirm|next/i }); }
      await sleep(900);
    }
    throw new StepError(currentStep, `commissioning did not reach the hub. Screen: "${await bodyText(page, 300)}"`);
  };
  await commission();

  // 4 ── hub + tour
  step('hub-tour');
  await waitFor(page, 'the hub shell (a [data-nav] item)', async () => !!(await page.$('[data-nav], .hub-door, nav button')), 20_000);
  M.hubAt = +now().toFixed(1);
  M.homeJs = await jsAt();
  await shot(page, 'hub-first');
  for (let i = 0; i < 14; i++) { // finish or skip the orientation tour; popups dismissed along the way
    const tourBtn = await page.$('button:has-text("Skip tour"), button:has-text("Skip")');
    const next = await page.$('button:has-text("Next"), button:has-text("Finish"), button:has-text("Done")');
    const isTour = /FIELD ORIENTATION|ORIENTATION/i.test(await bodyText(page, 1500));
    if (!isTour) break;
    if (next) await clickBox(page, 'button:has-text("Next"), button:has-text("Finish"), button:has-text("Done")'); else if (tourBtn) await clickBox(page, 'button:has-text("Skip")'); else break;
    await sleep(700);
  }
  await drainHubPopups(page, 6);

  // 5 ── Campaign Stage 1
  step('campaign-stage-1', 'start from Home');
  await clickBox(page, '[data-nav="home"]');
  await sleep(500);
  await startCampaign(page);
  M.firstRunStartAt = +now().toFixed(1);
  M.runJs = await jsAt();
  firstTowerMarked = firstTowerMarked || false;
  usedSlots.clear();
  await page.evaluate(() => { (window as unknown as { __probe: { mark: string } }).__probe.mark = 'run1'; });
  await playRun(page, {
    name: 'campaign-1', maxSec: 420, speed5: true,
    stopWhen: async (_p, text) => /VICTORY|DEFEAT|STAGE CLEAR|HIVE FELL|OVERRUN|RUN COMPLETE/i.test(text) || !!(await page.$('.results-screen')),
  });
  M.firstRunEndAt = +now().toFixed(1);
  await page.waitForSelector('.results-screen', { timeout: 8000 }).catch(() => undefined);
  M.stage1Result = ((await page.evaluate(() => document.querySelector('.results-screen')?.textContent?.match(/VICTORY|DEFEAT|STAGE CLEAR|EXTRACTED/i)?.[0] ?? null)) || 'ended');
  await sleep(1500);
  await shot(page, 'results');

  // 6 ── results → hub (counting what pops after the first run)
  step('results-to-hub');
  modalViews.clear();
  await page.evaluate(() => { (window as unknown as { __probe: { mark: string } }).__probe.mark = 'after-run1'; });
  for (let i = 0; i < 12; i++) { // results screen: Continue (several taps while rewards tally)
    if (!(await page.$('.results-screen'))) break;
    await clickBox(page, '.results-screen button', { text: /^(continue|collect|return|home|next)/i, last: true });
    await sleep(900);
  }
  await waitFor(page, 'the hub after results', async () => !!(await page.$('[data-nav], .hub-door')) && !(await page.$('.results-screen')), 20_000);
  await drainHubPopups(page, 25);
  await sleep(1500);
  await shot(page, 'hub-after-run1');
  const probe = await page.evaluate(() => (window as unknown as { __probe: { dialogs: { mark: string; label: string }[]; toasts: { mark: string; label: string }[] } }).__probe);
  const after = (m: string): boolean => m === 'after-run1';
  M.modalsAfterRun = [...new Set([...probe.dialogs.filter((d) => after(d.mark)).map((d) => d.label), ...modalViews])];
  M.toastsAfterRun = probe.toasts.filter((d) => after(d.mark)).map((d) => d.label);
  M.toastsTotal = probe.toasts.length;
  // nav badges on the first hub landing after the run
  await clickBox(page, '[data-nav="home"]');
  await sleep(600);
  M.badgesHub = await page.evaluate(() => {
    const vis = (e: Element): boolean => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll('.nav-badge')].filter(vis).map((e) => `${(e.closest('button, a')?.textContent ?? '?').replace(/\s+/g, ' ').trim().slice(0, 24)}=${(e.textContent ?? '').trim() || '•'}`);
  });
  M.badgeTotal = M.badgesHub.length;
  log(`hub after run 1: ${M.modalsAfterRun.length} modals [${M.modalsAfterRun.join(' | ')}], ${M.toastsAfterRun.length} toasts, ${M.badgeTotal} badges`);
  return page;
}

async function startCampaign(page: Page): Promise<void> {
  const labels = [/Continue Campaign/i, /Fight anyway/i, /^Deploy\b/i, /Start Campaign|Begin Campaign|Launch|Begin/i];
  for (const l of labels) {
    if (await clickBox(page, 'button', { text: l })) {
      await sleep(800);
      if (await page.$('canvas.board, [data-tut="hive-core"], button:has-text("Start Wave")')) return;
      await waitFor(page, 'the run to mount', async () => !!(await page.$('canvas.board, [data-tut="hive-core"]')), 12_000).catch(() => undefined);
      if (await page.$('canvas.board, [data-tut="hive-core"]')) return;
    }
  }
  // fallback: through the Campaign screen
  await page.evaluate(() => { (document.querySelector('[data-nav="campaign"]') as HTMLElement | null)?.click(); });
  await sleep(800);
  await clickBox(page, 'button', { text: /Deploy|Start|Begin|Launch/i });
  await waitFor(page, 'Campaign Stage 1 to start', async () => !!(await page.$('canvas.board, [data-tut="hive-core"]')), 15_000);
}

async function offlineProof(ctx: BrowserContext, page: Page): Promise<void> {
  step('offline-reload', 'service worker cache → reload with no network');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await sleep(3500); // let the install-time precache land
  const cached = await page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length; return n; });
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, 'the hub offline', async () => !!(await page.$('[data-nav], .hub-door')), 20_000);
  await clickBox(page, '[data-nav="home"]');
  await sleep(500);
  usedSlots.clear();
  await startCampaign(page);
  await waitFor(page, 'a run to start offline', async () => !!(await page.$('button:has-text("Start Wave")')), 15_000);
  M.offline = `OK — ${cached} cached entries; reload reached the hub and a run started with the network off`;
  await ctx.setOffline(false);
}

// ─────────────────────────────── report ───────────────────────────────
function fmt(n: number | null, unit = 's'): string { return n === null ? 'n/a' : `${n}${unit}`; }
function verdicts(): { name: string; budget: string; actual: string; ok: boolean }[] {
  const pageErrs = M.errors.length;
  return [
    { name: 'Page/console errors', budget: `≤ ${BUDGETS.pageErrors}`, actual: String(pageErrs), ok: pageErrs <= BUDGETS.pageErrors },
    { name: 'Modals after first run', budget: `≤ ${BUDGETS.modalsAfterFirstRun}`, actual: String(M.modalsAfterRun.length), ok: M.modalsAfterRun.length <= BUDGETS.modalsAfterFirstRun },
    { name: 'Time to first tower (cutscene skipped)', budget: `≤ ${BUDGETS.timeToFirstTowerSec}s`, actual: M.timeToFirstTower === null ? 'never' : `${M.timeToFirstTower}s`, ok: M.timeToFirstTower !== null && M.timeToFirstTower <= BUDGETS.timeToFirstTowerSec },
    { name: 'Boot JS gzip', budget: `≤ ${BUDGETS.bootJsGzipKb} KB`, actual: `${M.bootJs.gzipKb} KB`, ok: M.bootJs.gzipKb > 0 && M.bootJs.gzipKb <= BUDGETS.bootJsGzipKb },
    { name: 'Session completed', budget: 'all steps', actual: M.failedStep ? `blocked at ${M.failedStep}` : 'yes', ok: !M.failedStep },
  ];
}
function report(em: Emitted[], dist: string): string {
  const kb = (n: number): string => (n / 1024).toFixed(1);
  const js = em.filter((e) => e.kind === 'js'); const css = em.filter((e) => e.kind === 'css');
  const sum = (a: Emitted[], k: 'raw' | 'gzip'): number => a.reduce((s, e) => s + e[k], 0);
  const v = verdicts();
  const lines: string[] = [];
  lines.push('# First-session report');
  lines.push('');
  lines.push(`> Generated by \`npm run probe:first-session\` on ${new Date().toISOString().slice(0, 10)} — a fresh headless Chromium, 1440×900, new save, cutscene skipped, Campaign Stage 1 at 5×. Do not hand-edit; re-run the probe. Budgets live at the top of \`scripts/first-session-probe.ts\`. Docs: docs/FIRST-SESSION-PROBE.md.`);
  lines.push('');
  lines.push(`**Verdict: ${v.every((x) => x.ok) ? 'PASS' : 'FAIL'}**${M.failedStep ? ` — blocked at step \`${M.failedStep}\`: ${M.failMessage}` : ''}`);
  lines.push('');
  lines.push('| Budget | Limit | Actual | |');
  lines.push('|---|---|---|---|');
  for (const x of v) lines.push(`| ${x.name} | ${x.budget} | ${x.actual} | ${x.ok ? 'ok' : '**VIOLATED**'} |`);
  lines.push('');
  lines.push('## Timeline (seconds since the probe opened /play/)');
  lines.push('');
  lines.push('| Moment | t |');
  lines.push('|---|---|');
  lines.push(`| Cutscene skipped | ${fmt(M.cutsceneSkippedAt)} |`);
  lines.push(`| **First tower placed** | ${fmt(M.timeToFirstTower)} |`);
  lines.push(`| **First wave in combat** | ${fmt(M.timeToFirstWave)} |`);
  lines.push(`| **First reward** | ${fmt(M.timeToFirstReward)} |`);
  lines.push(`| Tutorial done (commissioning) | ${fmt(M.tutorialDoneAt)} |`);
  lines.push(`| First hub | ${fmt(M.hubAt)} |`);
  lines.push(`| Campaign Stage 1 started | ${fmt(M.firstRunStartAt)} |`);
  lines.push(`| Stage 1 ended (${M.stage1Result ?? 'n/a'}) | ${fmt(M.firstRunEndAt)} |`);
  lines.push('');
  lines.push('## Noise after the first run');
  lines.push('');
  lines.push(`- Modal dialogs between first results and a quiet hub: **${M.modalsAfterRun.length}**${M.modalsAfterRun.length ? ' — ' + M.modalsAfterRun.map((m) => `\`${m}\``).join(', ') : ''}`);
  lines.push(`- Toasts after the first run: **${M.toastsAfterRun.length}** (whole session: ${M.toastsTotal})${M.toastsAfterRun.length ? ' — ' + M.toastsAfterRun.slice(0, 8).map((m) => `\`${m}\``).join(', ') : ''}`);
  lines.push(`- Nav badges on the hub after run 1: **${M.badgeTotal}**${M.badgeTotal ? ' — ' + M.badgesHub.join(', ') : ''}`);
  lines.push('');
  lines.push('## Errors');
  lines.push('');
  lines.push(M.errors.length ? M.errors.map((e) => `- ${e}`).join('\n') : '- none');
  lines.push(`- (${M.ignored404} \`/api/*\` console errors ignored — expected without Pages Functions)`);
  lines.push('');
  lines.push('## What the browser had to download');
  lines.push('');
  lines.push('| Moment | JS files | JS gzip (cumulative) |');
  lines.push('|---|---|---|');
  lines.push(`| Boot chunk set (static entry closure — budgeted) | ${M.bootJs.files} | ${M.bootJs.gzipKb} KB |`);
  lines.push(`| First screen up (incl. tutorial engine loading behind the intro) | ${M.firstScreenJs.files} | ${M.firstScreenJs.gzipKb} KB |`);
  lines.push(`| First hub | ${M.homeJs.files} | ${M.homeJs.gzipKb} KB |`);
  lines.push(`| First campaign run started | ${M.runJs.files} | ${M.runJs.gzipKb} KB |`);
  lines.push('');
  lines.push(`Emitted: **${js.length} JS** chunks = ${kb(sum(js, 'raw'))} KB raw / ${kb(sum(js, 'gzip'))} KB gzip; CSS ${css.length} file(s) = ${kb(sum(css, 'raw'))} KB raw / ${kb(sum(css, 'gzip'))} KB gzip.`);
  lines.push('');
  lines.push('| Largest chunks | raw KB | gzip KB |');
  lines.push('|---|---|---|');
  for (const e of em.slice(0, 8)) lines.push(`| \`${e.file}\` | ${kb(e.raw)} | ${kb(e.gzip)} |`);
  if (M.offline) { lines.push(''); lines.push(`## Offline\n\n${M.offline}`); }
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  for (const s of M.steps) lines.push(`- ${s.at}s — ${s.name}${s.note ? ` (${s.note})` : ''}`);
  void dist;
  return lines.join('\n') + '\n';
}

// ─────────────────────────────── main ───────────────────────────────
async function main(): Promise<void> {
  const dist = opt('dist') ?? buildDist();
  if (!existsSync(join(dist, 'play', 'index.html'))) { console.error(`probe: ${dist}/play/index.html missing`); process.exit(2); }
  const em = emitted(dist);
  // Never measure somebody else's server: a stale preview on the port would silently serve another build.
  if (await fetch(`${BASE}/play/`).then(() => true, () => false)) { console.error(`probe: port ${PORT} is already serving something — stop it or pass --port`); process.exit(2); }
  // Run vite's own entry with node (NOT via npx): kill() must hit the real server, or it outlives the probe.
  const preview: ChildProcess = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', dist, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`${BASE}/play/`); if (r.ok) break; } catch { /* not up yet */ } await sleep(250); }
    browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-gpu'] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'allow' });
    let page: Page | null = null;
    try {
      page = await session(ctx, dist);
      if (flag('offline')) await offlineProof(ctx, page);
    } catch (e) {
      M.failedStep = e instanceof StepError ? e.step : currentStep;
      M.failMessage = e instanceof Error ? e.message : String(e);
      log(`✖ BLOCKED at ${M.failedStep}: ${M.failMessage}`);
      if (livePage) { await shot(livePage, 'blocked'); log(`screen at block: ${await bodyText(livePage, 400)}`); }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    preview.kill();
  }
  const md = report(em, dist);
  if (!flag('no-report')) writeFileSync(join(ROOT, 'docs', 'FIRST_SESSION_REPORT.md'), md);
  console.log('\n' + verdicts().map((x) => `${x.ok ? 'ok      ' : 'VIOLATED'}  ${x.name}: ${x.actual} (budget ${x.budget})`).join('\n'));
  process.exit(verdicts().every((x) => x.ok) ? 0 : 1);
}
void main();
