// Procedural equipment "artwork" — asset-free (rarity frame + slot/type sigil + glow), matching
// the game's placeholder-art approach. Rarity-agnostic: any rarity string maps to a color, so a
// future mythic/seasonal tier needs no change here. Premium tiers get an animated sheen.

import type { CSSProperties } from 'react';
import type { EquipDef } from '../../core/equipment';

/** Rarity → CSS color. Open map (mythic-ready); unknown rarities fall back to common. */
export const RARITY_VAR: Record<string, string> = {
  common: 'var(--r-common)',
  rare: 'var(--r-rare)',
  epic: 'var(--r-epic)',
  legendary: 'var(--r-legendary)',
  exotic: 'var(--viral)',
  mythic: 'var(--r-mythic)',
};
export function rarityColor(r: string): string {
  return RARITY_VAR[r] ?? 'var(--r-common)';
}

const SLOT_GLYPH: Record<string, string> = { weapon: '⚔', armor: '⬡', relic: '❖' };
const WEAPON_GLYPH: Record<string, string> = { melee: '⚔', ranged: '➹', conduit: '⌁' };

function glyphFor(def: EquipDef): string {
  if (def.slot === 'weapon' && def.weaponType) return WEAPON_GLYPH[def.weaponType] ?? '⚔';
  return SLOT_GLYPH[def.slot] ?? '◆';
}

export function ItemArt({
  def,
  rarity,
  size = 72,
}: {
  def: EquipDef;
  rarity: string;
  size?: number;
}): JSX.Element {
  const premium = rarity === 'legendary' || rarity === 'exotic' || rarity === 'mythic';
  return (
    <div
      className={`item-art${premium ? ' is-premium' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ['--rc' as string]: rarityColor(rarity) } as CSSProperties}
      aria-hidden
    >
      <div className="ia-sheen" />
      <span className="ia-glyph">{glyphFor(def)}</span>
    </div>
  );
}
