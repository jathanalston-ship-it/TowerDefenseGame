// Procedural, animated hero portrait — asset-free (the game styles by color + glyph, matching
// the renderer's placeholder-art approach). Driven entirely by HeroDef, so a 30+ roster needs
// no art: a rotating class aura, a breathing core, orbiting motes, and the class glyph, all
// tinted by the hero color. Mastery rank adds a veteran flourish. Purely decorative.
//
// SYMBIOTE PREVIEW (docs/HERO-SYMBIOTES.md §UI): when a `symbiote` view is passed, a canvas
// overlay animates the EXACT in-run graft layer (drawHeroSymbiotes — the same code the
// battlefield renders), so the Hero Lab preview can never drift from combat. Stage 0 ⇒ no canvas.

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { HeroDef } from '../../core/config';
import { drawHeroSymbiotes } from '../../render/heroSymbiotes';
import type { HeroSymbioteRender } from '../../render/heroSymbiotes';
import './HeroPortrait.css';

// A class sigil per combat class (extend as classes are added; falls back to a neutral mark).
const CLASS_GLYPH: Record<string, string> = {
  Kinetic: '✦',
  Vital: '✚',
  Neural: '◉',
  Caustic: '☣',
  Viral: '⬡',
};

/** The animated graft overlay — the in-run symbiote layer drawn over the portrait. */
function SymbioteOverlay({ def, size, view }: { def: HeroDef; size: number; view: HeroSymbioteRender }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    let raf = 0;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hero = { kind: def.kind, x: size / 2, y: size / 2 };
    const draw = (): void => {
      const t = performance.now() / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      drawHeroSymbiotes(ctx, hero, view, size * 0.2, t, def.color, false);
      if (!still) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [def.kind, def.color, size, view.stage, view.resonant, view.fx.join(',')]);
  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: size, height: size, pointerEvents: 'none' }}
      aria-hidden
    />
  );
}

export function HeroPortrait({
  def,
  size = 200,
  rank = 0,
  symbiote,
}: {
  def: HeroDef;
  size?: number;
  rank?: number;
  /** Optional live graft preview (docs/HERO-SYMBIOTES.md) — the in-run mutation layer. */
  symbiote?: HeroSymbioteRender;
}): JSX.Element {
  const glyph = CLASS_GLYPH[def.combatClass] ?? '◆';
  return (
    <div
      className={`hero-portrait beh-${def.behavior}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34), ['--hc' as string]: def.color } as CSSProperties}
      aria-hidden
    >
      <div className="hp-aura" />
      <div className="hp-pulse" />
      <div className="hp-orbit">
        <span /><span /><span />
      </div>
      <div className="hp-core">
        <span className="hp-glyph">{glyph}</span>
      </div>
      {symbiote && symbiote.stage > 0 && <SymbioteOverlay def={def} size={size} view={symbiote} />}
      {rank > 0 && (
        <div className="hp-rank" title={`Mastery rank ${rank}`}>
          {Array.from({ length: Math.min(rank, 5) }, (_, i) => <i key={i} />)}
        </div>
      )}
    </div>
  );
}
