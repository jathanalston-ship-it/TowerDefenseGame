// BIO-ROULETTE — the Boss Rush-exclusive second reward ceremony (docs/BOSS-RUSH.md §roulette).
// An enormous living wheel of flesh: twelve reward pods ring a central orifice that launches
// the run's earned BIO-SPORES one by one. Each sphere spins the track with real momentum,
// settles into its (pre-rolled, weighted) pod, the pod flares and ABSORBS it, the tally ticks,
// and the next spore launches ~0.5s later. Reveal All resolves the rest instantly; collection
// is one click (meta.grantRouletteRewards). Presentation only — state/bioRoulette.ts owns the
// board, weights, and outcomes, so the theater can never change what a spore is worth.

import { useEffect, useMemo, useRef, useState } from 'react';
import { isTowerUnlocked, meta } from '../state/meta';
import { audio } from '../audio/sound';
import { ROULETTE, rollBoard, rollOutcomes, summarizeRewards } from '../state/bioRoulette';
import { TOWER_ORDER } from '../core/config';

const LAUNCH_GAP = 0.55; // seconds between spore launches
const SPIN_T = 2.1; // seconds of powered spin (cubic decel = momentum reads honestly)
const SETTLE_T = 0.45; // wobble into the pod
const ABSORB_T = 0.5; // pod swallows the sphere

interface Spore {
  target: number; // pod index (pre-rolled)
  launchAt: number; // ceremony clock seconds
  theta0: number; // launch angle
  turns: number; // full rotations before settling (2..4 — varies the show)
  done: boolean; // tallied
}

/** Cubic ease-out — fast off the line, decaying to rest (the momentum read). */
const easeOut = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export function BioRoulette({ spores, onExit }: { spores: number; onExit: () => void }): JSX.Element {
  const save = meta.use();
  // The board + every outcome are rolled ONCE per ceremony (fresh each run, weighted).
  const { board, outcomes } = useMemo(() => {
    const roster = {
      towers: TOWER_ORDER.filter((k) => isTowerUnlocked(save, k)),
      heroes: save.heroUnlocked,
    };
    const b = rollBoard(Math.random, roster);
    return { board: b, outcomes: rollOutcomes(Math.random, b, spores) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roll once; the ceremony owns this board
  }, []);

  const [landedCount, setLandedCount] = useState(0);
  const [revealed, setRevealed] = useState(false); // Reveal All pressed — resolve the remainder
  const [collected, setCollected] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ landed: 0, glow: new Map<number, number>(), revealAt: -1 });

  const sporesList = useMemo<Spore[]>(
    () => outcomes.map((target, i) => ({
      target,
      launchAt: 0.6 + i * LAUNCH_GAP,
      theta0: Math.random() * Math.PI * 2,
      turns: 2 + Math.floor(Math.random() * 3),
      done: false,
    })),
    [outcomes],
  );

  const allLanded = landedCount >= spores;
  const tally = useMemo(() => summarizeRewards(board, outcomes.slice(0, landedCount)), [board, outcomes, landedCount]);

  const collect = (): void => {
    if (collected) return;
    setCollected(true);
    meta.grantRouletteRewards(outcomes.map((o) => board[o].reward), spores);
    audio.cue('ui');
    onExit();
  };

  // ── The ceremony loop ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const st = stateRef.current;

    const draw = (): void => {
      const now = (performance.now() - t0) / 1000;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.36; // pod ring radius
      ctx.clearRect(0, 0, W, H);

      // The organ: layered membrane rings, slowly breathing.
      const breathe = 1 + Math.sin(now * 1.4) * 0.012;
      for (let i = 4; i >= 1; i--) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.32 + i * 0.22) * breathe, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(182, 77, 255, ${0.05 + i * 0.02})`;
        ctx.lineWidth = 10 - i * 1.6;
        ctx.stroke();
      }
      // Veins radiating to each pod.
      for (let i = 0; i < board.length; i++) {
        const a = (i / board.length) * Math.PI * 2 - Math.PI / 2;
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

      // Pods — fleshy blobs; landed pods glow and carry a count badge.
      const counts = new Map<number, number>();
      for (let i = 0; i < st.landed; i++) counts.set(outcomes[i], (counts.get(outcomes[i]) ?? 0) + 1);
      for (let i = 0; i < board.length; i++) {
        const a = (i / board.length) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(a) * R;
        const py = cy + Math.sin(a) * R;
        const glow = Math.max(0, (st.glow.get(i) ?? -9) + 0.9 - now); // 0.9s flare after an absorb
        const pulse = 1 + Math.sin(now * 2 + i) * 0.03 + glow * 0.3;
        const r = 30 * pulse;
        if (glow > 0) {
          ctx.beginPath();
          ctx.arc(px, py, r + 16 * glow, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 214, 92, ${0.25 * glow})`;
          ctx.fill();
        }
        ctx.beginPath();
        for (let k = 0; k <= 20; k++) {
          const b = (k / 20) * Math.PI * 2;
          const wob = 1 + Math.sin(b * 3 + now * 1.6 + i) * 0.07;
          const x = px + Math.cos(b) * r * wob;
          const y = py + Math.sin(b) * r * wob;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(20, 14, 28, 0.92)';
        ctx.fill();
        const stroke = getComputedStyle(canvas).getPropertyValue('--rr-line') || '#b64dff';
        ctx.strokeStyle = glow > 0 ? '#ffd65c' : stroke.trim() || '#b64dff';
        ctx.lineWidth = glow > 0 ? 3 : 1.6;
        ctx.stroke();
        ctx.fillStyle = glow > 0 ? '#ffd65c' : '#cdb8e6';
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

      // The central orifice — the launcher.
      const oR = R * 0.2 * (1 + Math.sin(now * 2.2) * 0.05);
      const grad = ctx.createRadialGradient(cx, cy, oR * 0.15, cx, cy, oR);
      grad.addColorStop(0, 'rgba(255, 93, 115, 0.9)');
      grad.addColorStop(0.55, 'rgba(120, 30, 70, 0.85)');
      grad.addColorStop(1, 'rgba(24, 10, 26, 0.95)');
      ctx.beginPath();
      ctx.arc(cx, cy, oR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Spores in flight (skipped once Reveal All fired).
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
          continue;
        }
        if (t < 0) continue;
        const targetA = (sp.target / board.length) * Math.PI * 2 - Math.PI / 2;
        let a: number;
        let rad: number;
        let size = 9;
        if (t < SPIN_T) {
          // Powered spin: angle travels θ0 → target + N turns under cubic decel (momentum),
          // radius spirals out from the orifice to the pod ring.
          const k = easeOut(t / SPIN_T);
          a = sp.theta0 + (targetA + sp.turns * Math.PI * 2 - sp.theta0) * k;
          rad = oR + (R - 30 - oR) * Math.min(1, t / (SPIN_T * 0.55));
        } else if (t < SPIN_T + SETTLE_T) {
          // Settle: a damped wobble around the pod mouth — it ROLLS to rest, never snaps.
          const s = (t - SPIN_T) / SETTLE_T;
          a = targetA + Math.sin(s * Math.PI * 3) * 0.08 * (1 - s);
          rad = R - 30 + Math.sin(s * Math.PI * 2) * 4 * (1 - s);
        } else {
          // Absorb: the pod swallows it.
          const s = (t - SPIN_T - SETTLE_T) / ABSORB_T;
          a = targetA;
          rad = R - 30 + s * 26;
          size = 9 * (1 - s);
          if (s > 0.8) st.glow.set(sp.target, now);
        }
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fillStyle = '#ffe6a8';
        ctx.shadowColor = '#ffd65c';
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (landedNow !== st.landed) {
        st.landed = landedNow;
        setLandedCount(landedNow);
        audio.cue('splice');
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
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
        </div>
        <div className="roulette-spores" title="1 per new lifetime-record boss + 1 per 5 bosses felled this run">
          ✺ Bio-Spores <b>{Math.max(0, spores - landedCount)}</b> / {spores}
        </div>
      </div>

      <canvas ref={canvasRef} className="roulette-canvas" width={760} height={620} />

      <aside className="roulette-side">
        <div className="roulette-side-k">Absorbed</div>
        {tally.length === 0 && <div className="roulette-empty">The organ waits…</div>}
        {tally.map((t) => (
          <div className="roulette-row" key={t.label}>
            <i style={{ background: t.color }} />
            <span>{t.label}</span>
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
          Spores are earned by the gauntlet itself — one per NEW lifetime-record boss, one per{' '}
          {ROULETTE.sporesPerVolume} bosses felled. Every pod pays; the wheel only decides how much.
        </p>
      </aside>
    </div>
  );
}
