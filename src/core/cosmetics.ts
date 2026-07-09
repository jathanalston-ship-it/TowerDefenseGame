// PHENOTYPES — the cosmetics system (docs/COSMETICS.md). A phenotype is a purely visual
// expression of a tower or hero: a palette re-expression, an idle AURA flourish, themed
// projectile/beam light and a firing-sound variant. STRICTLY presentation — no def stat is
// read or written here, equipping changes nothing the sim can see, and a fresh save (zero
// owned, zero equipped) renders and sounds exactly like the pre-cosmetics build.
//
// CONTENT IS GENERATED, NOT HAND-AUTHORED: six theme FAMILIES × every tower/hero in the
// registries. New towers and heroes grow their full phenotype line automatically (the
// generator loops TOWER_ORDER/HERO_ORDER), which is how the system stays at target scale
// (100 towers ⇒ 600 tower phenotypes) with zero per-kind work.
//
// Sources gate HOW a phenotype is obtained:
//   cultivate — rollable in the Phenotype Lab for Gene Essence (the common families)
//   contract  — Champion Contract exclusive payouts (Gilded)
//   nemesis   — revenge-kill exclusives (Abyssal)

import { Registry } from './registry';
import { HERO_DEFS, HERO_ORDER, TOWER_DEFS, TOWER_ORDER } from './config';
import type { HeroKind, TowerKind } from './types';

export type CosmeticAura = 'ember' | 'frost' | 'void' | 'verdant' | 'gilded' | 'abyss';
export type CosmeticSfx = 'default' | 'deep' | 'crisp' | 'wet' | 'aetheric';
export type CosmeticRarity = 'rare' | 'epic' | 'legendary';
export type CosmeticSource = 'cultivate' | 'contract' | 'nemesis';

export interface CosmeticTheme {
  primary: string; // hex — replaces the def color on the body + kind-keyed FX
  glow: string;    // hex — blooms/energy accents
  aura: CosmeticAura; // idle flourish drawn around the themed unit
  sfx: CosmeticSfx;   // firing-cue variant (audio/sound.ts §variants)
}

export interface CosmeticDef {
  id: string;
  name: string;
  desc: string;
  target: { kind: 'tower'; tower: TowerKind } | { kind: 'hero'; hero: HeroKind };
  rarity: CosmeticRarity;
  source: CosmeticSource;
  theme: CosmeticTheme;
}

/** The six theme families — the entire content axis. Adding a family = one row here
 *  (every tower + hero grows the new skin automatically). */
export interface CosmeticFamily {
  id: string;
  name: string; // display prefix, e.g. 'Ember' → 'Ember Needle Spitter'
  desc: string;
  primary: string;
  glow: string;
  aura: CosmeticAura;
  sfx: CosmeticSfx;
  rarity: CosmeticRarity;
  source: CosmeticSource;
}

export const COSMETIC_FAMILIES: CosmeticFamily[] = [
  { id: 'ember', name: 'Ember', desc: 'A smoldering strain — coals under the chitin, cinders on every shot.', primary: '#ff7a45', glow: '#ffc46b', aura: 'ember', sfx: 'deep', rarity: 'rare', source: 'cultivate' },
  { id: 'frost', name: 'Frost', desc: 'A cryo-adapted strain — glacial plates, freezing light.', primary: '#7fd7ff', glow: '#d6f2ff', aura: 'frost', sfx: 'crisp', rarity: 'rare', source: 'cultivate' },
  { id: 'verdant', name: 'Verdant', desc: 'An overgrown strain — moss-slick, spore-sweet, alive.', primary: '#7fe07a', glow: '#c9ffb0', aura: 'verdant', sfx: 'wet', rarity: 'rare', source: 'cultivate' },
  { id: 'void', name: 'Void', desc: 'A strain grown in the dark between signals — light bends near it.', primary: '#9a7dff', glow: '#d9c9ff', aura: 'void', sfx: 'aetheric', rarity: 'epic', source: 'cultivate' },
  { id: 'gilded', name: 'Gilded', desc: 'The champion’s strain — laurelled in living gold. Contract exclusive.', primary: '#ffd24d', glow: '#fff0b8', aura: 'gilded', sfx: 'crisp', rarity: 'legendary', source: 'contract' },
  { id: 'abyss', name: 'Abyssal', desc: 'Grown from a nemesis’s remains — it remembers being killed by you. Revenge exclusive.', primary: '#ff4d6d', glow: '#2b1d33', aura: 'abyss', sfx: 'deep', rarity: 'legendary', source: 'nemesis' },
];

function makeDefs(): CosmeticDef[] {
  const out: CosmeticDef[] = [];
  for (const f of COSMETIC_FAMILIES) {
    for (const k of TOWER_ORDER) {
      out.push({
        id: `pt_${f.id}_${k}`,
        name: `${f.name} ${TOWER_DEFS[k].name}`,
        desc: f.desc,
        target: { kind: 'tower', tower: k },
        rarity: f.rarity,
        source: f.source,
        theme: { primary: f.primary, glow: f.glow, aura: f.aura, sfx: f.sfx },
      });
    }
    for (const h of HERO_ORDER) {
      out.push({
        id: `ph_${f.id}_${h}`,
        name: `${f.name} ${HERO_DEFS[h].name}`,
        desc: f.desc,
        target: { kind: 'hero', hero: h },
        rarity: f.rarity,
        source: f.source,
        theme: { primary: f.primary, glow: f.glow, aura: f.aura, sfx: f.sfx },
      });
    }
  }
  return out;
}

export const cosmeticRegistry = new Registry<CosmeticDef>('cosmetic', {
  idOf: (d) => d.id,
  validate: (d) => {
    const out: string[] = [];
    if (!/^p[th]_/.test(d.id)) out.push('id must be pt_/ph_ prefixed');
    if (d.target.kind === 'tower' && !(d.target.tower in TOWER_DEFS)) out.push(`unknown tower ${d.target.tower}`);
    if (d.target.kind === 'hero' && !(d.target.hero in HERO_DEFS)) out.push(`unknown hero ${d.target.hero}`);
    if (!/^#[0-9a-f]{6}$/i.test(d.theme.primary)) out.push('theme.primary must be #rrggbb');
    return out;
  },
});
cosmeticRegistry.registerAll(makeDefs());

// ── Lookup helpers (UI + render threading) ──────────────────────────────────────
export function cosmeticById(id: string): CosmeticDef | undefined {
  return cosmeticRegistry.get(id);
}
export function cosmeticsForTower(k: TowerKind): CosmeticDef[] {
  return cosmeticRegistry.all().filter((d) => d.target.kind === 'tower' && d.target.tower === k);
}
export function cosmeticsForHero(h: HeroKind): CosmeticDef[] {
  return cosmeticRegistry.all().filter((d) => d.target.kind === 'hero' && d.target.hero === h);
}
/** All ids rollable in the Phenotype Lab (the cultivate pool). */
export function cultivatePool(): CosmeticDef[] {
  return cosmeticRegistry.all().filter((d) => d.source === 'cultivate');
}

/** The Abyssal revenge pool (docs/NEMESIS.md): nemesis-source phenotypes. */
export function nemesisPool(): CosmeticDef[] {
  return cosmeticRegistry.all().filter((d) => d.source === 'nemesis');
}

/** Cultivation price (Gene Essence) by rarity — the lab rolls a RANDOM unowned cultivate
 *  phenotype, so the price is flat per roll; rarer families simply exist in the same pool. */
export const CULTIVATE_COST = 400;

export const COSMETIC_RARITY_COLOR: Record<CosmeticRarity, string> = {
  rare: '#5ad1ff',
  epic: '#c98bff',
  legendary: '#ffd24d',
};
