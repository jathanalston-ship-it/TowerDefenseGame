import { useEffect, useRef, useState } from 'react';
import { Game } from '../core/game';
import { drawGame } from '../render/renderer';
import type { Pointer } from '../render/renderer';
import { HEIGHT, WIDTH } from '../core/map';
import { TOWER_ORDER } from '../core/config';
import { audio } from '../audio/sound';
import { setActiveGame } from '../debug/debug';
import { Hud } from './Hud';
import { Toolbar } from './Toolbar';
import { BuildPanel } from './BuildPanel';
import { Inspector } from './Inspector';
import { DraftModal } from './DraftModal';
import type { HudSnapshot, MetaModifiers, TowerProgress } from '../core/types';
import type { RunResult } from '../state/meta';

// Per-cue camera "trauma" (screen-shake) contribution; shake = trauma² · SHAKE_MAX.
const TRAUMA: Record<string, number> = {
  hit: 0.018, kill: 0.015, shred: 0.1, breach: 0.45, ability: 0.3, wave: 0.08, place: 0.03,
};
const SHAKE_MAX = 16; // px
const SHAKE_DECAY = 2.0; // trauma/sec

export function GameView({
  seed,
  mods,
  progress,
  onEnd,
}: {
  seed: number;
  mods: MetaModifiers;
  progress: TowerProgress;
  onEnd: (r: RunResult) => void;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const game = (gameRef.current ??= new Game(seed, mods, progress));

  const [hud, setHud] = useState<HudSnapshot>(() => game.getSnapshot());
  const [crashed, setCrashed] = useState<string | null>(null);
  const pointerRef = useRef<Pointer | null>(null);
  const traumaRef = useRef(0);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const endedRef = useRef(false);

  const refresh = (): void => setHud(game.getSnapshot());

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;

    const loop = (now: number): void => {
      try {
        const dt = (now - last) / 1000;
        last = now;
        game.advance(dt);

        // Drain presentation cues → audio + screen-shake trauma.
        const cues = game.drainSfx();
        if (cues.length) {
          const tally: Record<string, number> = {};
          for (const c of cues) {
            tally[c] = (tally[c] ?? 0) + 1;
            traumaRef.current = Math.min(1, traumaRef.current + (TRAUMA[c] ?? 0));
          }
          audio.cueBatch(tally);
        }
        traumaRef.current = Math.max(0, traumaRef.current - SHAKE_DECAY * dt);

        // Render with shake (pre-fill covers the shake margin so no gap shows).
        const mag = traumaRef.current * traumaRef.current * SHAKE_MAX;
        const dx = mag ? (Math.random() * 2 - 1) * mag : 0;
        const dy = mag ? (Math.random() * 2 - 1) * mag : 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#070a10';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.save();
        ctx.translate(dx, dy);
        drawGame(ctx, game.getRenderState(), pointerRef.current);
        ctx.restore();

        // Ambient bed intensifies with pressure (enemies massing + a wounded core).
        const intRatio = game.maxIntegrity > 0 ? game.integrity / game.maxIntegrity : 1;
        const pressure =
          game.phase === 'won' || game.phase === 'lost'
            ? null
            : Math.min(1, (game.enemies.length / 30) * 0.6 + (1 - intRatio) * 0.6);
        audio.music(pressure, dt);

        if (now - lastHud > 80) {
          setHud(game.getSnapshot());
          lastHud = now;
        }
        if ((game.phase === 'won' || game.phase === 'lost') && !endedRef.current) {
          endedRef.current = true;
          setHud(game.getSnapshot());
          onEndRef.current({ wave: game.waveIndex, kills: game.kills, won: game.phase === 'won', mastery: game.getMasteryAccrual() });
        }
        raf = requestAnimationFrame(loop);
      } catch (err) {
        // Surface the failure and stop cleanly — never freeze silently or spam.
        console.error('[GameView] run loop error — stopping:', err);
        setCrashed(err instanceof Error ? err.message : String(err));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      audio.music(null, 0); // fade the bed when leaving the run
    };
  }, [game]);

  // expose the live run to the debug panel
  useEffect(() => {
    setActiveGame(game);
    return () => setActiveGame(null);
  }, [game]);

  // ── Desktop keyboard shortcuts (1-N towers · Q ability · Space wave · Esc) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      audio.resume();
      // Board hotkeys only during active play — the draft owns the keyboard while open.
      if (game.phase !== 'prep' && game.phase !== 'wave') return;
      const k = e.key;
      if (k >= '1' && k <= String(TOWER_ORDER.length)) {
        const kind = TOWER_ORDER[Number(k) - 1];
        game.selectTower(game.selectedTower === kind ? null : kind);
        audio.cue('select');
      } else if (k === 'q' || k === 'Q') {
        game.armAbility();
      } else if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        game.startWave();
      } else if (k === 'Escape') {
        game.selectTower(null);
      } else {
        return;
      }
      setHud(game.getSnapshot());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const toCoords = (clientX: number, clientY: number): Pointer => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (WIDTH / rect.width),
      y: (clientY - rect.top) * (HEIGHT / rect.height),
    };
  };

  return (
    <div className="game">
      <Hud hud={hud} />
      <div className="stage">
        <BuildPanel hud={hud} />
        <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className="board"
          width={WIDTH}
          height={HEIGHT}
          onPointerMove={(e) => {
            pointerRef.current = toCoords(e.clientX, e.clientY);
          }}
          onPointerDown={(e) => {
            audio.resume();
            pointerRef.current = toCoords(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            if (e.button !== 0) return;
            const p = toCoords(e.clientX, e.clientY);
            game.click(p.x, p.y);
            refresh();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') pointerRef.current = null;
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const p = toCoords(e.clientX, e.clientY);
            game.selectTower(null);
            game.setRally(p.x, p.y);
            refresh();
          }}
        />
        {hud.phase === 'draft' && hud.draft && (
          <DraftModal
            options={hud.draft}
            onPick={(id) => {
              game.chooseCard(id);
              refresh();
            }}
          />
        )}
        {crashed && (
          <div className="overlay">
            <h2>RUN ERROR</h2>
            <p className="hint">The run hit an error and stopped. Your permanent progress is safe.</p>
            <pre className="crash-msg">{crashed}</pre>
            <button
              className="primary"
              onClick={() => {
                if (endedRef.current) return;
                endedRef.current = true;
                onEndRef.current({ wave: game.waveIndex, kills: game.kills, won: false, mastery: game.getMasteryAccrual() });
              }}
            >
              End Run
            </button>
          </div>
        )}
        </div>
        <Inspector hud={hud} />
      </div>
      <Toolbar game={game} hud={hud} refresh={refresh} />
    </div>
  );
}
