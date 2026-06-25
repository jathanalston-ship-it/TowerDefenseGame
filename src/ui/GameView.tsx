import { useEffect, useRef, useState } from 'react';
import { Game } from '../core/game';
import { drawGame } from '../render/renderer';
import type { Pointer } from '../render/renderer';
import { HEIGHT, WIDTH } from '../core/map';
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
          onMouseMove={(e) => {
            pointerRef.current = toCoords(e.clientX, e.clientY);
          }}
          onMouseLeave={() => {
            pointerRef.current = null;
          }}
          onClick={(e) => {
            const p = toCoords(e.clientX, e.clientY);
            game.click(p.x, p.y);
            refresh();
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
      </div>
      <Toolbar game={game} hud={hud} refresh={refresh} />
    </div>
  );
}
