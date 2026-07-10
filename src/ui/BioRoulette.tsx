// BIO-ROULETTE — the Boss Rush-exclusive second reward ceremony (docs/BOSS-RUSH.md §roulette).
// An enormous living wheel of flesh: reward pods ring a central orifice that launches the run's
// BIO-SPORES one by one with real momentum — each settles into its (pre-rolled, weighted) pod,
// the pod flares and ABSORBS it in a spark burst, the tally ticks. The OVERHAUL adds the three
// depth systems the model now carries (state/bioRoulette.ts): DEPTH TIERS (quantities scale with
// the rush record), the MUTATION SURGE pity arc around the orifice (a dud streak of commons
// forces the next spore — rendered viral-magenta — into the premium pool), and the JACKPOT pod
// (one gold-crowned quantity pod pays ×3). Presentation only: the model pre-rolls everything, so
// the theater can never change what a spore is worth. DPR-crisp, responsive, visibility-paused;
// prefers-reduced-motion resolves the whole ceremony instantly to a readable still.

import { useEffect, useMemo, useRef, useState } from 'react';
import { isTowerUnlocked, meta } from '../state/meta';
import { audio } from '../audio/sound';
import {
  ROULETTE, boardTier, isPremiumPod, rollBoard, rollJackpot, rollOutcomesWithSurge,
  summarizeRewards, tripleReward,
} from '../state/bioRoulette';
import { TOWER_ORDER } from '../core/config';

const LAUNCH_GAP = 0.55; // seconds between spore launches
const SPIN_T = 2.1; // seconds of powered spin (cubic decel = momentum reads honestly)
const SETTLE_T = 0.45; // wobble into the pod
const ABSORB_T = 0.5; // pod swallows the sphere
const TAU = Math.PI * 2;

interface Spore {
  target: number; // pod index (pre-rolled)
  surge: boolean; // §surge — forced into the premium pool (viral-magenta presentation)
  launchAt: number; // ceremony clock seconds
  theta0: number; // launch angle
  turns: number; // full rotations before settling (2..4 — varies the show)
  done: boolean; // tallied
}

interface Burst { x: number; y: number; at: number; color: string; big: boolean }

/** Cubic ease-out — fast off the line, decaying to rest (the momentum read). */
const easeOut = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Resolve a pod's CSS color spec ('var(--x)' | 'var(--x, fb)' | raw) to a canvas-usable color. */
function makeCssColor(): (spec: string) => string {
  const cache = new Map<string, string>();
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  return (spec: string): string => {
    const hit = cache.get(spec);
    if (hit) return hit;
    let out = spec;
    const m = /^var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)$/i.exec(spec.trim());
    if (m) out = (root?.getPropertyValue(m[1]) || m[2] || '#b64dff').trim();
    cache.set(spec, out);
    return out;
  };
}

export function BioRoulette({ spores, onExit }: { spores: number; onExit: () => void }): JSX.Element {
  const save = meta.use();
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // The board, jackpot pod, and every outcome are rolled ONCE per ceremony — fresh each run,
  // weighted, tier-scaled by the account's rush record (§tier). The theater just replays them.
  const { board, outcomes, surges, jackpot, tier } = useMemo(() => {
    const roster = {
      towers: TOWER_ORDER.filter((k) => isTowerUnlocked(save, k)),
      heroes: save.heroUnlocked,
    };
    const t = boardTier(save.rushBestWave ?? 0);
    const b = rollBoard(Math.random, roster, t);
    const rolled = rollOutcomesWithSurge(Math.random, b, spores);
    return { board: b, outcomes: rolled.outcomes, surges: rolled.surges, jackpot: rollJackpot(Math.random, b), tier: t };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roll once; the ceremony owns this board
  }, []);

  const [landedCount, setLandedCount] = useState(reduced ? spores : 0);
  const [revealed, setRevealed] = useState(reduced);
  const [collected, setCollected] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    landed: reduced ? spores : 0,
    glow: new Map<number, number>(),
    bursts: [] as Burst[],
    streak: 0, // §surge — live pity meter (mirrors the model's walk as spores land)
    surgeFlash: -9, // clock stamp of the last surge landing (screen pulse)
    revealAt: reduced ? 0 : -1,
  });

  const sporesList = useMemo<Spore[]>(
    () => outcomes.map((target, i) => ({
      target,
      surge: surges[i],
      launchAt: 0.6 + i * LAUNCH_GAP,
      theta0: Math.random() * TAU,
      turns: 2 + Math.floor(Math.random() * 3),
      done: reduced,
    })),
    [outcomes, surges, reduced],
  );

  const allLanded = landedCount >= spores;
  const tally = useMemo(
    () => summarizeRewards(board, outcomes.slice(0, landedCount), jackpot),
    [board, outcomes, landedCount, jackpot],
  );

  const collect = (): void => {
    if (collected) return;
    setCollected(true);
    // §jackpot — the landed pod pays triple; the model's tripleReward owns the math.
    meta.grantRouletteRewards(outcomes.map((o) => (o === jackpot ? tripleReward(board[o].reward) : board[o].reward)), spores);
    audio.cue('ui');
    onExit();
  };

  // ── The ceremony loop — DPR-crisp, responsive, visibility-paused ─────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!wrap || !canvas || !ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssColor = makeCssColor();
    let W = 0;
    let H = 0;
    const size = (): void => {
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);

    let raf = 0;
    let stopped = false;
    const t0 = performance.now();
    const st = stateRef.current;

    const draw = (): void => {
      const now = (performance.now() - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.36; // pod ring radius
      ctx.clearRect(0, 0, W, H);

      // ── The organ: breathing membrane rings + a slow-rotating vein web + drifting motes ──
      const breathe = 1 + Math.sin(now * 1.4) * 0.012;
      for (let i = 4; i >= 1; i--) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.32 + i * 0.22) * breathe, 0, TAU);
        ctx.strokeStyle = `rgba(182, 77, 255, ${0.05 + i * 0.02})`;
        ctx.lineWidth = 10 - i * 1.6;
        ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {
        // Ambient motes orbiting between the membranes — the organ is ALIVE, not a chart.
        const a = now * 0.12 + (i / 7) * TAU;
        const rr = R * (0.55 + 0.3 * Math.sin(i * 2.1 + now * 0.4));
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6 + Math.sin(now + i) * 0.6, 0, TAU);
        ctx.fillStyle = 'rgba(205, 184, 230, 0.28)';
        ctx.fill();
      }
      for (let i = 0; i < board.length; i++) {
        const a = (i / board.length) * TAU - Math.PI / 2;
        const wob = Math.sin(now * 1.1 + i * 1.7) * 6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.24, cy + Math.sin(a) * R * 0.24);
        ctx.quadraticCurveTo(
          cx + Math.cos(a + 0.09) * R * 0.6 + wob, cy + Math.sin(a + 0.09) * R * 0.6 + wob,
          cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26),
        );
        ctx.strokeStyle = 'rgba(255, 93, 115, 0.16)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // ── Pods — fleshy sacs, rarity-bloom fills, nucleus pips per absorb, jackpot crown ──
      const counts = new Map<number, number>();
      for (let i = 0; i < st.landed; i++) counts.set(outcomes[i], (counts.get(outcomes[i]) ?? 0) + 1);
      for (let i = 0; i < board.length; i++) {
        const a = (i / board.length) * TAU - Math.PI / 2;
        const px = cx + Math.cos(a) * R;
        const py = cy + Math.sin(a) * R;
        const glow = Math.max(0, (st.glow.get(i) ?? -9) + 0.9 - now); // 0.9s flare after an absorb
        const premium = isPremiumPod(board[i]);
        const pulse = 1 + Math.sin(now * 2 + i) * 0.03 + glow * 0.3;
        const r = Math.max(24, R * 0.19) * pulse;
        const pc = cssColor(board[i].color);
        if (glow > 0) {
          ctx.beginPath();
          ctx.arc(px, py, r + 16 * glow, 0, TAU);
          ctx.fillStyle = `rgba(255, 214, 92, ${0.25 * glow})`;
          ctx.fill();
        }
        // The sac: organic wobble path with a radial rarity bloom inside.
        ctx.beginPath();
        for (let k = 0; k <= 20; k++) {
          const b = (k / 20) * TAU;
          const wob = 1 + Math.sin(b * 3 + now * 1.6 + i) * 0.07;
          const x = px + Math.cos(b) * r * wob;
          const y = py + Math.sin(b) * r * wob;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const fill = ctx.createRadialGradient(px, py - r * 0.25, r * 0.1, px, py, r);
        fill.addColorStop(0, `color-mix(in srgb, ${pc} 32%, rgba(20,14,28,0.94))`);
        fill.addColorStop(1, 'rgba(16, 11, 22, 0.94)');
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = glow > 0 ? '#ffd65c' : premium ? pc : 'rgba(182, 77, 255, 0.55)';
        ctx.lineWidth = glow > 0 ? 3 : premium ? 2.2 : 1.6;
        ctx.stroke();
        // §jackpot — the crowned pod: a slow-pulsing double gold ring + ×3 badge.
        if (i === jackpot) {
          const jp = 1 + Math.sin(now * 2.6) * 0.06;
          ctx.beginPath();
          ctx.arc(px, py, (r + 7) * jp, 0, TAU);
          ctx.strokeStyle = 'rgba(255, 214, 92, 0.85)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, (r + 12) * jp, 0, TAU);
          ctx.strokeStyle = 'rgba(255, 214, 92, 0.3)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = '#ffd65c';
          ctx.font = '800 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('×3', px, py - r - 20);
        }
        ctx.fillStyle = glow > 0 ? '#ffd65c' : '#e6d9f6';
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(board[i].short, px, py - (counts.get(i) ? 5 : 0));
        const c = counts.get(i);
        if (c) {
          ctx.fillStyle = '#ffd65c';
          ctx.font = '800 12px system-ui, sans-serif';
          ctx.fillText(`×${c}`, px, py + 10);
        }
      }

      // ── The central orifice — sphincter fringe + launch pulse + the SURGE arc (§surge) ──
      const oR = R * 0.2 * (1 + Math.sin(now * 2.2) * 0.05);
      for (let i = 0; i < 8; i++) {
        // Tendril fringe flexing around the mouth.
        const a = (i / 8) * TAU + now * 0.35;
        const flex = 1 + Math.sin(now * 3 + i * 2.2) * 0.18;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * oR * 0.95, cy + Math.sin(a) * oR * 0.95);
        ctx.lineTo(cx + Math.cos(a) * oR * (1.28 * flex), cy + Math.sin(a) * oR * (1.28 * flex));
        ctx.strokeStyle = 'rgba(255, 93, 115, 0.5)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
      const grad = ctx.createRadialGradient(cx, cy, oR * 0.15, cx, cy, oR);
      grad.addColorStop(0, 'rgba(255, 93, 115, 0.9)');
      grad.addColorStop(0.55, 'rgba(120, 30, 70, 0.85)');
      grad.addColorStop(1, 'rgba(24, 10, 26, 0.95)');
      ctx.beginPath();
      ctx.arc(cx, cy, oR, 0, TAU);
      ctx.fillStyle = grad;
      ctx.fill();
      // The pity meter: a viral arc filling with the live common-streak; flares when armed.
      const armed = st.streak >= ROULETTE.surgeAt;
      const frac = Math.min(1, st.streak / ROULETTE.surgeAt);
      if (frac > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, oR + 8, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
        ctx.strokeStyle = armed ? `rgba(226, 77, 255, ${0.8 + Math.sin(now * 8) * 0.2})` : 'rgba(226, 77, 255, 0.55)';
        ctx.lineWidth = armed ? 4 : 3;
        ctx.stroke();
      }
      // A brief viral pulse across the organ when a surge lands.
      const sf = Math.max(0, st.surgeFlash + 0.7 - now);
      if (sf > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1.25 - sf * 0.25), 0, TAU);
        ctx.strokeStyle = `rgba(226, 77, 255, ${0.35 * sf})`;
        ctx.lineWidth = 6 * sf;
        ctx.stroke();
      }

      // ── Spores in flight: comet trails; surge spores fly viral-magenta ──
      let landedNow = st.landed;
      for (let i = 0; i < sporesList.length; i++) {
        const sp = sporesList[i];
        if (sp.done) continue;
        const revealAll = st.revealAt >= 0 && sp.launchAt > st.revealAt;
        const t = now - sp.launchAt;
        if (revealAll || t > SPIN_T + SETTLE_T + ABSORB_T) {
          sp.done = true;
          landedNow++;
          st.glow.set(sp.target, now);
          st.streak = isPremiumPod(board[sp.target]) ? 0 : st.streak + 1;
          if (sp.surge) st.surgeFlash = now;
          continue;
        }
        if (t < 0) continue;
        const targetA = (sp.target / board.length) * TAU - Math.PI / 2;
        // One parametric position fn — evaluated at now AND slightly in the past for the trail.
        const pos = (tt: number): { a: number; rad: number; size: number } => {
          if (tt < SPIN_T) {
            const k = easeOut(tt / SPIN_T);
            return {
              a: sp.theta0 + (targetA + sp.turns * TAU - sp.theta0) * k,
              rad: oR + (R - 30 - oR) * Math.min(1, tt / (SPIN_T * 0.55)),
              size: sp.surge ? 12 : 9,
            };
          }
          if (tt < SPIN_T + SETTLE_T) {
            const s = (tt - SPIN_T) / SETTLE_T;
            return {
              a: targetA + Math.sin(s * Math.PI * 3) * 0.08 * (1 - s),
              rad: R - 30 + Math.sin(s * Math.PI * 2) * 4 * (1 - s),
              size: sp.surge ? 12 : 9,
            };
          }
          const s = (tt - SPIN_T - SETTLE_T) / ABSORB_T;
          if (s > 0.8 && !sp.done) st.glow.set(sp.target, now);
          return { a: targetA, rad: R - 30 + s * 26, size: (sp.surge ? 12 : 9) * (1 - s) };
        };
        const main = pos(t);
        const color = sp.surge ? '#e24dff' : '#ffe6a8';
        const glowColor = sp.surge ? '#c86bff' : '#ffd65c';
        // Comet trail: 5 ghosts sampled back along the SAME path — honest momentum, no state.
        for (let g = 5; g >= 1; g--) {
          const gp = pos(Math.max(0, t - g * 0.035));
          ctx.beginPath();
          ctx.arc(cx + Math.cos(gp.a) * gp.rad, cy + Math.sin(gp.a) * gp.rad, Math.max(0.4, gp.size * (1 - g * 0.16)), 0, TAU);
          ctx.fillStyle = sp.surge ? `rgba(226, 77, 255, ${0.1 * (6 - g)})` : `rgba(255, 214, 92, ${0.08 * (6 - g)})`;
          ctx.fill();
        }
        const x = cx + Math.cos(main.a) * main.rad;
        const y = cy + Math.sin(main.a) * main.rad;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, main.size), 0, TAU);
        ctx.fillStyle = color;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = sp.surge ? 20 : 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        // Landing spark burst + the audio cue fire exactly once, at the absorb threshold.
        if (t > SPIN_T + SETTLE_T + ABSORB_T - 0.05 && !sp.done) {
          st.bursts.push({ x, y, at: now, color: sp.surge ? '#e24dff' : cssColor(board[sp.target].color), big: sp.surge || sp.target === jackpot });
        }
      }
      // Spark bursts (0.5s of radial sparks; surge/jackpot bursts run bigger).
      st.bursts = st.bursts.filter((b) => now - b.at < 0.5);
      for (const b of st.bursts) {
        const s = (now - b.at) / 0.5;
        const n = b.big ? 10 : 6;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + b.at * 7;
          const d = (b.big ? 30 : 20) * easeOut(s);
          ctx.beginPath();
          ctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, Math.max(0.4, (b.big ? 3 : 2.2) * (1 - s)), 0, TAU);
          ctx.fillStyle = b.color;
          ctx.globalAlpha = 1 - s;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      if (landedNow !== st.landed) {
        // Which pods did the NEW landings hit? Differentiated cues: jackpot > surge > normal.
        const fresh = outcomes.slice(st.landed, landedNow);
        const freshSurge = surges.slice(st.landed, landedNow).some(Boolean);
        st.landed = landedNow;
        setLandedCount(landedNow);
        if (fresh.includes(jackpot)) audio.cue('chest');
        else if (freshSurge) audio.cue('graftCrack');
        else audio.cue('splice');
      }
      if (!stopped && !reduced) raf = requestAnimationFrame(tick);
    };
    // Visibility pause: skip the paint while hidden, keep the clock (spores resolve on return).
    const tick = (): void => { if (document.hidden) { raf = requestAnimationFrame(tick); return; } draw(); };

    if (reduced) {
      draw(); // one readable still — every spore pre-resolved, every pod counted
      return () => { stopped = true; ro.disconnect(); };
    }
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; ro.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one loop per ceremony
  }, []);

  const revealAll = (): void => {
    if (revealed) return;
    setRevealed(true);
    stateRef.current.revealAt = 0; // every not-yet-launched spore resolves on the next frame
    audio.cue('ui');
  };

  return (
    <div className="roulette-screen" role="dialog" aria-label="Bio-Roulette">
      <div className="roulette-head">
        <div>
          <div className="roulette-eyebrow">BOSS RUSH EXCLUSIVE</div>
          <h1 className="roulette-title">BIO-ROULETTE</h1>
          <div className="roulette-meta">
            {tier > 1 && (
              <span className="roulette-tier" title="Pod quantities scale with your Boss Rush depth record">
                DEPTH TIER ×{tier.toFixed(2).replace(/\.?0+$/, '')}
              </span>
            )}
            <span className="roulette-jack" title="One pod per ceremony is JACKPOT — spores landing there pay triple">
              ✦ jackpot pod pays ×{ROULETTE.jackpotMult}
            </span>
          </div>
        </div>
        <div className="roulette-spores" title="1 per new lifetime-record boss + 1 per 5 bosses felled this run">
          ✺ Bio-Spores <b>{Math.max(0, spores - landedCount)}</b> / {spores}
        </div>
      </div>

      <div className="roulette-stage" ref={wrapRef}>
        <canvas ref={canvasRef} className="roulette-canvas" />
      </div>

      <aside className="roulette-side">
        <div className="roulette-side-k">Absorbed</div>
        {tally.length === 0 && <div className="roulette-empty">The organ waits…</div>}
        {tally.map((t) => (
          <div className={`roulette-row${t.jackpot ? ' is-jackpot' : ''}`} key={t.label}>
            <i style={{ background: t.color }} />
            <span>{t.label}{t.jackpot ? ' — JACKPOT ×3' : ''}</span>
            <b>×{t.count}</b>
          </div>
        ))}
        <div className="roulette-actions">
          {!allLanded && (
            <button className="roulette-reveal" onClick={revealAll} disabled={revealed}>
              ⚡ Reveal All
            </button>
          )}
          <button className={`primary roulette-collect${allLanded ? ' is-ready' : ''}`} onClick={() => { revealAll(); collect(); }}>
            {allLanded ? '✺ Absorb All & Continue' : 'Collect & Skip'}
          </button>
        </div>
        <p className="roulette-hint">
          Spores are earned by the gauntlet — one per NEW lifetime-record boss, one per{' '}
          {ROULETTE.sporesPerVolume} bosses felled. Every pod pays; the wheel only decides how much.
          A streak of {ROULETTE.surgeAt} common landings arms a <b className="roulette-surge-word">Mutation Surge</b> —
          the next spore is forced into the premium pods.
        </p>
      </aside>
    </div>
  );
}
