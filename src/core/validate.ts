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
  TOTAL_WAVES,
  TOWER_DEFS,
  ENEMY_DEFS,
  HERO_DEFS,
  META_UPGRADES,
  CHESTS,
  STAR,
  MASTERY,
  chestForWave,
  enemyProblems,
  towerProblems,
  heroProblems,
  upgradeProblems,
  enemyRegistry,
  towerRegistry,
  heroRegistry,
  upgradeRegistry,
  chestRegistry,
} from './config';
import type { EnemyDef, TowerDef, UpgradeDef, WaveDef } from './config';
import { cardProblems, cardRegistry, CARD_POOL, defaultRunModifiers } from './cards';
import type { CardDef, CardEffect } from './cards';
import { bossRegistry, BOSS_DEFS } from './boss';
import {
  equipmentRegistry,
  WEAPONS,
  ARMOR,
  RELICS,
  ALL_ITEMS,
  AFFIXES,
  SETS,
  RARITY_AFFIXES,
  RARITY_ORDER,
  AFFIX_TIER_SCALE,
  MAX_AFFIX_TIER,
} from './equipment';
import { DIFFICULTIES, difficultyRegistry } from './difficulty';
import { statusRegistry } from './status';
import { rarityRegistry } from './loot';
import type { MetaModifiers } from './types';

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
    ...bossRegistry.validate(),
    ...equipmentRegistry.validate(),
    ...statusRegistry.validate(),
    ...difficultyRegistry.validate(),
    ...rarityRegistry.validate(),
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

// ── Structured content-validation report (the full authoring checklist) ──────
// `validateAllContent()` above stays the registry-driven string[] used at dev boot + tests.
// The report below classifies every authoring failure into the seven CANONICAL categories
// and is the surface a content tool / CI renders: each issue carries a category, target,
// message, and severity, so any new content (tower, enemy, item, loot table, difficulty…) is
// checked the moment it's added. Pure analysis — it reads content data only and changes
// nothing, so gameplay (and the golden run) is never affected.

export type ValidationCategory =
  | 'duplicate-id' // two defs share a stable id
  | 'missing-asset' // absent name/color (placeholder art slot) on a visual def
  | 'invalid-reference' // points at content/field that doesn't exist
  | 'invalid-stat' // out-of-range / non-finite numeric value
  | 'missing-localization' // a user-facing string (name/description) is empty
  | 'broken-upgrade-chain' // a progression curve is non-monotonic / degenerate
  | 'invalid-loot-table'; // a reward table is malformed (ranges/odds/empty pool)

export interface ValidationIssue {
  category: ValidationCategory;
  target: string; // e.g. "tower 'needle'"
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  ok: boolean; // true ⇒ no ERRORS (warnings are allowed)
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const HEX_COLOR = /^#([0-9a-fA-F]{3,8})$/;
// The valid run-modifier field set (numeric vs flag) + the meta-modifier stat set — used to
// validate that every declarative effect / upgrade points at a field that actually exists.
const RUN_MOD = defaultRunModifiers() as unknown as Record<string, unknown>;
const META_SAMPLE: MetaModifiers = { towerDamageMult: 1, biomassMult: 1, heroDamageMult: 1, integrityBonus: 0 };
const META_KEYS = new Set(Object.keys(META_SAMPLE));

const err = (category: ValidationCategory, target: string, message: string): ValidationIssue => ({ category, target, message, severity: 'error' });
const warn = (category: ValidationCategory, target: string, message: string): ValidationIssue => ({ category, target, message, severity: 'warning' });

/** Duplicate stable ids within a single catalog (registries throw at registration, but a
 * content tool validates raw arrays BEFORE they're registered — this catches it first). */
function dupIssues<T>(items: readonly T[], idOf: (t: T) => string, label: string): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const it of items) {
    const id = idOf(it);
    if (seen.has(id)) out.push(err('duplicate-id', `${label} '${id}'`, 'duplicate id within the catalog'));
    seen.add(id);
  }
  return out;
}

/** Validate a declarative effect list (cards, affixes, sets, items): every mul/add/flag must
 * point at a real run-modifier field of the right kind, and numeric values must be finite
 * (mul > 0). Exported so a content tool can check a NEW def's effects before it's registered. */
export function validateEffects(effects: CardEffect[], target: string): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const e of effects) {
    if ('value' in e && !Number.isFinite(e.value)) out.push(err('invalid-stat', target, 'non-finite effect value'));
    if (e.op === 'mul' && e.value <= 0) out.push(err('invalid-stat', target, `multiplier on '${e.field}' must be > 0`));
    if ((e.op === 'mul' || e.op === 'add') && typeof RUN_MOD[e.field] !== 'number') {
      out.push(err('invalid-reference', target, `'${e.field}' is not a numeric run modifier`));
    }
    if (e.op === 'flag' && typeof RUN_MOD[e.field] !== 'boolean') {
      out.push(err('invalid-reference', target, `'${e.field}' is not a boolean run modifier`));
    }
  }
  return out;
}

/** Require a non-empty user-facing string (localization-readiness). */
function locIssue(value: string | undefined, target: string, field: string): ValidationIssue | null {
  return value && value.trim().length > 0 ? null : err('missing-localization', target, `empty ${field}`);
}

/** The full structured report across all seven authoring-failure categories. */
export function validateAllContentReport(): ValidationReport {
  const issues: ValidationIssue[] = [];
  const push = (xs: (ValidationIssue | null)[]): void => {
    for (const x of xs) if (x) issues.push(x);
  };

  // 1 ─ Duplicate ids (every catalog).
  issues.push(...dupIssues(Object.values(TOWER_DEFS), (d) => d.kind, 'tower'));
  issues.push(...dupIssues(Object.values(ENEMY_DEFS), (d) => d.kind, 'enemy'));
  issues.push(...dupIssues(Object.values(HERO_DEFS), (d) => d.kind, 'hero'));
  issues.push(...dupIssues(CARD_POOL, (d) => d.id, 'card'));
  issues.push(...dupIssues(META_UPGRADES, (d) => d.id, 'upgrade'));
  issues.push(...dupIssues(ALL_ITEMS, (d) => d.id, 'item'));
  issues.push(...dupIssues(AFFIXES, (d) => d.id, 'affix'));
  issues.push(...dupIssues(Object.values(SETS), (d) => d.id, 'set'));
  issues.push(...dupIssues(Object.values(CHESTS), (d) => d.id, 'chest'));
  issues.push(...dupIssues(Object.values(BOSS_DEFS), (d) => d.id, 'boss'));
  issues.push(...dupIssues(Object.values(DIFFICULTIES), (d) => d.id, 'difficulty'));

  // 2 ─ Missing assets: visual defs need a name + a valid hex color (placeholder-art slot).
  const colored: { label: string; name: string; color: string; id: string }[] = [
    ...Object.values(TOWER_DEFS).map((d) => ({ label: 'tower', name: d.name, color: d.color, id: d.kind })),
    ...Object.values(ENEMY_DEFS).map((d) => ({ label: 'enemy', name: d.name, color: d.color, id: d.kind })),
    ...Object.values(HERO_DEFS).map((d) => ({ label: 'hero', name: d.name, color: d.color, id: d.kind })),
    ...Object.values(BOSS_DEFS).map((d) => ({ label: 'boss', name: d.name, color: d.color, id: d.id })),
  ];
  for (const c of colored) {
    const target = `${c.label} '${c.id}'`;
    if (!HEX_COLOR.test(c.color)) issues.push(err('missing-asset', target, `invalid/missing color '${c.color}'`));
  }

  // 3 ─ Invalid references (one pointer that doesn't resolve = a subtle runtime bug).
  WAVES.forEach((wave, w) => {
    for (const g of wave) if (!enemyRegistry.has(g.kind)) issues.push(err('invalid-reference', `wave ${w + 1}`, `unknown enemy '${g.kind}'`));
  });
  for (const b of Object.values(BOSS_DEFS)) {
    const target = `boss '${b.id}'`;
    b.modules.forEach((m, i) => {
      if (m.addKind && !enemyRegistry.has(m.addKind)) issues.push(err('invalid-reference', target, `module ${i} spawns unknown enemy '${m.addKind}'`));
    });
    b.phases.forEach((p, pi) => {
      for (const mi of p.modules) if (mi < 0 || mi >= b.modules.length) issues.push(err('invalid-reference', target, `phase ${pi} references module index ${mi} out of range`));
    });
  }
  for (const it of ALL_ITEMS) {
    const target = `item '${it.id}'`;
    issues.push(...validateEffects(it.base, target));
    if (it.signature) issues.push(...validateEffects(it.signature.effects, target));
    if (it.setId && !SETS[it.setId]) issues.push(err('invalid-reference', target, `unknown set '${it.setId}'`));
    if (it.slot === 'weapon' && !it.weaponType) issues.push(err('invalid-reference', target, 'weapon missing weaponType'));
    if (it.slot === 'armor' && !it.armorType) issues.push(err('invalid-reference', target, 'armor missing armorType'));
    if (it.slot === 'relic' && (it.weaponType || it.armorType)) issues.push(err('invalid-reference', target, 'relic must not declare weapon/armor type'));
  }
  for (const a of AFFIXES) issues.push(...validateEffects(a.effects, `affix '${a.id}'`));
  for (const s of Object.values(SETS)) issues.push(...validateEffects([...s.bonus2, ...s.bonus4], `set '${s.id}'`));
  for (const c of CARD_POOL) issues.push(...validateEffects(c.effects, `card '${c.id}'`));
  for (const u of META_UPGRADES) {
    if (!META_KEYS.has(u.effect.stat)) issues.push(err('invalid-reference', `upgrade '${u.id}'`, `targets unknown meta stat '${u.effect.stat}'`));
  }
  for (let w = 1; w <= TOTAL_WAVES; w++) {
    const id = chestForWave(w);
    if (!chestRegistry.has(id)) issues.push(err('invalid-reference', `chestForWave(${w})`, `returns unknown chest '${id}'`));
  }

  // 4 ─ Invalid stat values: the per-def invariants (the registries' own validators).
  for (const d of Object.values(TOWER_DEFS)) for (const p of towerProblems(d)) issues.push(err('invalid-stat', `tower '${d.kind}'`, p));
  for (const d of Object.values(ENEMY_DEFS)) for (const p of enemyProblems(d)) issues.push(err('invalid-stat', `enemy '${d.kind}'`, p));
  for (const d of Object.values(HERO_DEFS)) for (const p of heroProblems(d)) issues.push(err('invalid-stat', `hero '${d.kind}'`, p));
  for (const d of CARD_POOL) for (const p of cardProblems(d)) issues.push(err('invalid-stat', `card '${d.id}'`, p));
  for (const d of META_UPGRADES) for (const p of upgradeProblems(d)) issues.push(err('invalid-stat', `upgrade '${d.id}'`, p));
  issues.push(...difficultyRegistry.validate().map((p) => err('invalid-stat', 'difficulty', p)));
  issues.push(...bossRegistry.validate().map((p) => err('invalid-stat', 'boss', p)));
  issues.push(...equipmentRegistry.validate().map((p) => err('invalid-stat', 'equipment', p)));
  issues.push(...rarityRegistry.validate().map((p) => err('invalid-stat', 'rarity', p)));

  // 5 ─ Missing localization: every user-facing name + description string must be present.
  push(Object.values(TOWER_DEFS).flatMap((d) => [locIssue(d.name, `tower '${d.kind}'`, 'name'), locIssue(d.blurb, `tower '${d.kind}'`, 'blurb')]));
  push(Object.values(ENEMY_DEFS).map((d) => locIssue(d.name, `enemy '${d.kind}'`, 'name')));
  push(Object.values(HERO_DEFS).map((d) => locIssue(d.name, `hero '${d.kind}'`, 'name')));
  push(CARD_POOL.flatMap((d) => [locIssue(d.name, `card '${d.id}'`, 'name'), locIssue(d.description, `card '${d.id}'`, 'description')]));
  push(META_UPGRADES.flatMap((d) => [locIssue(d.name, `upgrade '${d.id}'`, 'name'), locIssue(d.description, `upgrade '${d.id}'`, 'description')]));
  push(ALL_ITEMS.flatMap((d) => [locIssue(d.name, `item '${d.id}'`, 'name'), locIssue(d.desc, `item '${d.id}'`, 'desc')]));
  push(AFFIXES.map((d) => locIssue(d.name, `affix '${d.id}'`, 'name')));
  push(Object.values(SETS).map((d) => locIssue(d.name, `set '${d.id}'`, 'name')));
  push(Object.values(CHESTS).map((d) => locIssue(d.name, `chest '${d.id}'`, 'name')));
  push(Object.values(BOSS_DEFS).map((d) => locIssue(d.name, `boss '${d.id}'`, 'name')));
  push(Object.values(DIFFICULTIES).flatMap((d) => [locIssue(d.name, `difficulty '${d.id}'`, 'name'), locIssue(d.blurb, `difficulty '${d.id}'`, 'blurb')]));

  // 6 ─ Broken upgrade chains: progression curves must stay monotonic / non-degenerate.
  if (STAR.maxStars <= 0) issues.push(err('broken-upgrade-chain', 'STAR', 'maxStars must be > 0'));
  if (STAR.baseCost <= 0) issues.push(err('broken-upgrade-chain', 'STAR', 'baseCost must be > 0'));
  if (STAR.costMult < 1) issues.push(err('broken-upgrade-chain', 'STAR', 'costMult must be >= 1 (costs must not shrink)'));
  if (MASTERY.baseReq <= 0) issues.push(err('broken-upgrade-chain', 'MASTERY', 'baseReq must be > 0'));
  if (MASTERY.reqGrowth < 1) issues.push(err('broken-upgrade-chain', 'MASTERY', 'reqGrowth must be >= 1 (requirements must not shrink)'));
  for (const u of META_UPGRADES) {
    if (!Number.isFinite(u.effect.perLevel)) issues.push(err('broken-upgrade-chain', `upgrade '${u.id}'`, 'effect.perLevel must be finite'));
    else if (u.effect.perLevel === 0) issues.push(warn('broken-upgrade-chain', `upgrade '${u.id}'`, 'effect.perLevel is 0 (upgrade does nothing)'));
  }
  // Equipment rarity ladder: affix-slot count must not DROP as rarity rises.
  for (let i = 1; i < RARITY_ORDER.length; i++) {
    if (RARITY_AFFIXES[RARITY_ORDER[i]] < RARITY_AFFIXES[RARITY_ORDER[i - 1]]) {
      issues.push(warn('broken-upgrade-chain', 'equipment rarity', `${RARITY_ORDER[i]} grants fewer affixes than ${RARITY_ORDER[i - 1]}`));
    }
  }
  if (AFFIX_TIER_SCALE.length !== MAX_AFFIX_TIER + 1) issues.push(err('broken-upgrade-chain', 'AFFIX_TIER_SCALE', `length must be MAX_AFFIX_TIER+1 (${MAX_AFFIX_TIER + 1})`));
  for (let i = 1; i < AFFIX_TIER_SCALE.length; i++) {
    if (AFFIX_TIER_SCALE[i] < AFFIX_TIER_SCALE[i - 1]) issues.push(err('broken-upgrade-chain', 'AFFIX_TIER_SCALE', `tier ${i} magnitude drops below tier ${i - 1}`));
  }
  // Boss phase thresholds: start at full (1) and strictly descend within (0,1].
  for (const b of Object.values(BOSS_DEFS)) {
    const target = `boss '${b.id}'`;
    b.phases.forEach((p, i) => {
      if (p.threshold <= 0 || p.threshold > 1) issues.push(err('broken-upgrade-chain', target, `phase ${i} threshold ${p.threshold} must be in (0,1]`));
      if (i === 0 && p.threshold !== 1) issues.push(warn('broken-upgrade-chain', target, 'first phase threshold should be 1 (from full HP)'));
      if (i > 0 && p.threshold >= b.phases[i - 1].threshold) issues.push(err('broken-upgrade-chain', target, `phase ${i} threshold must be below phase ${i - 1}`));
    });
  }

  // 7 ─ Invalid loot tables: pools non-empty, weights sane, ranges well-formed.
  for (const c of Object.values(CHESTS)) {
    const target = `chest '${c.id}'`;
    if (c.rolls <= 0) issues.push(err('invalid-loot-table', target, 'rolls must be > 0'));
    if (!c.pools || c.pools.length === 0) {
      issues.push(err('invalid-loot-table', target, 'must define at least one reward pool'));
      continue;
    }
    if (c.pools.reduce((s, p) => s + p.weight, 0) <= 0) issues.push(err('invalid-loot-table', target, 'pool weights sum to 0'));
    for (const p of c.pools) {
      if (p.weight < 0) issues.push(err('invalid-loot-table', target, 'pool weight must be ≥ 0'));
      const s = p.spec;
      if (
        (s.pool === 'tower' || s.pool === 'hero' || s.pool === 'material' || s.pool === 'event') &&
        (s.range[0] < 0 || s.range[1] < s.range[0])
      ) {
        issues.push(err('invalid-loot-table', target, `${s.pool} range ${JSON.stringify(s.range)} is malformed`));
      }
      if (s.pool === 'material' && s.mats.length === 0) issues.push(err('invalid-loot-table', target, 'material pool has no mats'));
    }
  }
  if (WEAPONS.length === 0) issues.push(err('invalid-loot-table', 'equipment', 'weapon pool is empty'));
  if (ARMOR.length === 0) issues.push(err('invalid-loot-table', 'equipment', 'armor pool is empty'));
  if (RELICS.length === 0) issues.push(err('invalid-loot-table', 'equipment', 'relic pool is empty'));
  if (ALL_ITEMS.length === 0) issues.push(err('invalid-loot-table', 'equipment', 'item drop pool is empty'));

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, issues, errors, warnings };
}

/** Render a structured report for the dev console / CI (grouped, human-readable). */
export function formatReport(r: ValidationReport): string {
  if (r.issues.length === 0) return 'content OK — 0 issues';
  const line = (i: ValidationIssue): string => `  [${i.severity}] (${i.category}) ${i.target}: ${i.message}`;
  const out: string[] = [`content: ${r.errors.length} error(s), ${r.warnings.length} warning(s)`];
  for (const i of r.issues) out.push(line(i));
  return out.join('\n');
}
