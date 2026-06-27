// Projectile mutators (TOWER-STARS.md §3 "projectile"). Composable spawn-time transforms
// that change how a fired projectile behaves — the iconic tower-evolution mutation. Each is
// a pure `(p) => void` registered by id; a tower's star kit lists mutator ids, and the sim
// applies them to every projectile that tower spawns. Adding a mutation is one registry
// entry — no sim branches.
//
// Golden invariant: a projectile with no mutators keeps pierce 0 (dies on first hit) — the
// historical behavior — so a fresh account is byte-identical.

import { Registry } from './registry';
import type { Projectile } from './types';

export type ProjectileMutator = (p: Projectile) => void;

interface MutatorDef {
  id: string;
  name: string;
  apply: ProjectileMutator;
}

export const mutatorRegistry = new Registry<MutatorDef>('projectileMutator', { idOf: (m) => m.id });

/** Make a projectile pass THROUGH up to `n` extra enemies (re-acquiring the next nearest
 * after each hit) instead of dying on the first. `hitIds` tracks who it already struck. */
function pierce(n: number): ProjectileMutator {
  return (p) => {
    p.pierce = (p.pierce ?? 0) + n;
    p.hitIds = p.hitIds ?? [];
  };
}

mutatorRegistry.registerAll([
  { id: 'pierce1', name: 'Piercing', apply: pierce(1) },
  { id: 'pierce2', name: 'Penetrating', apply: pierce(2) },
  { id: 'pierce3', name: 'Impaling', apply: pierce(3) },
]);

/** Apply a list of mutator ids to a freshly-spawned projectile (unknown ids are skipped). */
export function applyMutators(ids: readonly string[], p: Projectile): void {
  for (const id of ids) mutatorRegistry.get(id)?.apply(p);
}
