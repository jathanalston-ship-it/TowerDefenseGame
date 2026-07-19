// EFFECT LANGUAGE (docs/CARDS.md §language) — the universal descriptive-language system.
// Turns structured CardEffect data into standardized, digit-free player text: one impact
// scale ("Very Slightly" … "Overwhelmingly"), one color-coded effect-category palette, and
// one phrasing vocabulary per RunModifiers field. EVERY system that shows an effect (Gene
// Card drafts, equipment, mulligans, passives, future content) should speak through this
// module, so new content auto-generates consistent descriptions from its numbers — hand
// text only via the explicit CardDef.simple override.
//
// Pure data + functions: no DOM, no state, no Math.random. cards.ts imports at runtime;
// the CardDef/CardEffect imports below are type-only (the accepted back-edge pattern).

import type { CardDef, CardEffect, RunModifiers } from './cards';
import type { StatusType } from './types';
import { TOWER_DEFS } from './config';
import { effectsPower } from './power';

// ── The impact scale — 8 standardized magnitude descriptors (weakest → strongest). ──
// `min` is the inclusive lower bound of the NORMALIZED magnitude (×1.12 ⇒ 0.12; +8% ⇒ 0.08;
// discrete effects normalize via their vocab `unit`). Configurable in one place: retuning a
// band edge re-words every card in the game at once.
export interface ImpactTierDef {
  adverb: string; // "Moderately increases …"
  adjective: string; // "a Moderate infusion of …"
  min: number;
}
export const IMPACT_SCALE: ImpactTierDef[] = [
  { adverb: 'Very Slightly', adjective: 'Very Slight', min: 0 },
  { adverb: 'Slightly', adjective: 'Slight', min: 0.08 },
  { adverb: 'Moderately', adjective: 'Moderate', min: 0.15 },
  { adverb: 'Significantly', adjective: 'Significant', min: 0.25 },
  { adverb: 'Greatly', adjective: 'Great', min: 0.4 },
  { adverb: 'Massively', adjective: 'Massive', min: 0.6 },
  { adverb: 'Extremely', adjective: 'Extreme', min: 1.0 },
  { adverb: 'Overwhelmingly', adjective: 'Overwhelming', min: 1.75 },
];

/** Impact tier (0..7) for a normalized magnitude — the last band whose `min` it reaches. */
export function impactTier(magnitude: number): number {
  let tier = 0;
  for (let i = 0; i < IMPACT_SCALE.length; i++) if (magnitude >= IMPACT_SCALE[i].min) tier = i;
  return tier;
}

// ── Effect-category palette — the game-wide color language for effect types. ──
// Colors are picked for a dark UI; the glyph + label carry the identity for colorblind
// players (color is never the only channel). `genomeCore`/`essence` serve meta systems
// (pass/quest/collection rewards) — no RunModifiers field maps to them today.
export interface EffectCategoryDef {
  label: string;
  color: string;
  glyph: string; // small geometric mark (the UI's non-color identity channel)
}
export const EFFECT_CATEGORIES = {
  damage: { label: 'Damage', color: '#f0554a', glyph: '▲' },
  attackSpeed: { label: 'Attack Speed', color: '#f6a13c', glyph: '≫' },
  critical: { label: 'Critical', color: '#e8b234', glyph: '✦' },
  biomass: { label: 'Biomass Economy', color: '#66bb6a', glyph: '⬢' },
  genomeCore: { label: 'Genome Core Economy', color: '#26c6b9', glyph: '◈' },
  essence: { label: 'Gene Essence', color: '#ab6ef5', glyph: '⟡' },
  defense: { label: 'Defense', color: '#5b8ef0', glyph: '⬟' },
  healing: { label: 'Healing', color: '#3ddc97', glyph: '✚' },
  debuff: { label: 'Debuffs', color: '#e35bc8', glyph: '▼' },
  control: { label: 'Crowd Control', color: '#41d0e8', glyph: '◇' },
  hero: { label: 'Hero Effects', color: '#f5e04b', glyph: '★' },
  tower: { label: 'Tower Effects', color: '#8fc1f2', glyph: '⌂' },
} as const satisfies Record<string, EffectCategoryDef>;
export type EffectCategory = keyof typeof EFFECT_CATEGORIES;

// ── One generated line of player text. `pre + keyword + post` is the sentence; the keyword
//    is the emphasized game term (bold + category color in the UI; '' ⇒ no emphasis). ──
export interface EffectLine {
  pre: string;
  keyword: string;
  post: string;
  cat: EffectCategory;
  tier: number; // 0..7 impact tier — drives emphasis/animation intensity
  good: boolean; // false ⇒ a drawback line (warning styling; sorted last)
  exact: string; // the precise numeric restatement (detail expansion only)
}
export function lineText(l: EffectLine): string {
  return l.pre + l.keyword + l.post;
}

// ── Per-field vocabulary. `mode` picks the phrasing family + how the value normalizes:
//    mult |v−1| · frac |v| · flat |v|·unit · count/times n·unit. Optional `up`/`down` shapes
//    override the default "{A} increases/reduces {kw}." ({A} = the impact adverb). ──
interface Shape {
  pre: string; // contains '{A}'
  post: string;
}
type FieldVocab =
  | { mode: 'mult' | 'frac' | 'flat'; cat: EffectCategory; kw: string; unit?: number; up?: Shape; down?: Shape; moreIsBetter?: false; exactNoun?: string }
  | { mode: 'count'; cat: EffectCategory; unit: number; pre: string; kwOne: string; kwMany: string; tail: string; exactNoun: string }
  | { mode: 'times'; cat: EffectCategory; unit: number; kw: string; exactNoun: string };

const T = TOWER_DEFS; // tower display names stay in sync with the registry
export const FIELD_VOCAB: Record<keyof RunModifiers & string, FieldVocab | null> = {
  // ── army-wide scalars ──
  towerDamageMult: { mode: 'mult', cat: 'damage', kw: 'tower damage' },
  towerFireRateMult: { mode: 'mult', cat: 'attackSpeed', kw: 'tower fire rate' },
  splashRadiusMult: { mode: 'mult', cat: 'tower', kw: 'splash radius' },
  biomassMult: { mode: 'mult', cat: 'biomass', kw: 'Biomass from kills' },
  enemyHpRunMult: { mode: 'mult', cat: 'debuff', kw: 'enemy health', moreIsBetter: false },
  // ── tower identity scalars ──
  reactorBiomassMult: { mode: 'mult', cat: 'biomass', kw: `${T.reactor.name} Biomass` },
  reactorOverchargeBonus: { mode: 'frac', cat: 'biomass', kw: 'Reactor overcharge' },
  mortarPoolDurationMult: { mode: 'mult', cat: 'debuff', kw: 'Corrosion pool duration' },
  poolDpsMult: { mode: 'mult', cat: 'debuff', kw: 'Corrosion pool damage' },
  corrosionSlowBonus: { mode: 'frac', cat: 'control', kw: 'Corrosion slow' },
  parasiteInfectionMult: { mode: 'mult', cat: 'debuff', kw: 'Infection damage' },
  obeliskSlowBonus: { mode: 'frac', cat: 'control', kw: 'Disruption slow' },
  obeliskVulnerabilityBonus: { mode: 'frac', cat: 'debuff', kw: 'Disrupted', up: { pre: '{A} increases damage taken by ', post: ' enemies.' }, exactNoun: 'damage taken by Disrupted' },
  mawCleaveRadiusMult: { mode: 'mult', cat: 'tower', kw: `${T.maw.name} bite reach` },
  chrysalisFreezeDurationMult: { mode: 'mult', cat: 'control', kw: 'Encasement duration' },
  effigyDreadDurationMult: { mode: 'mult', cat: 'control', kw: 'Panic duration' },
  coilRampMult: { mode: 'mult', cat: 'damage', kw: `${T.coil.name} ramp` },
  siphonRampMult: { mode: 'mult', cat: 'damage', kw: `${T.siphon.name} gorge rate` },
  siphonDrainMult: { mode: 'mult', cat: 'biomass', kw: `${T.siphon.name} Biomass drain` },
  sowerBlastRadiusMult: { mode: 'mult', cat: 'tower', kw: `${T.sower.name} blast radius` },
  polypFieldMult: { mode: 'mult', cat: 'control', kw: `${T.polyp.name} field reach` },
  // ── tower counts ──
  needleExtraProjectiles: { mode: 'count', cat: 'tower', unit: 0.35, pre: 'Adds {N} extra ', kwOne: 'needle', kwMany: 'needles', tail: ` to every ${T.needle.name} volley.`, exactNoun: 'needles per volley' },
  coilBeamTargets: { mode: 'count', cat: 'tower', unit: 0.5, pre: `The ${T.coil.name} beam forks to {N} more `, kwOne: 'target', kwMany: 'targets', tail: '.', exactNoun: 'beam targets' },
  sowerExtraMines: { mode: 'count', cat: 'tower', unit: 0.3, pre: `Every ${T.sower.name} keeps {N} more `, kwOne: 'mine', kwMany: 'mines', tail: ' armed.', exactNoun: 'armed mines per Sower' },
  spireChainJumps: { mode: 'count', cat: 'tower', unit: 0.3, pre: `${T.spire.name} arcs leap to {N} more `, kwOne: 'victim', kwMany: 'victims', tail: '.', exactNoun: 'arc hops' },
  glaiveExtraBlades: { mode: 'count', cat: 'tower', unit: 0.3, pre: 'Adds {N} extra ', kwOne: 'blade', kwMany: 'blades', tail: ` to every ${T.glaive.name} throw.`, exactNoun: 'blades per throw' },
  roostBroodSize: { mode: 'count', cat: 'tower', unit: 0.35, pre: `Every ${T.roost.name} fields {N} more `, kwOne: 'drake', kwMany: 'drakes', tail: '.', exactNoun: 'drakes per Roost' },
  towerIdleChargeMult: { mode: 'mult', cat: 'tower', kw: 'idle preparation speed' },
  bonusTowerSlots: { mode: 'count', cat: 'tower', unit: 0.45, pre: 'Unlocks {N} extra ', kwOne: 'tower emplacement', kwMany: 'tower emplacements', tail: ' for this run.', exactNoun: 'tower emplacements (this run)' },
  // ── shred / crit lane ──
  fractureBonusStacks: { mode: 'count', cat: 'critical', unit: 0.08, pre: 'Adds {N} extra max ', kwOne: 'Fracture', kwMany: 'Fracture', tail: ' stack{s} — a deeper shred.', exactNoun: 'max Fracture stacks' },
  killFractureSplash: { mode: 'count', cat: 'debuff', unit: 0.15, pre: 'Every kill splinters {N} ', kwOne: 'Fracture', kwMany: 'Fracture', tail: ' stack{s} into nearby enemies.', exactNoun: 'Fracture spread on kill' },
  reactionRepeats: { mode: 'times', cat: 'debuff', unit: 0.35, kw: 'status reactions', exactNoun: 'reaction re-fires' },
  executeThreshold: { mode: 'frac', cat: 'critical', kw: 'Execute', up: { pre: '{A} raises the ', post: ' threshold on lesser enemies.' }, exactNoun: 'Execute threshold (enemy HP)' },
  fullHealthDamageBonus: { mode: 'frac', cat: 'damage', kw: 'damage', up: { pre: '{A} increases ', post: ' against enemies at full health.' }, exactNoun: 'damage vs full-health enemies' },
  // ── conditional army damage ──
  lastStandThreshold: { mode: 'frac', cat: 'defense', kw: 'Last Stand', up: { pre: '{A} raises the ', post: ' trigger threshold.' }, exactNoun: 'Last Stand trigger (Nucleus HP)' },
  lastStandMult: { mode: 'mult', cat: 'damage', kw: 'Last Stand tower damage' },
  damagePerTower: { mode: 'frac', cat: 'damage', kw: 'tower damage', up: { pre: '{A} increases ', post: ' for every tower fielded.' }, exactNoun: 'tower damage per tower fielded' },
  damagePerEmptySlot: { mode: 'frac', cat: 'damage', kw: 'tower damage', up: { pre: '{A} increases ', post: ' for every empty build slot.' }, exactNoun: 'tower damage per empty slot' },
  classResonanceBonus: { mode: 'frac', cat: 'damage', kw: 'tower damage', up: { pre: '{A} increases ', post: " for towers sharing the Hero's class." }, exactNoun: "damage for the Hero's class" },
  diversityBonus: { mode: 'frac', cat: 'damage', kw: 'tower damage', up: { pre: '{A} increases ', post: ' for every distinct tower class fielded.' }, exactNoun: 'tower damage per distinct class' },
  // ── hero kit ──
  heroDamageMult: { mode: 'mult', cat: 'damage', kw: 'Hero damage' },
  heroCooldownMult: { mode: 'mult', cat: 'hero', kw: 'Hero ability cooldown', moreIsBetter: false },
  heroAttackSpeedMult: { mode: 'mult', cat: 'attackSpeed', kw: 'Hero attack speed' },
  heroSpeedMult: { mode: 'mult', cat: 'hero', kw: 'Hero move speed' },
  heroAggroRangeMult: { mode: 'mult', cat: 'hero', kw: 'Hero aggression range' },
  heroAbilityRadiusMult: { mode: 'mult', cat: 'hero', kw: 'Hero ability radius' },
  heroRetreatThreshold: { mode: 'frac', cat: 'hero', kw: 'Hero retreat threshold' },
  heroCritChance: { mode: 'frac', cat: 'critical', kw: 'Hero crit chance' },
  heroCritDamageBonus: { mode: 'frac', cat: 'critical', kw: 'Hero crit damage' },
  heroLifestealFrac: { mode: 'frac', cat: 'healing', kw: 'Hero life steal' },
  heroHealingMult: { mode: 'mult', cat: 'healing', kw: 'healing', up: { pre: '{A} increases ', post: ' the Hero receives.' }, exactNoun: 'healing received' },
  heroArmor: { mode: 'frac', cat: 'defense', kw: 'Hero damage reduction' },
  heroThornsFrac: { mode: 'frac', cat: 'defense', kw: 'Hero thorns', exactNoun: 'contact damage reflected' },
  heroMaxHpMult: { mode: 'mult', cat: 'defense', kw: 'Hero max HP' },
  heroAuraRadius: { mode: 'flat', cat: 'hero', unit: 1 / 300, kw: 'Hero', up: { pre: '{A} widens the ', post: "'s empowering aura." }, exactNoun: 'aura radius' },
  heroTowerDamageAura: { mode: 'frac', cat: 'damage', kw: 'tower damage', up: { pre: '{A} increases ', post: " within the Hero's aura." }, exactNoun: 'tower damage in the aura' },
  heroTowerHasteAura: { mode: 'frac', cat: 'attackSpeed', kw: 'tower fire rate', up: { pre: '{A} increases ', post: " within the Hero's aura." }, exactNoun: 'tower fire rate in the aura' },
  // ── hive / economy ──
  integrityMult: { mode: 'mult', cat: 'defense', kw: 'Nucleus Integrity' },
  integrityRegenPerWave: { mode: 'flat', cat: 'healing', unit: 1 / 100, kw: 'Nucleus Integrity', up: { pre: '{A} regenerates ', post: ' after every cleared wave.' }, exactNoun: 'Integrity per cleared wave' },
  startBiomassBonus: { mode: 'flat', cat: 'biomass', unit: 1 / 600, kw: 'starting Biomass', exactNoun: 'starting Biomass' },
  sellRefundFrac: { mode: 'frac', cat: 'biomass', kw: 'tower sell refunds', exactNoun: 'sell refund' },
  // string/flag fields (described by SET_VOCAB / FLAG_VOCAB below)
  heroAnchor: null,
  mortarAppliesFracture: null,
  heroCorrosionAura: null,
};

// Rule-benders that aren't numbers: hand vocab per flag field / anchor value.
const FLAG_VOCAB: Record<string, { cat: EffectCategory; pre: string; kw: string; post: string; tier: number; exact: string }> = {
  mortarAppliesFracture: { cat: 'debuff', pre: `${T.mortar.name} shells now inflict `, kw: 'Fracture', post: '.', tier: 4, exact: `${T.mortar.name} applies Fracture` },
  heroCorrosionAura: { cat: 'debuff', pre: 'The Hero radiates ', kw: 'Corrosion', post: ' to nearby enemies.', tier: 4, exact: 'Hero Corrosion aura' },
};

// Statuses → the category their affliction reads as (shred = the crit lane; slows/holds = CC).
const STATUS_CAT: Partial<Record<StatusType, EffectCategory>> = {
  Fracture: 'critical', Corrosion: 'debuff', Infection: 'debuff', Disruption: 'debuff',
  Freeze: 'control', Fear: 'control',
};

// Run-start grant verbs (equipment mostly; Pierce Protocol is the one card user).
const MUTATOR_VOCAB: Record<string, { pre: string; kw: string; post: string; cat: EffectCategory; tier: number; exact: string }> = {
  pierce2: { pre: "Every tower's shots ", kw: 'pierce', post: ' additional enemies.', cat: 'damage', tier: 4, exact: 'shots pierce +2 enemies' },
};

// Hook events → subject phrasing (plural drives verb agreement).
const EVENT_VOCAB: Record<string, { label: string; plural: boolean; short: string }> = {
  enemyKilled: { label: 'Slain enemies', plural: true, short: 'kill' },
  waveStarted: { label: 'Every wave start', plural: false, short: 'wave start' },
  abilityCast: { label: 'Every Hero ability cast', plural: false, short: 'ability cast' },
  waveCleared: { label: 'Every cleared wave', plural: false, short: 'wave clear' },
};

// Instant resource ops.
const INSTANT_VOCAB = {
  biomass: { cat: 'biomass' as EffectCategory, kw: 'Biomass', unit: 1 / 900, exactNoun: 'Biomass now' },
  integrity: { cat: 'defense' as EffectCategory, kw: 'Nucleus Integrity', unit: 1 / 250, exactNoun: 'max & current Integrity' },
  heroHp: { cat: 'healing' as EffectCategory, kw: 'Hero HP', unit: 1 / 450, exactNoun: 'max & current Hero HP' },
};

// ── Number → word helpers (primary text is digit-free by contract). ──
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n); // beyond twelve leaks digits — the no-digit test guards content
}
function timesWord(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${countWord(n)} times`;
}
function article(adjective: string): string {
  return /^[aeiou]/i.test(adjective) ? 'an' : 'a';
}
const pct = (x: number): number => Math.round(x * 100);
const trim = (x: number): string => String(+x.toFixed(2));

const DEF_UP: Shape = { pre: '{A} increases ', post: '.' };
const DEF_DOWN: Shape = { pre: '{A} reduces ', post: '.' };

function scalarLine(v: Extract<FieldVocab, { kw: string; mode: 'mult' | 'frac' | 'flat' }>, dirUp: boolean, magnitude: number, exact: string): EffectLine {
  const tier = impactTier(magnitude);
  const good = dirUp === (v.moreIsBetter !== false);
  const shape = dirUp ? (v.up ?? DEF_UP) : (v.down ?? DEF_DOWN);
  const adverb = IMPACT_SCALE[tier].adverb;
  const pre = good ? shape.pre.replace('{A}', adverb) : `But ${shape.pre.replace('{A}', adverb.toLowerCase())}`;
  return { pre, keyword: v.kw, post: shape.post, cat: v.cat, tier, good, exact };
}

/** Describe ONE folded effect — null for no-ops (×1 / +0) and unknown shapes. */
function describeEffect(e: CardEffect): EffectLine | null {
  switch (e.op) {
    case 'mul': case 'add': {
      const v = FIELD_VOCAB[e.field];
      if (!v || v.mode === 'count' || v.mode === 'times') {
        if (v && v.mode === 'count') {
          const n = Math.round(e.value);
          if (n === 0) return null;
          const tier = impactTier(Math.abs(n) * v.unit);
          return {
            pre: v.pre.replace('{N}', n === 1 ? 'one' : countWord(n)),
            keyword: n === 1 ? v.kwOne : v.kwMany,
            post: v.tail.replace('{s}', n === 1 ? '' : 's'),
            cat: v.cat, tier, good: n > 0, exact: `+${n} ${v.exactNoun}`,
          };
        }
        if (v && v.mode === 'times') {
          const n = Math.round(e.value);
          if (n === 0) return null;
          return {
            pre: 'Causes ', keyword: v.kw, post: ` to re-fire ${timesWord(n)} more.`,
            cat: v.cat, tier: impactTier(Math.abs(n) * v.unit), good: n > 0, exact: `+${n} ${v.exactNoun}`,
          };
        }
        return null;
      }
      const noun = v.exactNoun ?? v.kw;
      if (e.op === 'mul') {
        if (e.value === 1) return null;
        const dirUp = e.value > 1;
        const exact = e.value >= 1.5 ? `×${trim(e.value)} ${noun}` : dirUp ? `+${pct(e.value - 1)}% ${noun}` : `−${pct(1 - e.value)}% ${noun}`;
        return scalarLine(v, dirUp, Math.abs(e.value - 1), exact);
      }
      if (e.value === 0) return null;
      const dirUp = e.value > 0;
      const mag = Math.abs(e.value) * (v.mode === 'flat' ? (v.unit ?? 1) : 1);
      const exact = v.mode === 'flat'
        ? `${dirUp ? '+' : '−'}${trim(Math.abs(e.value))} ${noun}`
        : `${dirUp ? '+' : '−'}${pct(Math.abs(e.value))}% ${noun}`;
      return scalarLine(v, dirUp, mag, exact);
    }
    case 'flag': {
      const f = FLAG_VOCAB[e.field];
      if (!f) return null;
      return { pre: f.pre, keyword: f.kw, post: f.post, cat: f.cat, tier: f.tier, good: true, exact: f.exact };
    }
    case 'set':
      return { pre: 'Re-anchors the ', keyword: 'Hero', post: "'s battlefield stance.", cat: 'hero', tier: 2, good: true, exact: `${e.field} = ${e.value}` };
    case 'biomass': case 'integrity': case 'heroHp': {
      if (e.value === 0) return null;
      const v = INSTANT_VOCAB[e.op];
      const tier = impactTier(Math.abs(e.value) * v.unit);
      const adj = IMPACT_SCALE[tier].adjective;
      return {
        pre: `Instantly grants ${article(adj)} ${adj} infusion of `, keyword: v.kw, post: '.',
        cat: v.cat, tier, good: e.value > 0, exact: `+${trim(e.value)} ${v.exactNoun}`,
      };
    }
    case 'grant': {
      const g = e.grant;
      if (g.kind === 'towerProjectileMutator') {
        const m = MUTATOR_VOCAB[g.id];
        if (m) return { pre: m.pre, keyword: m.kw, post: m.post, cat: m.cat, tier: m.tier, good: true, exact: m.exact };
        return { pre: "Mutates every tower's ", keyword: 'projectiles', post: '.', cat: 'tower', tier: 3, good: true, exact: `projectile mutator '${g.id}'` };
      }
      if (g.kind === 'heroAttackStatus') {
        return { pre: 'Hero strikes inflict ', keyword: g.status, post: '.', cat: STATUS_CAT[g.status] ?? 'debuff', tier: 3, good: true, exact: `hero hits apply ${g.status} (${g.amount})` };
      }
      return { pre: 'Re-authors the ', keyword: 'Hero', post: "'s attack pattern.", cat: 'hero', tier: 3, good: true, exact: 'hero attack ability' };
    }
    case 'hook': {
      const ev = EVENT_VOCAB[e.hook.on] ?? { label: 'A battlefield event', plural: false, short: e.hook.on };
      const s = ev.plural ? '' : 's';
      const a = e.hook.action;
      if (a.do === 'spreadStatus') {
        return { pre: `${ev.label} spread${s} `, keyword: a.status, post: ' to nearby foes.', cat: STATUS_CAT[a.status] ?? 'debuff', tier: 3, good: true, exact: `spreads ${a.amount} ${a.status} (radius ${a.radius}) on ${ev.short}` };
      }
      if (a.do === 'biomass') {
        return { pre: `${ev.label} shed${s} extra `, keyword: 'Biomass', post: '.', cat: 'biomass', tier: 3, good: true, exact: `+${a.value} Biomass on ${ev.short}` };
      }
      if (a.do === 'heal') {
        return { pre: `${ev.label} restore${s} `, keyword: 'Nucleus Integrity', post: '.', cat: 'healing', tier: 3, good: true, exact: `+${a.value} Integrity on ${ev.short}` };
      }
      return { pre: `${ev.label} grant${s} the Hero a `, keyword: 'shield', post: '.', cat: 'defense', tier: 3, good: true, exact: `${a.value} HP shield (${a.seconds}s) on ${ev.short}` };
    }
  }
}

/** Fold duplicate effects before describing: same-field `mul`s compound, same-field `add`s and
 *  instants sum, flags dedupe (exactly applyCard's semantics) — so a LEVELED card (base +
 *  upgrade lines on the same field) reads as one true total, not repeated fragments. First
 *  occurrence keeps its author position (design intent stays first); set/grant/hook pass through. */
export function foldEffects(effects: readonly CardEffect[]): CardEffect[] {
  const out: CardEffect[] = [];
  const at = new Map<string, number>(); // merge key → index in out
  for (const e of effects) {
    if (e.op === 'mul' || e.op === 'add') {
      const key = `${e.op}.${e.field}`;
      const i = at.get(key);
      if (i === undefined) { at.set(key, out.length); out.push({ ...e }); }
      else if (e.op === 'mul') (out[i] as { value: number }).value *= e.value;
      else (out[i] as { value: number }).value += e.value;
    } else if (e.op === 'flag') {
      const key = `flag.${e.field}`;
      if (!at.has(key)) { at.set(key, out.length); out.push(e); }
    } else if (e.op === 'biomass' || e.op === 'integrity' || e.op === 'heroHp') {
      const i = at.get(e.op);
      if (i === undefined) { at.set(e.op, out.length); out.push({ ...e }); }
      else (out[i] as { value: number }).value += e.value;
    } else {
      out.push(e); // set/grant/hook — order-preserved, unmerged
    }
  }
  return out;
}

/** The standardized player text for a set of effects: folded, described, buffs in author
 *  order, drawbacks last. This is THE generator every effect surface should call. */
export function describeEffects(effects: readonly CardEffect[]): EffectLine[] {
  const lines: EffectLine[] = [];
  for (const e of foldEffects(effects)) {
    const l = describeEffect(e);
    if (l) lines.push(l);
  }
  return [...lines.filter((l) => l.good), ...lines.filter((l) => !l.good)];
}

/** A card's full generated language. `effects` defaults to the def's base effects — pass the
 *  LEVELED effects (effectiveGeneEffects) so the text matches what a pick will actually apply.
 *  `simple` on the def overrides the generated primary lines (hand-written, digit-free);
 *  the exact strings still derive from the real numbers either way. */
export interface CardLanguage {
  lines: EffectLine[]; // primary display lines
  exact: string[]; // precise numeric restatements (detail expansion)
  powerMult: number; // Power Score contribution of these effects (×1 = unscored)
}
export function describeCard(def: CardDef, effects: readonly CardEffect[] = def.effects): CardLanguage {
  const derived = describeEffects(effects);
  const exact = derived.map((l) => l.exact);
  const powerMult = effectsPower(effects);
  if (def.simple) {
    const top = derived.reduce((m, l) => Math.max(m, l.tier), 0);
    return { lines: [{ pre: def.simple, keyword: '', post: '', cat: derived[0]?.cat ?? 'tower', tier: top, good: true, exact: exact.join(' · ') }], exact, powerMult };
  }
  return { lines: derived, exact, powerMult };
}
