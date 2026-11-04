// MOBILE LAYOUT GATE v3 (npm run mobilecheck) — phones play HORIZONTAL ONLY.
//
// Serves the current dist/ build and enforces the landscape mandate
// (docs/RESPONSIVE-DESIGN.md §landscape — the upgrade consoles are widescreen organisms):
//   • DESKTOP / TABLET-LANDSCAPE — the COMPRESSED rail (front doors only): every screen is
//     reached door → hub landing → [data-nav] card (direct doors like HOME/Store
//     short-circuit), and the landing pages themselves are audited along the way.
//   • LANDSCAPE PHONES — the SAME door→landing→card walk through the narrow-shell drawer
//     (the ☰ burger opens the off-canvas rail), plus the PHONE RUN CONTRACT on a live board.
//   • PORTRAIT touch viewports (phones AND portrait tablets) — the ROTATE GATE contract on the
//     hub (the full-screen hold must cover the viewport), then a LIVE RUN, which has its own
//     portrait layout: the gate must stand down and the PHONE RUN CONTRACT must hold
//     (docs/RESPONSIVE-DESIGN.md §run — no page scroll, a dominant board, ≥44px Start Wave,
//     tray + drawer toggles on-screen).
//   • Every live board also passes the RUN-CHROME contract: no two in-run HUD pieces overlap.
//   • HOME CTA ABOVE THE FOLD — on every landscape/desktop viewport the developed Home's primary
//     deploy button is fully visible without scrolling (docs/COMMAND-CENTER.md §zones).
// Every audited surface also passes the layout audit: no horizontal overflow, no clipped
// text, no sub-24px targets, no off-screen interactives, no unreachable popups.
//
// FUTURE-CONTENT AUTO-COVERAGE (the contract that makes new work mobile-safe by default):
//   1. src/ui/navModel.ts is the ONLY nav list — the desktop rail, this script, and
//      navModel.test.ts all derive from it (a screen outside it cannot compile).
//   2. This gate walks doors BY DISCOVERY (whatever the rail/landings render), so a new
//      screen is swept and audited the day it ships — there is no second list to update.
// `npm run validate` runs this gate. Options:
//   --no-build   reuse dist/ as-is (validate builds beforehand anyway)
//   --port 4321  fixed port (default: 4310)
//   --full       sweep the complete published viewport matrix (small-landscape floor,
//                large phones, big tablets, ultrawide)
//
// Portrait HUB walking retired 2026-07-18 (the v2 tab-shell contract): hub screens are
// landscape-only on touch devices — RotateGate.tsx holds them; the future store APP SHELL
// locks orientation natively. The RUN is exempt (2026-11): it is walked in portrait above.

import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { navGroups } from '../src/ui/navModel';
import { chromePath } from './chromePath';

const args = process.argv.slice(2).filter((a) => a !== '--');
const PORT = Number(args[args.indexOf('--port') + 1] || 0) || 4310;
const CHROME = chromePath(); // MOBILECHECK_CHROMIUM, else the newest preinstalled browser (scripts/chromePath.ts)

// The nav universe — derived, never hand-listed (see auto-coverage contract above).
const NAVS = navGroups().flatMap((g) => g.items.map((i) => i.key));

// The LANDSCAPE-MANDATE matrix (docs/RESPONSIVE-DESIGN.md §gate): desktop, the two
// mainstream landscape phones, tablet landscape (the desktop interface), and the portrait
// touch shapes that must show the ROTATE GATE. `--full` adds the long tail.
const GATE_VIEWPORTS = [
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'landscape-844x390', width: 844, height: 390 },
  { name: 'landscape-926x428', width: 926, height: 428 },
  { name: 'tablet-land-1024x768', width: 1024, height: 768 },
  { name: 'portrait-390x844', width: 390, height: 844 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
];
const FULL_VIEWPORTS = [
  ...GATE_VIEWPORTS,
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'desktop-2560x1440', width: 2560, height: 1440 },
  { name: 'ultrawide-3440x1440', width: 3440, height: 1440 },
  { name: 'landscape-667x375', width: 667, height: 375 },
  { name: 'landscape-932x430', width: 932, height: 430 },
  { name: 'portrait-320x568', width: 320, height: 568 },
  { name: 'portrait-430x932', width: 430, height: 932 },
  { name: 'tablet-land-1180x820', width: 1180, height: 820 },
];
const VIEWPORTS = args.includes('--full') ? FULL_VIEWPORTS : GATE_VIEWPORTS;
// The TUTORIAL WALK — proven at the landscape-phone floor AND in portrait (the tutorial is a
// live run, so it plays portrait since 2026-11); every checkpoint's cue target, callout, and
// controls must sit on-screen.
const TUTORIAL_VIEWPORTS = [
  { name: 'landscape-844x390', width: 844, height: 390 },
  { name: 'portrait-390x844', width: 390, height: 844 },
];
const TAP_MIN = 24; // px — WCAG 2.5.8 minimum target size

interface Violation { screen: string; vp: string; kind: string; detail: string }

/** Mirror of layoutProfile.compute() — the script routes each viewport the way the app will. */
function profileOf(vp: { width: number; height: number }): 'portrait' | 'landscape' | 'desktop' {
  if (vp.height >= vp.width && vp.width <= 900) return 'portrait';
  if (vp.width > vp.height && vp.height <= 520) return 'landscape';
  return 'desktop';
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

      // PORTRAIT touch viewports: the hub is held by the ROTATE GATE (hub screens are horizontal
      // only), but a LIVE RUN has its own portrait layout — the gate must stand down in-run and
      // the portrait battlefield must pass the phone run contract.
      if (profileOf(vp) === 'portrait') {
        // A fresh profile boots straight into the combat TUTORIAL (a live run → no gate): skip
        // it and seed first, so the gate is asserted on a real hub screen.
        await dismiss(page);
        await seedDevelopedProfile(page);
        violations.push(...(await rotateGateContract(page, vp.name)));
        if (await enterRunFromHome(page)) {
          violations.push(...(await audit(page, 'in-run', vp.name, touch)));
          violations.push(...(await phoneRunContract(page, vp.name, 'portrait')));
        } else violations.push({ screen: 'in-run', vp: vp.name, kind: 'unreachable', detail: 'could not enter a run from Home' });
        if (pageErrs.length) violations.push({ screen: '(any)', vp: vp.name, kind: 'pageerror', detail: pageErrs[0] });
        await ctx.close();
        continue;
      }
      // Landscape/desktop: the gate must NEVER leak into a playable orientation.
      const gateLeak = await page.evaluate(() => !!document.querySelector('.rotate-gate'));
      if (gateLeak) violations.push({ screen: 'hub-fresh', vp: vp.name, kind: 'gate-leak', detail: 'rotate gate rendered in a playable orientation' });

      await dismiss(page);
      // Minute-0 layout gate: the FRESH hub (4 revealed navs + teasers) must itself be clean.
      violations.push(...(await audit(page, 'hub-fresh', vp.name, touch)));
      // PROGRESSION GATING (docs/PROGRESSION-GATING.md): a fresh profile hides most wings — seed
      // a developed account so the sweep still audits EVERY screen at every viewport.
      await seedDevelopedProfile(page);
      violations.push(...(await homeCtaContract(page, vp.name)));

      if (profileOf(vp) === 'landscape') violations.push(...(await landscapeRailWalk(page, vp.name)));
      else violations.push(...(await desktopRailWalk(page, vp.name, touch)));

      // Live board: deploy the frontier and audit the combat screen itself.
      if (await enterRunFromHome(page)) {
        violations.push(...(await audit(page, 'in-run', vp.name, touch)));
        if (profileOf(vp) === 'landscape') violations.push(...(await phoneRunContract(page, vp.name, 'landscape')));
        else violations.push(...(await runChromeContract(page, vp.name)));
      } else violations.push({ screen: 'in-run', vp: vp.name, kind: 'unreachable', detail: 'could not enter a run from Home' });
      if (pageErrs.length) violations.push({ screen: '(any)', vp: vp.name, kind: 'pageerror', detail: pageErrs[0] });
      await ctx.close();
    }

    // ── TUTORIAL WALK (docs/RESPONSIVE-DESIGN.md §tutorial) — the reachability contract,
    // now proven at the landscape-phone floor. Fresh profile → the combat tutorial
    // auto-starts → step EVERY checkpoint and assert the cue target, callout and controls
    // are on-screen. Pointing at nothing FAILS the build.
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
        await reachDraftLesson(page);
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
      console.log(`mobilecheck: CLEAN — ${NAVS.length} nav screens (registry-derived) + in-run × ${VIEWPORTS.map((v) => v.name).join('/')}, landscape drawer walked, rotate gate holds the portrait hub, phone run contract (portrait + landscape) and run-chrome overlap contract hold, no overflow/clipped text/sub-${TAP_MIN}px targets.`);
      server.kill('SIGTERM'); // process.exit() skips `finally` — stop the preview server first
      process.exit(0);
    }
    console.error(`mobilecheck: ${violations.length} violation(s)`);
    for (const v of violations.slice(0, 120)) console.error(`  ✗ [${v.vp}px] ${v.screen}: ${v.kind} — ${v.detail}`);
    server.kill('SIGTERM');
    process.exit(1);
  } finally {
    server.kill('SIGTERM');
  }
}

/** Desktop/tablet-landscape: the COMPRESSED rail — HOME + one front door per hub. A screen
 *  is reached door → hub landing → its [data-nav] card (Hub.tsx / HubLanding.tsx); direct
 *  rail doors (HOME, the Store) short-circuit. Each hub's landing page is itself audited the
 *  first time its door opens, so the landings stay inside the layout gate too. */
async function desktopRailWalk(page: import('playwright-core').Page, vpName: string, touch: boolean): Promise<Violation[]> {
  const out: Violation[] = [];
  let missing = 0;
  const hubOf = new Map(navGroups().flatMap((g) => g.items.map((i) => [i.key, g.id] as const)));
  const auditedHubs = new Set<string>();
  for (const nav of NAVS) {
    // 1) Rail-level direct door (HOME, the Store) — click straight through.
    const direct = await page.evaluate((n) => {
      const el = document.querySelector(`.hub-nav [data-nav="${n}"]`) as HTMLElement | null;
      if (el) el.click();
      return !!el;
    }, nav);
    if (!direct) {
      // 2) Through the hub: open the owning door's landing, then the screen's card.
      const hub = hubOf.get(nav) ?? '';
      const doorOpen = await page.evaluate((h) => {
        const el = document.querySelector(`[data-hub="${h}"]`) as HTMLElement | null;
        if (el) el.click();
        return !!el;
      }, hub);
      if (!doorOpen) { missing++; continue; } // whole hub still gated for this profile
      await page.waitForTimeout(450);
      if (!auditedHubs.has(hub)) {
        auditedHubs.add(hub);
        out.push(...(await audit(page, `hub-${hub}`, vpName, touch)));
      }
      const card = await page.evaluate((n) => {
        const el = document.querySelector(`.hubl-grid [data-nav="${n}"]`) as HTMLElement | null;
        if (el) el.click();
        return !!el;
      }, nav);
      if (!card) { missing++; continue; } // still gated (not even teased) — audited as a teaser elsewhere
    }
    await page.waitForTimeout(650); // let ui-rise / panel transitions settle before measuring
    await dismiss(page);
    out.push(...(await audit(page, nav, vpName, touch)));
  }
  // The developed seed reveals nearly everything; heavy misses mean the doors or landings regressed.
  if (missing > 6) out.push({ screen: 'hub', vp: vpName, kind: 'rail-coverage', detail: `${missing}/${NAVS.length} registry navs unreachable via door→landing on a developed profile` });
  return out;
}

/** HOME CTA ABOVE THE FOLD (docs/COMMAND-CENTER.md §zones): the deploy row leads the board, so
 *  Home's primary CTA (Mission Control's deploy button) must sit fully inside the viewport at
 *  scroll 0 — the play button never loses primacy, on a 390px-tall phone included. */
async function homeCtaContract(page: import('playwright-core').Page, vpName: string): Promise<Violation[]> {
  await page.evaluate(() => (document.querySelector('[data-nav="home"]') as HTMLElement | null)?.click());
  await page.waitForTimeout(500);
  return page.evaluate((vpName) => {
    for (const el of document.querySelectorAll('.hub-screen')) el.scrollTop = 0;
    window.scrollTo(0, 0);
    const cta = document.querySelector('.mc-deploy');
    if (!cta) return [{ screen: 'home', vp: vpName, kind: 'home-cta', detail: 'no primary deploy CTA (.mc-deploy) on Home' }];
    const r = cta.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return [];
    return [{ screen: 'home', vp: vpName, kind: 'home-cta', detail: `primary CTA spans y ${Math.round(r.top)}..${Math.round(r.bottom)} — below the ${window.innerHeight}px fold` }];
  }, vpName);
}

/** The ROTATE GATE contract (RotateGate.tsx): a portrait touch viewport shows the hold —
 *  full-coverage, titled, above everything — and that IS the screen (nothing to walk). */
async function rotateGateContract(page: import('playwright-core').Page, vpName: string): Promise<Violation[]> {
  return page.evaluate((vpName) => {
    const out: { screen: string; vp: string; kind: string; detail: string }[] = [];
    const push = (kind: string, detail: string): void => { out.push({ screen: 'rotate-gate', vp: vpName, kind, detail }); };
    const gate = document.querySelector<HTMLElement>('.rotate-gate');
    if (!gate) { push('gate-missing', 'portrait touch viewport did not render the rotate gate'); return out; }
    const r = gate.getBoundingClientRect();
    if (r.left > 2 || r.top > 2 || r.right < window.innerWidth - 2 || r.bottom < window.innerHeight - 2) {
      push('gate-partial', `gate covers ${Math.round(r.width)}×${Math.round(r.height)} of ${window.innerWidth}×${window.innerHeight}`);
    }
    const title = (gate.querySelector('.rotate-gate-title')?.textContent ?? '').trim();
    if (title.length < 4) push('gate-mute', `gate title '${title}'`);
    const z = Number(getComputedStyle(gate).zIndex) || 0;
    if (z < 99999) push('gate-underlay', `z-index ${z} — overlays could cover the hold`);
    return out;
  }, vpName);
}

/** Open the narrow-shell ☰ drawer if this shell parks the rail off-canvas (no-op on wide). */
async function openDrawer(page: import('playwright-core').Page): Promise<void> {
  const opened = await page.evaluate(() => {
    const nav = document.querySelector('.hub-nav');
    const burger = document.querySelector<HTMLElement>('.hub-burger');
    if (burger && burger.offsetParent !== null && nav && !nav.classList.contains('is-open')) { burger.click(); return true; }
    return false;
  });
  if (opened) await page.waitForTimeout(300);
}

/** Landscape phones: the SAME door→landing→card discovery walk as desktop, through the
 *  narrow-shell drawer (☰ opens the off-canvas rail before each door hop). */
async function landscapeRailWalk(page: import('playwright-core').Page, vpName: string): Promise<Violation[]> {
  const out: Violation[] = [];
  let missing = 0;
  const hubOf = new Map(navGroups().flatMap((g) => g.items.map((i) => [i.key, g.id] as const)));
  const auditedHubs = new Set<string>();
  for (const nav of NAVS) {
    await openDrawer(page);
    const direct = await page.evaluate((n) => {
      const el = document.querySelector(`.hub-nav [data-nav="${n}"]`) as HTMLElement | null;
      if (el) el.click();
      return !!el;
    }, nav);
    if (!direct) {
      const hub = hubOf.get(nav) ?? '';
      const doorOpen = await page.evaluate((h) => {
        const el = document.querySelector(`[data-hub="${h}"]`) as HTMLElement | null;
        if (el) el.click();
        return !!el;
      }, hub);
      if (!doorOpen) { missing++; continue; }
      await page.waitForTimeout(450);
      if (!auditedHubs.has(hub)) {
        auditedHubs.add(hub);
        out.push(...(await audit(page, `hub-${hub}`, vpName, true)));
      }
      const card = await page.evaluate((n) => {
        const el = document.querySelector(`.hubl-grid [data-nav="${n}"]`) as HTMLElement | null;
        if (el) el.click();
        return !!el;
      }, nav);
      if (!card) { missing++; continue; }
    }
    await page.waitForTimeout(650);
    await dismiss(page);
    out.push(...(await audit(page, nav, vpName, true)));
  }
  if (missing > 6) out.push({ screen: 'hub', vp: vpName, kind: 'rail-coverage', detail: `${missing}/${NAVS.length} registry navs unreachable via drawer→landing on a developed profile` });
  return out;
}

/** Seed a developed account (mutating the app's own save blob, checksum recomputed) and reload.
 *  help.primed=false lets App boot silently archive the announcement backlog (no What's-New
 *  flood mid-audit). */
async function seedDevelopedProfile(page: import('playwright-core').Page): Promise<void> {
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
}

/** The walker force-advances lessons without playing, so it can reach the draft lesson while
 *  wave 1 still runs — real play only arrives there once the wave clears, when the director deals
 *  the held draft (docs/TUTORIAL.md §onboarding-flow). Drive the board to that state first: clear
 *  the wave (debug handle), wait for the build phase, then deal the draft exactly as the
 *  director's step hook does. A no-op on every other lesson. */
async function reachDraftLesson(page: import('playwright-core').Page): Promise<void> {
  type G = {
    __tut?: { get(): { def: { checkpoints: { cue?: { arrow?: { target: string }; callout?: { target?: string }; spotlight?: string } }[] }; progress: { checkpoint: number } } | null };
    __game?: { phase: string; draft: unknown; debugSkipWave(): void; openTutorialDraft(): void } | null;
  };
  const needs = await page.evaluate(() => {
    const g = globalThis as unknown as G;
    const s = g.__tut?.get();
    const cp = s ? s.def.checkpoints[s.progress.checkpoint] : undefined;
    const sel = cp?.cue?.arrow?.target ?? cp?.cue?.callout?.target ?? cp?.cue?.spotlight;
    if (!sel || !sel.includes('.overlay .cards') || document.querySelector(sel) || !g.__game) return false;
    if (g.__game.phase === 'wave') g.__game.debugSkipWave();
    return true;
  });
  if (!needs) return;
  await page.waitForFunction(() => {
    const g = (globalThis as unknown as G).__game;
    return !!g && (g.phase !== 'wave' || !!g.draft);
  }, undefined, { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => {
    const g = (globalThis as unknown as G).__game;
    if (g && !g.draft) g.openTutorialDraft();
  });
  await page.waitForTimeout(900); // the draft overlay mounts
}


/** Home → Continue Campaign → the live board. Narrow shells park HOME in the ☰ drawer; a
 *  portrait hub sits under the rotate gate, so every hop is a programmatic click. */
async function enterRunFromHome(page: import('playwright-core').Page): Promise<boolean> {
  await openDrawer(page);
  await page.evaluate(() => {
    (document.querySelector('[data-nav="home"]') as HTMLElement | null)?.click();
  });
  await page.waitForTimeout(380);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => (b as HTMLElement).offsetParent !== null);
    for (const label of ['Continue Campaign', 'Fight anyway', 'Deploy', 'Begin']) {
      const b = btns.find((x) => (x.textContent ?? '').includes(label));
      if (b) { (b as HTMLElement).click(); return; }
    }
  });
  await page.waitForTimeout(1800);
  await dismiss(page);
  await page.waitForTimeout(900); // run intro + HUD settle
  return page.evaluate(() => !!document.querySelector('canvas.board'));
}

/** RUN CHROME (every profile, docs/RESPONSIVE-DESIGN.md §run): the in-run HUD pieces never
 *  overlap one another — HUD bar, run-controls strip (speed · Hive · Pause · ticker), wave
 *  briefing, boss bars, tower deck, hero pod, drawer toggles, side panels. */
function runChromeContract(page: import('playwright-core').Page, vpName: string): Promise<Violation[]> {
  return page.evaluate((vpName) => {
    const out: { screen: string; vp: string; kind: string; detail: string }[] = [];
    const vis = (el: Element): boolean => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const sels = ['.hud', '.run-ctl > .speed-ctl', '.run-ctl > .hive-mind-btn', '.run-ctl > .pause-btn', '.run-ctl > .hive-ticker', '.run-ctl > .speed-note',
      '.build-controls.is-visible .build-bar', '.boss-banner', '.mega-banner', '.toolbar', '.tower-rail', '.hero-pod', '.panel-rail', '.side-panel'];
    const els: { s: string; el: Element; r: DOMRect }[] = [];
    for (const s of sels) for (const el of document.querySelectorAll(s)) if (vis(el)) els.push({ s, el, r: el.getBoundingClientRect() });
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i];
        const b = els[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 2 && oy > 2) out.push({ screen: 'in-run', vp: vpName, kind: 'chrome-overlap', detail: `${a.s} × ${b.s} (${Math.round(ox)}×${Math.round(oy)}px)` });
      }
    }
    return out;
  }, vpName);
}

/** The PHONE combat contract (portrait + landscape, docs/RESPONSIVE-DESIGN.md §run): no rotate
 *  gate in a live run, no page scroll, the board dominates (landscape: ≥90% of the height;
 *  portrait: ≥40% of the screen area), ▶ Start Wave thumb-sized and on-screen, the tower tray
 *  and both drawer toggles on-screen — plus the chrome-overlap contract. */
async function phoneRunContract(page: import('playwright-core').Page, vpName: string, profile: 'portrait' | 'landscape'): Promise<Violation[]> {
  const out = await page.evaluate(({ vpName, profile }) => {
    const out: { screen: string; vp: string; kind: string; detail: string }[] = [];
    const push = (kind: string, detail: string): void => { out.push({ screen: 'in-run', vp: vpName, kind, detail }); };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const onScreen = (r: DOMRect): boolean => r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1;
    if (document.querySelector('.rotate-gate')) push('gate-in-run', 'rotate gate rendered over a live run');
    const de = document.documentElement;
    if (de.scrollHeight > vh + 1 || de.scrollWidth > vw + 1) push('run-scrolls', `page ${de.scrollWidth}×${de.scrollHeight} > viewport ${vw}×${vh}`);
    const sb = document.querySelector<HTMLElement>('.start-btn');
    if (!sb) push('startwave-missing', 'no ▶ Start Wave button during prep');
    else {
      const r = sb.getBoundingClientRect();
      if (r.height < 44) push('startwave-size', `▶ Start Wave ${Math.round(r.height)}px tall (< 44)`);
      if (!onScreen(r)) push('startwave-offscreen', `▶ Start Wave spans ${Math.round(r.top)}..${Math.round(r.bottom)} of ${vh}`);
    }
    const board = document.querySelector<HTMLElement>('canvas.board');
    if (!board) push('board-missing', 'no battlefield canvas');
    else {
      const r = board.getBoundingClientRect();
      if (!onScreen(r)) push('board-offscreen', `board at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (profile === 'landscape' && r.height < vh * 0.9) push('board-crushed', `board ${Math.round(r.height)}px (< 90% of ${vh})`);
      if (profile === 'portrait' && r.width * r.height < vw * vh * 0.4) push('board-crushed', `board ${Math.round(r.width)}×${Math.round(r.height)} (< 40% of the screen)`);
    }
    const rail = document.querySelector<HTMLElement>('.tower-rail');
    if (!document.querySelector('.toolbar') || !rail) push('tray-missing', 'no tower build tray');
    else if (!onScreen(rail.getBoundingClientRect())) push('tray-offscreen', 'tower rail not fully on-screen');
    const toggles = [...document.querySelectorAll<HTMLElement>('.panel-rail')];
    if (toggles.length < 2) push('drawer-toggles', `${toggles.length}/2 side-panel drawer toggles`);
    for (const t of toggles) {
      const r = t.getBoundingClientRect();
      if (!onScreen(r) || r.height < 44) push('drawer-toggle', `${(t.textContent ?? '').trim()} ${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.top)}`);
    }
    return out;
  }, { vpName, profile });
  return [...out, ...(await runChromeContract(page, vpName))];
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
