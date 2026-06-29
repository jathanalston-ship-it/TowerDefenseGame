// Hero identity flavor — epithet, tagline, discipline. Authored per hero for the shipped
// roster; everything falls back to a DERIVED default (from HeroDef) so a 30+ roster needs
// zero new authoring to read correctly. Pure data/derivation (no DOM, no save).

import type { HeroDef } from './config';

/** A hero's combat role, derived from its battlefield behavior (overridable per hero). */
const ROLE_BY_BEHAVIOR: Record<string, string> = {
  dive: 'Striker',
  guard: 'Guardian',
  control: 'Controller',
};

/** One-line description of what a role does on the field (for the Combat Role card). */
const ROLE_DESC: Record<string, string> = {
  dive: 'Dives the densest packs and fights at the front, trading position for damage.',
  guard: 'Holds the line at the Nucleus — soaks pressure, mends Integrity, shields allies.',
  control: 'Floats over the swarm projecting a control field that slows and exposes enemies.',
};

export interface HeroLore {
  title: string; // epithet shown under the name (identity)
  tagline: string; // one-line fantasy of the hero
  specialization: string; // discipline label (their build identity)
  roleLabel: string; // Striker / Guardian / Controller
  roleDesc: string; // what that role does
}

// Authored flavor for the shipped heroes. New heroes are OPTIONAL here — heroLore() derives a
// sensible default from the HeroDef, so the screen never shows a blank for an unauthored hero.
const AUTHORED: Record<string, Partial<HeroLore>> = {
  ravager: {
    title: 'The Apex Predator',
    tagline: 'Closes the distance and shreds armor with relentless kinetic strikes.',
    specialization: 'Frontline Bruiser',
  },
  shepherd: {
    title: 'Warden of the Hive',
    tagline: 'Anchors the line, mends the Nucleus, and shields the swarm from collapse.',
    specialization: 'Sustain Guardian',
  },
  overseer: {
    title: 'Mind of the Swarm',
    tagline: 'Bends the battlefield — slows, exposes, and overclocks your towers.',
    specialization: 'Control Amplifier',
  },
};

/** Resolve a hero's lore, deriving any unauthored field from its definition. */
export function heroLore(def: HeroDef): HeroLore {
  const roleLabel = ROLE_BY_BEHAVIOR[def.behavior] ?? 'Specialist';
  const a = AUTHORED[def.kind] ?? {};
  return {
    title: a.title ?? def.name,
    tagline: a.tagline ?? def.ability.blurb,
    specialization: a.specialization ?? `${def.combatClass} ${roleLabel}`,
    roleLabel: a.roleLabel ?? roleLabel,
    roleDesc: a.roleDesc ?? ROLE_DESC[def.behavior] ?? def.ability.blurb,
  };
}
