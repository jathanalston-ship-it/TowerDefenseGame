// Lightweight per-browser UI preferences — small opt-in UX switches persisted to
// localStorage, read directly by the components that honor them. Distinct from save
// data (saveStore.ts) and the audio toggle (App boot). Each pref degrades to its
// default when storage is unavailable (private mode), so the feature simply stays off.

const AUTO_GENE_KEY = 'assimilate.autogene';

/** Auto Gene Selection — auto-draft the recommended ("PICK") card after a countdown. */
export function autoGenePref(): boolean {
  try {
    return localStorage.getItem(AUTO_GENE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAutoGenePref(on: boolean): void {
  try {
    localStorage.setItem(AUTO_GENE_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

// Per-mode difficulty — Campaign, Infinite and Boss Rush each remember their OWN choice,
// independently (selection lives inside each mode, not the Main Menu). Default 'standard'
// (identity/golden-safe).
const DIFF_KEY = { campaign: 'assimilate.diff.campaign', infinite: 'assimilate.diff.infinite', bossrush: 'assimilate.diff.bossrush' } as const;
export type DiffMode = keyof typeof DIFF_KEY;

export function difficultyPref(mode: DiffMode): string {
  try {
    return localStorage.getItem(DIFF_KEY[mode]) ?? 'standard';
  } catch {
    return 'standard';
  }
}

export function setDifficultyPref(mode: DiffMode, id: string): void {
  try {
    localStorage.setItem(DIFF_KEY[mode], id);
  } catch {
    /* storage unavailable */
  }
}

// ── Audio prefs — SFX and Music are INDEPENDENT toggles (Settings + the pause menu).
// 'audioOn' is the legacy key (SFX); 'musicOn' joined when the music engine landed.
export function sfxPref(): boolean {
  try { return localStorage.getItem('audioOn') !== 'false'; } catch { return true; }
}
export function setSfxPref(on: boolean): void {
  try { localStorage.setItem('audioOn', String(on)); } catch { /* storage unavailable */ }
}
export function musicPref(): boolean {
  try { return localStorage.getItem('musicOn') !== 'false'; } catch { return true; }
}
export function setMusicPref(on: boolean): void {
  try { localStorage.setItem('musicOn', String(on)); } catch { /* storage unavailable */ }
}

// ── Tower Lab bench prefs (docs/TOWERS.md) — favorites, recent upgrades, selection, sort.
// Device-local curation (NOT progression): favorites/sort are how THIS player arranges the
// bench, so they live beside the other UI prefs, never in the save.
const LAB_KEY = 'assimilate.lab';

export interface LabPrefs {
  favorites: string[]; // favorited tower kinds
  recents: Record<string, number>; // kind → last star-upgrade epoch ms (drives "Recently upgraded")
  selected: string | null; // last inspected tower
  sort: string; // roster sort mode id
}

export function labPrefs(): LabPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(LAB_KEY) ?? '{}') as Partial<LabPrefs>;
    return {
      favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
      recents: raw.recents && typeof raw.recents === 'object' ? raw.recents : {},
      selected: typeof raw.selected === 'string' ? raw.selected : null,
      sort: typeof raw.sort === 'string' ? raw.sort : 'default',
    };
  } catch {
    return { favorites: [], recents: {}, selected: null, sort: 'default' };
  }
}

export function setLabPrefs(patch: Partial<LabPrefs>): LabPrefs {
  const next = { ...labPrefs(), ...patch };
  try {
    localStorage.setItem(LAB_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

// ── Genetic Vault ledger — session-spanning opening history + counters (device-local;
// presentation only, never progression). Capped list so it can't grow unbounded.
const VAULT_KEY = 'assimilate.vault';
export interface VaultLedger {
  opened: number;
  byRarity: Record<string, number>;
  recent: { at: number; label: string; rarity: string; items: number }[]; // newest first, ≤ 10
}
export function vaultLedger(): VaultLedger {
  try {
    const raw = JSON.parse(localStorage.getItem(VAULT_KEY) ?? '{}') as Partial<VaultLedger>;
    return {
      opened: typeof raw.opened === 'number' ? raw.opened : 0,
      byRarity: raw.byRarity && typeof raw.byRarity === 'object' ? raw.byRarity : {},
      recent: Array.isArray(raw.recent) ? raw.recent.slice(0, 10) : [],
    };
  } catch {
    return { opened: 0, byRarity: {}, recent: [] };
  }
}
export function recordVaultOpen(label: string, rarity: string, items: number): VaultLedger {
  const led = vaultLedger();
  const next: VaultLedger = {
    opened: led.opened + 1,
    byRarity: { ...led.byRarity, [rarity]: (led.byRarity[rarity] ?? 0) + 1 },
    recent: [{ at: Date.now(), label, rarity, items }, ...led.recent].slice(0, 10),
  };
  try { localStorage.setItem(VAULT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

// ── Device-pref key registry ─────────────────────────────────────────────────
// The Auto-Start toggle key (read/written by GameView + BuildControls — shared const, not copies).
export const AUTOSTART_KEY = 'assimilate.autostart';

/** EVERY device-local preference/flag key, in one place — the list `meta.devReset('everything')`
 *  wipes for a true factory reset. When a module adds a new localStorage pref, it MUST add its key
 *  here (the owners keep their own consts; this registry only guarantees the wipe is complete). */
export const DEVICE_PREF_KEYS: readonly string[] = [
  'audioOn', // SFX toggle (App boot + Settings + pause menu)
  'musicOn', // Music toggle (independent of SFX)
  AUTO_GENE_KEY,
  DIFF_KEY.campaign,
  DIFF_KEY.infinite,
  AUTOSTART_KEY,
  'assimilate.debug', // debug flag (src/debug/debug.ts)
  'assimilate.notif.seen', // notification watermarks (state/notifications.ts)
  LAB_KEY, // Tower Lab bench prefs (favorites/recents/selection/sort)
  VAULT_KEY, // Genetic Vault opening ledger (history/statistics)
];
