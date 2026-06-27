// Doctrines — exclusive run-start build commitments. You pick exactly ONE at the start of a
// run and it reshapes a rule for the whole run, expressed through the same declarative
// CardEffect[] that cards/relics use (folded once at construction). Exclusivity is the point:
// it forces divergent builds instead of "stack every multiplier". Pure data; the default
// 'none' has no effects, so a run without a doctrine (the golden run) is byte-identical.
// Doctrines self-register under the content registry like all content.

import type { CardEffect } from './cards';
import { Registry } from './registry';

export interface DoctrineDef {
  id: string;
  name: string;
  blurb: string;
  effects: CardEffect[]; // folded into the run at construction (run-start)
}

export const DOCTRINES: Record<string, DoctrineDef> = {
  none: {
    id: 'none',
    name: 'No Doctrine',
    blurb: 'Play freely — no run-start commitment.',
    effects: [],
  },
  glasscannon: {
    id: 'glasscannon',
    name: 'Glass Doctrine',
    blurb: 'Towers hit far harder, but the Nucleus is brittle.',
    effects: [
      { op: 'mul', field: 'towerDamageMult', value: 1.5 },
      { op: 'mul', field: 'integrityMult', value: 0.55 },
    ],
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm Doctrine',
    blurb: 'Go wide — every tower on the board buffs the rest.',
    effects: [
      { op: 'add', field: 'damagePerTower', value: 0.05 },
      { op: 'mul', field: 'towerFireRateMult', value: 1.08 },
    ],
  },
  minimalist: {
    id: 'minimalist',
    name: 'Ascetic Doctrine',
    blurb: 'Go tall — fewer towers, each devastating.',
    effects: [{ op: 'add', field: 'damagePerEmptySlot', value: 0.06 }],
  },
  cascade: {
    id: 'cascade',
    name: 'Cascade Doctrine',
    blurb: 'Status reactions chain into one another — pair statuses to combust.',
    effects: [
      { op: 'add', field: 'reactionRepeats', value: 1 },
      { op: 'add', field: 'fractureBonusStacks', value: 2 },
    ],
  },
  resonance: {
    id: 'resonance',
    name: 'Resonance Doctrine',
    blurb: "Your hero's class amplifies same-class towers, and a varied board pays off.",
    effects: [
      { op: 'add', field: 'classResonanceBonus', value: 0.3 },
      { op: 'add', field: 'diversityBonus', value: 0.06 },
    ],
  },
};

export const doctrineRegistry = new Registry<DoctrineDef>('doctrine', {
  idOf: (d) => d.id,
  validate: (d) => (d.name && d.name.trim().length > 0 ? [] : ['doctrine needs a name']),
});
doctrineRegistry.registerAll(Object.values(DOCTRINES));

export const DOCTRINE_IDS: string[] = doctrineRegistry.ids();

/** Resolve a doctrine id to its def; unknown/omitted falls back to 'none' (no effects). */
export function resolveDoctrine(id?: string): DoctrineDef {
  if (!id) return DOCTRINES.none;
  return doctrineRegistry.get(id) ?? DOCTRINES.none;
}
