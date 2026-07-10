// DIL FEATURE CHECKLISTS (docs/DIL.md §checklists) — "is this feature COMPLETE?" answered by
// LIVE PROBES against the real registries wherever a machine can check, and by explicit manual
// items where only a human/agent can judge. `npm run dil -- checklist tower spitfang` prints the
// live status; dil.test.ts enforces that every SHIPPED entity passes all its auto probes — so a
// half-integrated tower fails CI, not a future session's archaeology.

import { ENEMY_DEFS, HERO_DEFS, HERO_SKILLS, TOWER_DEFS, towerFireCue } from '../../core/config';
import type { HeroKind, TowerKind } from '../../core/types';
import { starPathRegistry } from '../../core/stars';
import { branchesFor } from '../../core/branches';
import { TOWER_SHAPE, ENEMY_SHAPE, ENEMY_BODY } from '../../render/theme';
import { TOWER_FORM } from '../../render/towerForms';
import { heroLore } from '../../core/heroLore';
import { profileForTower } from '../../render/livingBattlefield';

export type ChecklistStatus = 'pass' | 'fail' | 'manual';
export interface ChecklistItem { item: string; status: ChecklistStatus; detail?: string }

const probe = (item: string, ok: boolean, detail?: string): ChecklistItem => ({ item, status: ok ? 'pass' : 'fail', detail });
const manual = (item: string, detail: string): ChecklistItem => ({ item, status: 'manual', detail });

/** Every AUTO row must pass for a shipped tower (enforced by dil.test.ts). */
export function towerChecklist(kind: TowerKind): ChecklistItem[] {
  const def = TOWER_DEFS[kind];
  if (!def) return [probe('definition (TOWER_DEFS)', false, `unknown tower '${kind}'`)];
  const branches = branchesFor(kind);
  return [
    probe('definition (TOWER_DEFS: stats + role blurb)', def.blurb.length > 20),
    probe('star path (starPathRegistry — permanent ★ evolution)', !!starPathRegistry.get(kind)),
    probe('branches (≥2 in-run mutations)', branches.length >= 2, `${branches.length} authored`),
    probe('silhouette (TOWER_SHAPE)', !!TOWER_SHAPE[kind]),
    probe('procedural body (TOWER_FORM)', !!TOWER_FORM[kind]),
    // Continuous identities (beam channels, support pulses, PULL fields) are AUTHORED silent per
    // shot — the cue requirement applies only to discrete-fire towers.
    probe('base firing audio (towerFireCue, discrete-fire kinds)',
      ['beam', 'support', 'field'].includes(def.firing) || towerFireCue(kind).length > 0,
      ['beam', 'support', 'field'].includes(def.firing) ? `'${def.firing}' firing — continuous identity, silent per shot by design` : undefined),
    probe('living-battlefield influence (profileForTower — hash default guarantees)', !!profileForTower(kind).hue),
    probe('website tower guide row (generated from TOWER_DEFS)', true, 'auto: /guides/towers/ regenerates from the def'),
    manual('mastery lore + rank thresholds reviewed', 'core/mastery.ts — verify voice + numbers'),
    manual('mulligan slots verified in the Lab UI', 'organism assembly is kind-agnostic; eyeball once'),
    manual('balance pass vs. cost band', 'docs/BALANCE_ARCHITECTURE.md — run npm run sim:report'),
    manual('unlock method + gating decided', 'unlockShards / stage gate in the def'),
    manual('achievement / collection hooks if the kind is thematic', 'state/achievements.ts'),
  ];
}

export function heroChecklist(kind: HeroKind): ChecklistItem[] {
  const def = HERO_DEFS[kind];
  if (!def) return [probe('definition (HERO_DEFS)', false, `unknown hero '${kind}'`)];
  return [
    probe('definition (HERO_DEFS: stats + doctrine)', def.maxHp > 0 && !!def.behavior),
    probe('active ability authored', !!def.ability?.name && def.ability.blurb.length > 10),
    probe('star ability kit (HERO_SKILLS)', (HERO_SKILLS[kind] ?? []).length > 0),
    probe('lore (heroLore: title + tagline resolve)', heroLore(def).title.length > 0 && heroLore(def).tagline.length > 0),
    probe('website hero guide row (generated from HERO_DEFS)', true, 'auto: /guides/heroes/ regenerates from the def'),
    manual('equipment loadout renders on the battlefield', 'render/equipmentArt drawHeroGear — eyeball with gear equipped'),
    manual('★5/★8 ability forks authored', 'core/heroForks — two per fork point'),
    manual('unlock gate + shard pricing decided', 'HERO_DEFS.unlock'),
    manual('tutorial/help mention if the doctrine is novel', 'state/mechanics.ts'),
  ];
}

export function enemyChecklist(kind: string): ChecklistItem[] {
  const def = ENEMY_DEFS[kind as keyof typeof ENEMY_DEFS];
  if (!def) return [probe('definition (ENEMY_DEFS)', false, `unknown enemy '${kind}'`)];
  return [
    probe('definition (ENEMY_DEFS: stats + attack profile)', def.hp > 0 && !!def.attack),
    probe('silhouette (ENEMY_SHAPE)', !!ENEMY_SHAPE[def.kind]),
    probe('procedural body form (ENEMY_BODY)', !!ENEMY_BODY[def.kind]),
    probe('bounty pays biomass', def.bounty > 0),
    manual('death timbre fits the body (enemyDeathCue archetype)', 'core/config enemyDeathCue'),
    manual('wave-plan / director budget entry', 'spawndirector composition weights'),
  ];
}

export type ChecklistKind = 'tower' | 'hero' | 'enemy';
export function checklistFor(kind: ChecklistKind, id: string): ChecklistItem[] {
  if (kind === 'tower') return towerChecklist(id as TowerKind);
  if (kind === 'hero') return heroChecklist(id as HeroKind);
  return enemyChecklist(id);
}

/** Every shipped entity's auto-probe failures — the CI hook (empty = the roster is fully integrated). */
export function allAutoFailures(): { kind: ChecklistKind; id: string; item: string; detail?: string }[] {
  const out: { kind: ChecklistKind; id: string; item: string; detail?: string }[] = [];
  const sweep = (kind: ChecklistKind, ids: string[]): void => {
    for (const id of ids) {
      for (const c of checklistFor(kind, id)) if (c.status === 'fail') out.push({ kind, id, item: c.item, detail: c.detail });
    }
  };
  sweep('tower', Object.keys(TOWER_DEFS));
  sweep('hero', Object.keys(HERO_DEFS));
  sweep('enemy', Object.keys(ENEMY_DEFS));
  return out;
}
