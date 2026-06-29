// Procedural, animated hero portrait — asset-free (the game styles by color + glyph, matching
// the renderer's placeholder-art approach). Driven entirely by HeroDef, so a 30+ roster needs
// no art: a rotating class aura, a breathing core, orbiting motes, and the class glyph, all
// tinted by the hero color. Mastery rank adds a veteran flourish. Purely decorative.

import type { CSSProperties } from 'react';
import type { HeroDef } from '../../core/config';

// A class sigil per combat class (extend as classes are added; falls back to a neutral mark).
const CLASS_GLYPH: Record<string, string> = {
  Kinetic: '✦',
  Vital: '✚',
  Neural: '◉',
  Caustic: '☣',
  Viral: '⬡',
};

export function HeroPortrait({
  def,
  size = 200,
  rank = 0,
}: {
  def: HeroDef;
  size?: number;
  rank?: number;
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
      {rank > 0 && (
        <div className="hp-rank" title={`Mastery rank ${rank}`}>
          {Array.from({ length: Math.min(rank, 5) }, (_, i) => <i key={i} />)}
        </div>
      )}
    </div>
  );
}
