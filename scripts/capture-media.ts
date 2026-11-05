// MEDIA CAPTURE (docs/WEBSITE.md §media) — re-shoots the website's screenshots and trailer from
// the real build, so the public site never shows a HUD the game has outgrown.
//
//   npm run media                 build, then the three stills + the trailer
//   npm run media -- --stills     the stills only (no ffmpeg needed)
//   npm run media -- --no-build   reuse dist/ as-is
//
// Output: public/media/shots/{command,combat,megaraid}.webp (1440×900) and public/media/trailer.webm
// (1440×900, 24 fps, VP9 — needs ffmpeg on PATH). The trailer is FRAME-STEPPED: Playwright's fake
// clock advances exactly 1/24 s between screenshots, so it is smooth on any machine.
//
// STAGING (honest, documented): a seeded save (Campaign cleared to N), cleared-stage replays (where
// Hive Intelligence is allowed), the 15 run-start slots filled through Game.deployTower, and the
// current wave swollen with MORE OF ITS OWN enemy kinds via the ?debug handle so the field reads at a
// glance. Toasts are hidden; everything on screen is the shipped renderer and HUD.

import { spawn, execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { chromePath } from './chromePath';

const args = process.argv.slice(2);
const STILLS_ONLY = args.includes('--stills');
const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 4395;
const BASE = `http://localhost:${PORT}`;
const VIEW = { width: 1440, height: 900 };
const FPS = 24;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type DebugGame = {
  phase: string; waveIndex: number; enemies: { kind: string }[]; unlockedKinds: Set<string>; stage?: { enemyPool: string[] };
  mega: unknown; debugAddBiomass(n: number): void; debugRefillIntegrity(): void; debugReviveHero?(): void;
  debugSpawn(kind: string, n: number): void; deployTower(kind: string, x: number, y: number): boolean;
};
declare global { var __game: DebugGame | null | undefined } // set by src/debug/debug.ts under ?debug

// ── page helpers ────────────────────────────────────────────────────────────────
async function dismiss(page: Page, rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    const clicked = await page.evaluate(() => {
      const pats = [/^got it/i, /^skip/i, /^continue/i, /^close/i, /^later/i, /^dismiss/i, /^ok\b/i, /^collect/i, /^claim/i, /^onward/i, /^✕|^×/];
      const vis = (e: Element): boolean => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
      for (const d of [...document.querySelectorAll('[role=dialog], .overlay, .whatsnew, .evo-unlock')].filter(vis)) {
        for (const p of pats) {
          const b = [...d.querySelectorAll('button')].filter(vis).find((x) => p.test(((x as HTMLElement).innerText || x.getAttribute('aria-label') || '').trim()));
          if (b) { (b as HTMLElement).click(); return true; }
        }
      }
      return false;
    });
    if (!clicked) return;
    await sleep(450);
  }
}

/** Boot a fresh profile, seed Campaign depth, land on a quiet Command Center. */
async function bootHub(page: Page, cleared: number): Promise<void> {
  await page.goto(`${BASE}/play/?debug`, { waitUntil: 'networkidle' });
  await sleep(1500);
  await page.evaluate((n) => {
    const raw = localStorage.getItem('assimilate.save');
    if (!raw) return;
    const blob = JSON.parse(raw) as { data: Record<string, unknown>; checksum: string };
    const d = blob.data as Record<string, unknown> & { campaign?: object };
    d.campaign = { ...(d.campaign ?? {}), cleared: { standard: n }, bestTime: {} };
    d.totalRuns = n >= 20 ? 64 : 14;
    d.bestWave = n >= 20 ? 41 : 9;
    d.ichor = 180; d.shards = 4200; d.geneEssence = 900;
    d.help = { seen: [], primed: false, hudTour: true };
    const s = JSON.stringify(d);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    blob.checksum = (h >>> 0).toString(36);
    localStorage.setItem('assimilate.save', JSON.stringify(blob));
  }, cleared);
  await page.reload({ waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '.debug-panel { display: none !important; }' });
  await sleep(1500);
  await dismiss(page, 20);
  await page.evaluate(() => (document.querySelector('[data-nav="home"]') as HTMLElement | null)?.click());
  await sleep(1200);
  await dismiss(page, 20);
}

/** Replay a cleared stage through the real Campaign screen. */
async function startStage(page: Page, stage: number): Promise<void> {
  await page.evaluate(() => (document.querySelector('[data-hub="play"]') as HTMLElement | null)?.click());
  await sleep(700);
  await page.evaluate(() => (document.querySelector('.hubl-grid [data-nav="campaign"], .hub-nav [data-nav="campaign"]') as HTMLElement | null)?.click());
  await sleep(1200);
  await dismiss(page);
  await page.fill('.camp-search', String(stage));
  await page.press('.camp-search', 'Enter');
  await sleep(600);
  await page.evaluate(() => (document.querySelector('.camp-deploy') as HTMLElement | null)?.click());
  await sleep(2200);
  await dismiss(page);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^(Begin|Deploy|Fight anyway|Start)/i.test(((x as HTMLElement).innerText || '').trim()));
    (b as HTMLElement | undefined)?.click();
  });
  await sleep(2500);
  await dismiss(page);
  if (!(await page.evaluate(() => !!document.querySelector('canvas.board')))) throw new Error(`stage ${stage}: no run on screen`);
}

const keepAlive = (page: Page): Promise<void> => page.evaluate(() => { globalThis.__game?.debugRefillIntegrity(); globalThis.__game?.debugReviveHero?.(); });

/** Fill the 15 run-start slots (centre five columns × three rows) and let Hive Intelligence upgrade. */
async function garrison(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis.__game;
    if (!g) return;
    g.debugAddBiomass(60000);
    const kinds = [...g.unlockedKinds];
    let k = 0;
    for (const x of [360, 280, 440, 200, 520]) for (const y of [900, 820, 740]) { g.deployTower(kinds[k % kinds.length], x, y); k++; }
  });
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { globalThis.__game?.debugAddBiomass(20000); (document.querySelector('.hive-mind-btn') as HTMLElement | null)?.click(); });
    await sleep(400);
    await closeDrafts(page);
  }
}

/** Play forward (5×, first draft card, Hive Intelligence each beat) to the build phase before `wave`. */
async function prepFor(page: Page, wave: number): Promise<void> {
  const end = Date.now() + 240_000;
  while (Date.now() < end) {
    await keepAlive(page);
    await page.evaluate(() => { globalThis.__game?.debugAddBiomass(2500); (document.querySelector('.hive-mind-btn') as HTMLElement | null)?.click(); });
    if (await page.evaluate(() => !!document.querySelector('.overlay .cards'))) { await page.keyboard.press('1'); await sleep(300); await page.keyboard.press('Enter'); }
    await dismiss(page, 2);
    const st = await page.evaluate(() => ({ w: globalThis.__game?.waveIndex ?? 0, p: globalThis.__game?.phase }));
    if (st.w >= wave - 1 && st.p === 'prep') return;
    if (st.p === 'prep') {
      await page.evaluate(() => {
        const s = [...document.querySelectorAll('.speed-btn')].find((x) => (x.textContent || '').trim().startsWith('5'));
        if (s && !s.classList.contains('on')) (s as HTMLElement).click();
        ([...document.querySelectorAll('button')].find((x) => /Start Wave/i.test((x as HTMLElement).innerText || '')) as HTMLElement | undefined)?.click();
      });
    }
    await sleep(600);
  }
  throw new Error(`never reached the build phase before wave ${wave}`);
}

/** Close any open gene draft (Hive Intelligence SPLICES an overflowing bank — the pulse then ends on the
 *  open draft; docs/CARDS.md §splice) so the shot shows the battlefield, not a modal. */
async function closeDrafts(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const open = await page.evaluate(() => !!document.querySelector('.overlay .cards') || globalThis.__game?.phase === 'draft');
    if (!open) return;
    await page.keyboard.press('1');
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(500);
  }
}

/** Start the wave at 1× and swell it with more of its own kinds. */
async function heavyWave(page: Page, perKind: number): Promise<void> {
  await closeDrafts(page);
  await page.addStyleTag({ content: '.rwt2-wrap, .speed-note, .axp-toast, .mtoasts, .hive-ticker { display: none !important; }' });
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.speed-btn')].find((x) => (x.textContent || '').trim().startsWith('1'));
    (s as HTMLElement | undefined)?.click();
    ([...document.querySelectorAll('button')].find((x) => /Start Wave/i.test((x as HTMLElement).innerText || '')) as HTMLElement | undefined)?.click();
  });
  await sleep(1200);
  await swell(page, perKind);
}

function swell(page: Page, perKind: number): Promise<void> {
  return page.evaluate((n) => {
    const g = globalThis.__game;
    if (!g) return;
    const live = [...new Set(g.enemies.map((e) => e.kind))];
    for (const k of (live.length ? live : g.stage?.enemyPool ?? []).slice(0, 3)) g.debugSpawn(k, n);
  }, perKind);
}

/** PNG → WebP inside Chromium (no external encoder for the stills). */
async function toWebp(browser: Browser, png: Buffer, out: string): Promise<void> {
  const p = await browser.newPage();
  const dataUrl = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.86);
  }, png.toString('base64'));
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await p.close();
}

// ── the shoots ──────────────────────────────────────────────────────────────────
async function scene(browser: Browser, cleared: number, clock: boolean): Promise<Page> {
  const ctx = await browser.newContext({ viewport: VIEW });
  const page = await ctx.newPage();
  if (clock) await page.clock.install();
  await bootHub(page, cleared);
  return page;
}

async function stills(browser: Browser): Promise<void> {
  const shots = join(ROOT, 'public/media/shots');
  let page = await scene(browser, 2, false); // a Stage-2 account: its Power matches its depth
  await sleep(2500);
  await dismiss(page);
  await toWebp(browser, await page.screenshot({ animations: 'disabled' }), join(shots, 'command.webp'));
  await page.context().close();
  console.log('media: command.webp');

  page = await scene(browser, 30, false);
  await startStage(page, 17); // The Coil
  await garrison(page); await prepFor(page, 6); await garrison(page);
  await heavyWave(page, 50);
  // Let the swarm come down the maze before the cast (a fresh swell crowds the first corridor).
  await sleep(3200); await keepAlive(page); await page.keyboard.press('q'); await sleep(300);
  await toWebp(browser, await page.screenshot({ animations: 'disabled' }), join(shots, 'combat.webp'));
  await page.context().close();
  console.log('media: combat.webp');

  page = await scene(browser, 30, false);
  await startStage(page, 20); // a Mega raid on The Gullet
  await garrison(page); await prepFor(page, 3); await garrison(page);
  await heavyWave(page, 40);
  await sleep(1300); await keepAlive(page); await page.keyboard.press('q'); await sleep(1000);
  await toWebp(browser, await page.screenshot({ animations: 'disabled' }), join(shots, 'megaraid.webp'));
  await page.context().close();
  console.log('media: megaraid.webp');
}

async function trailer(browser: Browser): Promise<void> {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) throw new Error('the trailer needs ffmpeg on PATH (or run with --stills)');
  const frames = mkdtempSync(join(tmpdir(), 'asm-trailer-'));
  let n = 0;
  const shoot = async (page: Page, seconds: number, beat?: (f: number) => Promise<void>): Promise<void> => {
    await page.clock.pauseAt(new Date(Date.now() + 250));
    for (let f = 0; f < Math.round(seconds * FPS); f++) {
      if (beat) await beat(f);
      await page.clock.runFor(1000 / FPS);
      await page.screenshot({ path: join(frames, `f-${String(n++).padStart(5, '0')}.png`) });
    }
    await page.clock.resume();
  };

  let page = await scene(browser, 2, true);
  await sleep(2500); await dismiss(page);
  await shoot(page, 4);
  await page.context().close();

  page = await scene(browser, 30, true);
  await startStage(page, 17);
  await garrison(page); await prepFor(page, 6); await garrison(page);
  await heavyWave(page, 45);
  await shoot(page, 16, async (f) => {
    if (f % 24 === 0) await keepAlive(page);
    if (f === 40 || f === 220) await page.keyboard.press('q');
    if (f === 130 || f === 260) await swell(page, 40);
  });
  await page.context().close();

  page = await scene(browser, 30, true);
  await startStage(page, 20);
  await garrison(page); await prepFor(page, 3); await garrison(page);
  await heavyWave(page, 35);
  await shoot(page, 16, async (f) => {
    if (f % 24 === 0) await keepAlive(page);
    if (f === 60 || f === 250) await page.keyboard.press('q');
    if (f === 150 || f === 300) await swell(page, 30);
  });
  await page.context().close();

  const secs = n / FPS;
  const r = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, 'f-%05d.png'),
    '-vf', `fade=t=in:st=0:d=0.6,fade=t=out:st=${(secs - 0.7).toFixed(2)}:d=0.7`,
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-pix_fmt', 'yuv420p', '-an',
    join(ROOT, 'public/media/trailer.webm'),
  ], { stdio: 'inherit' });
  rmSync(frames, { recursive: true, force: true });
  if (r.status !== 0) throw new Error('ffmpeg failed to encode the trailer');
  console.log(`media: trailer.webm (${n} frames, ${secs.toFixed(1)} s)`);
}

async function main(): Promise<void> {
  if (!args.includes('--no-build')) execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const stop = (): void => { try { process.kill(-(srv.pid ?? 0)); } catch { /* already gone */ } };
  await sleep(3500);
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-gpu'] });
  try {
    await stills(browser);
    if (!STILLS_ONLY) await trailer(browser);
  } finally {
    await browser.close();
    stop();
  }
  console.log(`media: done — ${readdirSync(join(ROOT, 'public/media/shots')).length} stills in public/media/shots. Bump the PIL review stamp and run \`npm run site\`.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
