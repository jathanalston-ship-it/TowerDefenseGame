// Content validation — logical invariants the type system can't express (positive
// vitals, sane costs, non-degenerate multipliers). TypeScript already guarantees
// ID/key consistency (typed unions + exhaustive Records), so this targets authoring
// mistakes that would otherwise surface as subtle gameplay bugs as content scales to
// hundreds of towers / cards / enemies. Pure (no DOM/state) and parameterized so it
// also covers future data-loaded content, not just the built-in registries.

import { ENEMY_DEFS, META_UPGRADES, TOWER_DEFS, WAVES } from './config';
import type { EnemyDef, TowerDef, UpgradeDef, WaveDef } from './config';
import { CARD_POOL, defaultRunModifiers } from './cards';
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
    enemies: Object.values(ENEMY_DEFS),
    towers: Object.values(TOWER_DEFS),
    waves: WAVES,
    cards: CARD_POOL,
    upgrades: META_UPGRADES,
  };
}

/** Returns a list of content problems (empty = valid). */
export function validateContent(reg: ContentRegistries = defaultRegistries()): string[] {
  const problems: string[] = [];
  const bad = (msg: string): void => void problems.push(msg);

  for (const d of reg.enemies) {
    if (d.hp <= 0) bad(`enemy '${d.kind}': hp must be > 0`);
    if (d.speed <= 0) bad(`enemy '${d.kind}': speed must be > 0`);
    if (d.radius <= 0) bad(`enemy '${d.kind}': radius must be > 0`);
    if (d.armor < 0) bad(`enemy '${d.kind}': armor must be >= 0`);
  }

  for (const d of reg.towers) {
    if (d.cost < 0) bad(`tower '${d.kind}': cost must be >= 0`);
    const fires = d.fireInterval > 0;
    if (fires && d.range <= 0) bad(`tower '${d.kind}': a firing tower needs range > 0`);
    if (fires && d.projectileSpeed <= 0) bad(`tower '${d.kind}': a firing tower needs projectileSpeed > 0`);
  }

  reg.waves.forEach((wave, w) => {
    if (wave.length === 0) bad(`wave ${w + 1}: has no spawn groups`);
    for (const g of wave) {
      if (g.count <= 0) bad(`wave ${w + 1}: group '${g.kind}' count must be > 0`);
      if (g.spacing < 0 || g.delay < 0) bad(`wave ${w + 1}: group '${g.kind}' has negative timing`);
    }
  });

  // Cards mutate RunModifiers — verify each effect targets a field of the right type
  // and that magnitudes are sane (a 0x multiplier would wipe a stat).
  const mods = defaultRunModifiers() as unknown as Record<string, unknown>;
  for (const c of reg.cards) {
    if (c.effects.length === 0) bad(`card '${c.id}': has no effects`);
    for (const e of c.effects) {
      if ('value' in e && !Number.isFinite(e.value)) bad(`card '${c.id}': non-finite effect value`);
      if (e.op === 'mul' && e.value <= 0) bad(`card '${c.id}': multiplier must be > 0`);
      if ((e.op === 'mul' || e.op === 'add') && typeof mods[e.field] !== 'number') {
        bad(`card '${c.id}': '${e.field}' is not a numeric run modifier`);
      }
      if (e.op === 'flag' && typeof mods[e.field] !== 'boolean') {
        bad(`card '${c.id}': '${e.field}' is not a boolean run modifier`);
      }
    }
  }

  for (const u of reg.upgrades) {
    if (u.maxLevel <= 0) bad(`upgrade '${u.id}': maxLevel must be > 0`);
    if (u.baseCost <= 0) bad(`upgrade '${u.id}': baseCost must be > 0`);
    if (u.costMult < 1) bad(`upgrade '${u.id}': costMult should be >= 1`);
  }

  return problems;
}
