// THE ARENA MATCH VIEW (docs/ARENA.md §1, §10) — the vertically-expanded battlefield. The
// local player's hive fills the viewport; the opponent's MIRRORED battlefield hangs above it
// across a membrane seam. Scroll (wheel / drag / the indicator) to inspect the opponent's
// GENUINE live simulation — towers, hero, projectiles, statuses, everything — and the camera
// eases home to your own field on release (never both fields at once; the zoom never changes).
//
// Every gameplay input issues COMMANDS through match.issueLocal (the one pipeline —
// docs/ONLINE-FOUNDATION.md §1); this view renders and narrates, it never mutates sims.
// The HUD overlay carries the spec's §10 set: opponent health + portrait + name/rating,
// arena rank, latency + connection quality, the PvP timer, the scroll indicator and the
// camera-reset control.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArenaMatch } from '../core/arenaMatch';
import type { ArenaMatchSetup } from '../core/arenaMatch';
import { ARENA, divisionForRating } from '../core/arena';
import { HEIGHT, WIDTH } from '../core/map';
import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import type { TowerKind } from '../core/types';
import { drawGame } from '../render/renderer';
import { meta } from '../state/meta';
import type { ArenaSettleReceipt } from '../state/meta';
import { reportArenaMatch } from '../net/arenaReport';
import { ArenaSession } from '../net/arenaSession';
import type { ArenaTransport } from '../net/arenaTransport';
import { audio } from '../audio/sound';

const SEAM = 46; // the membrane band between the two battlefields (world px)
const SCROLL_MAX = HEIGHT + SEAM; // camY at full opponent view
const RETURN_RATE = 4.2; // camera ease-home speed (fraction/sec)

export function ArenaView({ setup, transport, onExit }: { setup: ArenaMatchSetup; transport?: ArenaTransport | null; onExit: () => void }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const matchRef = useRef<ArenaMatch | null>(null);
  const match = (matchRef.current ??= new ArenaMatch(setup));
  // HUMAN matches bind the match to its relay transport through ONE ArenaSession — command
  // relay, beacons, digests, resync, liveness (docs/ONLINE-FOUNDATION.md §2–3). Vs-AI matches
  // never construct one (the match drives the AI internally).
  const sessionRef = useRef<ArenaSession | null>(null);
  if (!setup.vsAi && transport && sessionRef.current === null) {
    sessionRef.current = new ArenaSession(match, transport);
  }
  const [, force] = useState(0); // HUD refresh tick (~8 Hz)
  const [selected, setSelected] = useState<TowerKind | null>(null);
  const [armed, setArmed] = useState(false); // next tap casts the hero ability
  const [receipt, setReceipt] = useState<ArenaSettleReceipt | null>(null);
  const settledRef = useRef(false);
  const camRef = useRef({ y: 0, target: 0, inspecting: false });
  const dragRef = useRef<{ y0: number; camY0: number } | null>(null);

  const oppName = setup.ai?.name ?? setup.oppName ?? 'OPPONENT';
  const oppHero = setup.ai?.heroKind ?? setup.remote.heroKind;
  const oppDivision = divisionForRating(setup.oppRating);

  // ── The run loop: advance the match, draw the visible field(s), settle on finish ──
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    const loop = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // The session's step wraps match.step with the protocol work (beacons/digests/liveness).
      if (sessionRef.current) sessionRef.current.step(dt);
      else match.step(dt);

      // Camera: ease toward the target; ease HOME when not inspecting (spec: returns naturally).
      const cam = camRef.current;
      if (!cam.inspecting) cam.target = 0;
      cam.y += (cam.target - cam.y) * Math.min(1, RETURN_RATE * dt);
      if (Math.abs(cam.y - cam.target) < 0.5) cam.y = cam.target;

      draw();

      if (now - hudAt > 125) {
        hudAt = now;
        force((n) => n + 1);
      }
      if (match.finished && !settledRef.current) {
        settledRef.current = true;
        const r = meta.settleArenaMatch(match.finished.claim);
        setReceipt(r);
        audio.cue(match.finished.outcome === 'win' ? 'victory' : 'defeat');
        void reportArenaMatch(match.finished.claim); // fail-soft server ladder reconcile
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // Human matches: release the wire on the way out (bye is a courtesy; the peer's
      // liveness path covers a silent exit — docs/ONLINE-FOUNDATION.md §2).
      sessionRef.current?.close();
      if (transport) {
        transport.send({ t: 'bye' });
        transport.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = useCallback((): void => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const camY = camRef.current.y;
    ctx.save();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // OWN field: world y ∈ [0..H] drawn at screen y = world + camY (camY 0 ⇒ fills the view).
    if (camY < HEIGHT) {
      ctx.save();
      ctx.translate(0, camY);
      ctx.beginPath();
      ctx.rect(0, 0, WIDTH, HEIGHT);
      ctx.clip();
      drawGame(ctx, match.localGame.getRenderState(), null);
      ctx.restore();
    }

    // OPPONENT field: rendered to an offscreen canvas by the SAME renderer, then MIRRORED
    // vertically above the seam (their hive faces yours). Floats are stripped (mirrored
    // damage text is noise); the field itself is the genuine live simulation.
    if (camY > 0) {
      const off = (offRef.current ??= document.createElement('canvas'));
      if (off.width !== WIDTH || off.height !== HEIGHT) {
        off.width = WIDTH;
        off.height = HEIGHT;
      }
      const octx = off.getContext('2d');
      if (octx) {
        octx.clearRect(0, 0, WIDTH, HEIGHT);
        const rs = match.remoteGame.getRenderState();
        drawGame(octx, { ...rs, floats: [] }, null);
        ctx.save();
        // The mirrored upper battlefield: its world y ∈ [-SEAM-H .. -SEAM], flipped.
        ctx.translate(0, camY - SEAM);
        ctx.scale(1, -1);
        ctx.drawImage(off, 0, 0);
        ctx.restore();
      }
      // The membrane seam between the two hives.
      const seamTop = camY - SEAM;
      const grad = ctx.createLinearGradient(0, seamTop, 0, seamTop + SEAM);
      grad.addColorStop(0, 'rgba(210, 77, 255, 0.28)');
      grad.addColorStop(0.5, 'rgba(20, 8, 28, 0.92)');
      grad.addColorStop(1, 'rgba(90, 209, 255, 0.28)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, seamTop, WIDTH, SEAM);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('— THE MEMBRANE — their hive above · yours below —', WIDTH / 2, seamTop + SEAM / 2 + 4);
    }
    ctx.restore();
  }, [match]);

  // ── Input: board taps issue commands; wheel/drag scrolls the vertical battlefield ──
  const boardPoint = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const cv = canvasRef.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * WIDTH;
    const yScreen = ((e.clientY - r.top) / r.height) * HEIGHT;
    const y = yScreen - camRef.current.y; // into OWN-field world coords
    return { x, y };
  };

  const onTap = (e: React.MouseEvent): void => {
    if (receipt) return;
    const p = boardPoint(e);
    if (!p || p.y < 0 || p.y > HEIGHT) return; // taps land on YOUR field only
    if (armed) {
      match.issueLocal({ k: 'ability', x: p.x, y: p.y });
      setArmed(false);
      return;
    }
    if (selected) {
      if (match.issueLocal({ k: 'place', tower: selected, x: p.x, y: p.y })) audio.cue('place');
      return;
    }
    match.issueLocal({ k: 'rally', x: p.x, y: p.y });
  };

  const onWheel = (e: React.WheelEvent): void => {
    const cam = camRef.current;
    cam.target = Math.max(0, Math.min(SCROLL_MAX, cam.target + e.deltaY * 1.4));
    cam.inspecting = cam.target > 4;
  };
  const onPointerDown = (e: React.PointerEvent): void => {
    dragRef.current = { y0: e.clientY, camY0: camRef.current.y };
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    if (!d) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const scale = HEIGHT / cv.getBoundingClientRect().height;
    const dy = (e.clientY - d.y0) * scale;
    if (Math.abs(dy) > 12) {
      const cam = camRef.current;
      cam.target = Math.max(0, Math.min(SCROLL_MAX, d.camY0 + dy));
      cam.y = cam.target;
      cam.inspecting = cam.target > 4;
    }
  };
  const onPointerUp = (): void => {
    dragRef.current = null;
  };

  // ── HUD facts (recomputed on the ~8 Hz tick) ──
  const snap = match.localGame.getSnapshot();
  const opp = match.opponentState();
  const timeLeft = Math.max(0, ARENA.matchSec - match.elapsed);
  const roster = useMemo(
    () => (setup.local.opts.unlocked ?? []).filter((k) => TOWER_DEFS[k]),
    [setup.local.opts.unlocked],
  );
  const scrollFrac = camRef.current.y / SCROLL_MAX;

  return (
    <div className="arena-view" style={{ position: 'relative', width: '100%', height: '100%', background: '#07040c', display: 'flex', flexDirection: 'column' }}>
      {/* ── §10 HUD: the opponent bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'rgba(12,6,18,0.92)', borderBottom: '1px solid rgba(210,77,255,0.3)' }}>
        <span title={`${oppName} — ${HERO_DEFS[oppHero]?.name ?? oppHero}`} style={{ fontSize: 22, color: HERO_DEFS[oppHero]?.color ?? '#fff' }}>◈</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <b>{oppName}</b> <span className="muted">· {oppDivision.glyph} {oppDivision.name} · {setup.oppRating}</span>
            {opp.heroDown && <span style={{ color: 'var(--danger, #ff5d73)' }}> · hero DOWN</span>}
          </div>
          <div style={{ height: 8, width: 220, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
            <div style={{ height: '100%', width: `${Math.round(opp.integrityFrac * 100)}%`, background: 'linear-gradient(90deg,#d24dff,#ff5d73)', borderRadius: 4, transition: 'width 200ms' }} />
          </div>
        </div>
        <span className="muted">wave {opp.wave}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 18, color: timeLeft < 30 ? 'var(--danger, #ff5d73)' : undefined }}>
          ⏱ {Math.floor(timeLeft / 60)}:{String(Math.floor(timeLeft % 60)).padStart(2, '0')}
        </span>
        <span title="connection">
          {setup.vsAi || !transport ? (
            <span className="muted">⇄ LOCAL · AI</span>
          ) : (
            (() => {
              // Live RTT + quality off the relay transport (§10 HUD); refreshed by the 8 Hz tick.
              const st = transport.state();
              const q = transport.quality();
              const col = st !== 'open' || q === 'bad' ? 'var(--danger, #ff5d73)'
                : q === 'poor' ? 'var(--gold, #ffd24d)'
                : 'var(--vital, #7fd08f)';
              return (
                <span style={{ color: col, fontVariantNumeric: 'tabular-nums' }}>
                  ⇄ {st === 'open' ? `${transport.rttMs()}ms · ${q}` : st === 'dropped' ? 'RECONNECTING…' : 'LOST'}
                </span>
              );
            })()
          )}
        </span>
        <button onClick={() => { if (!receipt) match.forfeitLocal(); else onExit(); }} title="Forfeit the match">
          {receipt ? 'LEAVE' : 'FORFEIT'}
        </button>
      </div>

      {/* ── The vertically-expanded battlefield ── */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          style={{ height: '100%', maxWidth: '100%', objectFit: 'contain', touchAction: 'none', cursor: armed ? 'crosshair' : 'pointer' }}
          onClick={onTap}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {/* Scroll indicator + camera reset (spec §10) */}
        <div style={{ position: 'absolute', right: 8, top: '20%', bottom: '20%', width: 18, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 10 }}>THEM</span>
          <div style={{ flex: 1, width: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, position: 'relative', margin: '4px 0' }}>
            <div style={{ position: 'absolute', left: -3, width: 10, height: 10, borderRadius: 5, background: '#d24dff', top: `${Math.round((1 - scrollFrac) * 100)}%`, transform: 'translateY(-50%)' }} />
          </div>
          <span className="muted" style={{ fontSize: 10 }}>YOU</span>
          {camRef.current.inspecting && (
            <button
              style={{ marginTop: 6, fontSize: 11 }}
              title="Return the camera to your hive"
              onClick={() => { camRef.current.inspecting = false; camRef.current.target = 0; }}
            >⌂</button>
          )}
        </div>

        {/* The draft, when the assault offers one */}
        {snap.draft && !receipt && (
          <div style={{ position: 'absolute', left: '50%', bottom: 90, transform: 'translateX(-50%)', display: 'flex', gap: 8, background: 'rgba(10,5,16,0.94)', padding: 10, borderRadius: 8, border: '1px solid rgba(210,77,255,0.4)' }}>
            {snap.draft.map((c) => (
              <button key={c.id} style={{ maxWidth: 150, textAlign: 'left' }} onClick={() => match.issueLocal({ k: 'chooseCard', cardId: c.id })}>
                <b>{c.name}</b>
                <div className="muted" style={{ fontSize: 11 }}>{c.description}</div>
              </button>
            ))}
          </div>
        )}

        {/* The verdict */}
        {receipt && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,2,8,0.82)' }}>
            <div className="panel" style={{ minWidth: 300, maxWidth: 420, textAlign: 'center', borderColor: receipt.outcome === 'win' ? 'var(--gold, #ffd24d)' : 'rgba(255,255,255,0.2)' }}>
              <h2 style={{ color: receipt.outcome === 'win' ? 'var(--gold, #ffd24d)' : receipt.outcome === 'loss' ? 'var(--danger, #ff5d73)' : undefined }}>
                {receipt.outcome === 'win' ? '⚔ VICTORY' : receipt.outcome === 'loss' ? 'DEFEAT' : 'DRAW'}
              </h2>
              <p style={{ fontSize: 18 }}>
                {receipt.delta >= 0 ? '+' : ''}{receipt.delta} rating → <b>{receipt.rating}</b> · {receipt.division}
                {receipt.promoted && <span style={{ color: 'var(--gold, #ffd24d)' }}> — PROMOTED</span>}
                {receipt.demoted && <span style={{ color: 'var(--danger, #ff5d73)' }}> — demoted</span>}
              </p>
              {receipt.placementsLeft > 0 && <p className="muted">Placements — {receipt.placementsLeft} to go</p>}
              {receipt.passLevelUp && <p>ARENA PASS — level {receipt.passLevelUp.from} → <b>{receipt.passLevelUp.to}</b></p>}
              <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left' }}>
                {receipt.lines.map((l, i) => <li key={i}>{l.icon} {l.label}</li>)}
              </ul>
              <button className="primary" onClick={onExit} style={{ marginTop: 8 }}>RETURN TO THE PROVING GROUNDS</button>
            </div>
          </div>
        )}
      </div>

      {/* ── The command dock: build / wave / ability ── */}
      {!receipt && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 10px', background: 'rgba(12,6,18,0.92)', borderTop: '1px solid rgba(90,209,255,0.25)', overflowX: 'auto' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 86 }}>⬢ {Math.floor(snap.biomass)}</span>
          <span className="muted" style={{ minWidth: 70 }}>♥ {Math.max(0, Math.round(snap.integrity))}/{snap.maxIntegrity}</span>
          {roster.map((k) => (
            <button
              key={k}
              className={selected === k ? 'primary' : ''}
              disabled={TOWER_DEFS[k].cost > snap.biomass && selected !== k}
              style={{ borderColor: TOWER_DEFS[k].color, whiteSpace: 'nowrap' }}
              title={`${TOWER_DEFS[k].name} — ${TOWER_DEFS[k].cost} biomass`}
              onClick={() => { setSelected(selected === k ? null : k); setArmed(false); }}
            >
              {TOWER_DEFS[k].name.split(' ')[0]} <span className="muted">{TOWER_DEFS[k].cost}</span>
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            className={armed ? 'primary' : ''}
            disabled={!snap.hero.abilityReady || snap.hero.down}
            title="Arm the hero ability — tap the battlefield to cast"
            onClick={() => { setArmed(!armed); setSelected(null); }}
          >✦ ABILITY</button>
          {snap.phase === 'prep' && (
            <button className="primary" style={{ fontWeight: 700 }} onClick={() => match.issueLocal({ k: 'startWave' })}>
              ▶ START WAVE {snap.wave + 1}
            </button>
          )}
          {snap.phase === 'wave' && <span className="muted">wave {snap.wave} · {snap.enemiesAlive} hostiles</span>}
        </div>
      )}
    </div>
  );
}
