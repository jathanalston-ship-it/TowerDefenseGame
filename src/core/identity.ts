// COMMANDER IDENTITY (docs/PROFILE.md §commissioning) — the data behind account creation:
// SIGILS (the glyph mark worn beside the commander's name), FOUNDING TITLES (the one-time
// choice made at commissioning), and the designation name generator. Pure data + pure
// functions — chosen at the post-tutorial COMMISSIONING ceremony (ui/tutorial/Commissioning),
// changeable later from the Profile (sigil) / never (founding title — a permanent identity
// choice, like the doctrine you swore by). Adding a sigil or title = one row.

import { Registry } from './registry';

export interface SigilDef {
  id: string;
  /** Single glyph — rendered beside the name everywhere identity shows (banner, ceremony). */
  glyph: string;
  name: string;
  blurb: string;
  /** CSS color the glyph wears (the identity accent). */
  accent: string;
}

/** The commissioning sigil set — all open at creation (identity is never progression-gated;
 *  frames/titles carry the earned prestige instead). */
export const SIGILS: SigilDef[] = [
  { id: 'hive', glyph: '⬡', name: 'The Hive', blurb: 'The Nucleus endures.', accent: 'var(--vital)' },
  { id: 'apex', glyph: '⌖', name: 'Apex Sight', blurb: 'Every hunt ends the same way.', accent: 'var(--danger)' },
  { id: 'helix', glyph: '⌬', name: 'Broken Helix', blurb: 'The genome is a suggestion.', accent: 'var(--viral)' },
  { id: 'swarm', glyph: '⁂', name: 'The Swarm', blurb: 'One is nothing. All is everything.', accent: 'var(--kinetic)' },
  { id: 'veil', glyph: '◈', name: 'Vault Veil', blurb: 'What is kept, keeps.', accent: 'var(--gold)' },
  { id: 'pulse', glyph: '∿', name: 'First Pulse', blurb: 'It was alive before it was born.', accent: 'var(--caustic)' },
  { id: 'warden', glyph: '⛨', name: 'Line Warden', blurb: 'Nothing passes. Nothing ever has.', accent: 'var(--success)' },
  { id: 'maw', glyph: '◉', name: 'The Open Maw', blurb: 'Hunger is a strategy.', accent: 'var(--warn)' },
  { id: 'spore', glyph: '⊛', name: 'Spore Crown', blurb: 'Every ending seeds a beginning.', accent: 'var(--neural, var(--viral))' },
  { id: 'null', glyph: '◌', name: 'Null Strain', blurb: 'Unclassified. Unbothered.', accent: 'var(--muted)' },
  { id: 'shard', glyph: '✦', name: 'Strain Shard', blurb: 'Sharpened by every generation.', accent: 'var(--kinetic)' },
  { id: 'bloom', glyph: '❁', name: 'Terminal Bloom', blurb: 'The prettiest things are the last things.', accent: 'var(--r-epic, var(--viral))' },
];

export const sigilRegistry = new Registry<SigilDef>('sigil', {
  idOf: (s) => s.id,
  validate: (s) => {
    const errs: string[] = [];
    if (!s.glyph) errs.push(`sigil ${s.id} needs a glyph`);
    if (!s.name || s.name.trim().length === 0) errs.push(`sigil ${s.id} needs a name`);
    if (!s.accent) errs.push(`sigil ${s.id} needs an accent color`);
    return errs;
  },
});
sigilRegistry.registerAll(SIGILS);

/** Resolve a sigil id (null/unknown ⇒ null — no sigil is a valid identity). */
export function sigilById(id: string | null | undefined): SigilDef | null {
  if (!id) return null;
  return sigilRegistry.get(id) ?? null;
}

// ── FOUNDING TITLES — the commissioning's one-time choice. Exactly ONE is granted (the other
//    two are the roads not taken — permanent, like a doctrine oath). They share the equipped-
//    title slot with mastery/account/genome titles via state/profile titleName. ──

export interface FoundingTitleDef { id: string; name: string; blurb: string }

export const FOUNDING_TITLES: FoundingTitleDef[] = [
  { id: 'found_survivor', name: 'First Survivor', blurb: 'You were there when the line first held.' },
  { id: 'found_cultivator', name: 'Brood Cultivator', blurb: 'You saw livestock where others saw monsters.' },
  { id: 'found_witness', name: 'Silent Witness', blurb: 'You watched the assimilation begin — and took notes.' },
];

/** Founding-title display name (the titleName chain's founding link) — null when not one. */
export function foundingTitleName(id: string): string | null {
  return FOUNDING_TITLES.find((t) => t.id === id)?.name ?? null;
}

// ── DESIGNATION TAGS — the duplicate-name system (docs/PROFILE.md §designation-tags). Names
//    are NOT unique (any commander may be "Marrowthorn"); the REGISTER NUMBER is: a stable
//    4-digit tag derived from the player's permanent identity (net/identity playerId — the same
//    id the accounts platform formalizes, so it survives guest→account upgrades). Deterministic
//    FNV-1a ⇒ no server coordination, works fully offline, and the SERVER derives the same tag
//    from its own player_id column at read time (functions/api/leaderboard/top.ts imports THIS
//    function — one implementation, compiler-enforced) so a client can never forge one. ──

/** Stable 4-digit register number for a player id — '0001'…'9999' (never '0000'). */
export function designationTag(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return String(((h >>> 0) % 9999) + 1).padStart(4, '0');
}

/** The full display identity: `Name #0421` (no tag ⇒ the bare name — old API responses). */
export function displayCommanderName(name: string, tag?: string | null): string {
  return tag ? `${name} #${tag}` : name;
}

// ── The DESIGNATION generator — a one-tap bio-flavored callsign for the name step. Output is
//    guaranteed to pass sanitizeCommanderName (letters only, 2–20 chars, no forbidden chars). ──

const NAME_HEADS = [
  'Vex', 'Mora', 'Kass', 'Ossia', 'Bryn', 'Ichor', 'Sever', 'Nyx', 'Carno', 'Velle',
  'Strain', 'Ryle', 'Umbra', 'Chit', 'Marrow', 'Sylve', 'Krev', 'Otta', 'Pale', 'Virex',
] as const;
const NAME_TAILS = [
  'mind', 'wretch', 'shade', 'warden', 'thorn', 'vast', 'stitch', 'bloom', 'fang', 'hollow',
  'weft', 'ridge', 'moth', 'crown', 'root', 'gaunt', 'spore', 'tide', 'wake', 'null',
] as const;

/** A suggested commander designation, e.g. "Marrowthorn" / "Vexnull". `rng` defaults to
 *  Math.random (UI); tests pass a constant for determinism. Always sanitizer-clean. */
export function suggestCommanderName(rng: () => number = Math.random): string {
  const head = NAME_HEADS[Math.floor(rng() * NAME_HEADS.length) % NAME_HEADS.length];
  const tail = NAME_TAILS[Math.floor(rng() * NAME_TAILS.length) % NAME_TAILS.length];
  return `${head}${tail}`.slice(0, 20);
}
