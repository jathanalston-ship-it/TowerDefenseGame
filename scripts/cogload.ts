// COGNITIVE-LOAD AUDIT (docs/INFO-HIERARCHY.md) — measures what LAYER ONE actually shows on
// every screen: how many elements fight for attention, how many raw numbers confront the
// player before any interaction, how much text the screen speaks, and whether exactly one
// action dominates. "Players should only need to think about what matters in the next 30
// seconds" — this script is how that stops being a slogan and becomes a measured budget.
//
//   npm run cogload           → walks every registry screen (developed profile, desktop +
//                               landscape phone), writes docs/COGLOAD_REPORT.md, exits 1 on
//                               HARD budget violations (attention animators per screen).
//
// Metrics per screen (visible-in-viewport only — Layer 1 is what you see WITHOUT scrolling):
//   attn      running attention animations (name ~ pulse|breathe|blink|flash|glow, infinite,
//             duration ≤ 3.6s — slower loops read as ambient/decorative, not attention)
//   digits    digit-runs in visible text (Layer-1 numeric density — "outcomes before numbers")
//   chars     visible text length (reading burden)
//   primaries hero CTAs visible (.primary/.ah-primary/.bbs-buy) — ONE thing should dominate
//   badges    notification badges visible
//   small     visible text leaves under the 12px floor (docs/UI-STANDARDS.md §readability)
//   lowCr     visible text leaves under 4.5:1 against their nearest opaque background
//
// BUDGETS (docs/INFO-HIERARCHY.md §budget): attn ≤ 2 HARD (the ONE priority may breathe,
// plus at most one secondary); primaries ≤ 3 and digits ≤ 40 are REPORTED as pressure, not
// failed — screens differ legitimately (a lab is denser than a landing). The READABILITY gauge
// (small < 12px, lowCr < 4.5:1) is likewise reported, never failed: decorative eyebrows may sit
// under 12px, and the token floor itself is pinned by src/dev/tokenContrast.test.ts.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { navGroups } from '../src/ui/navModel';
import { chromePath } from './chromePath';

const CHROME = chromePath(); // MOBILECHECK_CHROMIUM, else the newest preinstalled browser (scripts/chromePath.ts)
const PORT = 4188;
const ROOT = new URL('..', import.meta.url).pathname;
const ATTN_BUDGET = 2;

interface Row { screen: string; vp: string; attn: number; attnNames: string; digits: number; chars: number; primaries: number; badges: number; texts: number; small: number; lowCr: number }

async function dismiss(page: import('playwright-core').Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const done = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => (b as HTMLElement).offsetParent !== null);
      for (const re of [/^(skip|close|dismiss|got it|later|✕|x)$/i, /^continue/i]) {
        const b = btns.find((x) => re.test((x.textContent ?? '').trim()));
        if (b) { (b as HTMLElement).click(); return false; }
      }
      return true;
    });
    if (done) break;
    await page.waitForTimeout(220);
  }
}

/** The Layer-1 measurement — everything visible in the viewport right now. */
async function measure(page: import('playwright-core').Page, screen: string, vp: string): Promise<Row> {
  const m = await page.evaluate(() => {
    const vw = innerWidth; const vh = innerHeight;
    const vis = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    };
    let attn = 0; const names: Record<string, number> = {};
    for (const el of document.querySelectorAll('*')) {
      if (!vis(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.animationName === 'none' || cs.animationName === '') continue;
      const ns = cs.animationName.split(', ');
      const ds = cs.animationDuration.split(', ').map((x) => parseFloat(x) || 0);
      const its = cs.animationIterationCount.split(', ');
      ns.forEach((n, i) => {
        if (!/pulse|breathe|blink|flash|glow/i.test(n)) return;
        if (its[i % its.length] !== 'infinite') return;
        if ((ds[i % ds.length] || 0) > 3.6) return; // ambient, not attention
        attn++; names[n] = (names[n] ?? 0) + 1;
      });
    }
    let chars = 0; let digits = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode; const p = (t as Text).parentElement;
      if (!p || !vis(p)) continue;
      const cs = getComputedStyle(p);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const s = (t.textContent ?? '').trim();
      if (!s) continue;
      chars += s.length;
      digits += (s.match(/\d[\d,.%]*/g) ?? []).length;
    }
    const primaries = [...document.querySelectorAll('.primary, .ah-primary, .bbs-buy')].filter(vis).length;
    const badges = [...document.querySelectorAll('.nav-badge, .ah-dot')].filter(vis).length;
    // READABILITY gauge: text leaves under the 12px floor, and under 4.5:1 against the nearest
    // ancestor with an (≥ 50% alpha) background colour — gradients fall back to --panel.
    const rgba = (c: string): number[] => (c.match(/[\d.]+/g) ?? ['0', '0', '0', '0']).map(Number);
    const lum = (c: number[]): number => {
      const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const PANEL = [17, 22, 31];
    const bgOf = (el: Element): number[] => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const c = rgba(cs.backgroundColor);
        if ((c[3] ?? 1) >= 0.5) return c.slice(0, 3);
        if (cs.backgroundImage !== 'none') return PANEL;
      }
      return PANEL;
    };
    let texts = 0; let small = 0; let lowCr = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0 || (el.textContent ?? '').trim().length < 2 || !vis(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      texts++;
      if (parseFloat(cs.fontSize) < 12) small++;
      const fg = rgba(cs.color); const a = (fg[3] ?? 1) * parseFloat(cs.opacity || '1'); const bg = bgOf(el);
      const mix = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
      const [hi, lo] = [lum(mix), lum(bg)].sort((x, y) => y - x);
      if ((hi + 0.05) / (lo + 0.05) < 4.5) lowCr++;
    }
    return { attn, names, chars, digits, primaries, badges, texts, small, lowCr };
  });
  const attnNames = Object.entries(m.names).sort((a, b) => b[1] - a[1]).map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join(' ');
  return { screen, vp, attn: m.attn, attnNames, digits: m.digits, chars: m.chars, primaries: m.primaries, badges: m.badges, texts: m.texts, small: m.small, lowCr: m.lowCr };
}

async function main(): Promise<void> {
  // vite itself, not `npx vite`: npx leaves its vite child orphaned when killed (same as first-session-probe).
  const preview = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
  const rows: Row[] = [];
  try {
    for (const vp of [
      { name: 'desktop-1366', width: 1366, height: 768, touch: false },
      { name: 'land-844', width: 844, height: 390, touch: true },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${PORT}/play/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await page.addStyleTag({ content: '.debug-panel { display: none !important; }' });
      await dismiss(page);
      // The developed profile (mobilecheck recipe) — the FULL cognitive surface, worst case.
      await page.evaluate(() => {
        const raw = localStorage.getItem('assimilate.save');
        if (!raw) return;
        const blob = JSON.parse(raw) as { data: Record<string, unknown>; checksum: string };
        blob.data.campaign = { ...(blob.data.campaign as object ?? {}), cleared: { standard: 30 }, bestTime: {} };
        blob.data.bestWave = 37;
        blob.data.totalRuns = 21;
        blob.data.ichor = 1250;
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

      const openDrawer = async (): Promise<void> => {
        const opened = await page.evaluate(() => {
          const nav = document.querySelector('.hub-nav');
          const burger = document.querySelector<HTMLElement>('.hub-burger');
          if (burger && burger.offsetParent !== null && nav && !nav.classList.contains('is-open')) { burger.click(); return true; }
          return false;
        });
        if (opened) await page.waitForTimeout(280);
      };

      for (const g of navGroups()) {
        for (const item of g.items) {
          await openDrawer();
          let hit = await page.evaluate((n) => {
            const el = document.querySelector<HTMLElement>(`.hub-nav [data-nav="${n}"]`);
            if (el) { el.click(); return true; }
            return false;
          }, item.key);
          if (!hit) {
            await page.evaluate((h) => document.querySelector<HTMLElement>(`[data-hub="${h}"]`)?.click(), g.id);
            await page.waitForTimeout(380);
            hit = await page.evaluate((n) => {
              const el = document.querySelector<HTMLElement>(`.hubl-grid [data-nav="${n}"]:not(.is-locked)`);
              if (el) { el.click(); return true; }
              return false;
            }, item.key);
          }
          if (!hit) continue; // gated for this profile — nothing rendered to measure
          await page.waitForTimeout(650);
          await dismiss(page);
          rows.push(await measure(page, item.key, vp.name));
        }
        // The hub landing itself is a screen the player reads — measure it too.
        await openDrawer();
        const door = await page.evaluate((h) => {
          const el = document.querySelector<HTMLElement>(`[data-hub="${h}"]`);
          if (el) { el.click(); return true; }
          return false;
        }, g.id);
        if (door) {
          await page.waitForTimeout(450);
          rows.push(await measure(page, `hub:${g.id}`, vp.name));
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    preview.kill();
  }

  const over = rows.filter((r) => r.attn > ATTN_BUDGET);
  const worst = [...rows].sort((a, b) => b.attn - a.attn || b.digits - a.digits);
  const lines = [
    '# COGLOAD_REPORT.md — Layer-1 cognitive load, measured',
    '',
    `> Generated by \`npm run cogload\` (${new Date().toISOString().slice(0, 10)}). Developed profile,`,
    '> viewport-visible content only. Budgets: docs/INFO-HIERARCHY.md §budget —',
    `> **attn ≤ ${ATTN_BUDGET} is HARD** (exit 1); digits/primaries/chars are pressure gauges.`,
    '> Readability (reported): **<12px** = visible text leaves under the 12px floor · **<4.5:1** = leaves',
    '> under AA contrast against their nearest opaque background (docs/UI-STANDARDS.md §readability).',
    '',
    '| screen | vp | attn | attention animators | digits | chars | primaries | badges | <12px | <4.5:1 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...worst.map((r) => `| ${r.screen} | ${r.vp} | ${r.attn > ATTN_BUDGET ? `**${r.attn}** ⚠` : r.attn} | ${r.attnNames || '—'} | ${r.digits} | ${r.chars} | ${r.primaries} | ${r.badges} | ${r.small}/${r.texts} | ${r.lowCr} |`),
    '',
    over.length > 0
      ? `**${over.length} screen(s) over the attention budget** — one priority may breathe; the rest must hold still.`
      : 'All screens inside the attention budget.',
    '',
  ];
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(join(ROOT, 'docs/COGLOAD_REPORT.md'), lines.join('\n'));
  console.log(`cogload: ${rows.length} screen measurements → docs/COGLOAD_REPORT.md`);
  for (const r of worst.slice(0, 8)) {
    console.log(`  ${r.attn > ATTN_BUDGET ? '⚠' : ' '} ${r.screen} @ ${r.vp}: attn ${r.attn} (${r.attnNames || '—'}) · digits ${r.digits} · chars ${r.chars} · primaries ${r.primaries}`);
  }
  const unreadable = [...rows].sort((a, b) => b.lowCr - a.lowCr || b.small - a.small).slice(0, 5);
  console.log(`cogload readability (reported, not failed): worst <4.5:1 — ${unreadable.map((r) => `${r.screen}@${r.vp} ${r.lowCr} low / ${r.small} small of ${r.texts}`).join(' · ')}`);
  if (over.length > 0) {
    console.error(`cogload: ${over.length} screen(s) exceed the attention budget (≤ ${ATTN_BUDGET})`);
    process.exit(1);
  }
}

void main();
