// MOBILE LAYOUT GATE (npm run mobilecheck) — every screen, small-phone honest.
//
// Serves the current dist/ build and enforces BOTH intentional interfaces
// (docs/RESPONSIVE-DESIGN.md §mobile-shell):
//   • DESKTOP — the rail hub, swept via [data-nav] exactly as before.
//   • PORTRAIT — the phone game: the five-tab bottom bar must exist (≥44px tabs), every tab
//     index row must be SELF-DESCRIBING (name + blurb — a first-timer reads what a screen is
//     before entering), every row must drill in (back header present) and return, and the
//     live run must present the combat dock contract: fixed wave dock with a ≥44px on-screen
//     ▶ Start Wave, visible board, reachable tower tray.
// Every audited surface also passes the layout audit: no horizontal overflow, no clipped
// text, no sub-24px targets, no off-screen interactives, no unreachable popups.
//
// FUTURE-CONTENT AUTO-COVERAGE (the contract that makes new work mobile-safe by default):
//   1. src/ui/navModel.ts is the ONLY nav list — the desktop rail, the portrait tabs, this
//      script, and navModel.test.ts all derive from it (a screen outside it cannot compile).
//   2. navModel.test.ts proves every NavKey sits in exactly one tab and has an unlock-registry
//      blurb, so the portrait index row for any future screen exists and explains itself.
//   3. This gate walks rows BY DISCOVERY (whatever the index pages render), so a new screen is
//      swept, drilled, and audited the day it ships — there is no second list to update.
// `npm run validate` runs this gate. Options:
//   --no-build   reuse dist/ as-is (validate builds beforehand anyway)
//   --port 4321  fixed port (default: 4310)
//   --full       sweep the complete published viewport matrix (includes landscape phones)
//
// Landscape phones are NOT in the default gate: the game is designed vertical-only on
// phones (the shell targets portrait; rotation is not a supported play mode).

import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { navGroups, mobileTabs } from '../src/ui/navModel';

const args = process.argv.slice(2).filter((a) => a !== '--');
const PORT = Number(args[args.indexOf('--port') + 1] || 0) || 4310;
const CHROME = process.env.MOBILECHECK_CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

// The nav universe — derived, never hand-listed (see auto-coverage contract above).
const NAVS = navGroups().flatMap((g) => g.items.map((i) => i.key));
const TABS = mobileTabs();

// The LAYOUT-PROFILE matrix (docs/RESPONSIVE-DESIGN.md §gate): desktop, mainstream portrait,
// smallest portrait, tablet portrait. Portrait viewports run the TAB-SHELL walk; desktop runs
// the rail walk. `--full` adds the long tail (including landscape, kept honest but ungated).
const GATE_VIEWPORTS = [
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'portrait-390x844', width: 390, height: 844 },
  { name: 'portrait-320x568', width: 320, height: 568 },
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
  { name: 'landscape-844x390', width: 844, height: 390 },
  { name: 'landscape-932x430', width: 932, height: 430 },
  { name: 'tablet-820x1180', width: 820, height: 1180 },
  { name: 'tablet-1024x1366', width: 1024, height: 1366 },
];
const VIEWPORTS = args.includes('--full') ? FULL_VIEWPORTS : GATE_VIEWPORTS;
// The TUTORIAL WALK — portrait phones are where reachability historically broke; every
// checkpoint's cue target, callout, and controls must sit on-screen.
const TUTORIAL_VIEWPORTS = [
  { name: 'portrait-375x812', width: 375, height: 812 },
];
const TAP_MIN = 24; // px — WCAG 2.5.8 minimum target size
const TAB_MIN = 44; // px — the bottom bar is the primary thumb surface; it gets the full floor

interface Violation { screen: string; vp: string; kind: string; detail: string }

/** A viewport is portrait-shell territory when height ≥ width and width ≤ 900 (layoutProfile). */
function isPortrait(vp: { width: number; height: number }): boolean {
  return vp.height >= vp.width && vp.width <= 900;
}

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

      if (isPortrait(vp)) violations.push(...(await portraitShellWalk(page, vp.name)));
      else violations.push(...(await desktopRailWalk(page, vp.name, touch)));

      // Live board: deploy the frontier and audit the combat screen itself.
      await page.evaluate(() => {
        (document.querySelector('[data-mtab="home"]') as HTMLElement | null)?.click();
        (document.querySelector('[data-nav="home"]') as HTMLElement | null)?.click();
      });
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
      if (inRun) {
        violations.push(...(await audit(page, 'in-run', vp.name, touch)));
        if (isPortrait(vp)) violations.push(...(await portraitRunContract(page, vp.name)));
      } else violations.push({ screen: 'in-run', vp: vp.name, kind: 'unreachable', detail: 'could not enter a run from Home' });
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
      console.log(`mobilecheck: CLEAN — ${NAVS.length} nav screens (registry-derived) + in-run × ${VIEWPORTS.map((v) => v.name).join('/')}, portrait tab-shell walked, no overflow/clipped text/sub-${TAP_MIN}px targets.`);
      process.exit(0);
    }
    console.error(`mobilecheck: ${violations.length} violation(s)`);
    for (const v of violations.slice(0, 120)) console.error(`  ✗ [${v.vp}px] ${v.screen}: ${v.kind} — ${v.detail}`);
    process.exit(1);
  } finally {
    server.kill('SIGTERM');
  }
}

/** Desktop/tablet-landscape: the rail hub — click every registry nav that is present. */
async function desktopRailWalk(page: import('playwright-core').Page, vpName: string, touch: boolean): Promise<Violation[]> {
  const out: Violation[] = [];
  let missing = 0;
  for (const nav of NAVS) {
    const present = await page.evaluate((n) => !!document.querySelector(`[data-nav="${n}"]`), nav);
    if (!present) { missing++; continue; } // still gated for this profile — its teaser row was audited with the shell
    await page.evaluate((n) => (document.querySelector(`[data-nav="${n}"]`) as HTMLElement | null)?.click(), nav);
    await page.waitForTimeout(650); // let ui-rise / panel transitions settle before measuring
    await dismiss(page);
    out.push(...(await audit(page, nav, vpName, touch)));
  }
  // The developed seed reveals nearly everything; a collapsed rail means gating regressed.
  if (missing > 6) out.push({ screen: 'hub', vp: vpName, kind: 'rail-coverage', detail: `${missing}/${NAVS.length} registry navs missing from the rail on a developed profile` });
  return out;
}

/** Portrait phones/tablets: the tab shell — the bar, the index rows, the drill-down, the return. */
async function portraitShellWalk(page: import('playwright-core').Page, vpName: string): Promise<Violation[]> {
  const out: Violation[] = [];

  // 1. The bottom bar: all five tabs, visible, thumb-sized.
  const bar = await page.evaluate((TAB_MIN) => {
    const tabs = [...document.querySelectorAll<HTMLElement>('.mtab-bar [data-mtab]')];
    return {
      keys: tabs.map((t) => t.dataset.mtab),
      bad: tabs
        .filter((t) => { const r = t.getBoundingClientRect(); return r.height < TAB_MIN || t.offsetParent === null; })
        .map((t) => `${t.dataset.mtab} ${Math.round(t.getBoundingClientRect().height)}px`),
      labels: tabs.filter((t) => ((t.querySelector('.mtab-l')?.textContent ?? '').trim().length ?? 0) < 2).map((t) => t.dataset.mtab),
    };
  }, TAB_MIN);
  for (const tab of TABS) {
    if (!bar.keys.includes(tab.key)) out.push({ screen: 'tab-bar', vp: vpName, kind: 'tab-missing', detail: `tab '${tab.key}' not rendered` });
  }
  for (const b of bar.bad) out.push({ screen: 'tab-bar', vp: vpName, kind: 'tab-size', detail: `tab ${b} < ${TAB_MIN}px` });
  for (const l of bar.labels ?? []) out.push({ screen: 'tab-bar', vp: vpName, kind: 'tab-unlabelled', detail: `tab '${l}' has no text label` });

  // 2. Walk every tab: index rows are self-describing; each row drills in and returns.
  const seen = new Set<string>();
  for (const tab of TABS.filter((t) => t.key !== 'home')) {
    await page.evaluate((k) => (document.querySelector(`[data-mtab="${k}"]`) as HTMLElement | null)?.click(), tab.key);
    await page.waitForTimeout(450);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.mnav-index .mnav-row')].map((r) => ({
        nav: r.dataset.nav ?? '',
        name: (r.querySelector('.mnav-name')?.textContent ?? '').trim(),
        blurb: (r.querySelector('.mnav-blurb')?.textContent ?? '').trim(),
        h: Math.round(r.getBoundingClientRect().height),
        locked: r.classList.contains('is-locked'),
      })));
    if (rows.length === 0) {
      out.push({ screen: `tab-${tab.key}`, vp: vpName, kind: 'empty-index', detail: 'tab index rendered zero rows on a developed profile' });
      continue;
    }
    for (const r of rows) {
      if (!tab.navs.includes(r.nav as (typeof tab.navs)[number])) out.push({ screen: `tab-${tab.key}`, vp: vpName, kind: 'stray-row', detail: `row '${r.nav}' does not belong to this tab` });
      if (r.name.length < 3) out.push({ screen: `tab-${tab.key}`, vp: vpName, kind: 'row-unnamed', detail: `row '${r.nav}' name '${r.name}'` });
      if (r.blurb.length < 8) out.push({ screen: `tab-${tab.key}`, vp: vpName, kind: 'row-mute', detail: `row '${r.nav}' has no first-timer blurb` });
      if (r.h < TAB_MIN) out.push({ screen: `tab-${tab.key}`, vp: vpName, kind: 'row-size', detail: `row '${r.nav}' ${r.h}px < ${TAB_MIN}px` });
    }
    out.push(...(await audit(page, `tab-${tab.key}-index`, vpName, true)));
    // Drill every row (locked rows open their unlock briefing — that must work too).
    for (const r of rows) {
      seen.add(r.nav);
      await page.evaluate((n) => (document.querySelector(`.mnav-row[data-nav="${n}"]`) as HTMLElement | null)?.click(), r.nav);
      await page.waitForTimeout(650);
      await dismiss(page);
      const head = await page.evaluate(() => ({
        present: !!document.querySelector('.mpage-head'),
        title: (document.querySelector('.mpage-title')?.textContent ?? '').trim(),
        backH: Math.round(document.querySelector('.mpage-back')?.getBoundingClientRect().height ?? 0),
      }));
      if (!head.present) out.push({ screen: r.nav, vp: vpName, kind: 'no-back-header', detail: 'drilled-in screen has no back header' });
      else {
        if (head.title.length < 3) out.push({ screen: r.nav, vp: vpName, kind: 'untitled-page', detail: `page title '${head.title}'` });
        if (head.backH < 36) out.push({ screen: r.nav, vp: vpName, kind: 'back-size', detail: `back button ${head.backH}px` });
      }
      out.push(...(await audit(page, r.nav, vpName, true)));
      await page.evaluate(() => (document.querySelector('.mpage-back') as HTMLElement | null)?.click());
      await page.waitForTimeout(400);
      const backOnIndex = await page.evaluate(() => !!document.querySelector('.mnav-index'));
      if (!backOnIndex) {
        out.push({ screen: r.nav, vp: vpName, kind: 'back-broken', detail: 'back did not return to the tab index' });
        await page.evaluate((k) => (document.querySelector(`[data-mtab="${k}"]`) as HTMLElement | null)?.click(), tab.key);
        await page.waitForTimeout(400);
      }
    }
  }
  // Home tab: jumps straight to the Command Center (no index page).
  await page.evaluate(() => (document.querySelector('[data-mtab="home"]') as HTMLElement | null)?.click());
  await page.waitForTimeout(500);
  await dismiss(page);
  out.push(...(await audit(page, 'home', vpName, true)));
  seen.add('home');

  // 3. Coverage floor: a gating/shell regression that empties the indexes must fail loudly.
  if (seen.size < Math.min(15, NAVS.length)) {
    out.push({ screen: 'tab-shell', vp: vpName, kind: 'coverage-collapse', detail: `only ${seen.size} screens reachable through the tab shell on a developed profile` });
  }
  return out;
}

/** The portrait combat dock contract: the primary loop must be playable one-handed. */
function portraitRunContract(page: import('playwright-core').Page, vpName: string): Promise<Violation[]> {
  return page.evaluate((vpName) => {
    const out: { screen: string; vp: string; kind: string; detail: string }[] = [];
    const push = (kind: string, detail: string): void => { out.push({ screen: 'in-run', vp: vpName, kind, detail }); };
    const dock = document.querySelector<HTMLElement>('.build-controls');
    if (!dock) push('dock-missing', 'no .build-controls in the run DOM');
    else {
      if (getComputedStyle(dock).position !== 'fixed') push('dock-not-fixed', `position=${getComputedStyle(dock).position}`);
      const sb = document.querySelector<HTMLElement>('.start-btn');
      if (!sb) push('startwave-missing', 'no ▶ Start Wave button during prep');
      else {
        const r = sb.getBoundingClientRect();
        if (r.height < 44) push('startwave-size', `▶ Start Wave ${Math.round(r.height)}px tall (< 44)`);
        if (!(r.top >= 0 && r.bottom <= window.innerHeight)) push('startwave-offscreen', `▶ Start Wave spans ${Math.round(r.top)}..${Math.round(r.bottom)} of ${window.innerHeight}`);
      }
    }
    const board = document.querySelector<HTMLElement>('canvas.board');
    if (!board) push('board-missing', 'no battlefield canvas');
    else {
      const r = board.getBoundingClientRect();
      if (r.height < window.innerHeight * 0.25) push('board-crushed', `board ${Math.round(r.height)}px (< 25% of ${window.innerHeight})`);
    }
    const rail = document.querySelector<HTMLElement>('.toolbar');
    if (!rail) push('tray-missing', 'no tower build tray');
    return out;
  }, vpName);
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
    window.scrollTo(0, 0); // normalize probe state — focus-scroll during the walk skews rect math
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
    // GEOMETRIC TRUNCATION (touch layouts) — the detector above only sees an element overflowing
    // its OWN box; text is just as unreadable when an ANCESTOR's overflow box (or the viewport
    // edge) cuts it — the 2026-07 "hero HP clipped on the first tutorial screen" class. For every
    // visible TEXT-carrying element (has a direct non-empty text node), fail if its rect pokes
    // horizontally out of the nearest clipping ancestor or the viewport, unless it sits inside a
    // deliberate horizontal scroller (reachable by swipe).
    if (touch) {
      const TOL = 1.5; // px — sub-pixel rounding is not a clip
      const isScroller = (c: CSSStyleDeclaration): boolean => c.overflowX === 'auto' || c.overflowX === 'scroll';
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        let ownText = '';
        for (const n of el.childNodes) if (n.nodeType === 3) ownText += n.textContent ?? '';
        ownText = ownText.trim();
        if (!ownText) continue;
        if (!visible(el)) continue;
        if (Number(getComputedStyle(el).opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Nearest clipping ancestor decides; a scroller ancestry legitimizes the overhang.
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const pcs = getComputedStyle(p);
          if (isScroller(pcs)) break;
          if (!(pcs.overflowX === 'hidden' || pcs.overflowX === 'clip' || pcs.overflow === 'hidden')) {
            if (pcs.position === 'fixed') break; // fixed chrome escapes ancestor overflow clips — the viewport-spill check below guards it
            continue;
          }
          const pr = p.getBoundingClientRect();
          if (r.right > pr.right + TOL || r.left < pr.left - TOL) {
            out.push({ screen, vp, kind: 'geo-clip', detail: `<${el.tagName.toLowerCase()} class="${el.className}"> "${ownText.slice(0, 30)}" cut by <${(p.className || p.tagName).toString().split(' ')[0]}> at x=${Math.round(pr.right)}` });
          }
          break;
        }
        if (r.right > window.innerWidth + TOL || r.left < -TOL) {
          let scrollable = false;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (isScroller(getComputedStyle(p)) && p.scrollWidth > p.clientWidth + 2) { scrollable = true; break; }
          }
          if (!scrollable) out.push({ screen, vp, kind: 'viewport-spill', detail: `<${el.tagName.toLowerCase()} class="${el.className}"> "${ownText.slice(0, 30)}" spans ${Math.round(r.left)}..${Math.round(r.right)} vs vw=${window.innerWidth}` });
        }
      }
    }
    for (const el of document.querySelectorAll('button, a, input, select, summary, [role="button"]')) {
      if (!visible(el)) continue;
      // Only the OUTERMOST interactive element is the tap target — decorated inner
      // spans (icons/badges with role attributes) ride inside it.
      if (el.parentElement?.closest('button, a, summary, [role="button"]')) continue;
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
