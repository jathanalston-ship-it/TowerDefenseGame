// Evolving Home Base — the laboratory behind the headquarters grows into a living organism as
// the account develops (docs/HOME-BASE.md). This is the PURE model: a single monotonic
// "development score" folded from progression signals, a 0..3 era, an ambient intensity, and a
// data-driven ladder of FIXTURES that switch on at rising thresholds. LabAtmosphere renders it.
//
// Design: the score blends many long-horizon signals (stars, bosses, prestige, upgrades, depth)
// so the lab keeps visibly changing across dozens of hours — never maxing early, never static.
// Adding a fixture is one row; the renderer + CSS are generic. No sim, no DOM here.

import type { SaveData } from '../save/saveStore';
import { sumValues } from '../core/math';
import { hiveFixtures, hiveGlow } from '../core/hiveOrgans';


/** A single monotonic measure of "how developed is this account" — drives the lab's growth.
 *  Weighted so each system contributes and the curve keeps climbing on a long arc. */
export function labScore(save: SaveData): number {
  const towerStars = sumValues(save.towerStars);
  const heroStars = sumValues(save.heroStars);
  const upgrades = sumValues(save.upgrades);
  const bosses = (save.bossesSlain ?? []).length;
  const cells = save.prestige?.lifetimeCells ?? 0;
  const runs = Math.min(save.totalRuns ?? 0, 60); // a soft cap so early runs matter but don't dominate
  const depth = save.bestWave ?? 0;
  return (
    towerStars * 1.0 +
    heroStars * 1.4 +
    upgrades * 0.9 +
    bosses * 2.0 +
    cells * 6.0 +
    runs * 0.35 +
    depth * 0.25
  );
}

/** The lab ERA (0 nascent · 1 growing · 2 thriving · 3 ascendant) — drives the palette/mood. */
export function labEra(score: number): 0 | 1 | 2 | 3 {
  if (score >= 90) return 3;
  if (score >= 45) return 2;
  if (score >= 16) return 1;
  return 0;
}

/** Ambient intensity 0..1 — scales spore density, glow strength, helix opacity (CSS --lab-intensity).
 *  Floored so a fresh lab still breathes; saturates near a long-arc full build. */
export function labIntensity(score: number): number {
  return Math.max(0.12, Math.min(1, score / 110));
}

/** A piece of lab equipment that materializes once the account passes `at` development.
 *  `id` maps to a CSS class (.fix-<id>); `at` is the score threshold; `hint` documents the unlock. */
export interface LabFixture {
  id: string;
  at: number;
  hint: string;
}

// The ladder (BIOMES.md-style data table) — ordered, switched on by score. Mirrors the design
// arc: bare lab → mutation vats → containment → organic supercomputer → mutating walls →
// hero chambers → ascension devices. Hero/ascension fixtures are also gated by their own system
// below (a vat needs biology; an ascension device needs a Molt) for a truthful environment.
export const LAB_FIXTURES: LabFixture[] = [
  { id: 'vats', at: 6, hint: 'first tower/hero stars — mutation vats bubble to life' },
  { id: 'pipes', at: 12, hint: 'early upgrades — biomechanical plumbing threads the walls' },
  { id: 'containment', at: 22, hint: 'a boss felled — animated containment chambers' },
  { id: 'supercomputer', at: 38, hint: 'deep investment — an organic supercomputer pulses' },
  { id: 'walls', at: 58, hint: 'a thriving lab — the walls themselves mutate' },
  { id: 'herochambers', at: 30, hint: 'hero progression — stasis chambers for the heroes' },
  { id: 'ascension', at: 1, hint: 'a completed Molt — ascension devices hum (prestige-gated)' },
];

/** The fixtures currently present, given the account. Pure; respects per-system gates so the
 *  environment never lies (no hero chambers without hero stars; no ascension device pre-Molt).
 *  BUILT Hive organs (docs/HIVE-CONSTRUCTION.md) layer their own fixtures on top — the passive
 *  score ladder and the active construction share ONE renderer. */
export function unlockedFixtures(save: SaveData): string[] {
  const score = labScore(save);
  const heroStars = sumValues(save.heroStars);
  const cells = save.prestige?.lifetimeCells ?? 0;
  const passive = LAB_FIXTURES.filter((f) => {
    if (f.id === 'herochambers') return heroStars >= 3 && score >= f.at;
    if (f.id === 'ascension') return cells >= 1; // a Molt is the true unlock
    return score >= f.at;
  }).map((f) => f.id);
  return [...passive, ...hiveFixtures(save.hive?.built ?? {})];
}

export interface LabState { score: number; era: 0 | 1 | 2 | 3; intensity: number; fixtures: string[] }

/** One call for the renderer: the full evolving-lab state derived from a save. The built Hive
 *  raises ambient intensity a little (visual glow only — nothing gameplay reads LabState). */
export function labState(save: SaveData): LabState {
  const score = labScore(save);
  const intensity = Math.min(1, labIntensity(score) + hiveGlow(save.hive?.built ?? {}));
  return { score, era: labEra(score), intensity, fixtures: unlockedFixtures(save) };
}
