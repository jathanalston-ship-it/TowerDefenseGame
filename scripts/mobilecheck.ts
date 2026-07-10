// MOBILE LAYOUT GATE (npm run mobilecheck) — every screen, small-phone honest.
//
// Serves the current dist/ build, walks EVERY hub screen plus a live in-run board at
// 390×844 (mainstream) and 320×700 (smallest supported), and fails on:
//   • horizontal overflow (document wider than the viewport)
//   • clipped text (nowrap + hidden overflow overflowing WITHOUT text-overflow:ellipsis)
//   • sub-24px interactive targets (WCAG 2.5.8 floor; game chips must stay tappable)
//   • visible interactive elements sitting fully outside the viewport
//
// This is the "new content is automatically mobile-fit" enforcement lane: registries
// bound the DATA (name/description caps in content validators) and this gate bounds
// the LAYOUT — `npm run validate` runs it, so a screen that breaks at phone width
// fails the audit the same day it's written. Options:
//   --no-build   reuse dist/ as-is (validate builds beforehand anyway)
//   --port 4321  fixed port (default: 4310)

import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2).filter((a) => a !== '--');
const PORT = Number(args[args.indexOf('--port') + 1] || 0) || 4310;
const CHROME = process.env.MOBILECHECK_CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const NAVS = ['home', 'campaign', 'infinite', 'bossrush', 'daily', 'towers', 'heroes', 'evolution', 'genes', 'mulligans', 'vault', 'market', 'equipment', 'phenotypes', 'collection', 'store', 'profile', 'help', 'settings'];

// The LAYOUT-PROFILE matrix (docs/RESPONSIVE-DESIGN.md §gate). The default gate covers one
// honest representative of every profile class — desktop, portrait phone (mainstream +
// smallest), LANDSCAPE phone, tablet portrait — so `npm run validate` enforces all three
// intentional interfaces on every run. `--full` sweeps the complete published matrix.
const GATE_VIEWPORTS = [
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'portrait-390x844', width: 390, height: 844 },
  { name: 'portrait-320x568', width: 320, height: 568 },
  { name: 'landscape-844x390', width: 844, height: 390 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
];
const FULL_VIEWPORTS = [
  ...GATE_VIEWPORTS,
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-2560x1440', width: 2560, height: 1440 },
  { name: 'ultrawide-3440x1440', width: 3440, height: 1440 },
  { name: 'portrait-360x640', width: 360, height: 640 },
  { name: 'portrait-375x812', width: 375, height: 812 },
  { name: 'portrait-412x915', width: 412, height: 915 },
  { name: 'portrait-430x932', width: 430, height: 932 },
  { name: 'landscape-568x320', width: 568, height: 320 },
  { name: 'landscape-640x360', width: 640, height: 360 },
  { name: 'landscape-932x430', width: 932, height: 430 },
  { name: 'tablet-820x1180', width: 820, height: 1180 },
  { name: 'tablet-1024x1366', width: 1024, height: 1366 },
];
const VIEWPORTS = args.includes('--full') ? FULL_VIEWPORTS : GATE_VIEWPORTS;
// The TUTORIAL WALK runs at the layouts where reachability historically broke (portrait +
// landscape phones): every checkpoint's cue target, callout and controls must sit on-screen.
const TUTORIAL_VIEWPORTS = [
  { name: 'portrait-375x812', width: 375, height: 812 },
  { name: 'landscape-844x390', width: 844, height: 390 },
];
const TAP_MIN = 24; // px — WCAG 2.5.8 minimum target size

interface Violation { screen: string; vp: string; kind: string; detail: string }

async function main(): Promise<void> {
  if (!args.includes('--no-build')) {
    execSync('npm run build', { stdio: 'inherit' });
  }
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: false });
  try {
    await waitFor(`http://localhost:${PORT}/play/`, 20_000);
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
    const violations: Violation[] = [];
    for (const vp of VIEWPORTS) {
      const touch = !vp.name.startsWith('desktop') && !vp.name.startsWith('ultrawide');
      // isMobile ⇒ Chromium reports (pointer: coarse), so the 44px CSS floors apply in-probe
      // exactly as on real devices (the tap-size measurements are honest).
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
      const page = await ctx.newPage();
      const pageErrs: string[] = [];
      page.on('pageerror', (e) => pageErrs.push(String(e).slice(0, 120)));
      await page.goto(`http://localhost:${PORT}/play/?debug`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await page.addStyleTag({ content: '.debug-panel { display: none !important; }' });
      await dismiss(page);
      // Minute-0 layout gate: the FRESH hub (4 revealed navs + teasers) must itself be clean.
      violations.push(...(await audit(page, 'hub-fresh', vp.name, touch)));
      // PROGRESSION GATING (docs/PROGRESSION-GATING.md): a fresh profile hides most wings — seed
      // a developed account (mutating the app's own save blob, checksum recomputed) so the sweep
      // still audits EVERY screen at every viewport. help.primed=false lets App boot silently
      // archive the announcement backlog (no What's-New flood mid-audit).
      await page.evaluate(() => {
        const raw = localStorage.getItem('assimilate.save');
        if (!raw) return;
        const blob = JSON.parse(raw) as { data: Record<string, unknown>; checksum: string };
        const d = blob.data as { campaign?: { cleared?: Record<string, number> }; prestige?: { molts?: number }; mats?: Record<string, number>; help?: Record<string, unknown> };
        blob.data.campaign = { ...(d.campaign ?? {}), cleared: { standard: 30 }, bestTime: {} };
        blob.data.bestWave = 37;
        blob.data.totalRuns = 21;
        blob.data.ichor = 3;
        if (d.mats) d.mats.scrap = Math.max(1, d.mats.scrap ?? 0);
        if (d.prestige) d.prestige.molts = Math.max(1, d.prestige.molts ?? 0);
        blob.data.help = { seen: [], primed: false, hudTour: true };
        const s = JSON.stringify(blob.data);
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        blob.checksum = (h >>> 0).toString(36);
        localStorage.setItem('assimilate.save', JSON.stringify(blob));
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      await page.addStyleTag({ content: '.debug-panel { display: none !important; }' });
      await dismiss(page);
      for (const nav of NAVS) {
        await page.evaluate((n) => (document.querySelector(`[data-nav="${n}"]`) as HTMLElement | null)?.click(), nav);
        await page.waitForTimeout(650); // let ui-rise / panel transitions settle before measuring
        await dismiss(page);
        violations.push(...(await audit(page, nav, vp.name, touch)));
      }
      // Live board: deploy the frontier and audit the combat screen itself.
      await page.evaluate(() => (document.querySelector('[data-nav="home"]') as HTMLElement | null)?.click());
      await page.waitForTimeout(380);
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')].filter((b) => (b as HTMLElement).offsetParent !== null);
        for (const label of ['Continue Campaign', 'Deploy Under-Powered', 'Deploy', 'Begin']) {
          const b = btns.find((x) => (x.textContent ?? '').includes(label));
          if (b) { (b as HTMLElement).click(); return; }
        }
      });
      await page.waitForTimeout(1800);
      await dismiss(page);
      await page.waitForTimeout(900); // run intro + HUD settle
      const inRun = await page.evaluate(() => !!document.querySelector('canvas.board'));
      if (inRun) violations.push(...(await audit(page, 'in-run', vp.name, touch)));
      else violations.push({ screen: 'in-run', vp: vp.name, kind: 'unreachable', detail: 'could not enter a run from Home' });
      if (pageErrs.length) violations.push({ screen: '(any)', vp: vp.name, kind: 'pageerror', detail: pageErrs[0] });
      await ctx.close();
    }

    // ── TUTORIAL WALK (docs/RESPONSIVE-DESIGN.md §tutorial) — the reachability contract.
    // Fresh profile → the combat tutorial auto-starts → step EVERY checkpoint and assert the
    // cue target, callout and controls are on-screen. This is the regression gate for the
    // "portrait couldn't finish the tutorial" class of bug: pointing at nothing FAILS the build.
    for (const vp of TUTORIAL_VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/play/?debug`, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '.debug-panel { display: none !important; }' });
      // First-launch gate → Continue as Guest (part of the real first-run path).
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('Continue as Guest'));
        (b as HTMLElement | undefined)?.click();
      });
      // Wait for the tutorial overlay (auto-starts on a fresh profile), dismiss the cold open.
      const started = await page.waitForSelector('.tut-overlay', { timeout: 15_000 }).then(() => true).catch(() => false);
      if (!started) {
        violations.push({ screen: 'tutorial', vp: vp.name, kind: 'tutorial-walk', detail: 'tutorial did not auto-start on a fresh profile' });
        await ctx.close();
        continue;
      }
      await page.evaluate(() => (document.querySelector('.tut-cine-open') as HTMLElement | null)?.click());
      for (let step = 0; step < 40; step++) {
        await page.waitForTimeout(1300); // typewriter + auto-scroll settle
        const check = await page.evaluate(() => {
          const g = globalThis as unknown as { __tut?: { get(): { def: { checkpoints: { id: string; cue?: { arrow?: { target: string }; callout?: { target?: string }; spotlight?: string } }[]; }; progress: { checkpoint: number } } | null; advance(): void } };
          const tut = g.__tut;
          if (!tut) return { done: true, errs: ['__tut handle missing (debug flag not set?)'] };
          const s = tut.get();
          if (!s) return { done: true, errs: [] };
          const cp = s.def.checkpoints[s.progress.checkpoint];
          if (!cp) return { done: true, errs: [] };
          const errs: string[] = [];
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const onScreen = (r: DOMRect): boolean => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
          const sel = cp.cue?.arrow?.target ?? cp.cue?.callout?.target ?? cp.cue?.spotlight;
          if (sel) {
            const el = document.querySelector(sel);
            if (!el) errs.push(`${cp.id}: target '${sel}' not in DOM`);
            else if (!onScreen(el.getBoundingClientRect())) errs.push(`${cp.id}: target '${sel}' OFF-SCREEN after auto-scroll`);
          }
          const callout = document.querySelector('.tut-callout');
          if (callout) {
            const r = callout.getBoundingClientRect();
            if (r.top < -2 || r.bottom > vh + 2 || r.left < -2 || r.right > vw + 2) errs.push(`${cp.id}: callout leaves the viewport (${Math.round(r.top)}..${Math.round(r.bottom)} of ${vh})`);
          }
          for (const ctl of document.querySelectorAll('.tut-ctl')) {
            const r = ctl.getBoundingClientRect();
            if (!onScreen(r)) errs.push(`${cp.id}: control '${(ctl.textContent ?? '').trim()}' off-screen`);
          }
          tut.advance(); // presentation validated — move to the next checkpoint
          return { done: false, errs };
        });
        for (const e of check.errs) violations.push({ screen: 'tutorial', vp: vp.name, kind: 'tutorial-walk', detail: e });
        if (check.done) break;
      }
      await ctx.close();
    }
    await browser.close();

    if (violations.length === 0) {
      console.log(`mobilecheck: CLEAN — ${NAVS.length + 1} screens × ${VIEWPORTS.map((v) => v.name).join('/')}px, no overflow, no clipped text, no sub-${TAP_MIN}px targets.`);
      process.exit(0);
    }
    console.error(`mobilecheck: ${violations.length} violation(s)`);
    for (const v of violations.slice(0, 120)) console.error(`  ✗ [${v.vp}px] ${v.screen}: ${v.kind} — ${v.detail}`);
    process.exit(1);
  } finally {
    server.kill('SIGTERM');
  }
}

async function waitFor(url: string, ms: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not come up on ${url}`);
}

async function dismiss(page: import('playwright-core').Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const acted = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const pat = /^(continue|got it|close|claim|collect|skip tutorial|skip|onward|begin|ok|later|✕|×)$|^got it\b/i; // "Got it · N more ▸" queues count down
      const b = btns.find((x) => pat.test(x.textContent?.trim() ?? '') && (x as HTMLElement).offsetParent !== null);
      if (b) { (b as HTMLElement).click(); return true; }
      return false;
    });
    if (!acted) break;
    await page.waitForTimeout(220);
  }
}

function audit(page: import('playwright-core').Page, screen: string, vp: string, touch = true): Promise<Violation[]> {
  return page.evaluate(({ screen, vp, TAP_MIN, touch }) => {
    const out: { screen: string; vp: string; kind: string; detail: string }[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 2) {
      // Only VISIBLE geometry is a violation: closed drawers/tooltips keep layout via
      // the visibility pattern and body{overflow-x:hidden} already blocks panning.
      let worst: Element | null = null;
      let worstRight = window.innerWidth;
      const contained = (el: Element): boolean => {
        // A box inside ANY clipping/scrolling ancestor never widens the document.
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') return true;
        }
        return false;
      };
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
        const r = el.getBoundingClientRect();
        if (r.right > worstRight + 2 && r.width > 40 && !contained(el)) { worstRight = r.right; worst = el; }
      }
      if (worst) {
        const w = worst as HTMLElement;
        out.push({ screen, vp, kind: 'h-overflow', detail: `document ${doc.scrollWidth}px > viewport ${window.innerWidth}px — widest visible: <${w.tagName.toLowerCase()} class="${w.className}"> right=${Math.round(worstRight)}` });
      }
    }
    const visible = (el: Element): boolean => ((el as HTMLElement).offsetParent !== null || el.tagName === 'CANVAS') && getComputedStyle(el).visibility !== 'hidden';
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      // Clipped text: single-line, hidden overflow, actually overflowing, and NOT ellipsized.
      if (
        cs.whiteSpace === 'nowrap' &&
        (cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
        cs.textOverflow !== 'ellipsis' &&
        el.scrollWidth > el.clientWidth + 3 &&
        (el.textContent ?? '').trim().length > 0 &&
        el.children.length === 0
      ) {
        out.push({ screen, vp, kind: 'clipped-text', detail: `<${el.tagName.toLowerCase()} class="${el.className}"> "${(el.textContent ?? '').trim().slice(0, 32)}" ${el.clientWidth}w/${el.scrollWidth}sw` });
      }
    }
    for (const el of document.querySelectorAll('button, a, input, select, [role="button"]')) {
      if (!visible(el)) continue;
      // Only the OUTERMOST interactive element is the tap target — decorated inner
      // spans (icons/badges with role attributes) ride inside it.
      if (el.parentElement?.closest('button, a, [role="button"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (touch && (r.height < TAP_MIN || r.width < TAP_MIN)) {
        out.push({ screen, vp, kind: 'tiny-target', detail: `<${el.tagName.toLowerCase()} class="${(el as HTMLElement).className}"> "${(el.textContent ?? '').trim().slice(0, 20)}" ${Math.round(r.width)}×${Math.round(r.height)}px` });
      }
      if (r.right < -2 || r.left > window.innerWidth + 2) {
        // A fully-offscreen ANCESTOR container = a parked drawer/panel (intentional UI);
        // only flag elements sticking out of an otherwise ON-screen layout. Hidden
        // (visibility) elements are already excluded by the computed-style check below.
        let parked = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const pr = p.getBoundingClientRect();
          if (pr.width > 0 && (pr.right < -2 || pr.left > window.innerWidth + 2)) { parked = true; break; }
          const pcs = getComputedStyle(p);
          // Inside a horizontal scroller (tower rail, chip rows): reachable by design.
          if ((pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 2) { parked = true; break; }
        }
        if (getComputedStyle(el).visibility === 'hidden') parked = true;
        if (!parked) out.push({ screen, vp, kind: 'offscreen-interactive', detail: `<${el.tagName.toLowerCase()}> "${(el.textContent ?? '').trim().slice(0, 20)}" at x=${Math.round(r.left)}` });
      }
    }
    // Off-screen / oversize popups: a dialog must fit the viewport or scroll internally —
    // one whose buttons render past the fold is unreachable (the zero-list contract).
    for (const el of document.querySelectorAll('[role="dialog"]')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const scrolls = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
      if ((r.bottom > window.innerHeight + 2 || r.top < -2) && !scrolls) {
        out.push({ screen, vp, kind: 'popup-overflow', detail: `<${el.tagName.toLowerCase()} class="${(el as HTMLElement).className}"> spans ${Math.round(r.top)}..${Math.round(r.bottom)} vs vh=${window.innerHeight}` });
      }
    }
    // De-duplicate identical findings (lists repeat the same template).
    const seen = new Set<string>();
    return out.filter((v) => {
      const k = `${v.kind}|${v.detail.replace(/\d+/g, '#')}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, { screen, vp, TAP_MIN, touch });
}

void main();
