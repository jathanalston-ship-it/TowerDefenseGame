// Content validation — logical invariants the type system can't express (positive
// vitals, sane costs, non-degenerate multipliers). TypeScript already guarantees
// ID/key consistency, so this targets authoring mistakes that surface as subtle
// gameplay bugs as content scales to hundreds of towers / cards / enemies.
//
// Two entry points:
//   • validateContent(reg)  — array-based; validates a supplied (or default) content
//     set. Kept stable for tests and ad-hoc checks.
//   • validateAllContent()  — registry-driven; runs every registry's own validator
//     plus CROSS-registry checks (e.g. waves only reference registered enemies). This
//     is the dev-boot check and the one that scales as content self-registers.
//
// The per-def invariants live with their content (config.ts / cards.ts) so there is a
// single source of truth shared by both entry points and the registries themselves.

import {
  WAVES,
  enemyProblems,
  towerProblems,
  upgradeProblems,
  enemyRegistry,
  towerRegistry,
  heroRegistry,
  upgradeRegistry,
  chestRegistry,
} from './config';
import type { EnemyDef, TowerDef, UpgradeDef, WaveDef } from './config';
import { cardProblems, cardRegistry } from './cards';
import type { CardDef } from './cards';

export interface ContentRegistries {
  enemies: EnemyDef[];
  towers: TowerDef[];
  waves: WaveDef[];
  cards: CardDef[];
  upgrades: UpgradeDef[];
}

function defaultRegistries(): ContentRegistries {
  return {
    enemies: enemyRegistry.all(),
    towers: towerRegistry.all(),
    waves: WAVES,
    cards: cardRegistry.all(),
    upgrades: upgradeRegistry.all(),
  };
}

/** Validate timing/structure of the wave scripts (shared by both entry points). */
function waveProblems(waves: WaveDef[]): string[] {
  const out: string[] = [];
  waves.forEach((wave, w) => {
    if (wave.length === 0) out.push(`wave ${w + 1}: has no spawn groups`);
    for (const g of wave) {
      if (g.count <= 0) out.push(`wave ${w + 1}: group '${g.kind}' count must be > 0`);
      if (g.spacing < 0 || g.delay < 0) out.push(`wave ${w + 1}: group '${g.kind}' has negative timing`);
    }
  });
  return out;
}

/** Returns a list of content problems (empty = valid). Array-based; defaults to the
 * registered content. The per-def checks are the same ones the registries run. */
export function validateContent(reg: ContentRegistries = defaultRegistries()): string[] {
  const problems: string[] = [];
  for (const d of reg.enemies) for (const p of enemyProblems(d)) problems.push(`enemy '${d.kind}': ${p}`);
  for (const d of reg.towers) for (const p of towerProblems(d)) problems.push(`tower '${d.kind}': ${p}`);
  problems.push(...waveProblems(reg.waves));
  for (const d of reg.cards) for (const p of cardProblems(d)) problems.push(`card '${d.id}': ${p}`);
  for (const d of reg.upgrades) for (const p of upgradeProblems(d)) problems.push(`upgrade '${d.id}': ${p}`);
  return problems;
}

/** Registry-driven validation: every registry's own validator + cross-registry
 * invariants. This is what the dev boot runs, and what scales as content (towers,
 * heroes, enemies, cards, …) self-registers — no hand-maintained checklist. */
export function validateAllContent(): string[] {
  const problems: string[] = [
    ...towerRegistry.validate(),
    ...enemyRegistry.validate(),
    ...heroRegistry.validate(),
    ...cardRegistry.validate(),
    ...upgradeRegistry.validate(),
    ...chestRegistry.validate(),
    ...waveProblems(WAVES),
  ];
  // Cross-registry: a wave may only spawn enemies that actually exist in the registry.
  WAVES.forEach((wave, w) => {
    for (const g of wave) {
      if (!enemyRegistry.has(g.kind)) problems.push(`wave ${w + 1}: references unknown enemy '${g.kind}'`);
    }
  });
  return problems;
}
