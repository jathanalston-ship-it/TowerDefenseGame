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
      // Don't hijack keys while typing in a form control (e.g. the debug select).
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))) return;
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

  // Map a client point to battlefield coordinates. Returns null if the canvas
  // isn't laid out yet (zero-sized rect) so we never feed NaN coords to the sim.
  const toCoords = (clientX: number, clientY: number): Pointer | null => {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
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
            // Capture the pointer so a press that slides slightly off the canvas
            // edge still delivers its pointerup here (reliable taps near borders).
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* capture unsupported — taps still work without it */
            }
            pointerRef.current = toCoords(e.clientX, e.clientY); // show the ghost where you touch
          }}
          onPointerUp={(e) => {
            if (e.button !== 0) return; // primary tap / left-click only
            const p = toCoords(e.clientX, e.clientY);
            if (p) game.click(p.x, p.y);
            // Don't leave a placement ghost stuck under a lifted finger (touch).
            if (e.pointerType !== 'mouse') pointerRef.current = null;
            refresh();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') pointerRef.current = null;
          }}
          onPointerCancel={() => {
            pointerRef.current = null; // gesture interrupted — clear the ghost
          }}
          onContextMenu={(e) => {
            e.preventDefault(); // desktop right-click: re-anchor the hero's patrol point
            const p = toCoords(e.clientX, e.clientY);
            if (!p) return;
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
      </div>
      <Toolbar game={game} hud={hud} refresh={refresh} />
    </div>
  );
}
