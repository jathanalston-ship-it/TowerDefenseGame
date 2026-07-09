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

const NAVS = ['home', 'campaign', 'infinite', 'bossrush', 'daily', 'towers', 'heroes', 'evolution', 'genes', 'vault', 'market', 'equipment', 'phenotypes', 'collection', 'store', 'profile', 'help', 'settings'];
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '320', width: 320, height: 700 },
];
const TAP_MIN = 24; // px — WCAG 2.5.8 minimum target size

interface Violation { screen: string; vp: string; kind: string; detail: string }

async function main(): Promise<void> {
  if (!args.includes('--no-build')) {
    execSync('npm run build', { stdio: 'inherit' });
  }
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: false });
  try {
    await waitFor(`http://localhost:${PORT}/`, 20_000);
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
    const violations: Violation[] = [];
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const pageErrs: string[] = [];
      page.on('pageerror', (e) => pageErrs.push(String(e).slice(0, 120)));
      await page.goto(`http://localhost:${PORT}/?debug`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await page.addStyleTag({ content: '.debug-panel { display: none !important; }' });
      await dismiss(page);
      for (const nav of NAVS) {
        await page.evaluate((n) => (document.querySelector(`[data-nav="${n}"]`) as HTMLElement | null)?.click(), nav);
        await page.waitForTimeout(650); // let ui-rise / panel transitions settle before measuring
        await dismiss(page);
        violations.push(...(await audit(page, nav, vp.name)));
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
      if (inRun) violations.push(...(await audit(page, 'in-run', vp.name)));
      else violations.push({ screen: 'in-run', vp: vp.name, kind: 'unreachable', detail: 'could not enter a run from Home' });
      if (pageErrs.length) violations.push({ screen: '(any)', vp: vp.name, kind: 'pageerror', detail: pageErrs[0] });
      await ctx.close();
    }
    await browser.close();

    if (violations.length === 0) {
      console.log(`mobilecheck: CLEAN — ${NAVS.length + 1} screens × ${VIEWPORTS.map((v) => v.name).join('/')}px, no overflow, no clipped text, no sub-${TAP_MIN}px targets.`);
      process.exit(0);
    }
    console.error(`mobilecheck: ${violations.length} violation(s)`);
    for (const v of violations.slice(0, 40)) console.error(`  ✗ [${v.vp}px] ${v.screen}: ${v.kind} — ${v.detail}`);
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
      const pat = /^(continue|got it|close|claim|collect|skip tutorial|skip|onward|begin|ok|later|✕|×)$/i;
      const b = btns.find((x) => pat.test(x.textContent?.trim() ?? '') && (x as HTMLElement).offsetParent !== null);
      if (b) { (b as HTMLElement).click(); return true; }
      return false;
    });
    if (!acted) break;
    await page.waitForTimeout(220);
  }
}

function audit(page: import('playwright-core').Page, screen: string, vp: string): Promise<Violation[]> {
  return page.evaluate(({ screen, vp, TAP_MIN }) => {
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
      if (r.height < TAP_MIN || r.width < TAP_MIN) {
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
    // De-duplicate identical findings (lists repeat the same template).
    const seen = new Set<string>();
    return out.filter((v) => {
      const k = `${v.kind}|${v.detail.replace(/\d+/g, '#')}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, { screen, vp, TAP_MIN });
}

void main();
