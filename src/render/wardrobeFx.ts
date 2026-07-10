// WARDROBE RENDER KIT (docs/COSMETICS.md §wardrobe) — the render-side half of the global
// cosmetics. The app SETS the equipped payloads once (run start / equip change); the renderer
// READS them through cheap accessors. Everything here is presentation-only: an empty kit is
// the exact classic look, and nothing reads or writes sim state (golden-safe).
//
// Enemy/boss reskins are PRECOMPUTED palettes (built once per kit change), so drawEnemy pays
// one map lookup per entity — never a per-frame blend or allocation.

import { ENEMY_DEFS } from '../core/config';
import type { WardrobeKind, WardrobePayload } from '../core/wardrobe';

export type WardrobeRenderKit = Partial<Record<WardrobeKind, WardrobePayload>>;

type EnemyDefs = typeof ENEMY_DEFS;
type AnyEnemyDef = EnemyDefs[keyof EnemyDefs];

let kit: WardrobeRenderKit = {};
/** Blended enemy body colors per kind (accent-leaning mix), rebuilt on kit change. */
let enemyColors: Record<string, string> = {};
/** Full def clones with the blended color — drawEnemy reads ONE lookup, zero per-frame allocs. */
let themedDefs: Partial<Record<string, AnyEnemyDef>> = {};
let bossBlend: ((base: string) => string) | null = null;
let megaBlend: ((base: string) => string) | null = null;

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}
/** 65/35 accent-over-base blend — a re-pigmentation that keeps each kind's identity value. */
function blend(base: string, accent: string): string {
  const b = parseInt(base.slice(1), 16);
  const a = parseInt(accent.slice(1), 16);
  const mix = (sb: number, sa: number): number => sa * 0.65 + sb * 0.35;
  return `#${hex2(mix((b >> 16) & 255, (a >> 16) & 255))}${hex2(mix((b >> 8) & 255, (a >> 8) & 255))}${hex2(mix(b & 255, a & 255))}`;
}

/** Install the equipped payloads (App/GameView call this on load, equip, and run start). */
export function setWardrobeKit(next: WardrobeRenderKit): void {
  kit = next;
  enemyColors = {};
  themedDefs = {};
  const enemy = kit.enemyTheme?.accent;
  if (enemy) {
    for (const [k, def] of Object.entries(ENEMY_DEFS)) {
      enemyColors[k] = blend(def.color, enemy);
      themedDefs[k] = { ...def, color: enemyColors[k] } as AnyEnemyDef;
    }
  }
  const boss = kit.bossTheme?.accent;
  bossBlend = boss ? (base: string): string => blend(base, boss) : null;
  const mega = kit.megaTheme?.accent;
  megaBlend = mega ? (base: string): string => blend(base, mega) : null;
}

export function wardrobeKit(): WardrobeRenderKit {
  return kit;
}

/** The (possibly re-pigmented) body color for an enemy kind. */
export function themedEnemyColor(kind: string, base: string): string {
  return enemyColors[kind] ?? base;
}
/** The enemy def with its reskinned color (the base def when no enemy theme is equipped). */
export function themedEnemyDef<K extends keyof EnemyDefs>(kind: K): EnemyDefs[K] {
  return (themedDefs[kind as string] as EnemyDefs[K] | undefined) ?? ENEMY_DEFS[kind];
}
/** Boss chassis color through the equipped boss skin (identity preserved, hue re-lit). */
export function themedBossColor(base: string): string {
  return bossBlend ? bossBlend(base) : base;
}
/** Mega Boss palette entry through the equipped mega variant. */
export function themedMegaColor(base: string): string {
  return megaBlend ? megaBlend(base) : base;
}
