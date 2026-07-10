// COMBAT CLASS identity (docs/MULLIGANS.md §classes) — the ONE display table for the six
// biological classes shared by towers (TowerDef.combatClass) and Mulligan modifiers
// (MulliganModifier.cls). Every surface that shows a class — modifier cards, adaptation
// panels, portraits, tooltips — reads THIS table, never a local copy: a class is a color,
// a glyph, and a role you can recognize before you read.

import type { CombatClass } from './types';

export interface CombatClassMeta {
  id: CombatClass;
  glyph: string; // the at-a-glance biological mark
  /** CSS custom property reference (tokens live in index.css :root). */
  color: string;
  /** Raw hex mirror of the token — canvas generators can't resolve var() (keep in sync). */
  hex: string;
  /** The class's gameplay identity in one line (inspection "what role does this fill?"). */
  role: string;
}

export const COMBAT_CLASSES: Record<CombatClass, CombatClassMeta> = {
  Kinetic: { id: 'Kinetic', glyph: '✦', color: 'var(--kinetic)', hex: '#5ad1ff', role: 'Impact — raw hits that punch through flesh and bone.' },
  Caustic: { id: 'Caustic', glyph: '☣', color: 'var(--caustic)', hex: '#b6e84a', role: 'Dissolution — corrosive blasts that eat whole packs.' },
  Viral: { id: 'Viral', glyph: '⬡', color: 'var(--viral)', hex: '#e24dff', role: 'Infection — contagion that spreads and lingers.' },
  Neural: { id: 'Neural', glyph: '◉', color: 'var(--neural)', hex: '#6e7bff', role: 'Control — the lattice that slows, marks and unmakes.' },
  Vital: { id: 'Vital', glyph: '✚', color: 'var(--vital)', hex: '#ff7a59', role: 'Sustain — living tissue that endures and outlasts.' },
  Resonant: { id: 'Resonant', glyph: '◈', color: 'var(--resonant)', hex: '#ffb454', role: 'Amplification — one note the battlefield obeys.' },
};

export const COMBAT_CLASS_ORDER: CombatClass[] = ['Kinetic', 'Caustic', 'Viral', 'Neural', 'Vital', 'Resonant'];
