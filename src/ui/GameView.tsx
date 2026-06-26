import { useEffect, useRef, useState } from 'react';
import { Game } from '../core/game';
import { drawGame } from '../render/renderer';
import type { Pointer } from '../render/renderer';
import { HEIGHT, WIDTH } from '../core/map';
import { TOWER_ORDER } from '../core/config';
import { setActiveGame } from '../debug/debug';
import { Hud } from './Hud';
import { Toolbar } from './Toolbar';
import { DraftModal } from './DraftModal';
import type { HudSnapshot, MetaModifiers } from '../core/types';
import type { RunResult } from '../state/meta';

export function GameView({
  seed,
  mods,
  onEnd,
}: {
  seed: number;
  mods: MetaModifiers;
  onEnd: (r: RunResult) => void;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const game = (gameRef.current ??= new Game(seed, mods));

  const [hud, setHud] = useState<HudSnapshot>(() => game.getSnapshot());
  const [crashed, setCrashed] = useState<string | null>(null);
  const pointerRef = useRef<Pointer | null>(null);
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
        drawGame(ctx, game.getRenderState(), pointerRef.current);
        if (now - lastHud > 80) {
          setHud(game.getSnapshot());
          lastHud = now;
        }
        if ((game.phase === 'won' || game.phase === 'lost') && !endedRef.current) {
          endedRef.current = true;
          setHud(game.getSnapshot());
          onEndRef.current({ wave: game.waveIndex, kills: game.kills, won: game.phase === 'won' });
        }
        raf = requestAnimationFrame(loop);
      } catch (err) {
        // Surface the failure and stop cleanly — never freeze silently or spam.
        console.error('[GameView] run loop error — stopping:', err);
        setCrashed(err instanceof Error ? err.message : String(err));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  // expose the live run to the debug panel
  useEffect(() => {
    setActiveGame(game);
    return () => setActiveGame(null);
  }, [game]);

  // ── Desktop keyboard shortcuts (1-3 towers · Q ability · Space wave · Esc) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k >= '1' && k <= String(TOWER_ORDER.length)) {
        const kind = TOWER_ORDER[Number(k) - 1];
        game.selectTower(game.selectedTower === kind ? null : kind);
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
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className="board"
          width={WIDTH}
          height={HEIGHT}
          // Pointer Events unify mouse + touch (touch-action:none on .board
          // prevents scroll/zoom so taps map cleanly to the battlefield).
          onPointerMove={(e) => {
            pointerRef.current = toCoords(e.clientX, e.clientY);
          }}
          onPointerDown={(e) => {
            pointerRef.current = toCoords(e.clientX, e.clientY); // show the ghost where you touch
          }}
          onPointerUp={(e) => {
            if (e.button !== 0) return; // primary tap / left-click only
            const p = toCoords(e.clientX, e.clientY);
            game.click(p.x, p.y);
            refresh();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') pointerRef.current = null;
          }}
          onContextMenu={(e) => {
            e.preventDefault(); // desktop right-click: re-anchor the hero's patrol point
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
                onEndRef.current({ wave: game.waveIndex, kills: game.kills, won: false });
              }}
            >
              End Run
            </button>
          </div>
        )}
      </div>
      <Toolbar game={game} hud={hud} refresh={refresh} />
    </div>
  );
}
