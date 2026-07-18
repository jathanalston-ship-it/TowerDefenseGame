// ICON LANGUAGE (docs/ICON-LANGUAGE.md) — the universal symbol library. ONE module answers
// "what does this concept look like?" for every axis of the game's visual language:
//
//   • ACTIONS   — the verb/state table below (claim, open, upgrade, equip, play, locked, …):
//                 the NEW axis this module introduces. Codifies glyphs the UI already spoke
//                 informally (⚡ best-value, ◈ ready chain, 🔒 teasers, ⛨ equipment) so every
//                 button/badge conjugates the same verb the same way.
//   • EFFECTS   — core/effectLanguage.EFFECT_CATEGORIES (damage ▲, healing ✚, control ◇, …).
//   • CURRENCIES— core/currencies.CURRENCIES (unique SVG silhouette + color + glow each;
//                 render via components/CurrencyIcon).
//   • REWARDS   — state/rewardToast.REWARD_TYPES art (every grantable thing has a face).
//   • STATUSES  — core/status.statusRegistry (sim color/fx) + the single-glyph map here
//                 (the two-letter sim codes are engine ids, not player symbols).
//   • SCREENS   — ui/navModel mono glyphs + state/unlocks FEATURES glyphs.
//   • RARITY    — the --r-* CSS tokens (common → mythic) + per-system rarity color maps.
//
// THE INHERITANCE CONTRACT (enforced by src/dev/iconLanguage.test.ts): every currency, every
// reward type, every status effect, and every nav screen MUST resolve to an identity here —
// a new system without a face fails CI. Glyphs are unique within an axis; cross-axis reuse is
// allowed ONLY when the concepts are the same family (⛨ equipment↔equip, ✚ healing↔regen).
//
// ACCESSIBILITY: the glyph is never the only channel — every icon pairs with a text label or
// aria-label, and color is always redundant with shape (docs/ICON-LANGUAGE.md §a11y).

import { EFFECT_CATEGORIES } from '../core/effectLanguage';
import type { EffectCategory } from '../core/effectLanguage';
import { CURRENCIES } from '../core/currencies';
import type { CurrencyId } from '../core/currencies';
import { statusRegistry } from '../core/status';

// ── The ACTION axis — every verb/state a button or badge can speak. ──────────────────────
export type ActionId =
  | 'claim' | 'collect' | 'open' | 'upgrade' | 'equip' | 'merge' | 'replace' | 'spend'
  | 'play' | 'accept' | 'cancel' | 'recommended' | 'locked' | 'new' | 'completed'
  | 'unavailable' | 'ready' | 'browse' | 'unlock';

export interface ActionDef {
  glyph: string;
  color: string; // CSS token — the verb's signature color
  label: string; // the default verb text (buttons may override; the pair travels together)
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  claim: { glyph: '✹', color: 'var(--gold)', label: 'Claim' },
  collect: { glyph: '⤓', color: 'var(--gold)', label: 'Collect' },
  open: { glyph: '◉', color: 'var(--cache, var(--gold))', label: 'Open' },
  upgrade: { glyph: '⇧', color: 'var(--viral)', label: 'Upgrade' },
  equip: { glyph: '⛨', color: 'var(--vital)', label: 'Equip' }, // family: equipment ⛨
  merge: { glyph: '⧓', color: 'var(--caustic)', label: 'Merge' },
  replace: { glyph: '⇄', color: 'var(--caustic)', label: 'Replace' },
  spend: { glyph: '◆', color: 'var(--gold)', label: 'Spend' }, // family: the Ichor diamond
  play: { glyph: '▶', color: 'var(--vital)', label: 'Deploy' },
  accept: { glyph: '✔', color: 'var(--vital)', label: 'Accept' },
  cancel: { glyph: '✕', color: 'var(--muted)', label: 'Cancel' },
  recommended: { glyph: '⚡', color: 'var(--gold)', label: 'Best Value' }, // bbs precedent
  locked: { glyph: '🔒', color: 'var(--muted)', label: 'Locked' }, // teaser precedent
  new: { glyph: '✧', color: 'var(--caustic)', label: 'New' },
  completed: { glyph: '✓', color: 'var(--vital)', label: 'Done' }, // family: accept ✔
  unavailable: { glyph: '⊘', color: 'var(--muted)', label: 'Unavailable' },
  ready: { glyph: '◈', color: 'var(--caustic)', label: 'Ready' }, // ready-chain precedent
  browse: { glyph: '⌕', color: 'var(--muted)', label: 'Browse' },
  unlock: { glyph: '🔓', color: 'var(--gold)', label: 'Unlock' },
};

// ── The STAT axis — chips beside numbers (labs, inspectors, equipment). Effect categories
//    cover the combat verbs; these fill the display-only gaps. ────────────────────────────
export interface StatDef { glyph: string; color: string; label: string }
export const STATS: Record<string, StatDef> = {
  dps: { glyph: EFFECT_CATEGORIES.damage.glyph, color: EFFECT_CATEGORIES.damage.color, label: 'DPS' },
  damage: { glyph: EFFECT_CATEGORIES.damage.glyph, color: EFFECT_CATEGORIES.damage.color, label: 'Damage' },
  range: { glyph: '◎', color: '#8fc1f2', label: 'Range' },
  cadence: { glyph: EFFECT_CATEGORIES.attackSpeed.glyph, color: EFFECT_CATEGORIES.attackSpeed.color, label: 'Cadence' },
  crit: { glyph: EFFECT_CATEGORIES.critical.glyph, color: EFFECT_CATEGORIES.critical.color, label: 'Critical' },
  power: { glyph: '⟁', color: 'var(--viral)', label: 'Power' },
  hp: { glyph: '♥', color: '#ff6b8b', label: 'Health' },
  armor: { glyph: EFFECT_CATEGORIES.defense.glyph, color: EFFECT_CATEGORIES.defense.color, label: 'Armor' },
  healing: { glyph: EFFECT_CATEGORIES.healing.glyph, color: EFFECT_CATEGORIES.healing.color, label: 'Healing' },
};

// ── The STATUS axis — one PLAYER glyph per status effect (the def's two-letter `icon` is a
//    sim id). Colors come from the def itself (statusRegistry.get(id).color). ─────────────
export const STATUS_GLYPHS: Record<string, string> = {
  fracture: '✶', corrosion: '≋', infection: '❉', disruption: '⌁',
  poison: '☣', burn: '♨', slow: '⇣', armorBreak: '⛉', stun: '✺',
  charge: 'ϟ', freeze: '❆', fear: '☍', silence: '⌀', regen: '✚', shield: '⛊',
  haste: '⇡', // pairs with slow ⇣ — the speed axis reads as direction
};

/** A status effect's full visual identity: player glyph + the sim def's color/name. */
export function statusIcon(id: string): { glyph: string; color: string; label: string } | null {
  const d = statusRegistry.get(id);
  if (!d) return null;
  return { glyph: STATUS_GLYPHS[id] ?? '◌', color: d.color, label: d.name };
}

/** An effect category's identity (pass-through — EFFECT_CATEGORIES is the source of truth). */
export function effectIcon(cat: EffectCategory): { glyph: string; color: string; label: string } {
  const d = EFFECT_CATEGORIES[cat];
  return { glyph: d.glyph, color: d.color, label: d.label };
}

/** A currency's color+glow identity (silhouettes render via <CurrencyIcon>). */
export function currencyColor(id: CurrencyId): string {
  return CURRENCIES[id].color;
}

// ── The primitive — an inline action/stat/status glyph. aria-hidden by default: the icon
//    CONFIRMS the adjacent text, it never replaces it (a11y contract). Pass `title` when the
//    glyph stands alone (icon-only chips) so it still reads. ──────────────────────────────
export function Ico({ a, stat, status, className, title }: {
  a?: ActionId; stat?: string; status?: string; className?: string; title?: string;
}): JSX.Element | null {
  const d = a ? ACTIONS[a] : stat ? STATS[stat] : status ? statusIcon(status) : null;
  if (!d) return null;
  return (
    <i
      className={`ico${className ? ` ${className}` : ''}`}
      style={{ color: d.color }}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      title={title}
    >
      {d.glyph}
    </i>
  );
}
