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

// THREAT LADDER (docs/THREAT.md): the level the player last picked per ladder mode (a device pref,
// like difficulty). Callers CLAMP it to what the save has earned — a stale value can't over-reach.
export function threatPref(mode: 'campaign' | 'endless' | 'bossRush'): number {
  try {
    return Math.max(0, Math.floor(Number(localStorage.getItem(`assimilate.threat.${mode}`)) || 0));
  } catch {
    return 0;
  }
}

export function setThreatPref(mode: 'campaign' | 'endless' | 'bossRush', level: number): void {
  try {
    localStorage.setItem(`assimilate.threat.${mode}`, String(Math.max(0, Math.floor(level))));
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

// ── Arena matchmaking pref (docs/ARENA.md §toggle) — human matchmaking is ON by default
// wherever a relay is configured; opting OUT is honored (the queue goes straight to the AI)
// but the sparring construct runs a HARDENED build (ARENA.aiOptOutPowerPremium) so ducking
// humans never becomes the easy-rating farm. Device-local, like every UX pref.
export function humanMatchmakingPref(): boolean {
  try { return localStorage.getItem('assimilate.humanMM') !== 'false'; } catch { return true; }
}
export function setHumanMatchmakingPref(on: boolean): void {
  try { localStorage.setItem('assimilate.humanMM', String(on)); } catch { /* storage unavailable */ }
}

// ── Tower Lab bench prefs (docs/TOWERS.md) — favorites, recent upgrades, selection, sort.
// Device-local curation (NOT progression): favorites/sort are how THIS player arranges the
// bench, so they live beside the other UI prefs, never in the save.
const LAB_KEY = 'assimilate.lab';

export interface LabPrefs {
  favorites: string[]; // favorited tower kinds
  recents: Record<string, number>; // kind → last star-upgrade epoch ms (drives the 'recent' SORT)
  /** kind → last time the player INSPECTED it — the NEW chip shows only while an upgrade is
   *  newer than the last look, so selecting the tower dismisses it (it used to sit for a
   *  fixed 24h with no way to clear it — the "undismissable NEW badge" bug). */
  recentsSeen: Record<string, number>;
  selected: string | null; // last inspected tower
  sort: string; // roster sort mode id
  grouped: boolean; // rail folds by combat class (the 100-tower answer — docs/UI-STANDARDS.md §lists)
  collapsed: string[]; // collapsed class-fold keys
}

export function labPrefs(): LabPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(LAB_KEY) ?? '{}') as Partial<LabPrefs>;
    return {
      favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
      recents: raw.recents && typeof raw.recents === 'object' ? raw.recents : {},
      recentsSeen: raw.recentsSeen && typeof raw.recentsSeen === 'object' ? raw.recentsSeen : {},
      selected: typeof raw.selected === 'string' ? raw.selected : null,
      sort: typeof raw.sort === 'string' ? raw.sort : 'default',
      grouped: raw.grouped === true,
      collapsed: Array.isArray(raw.collapsed) ? raw.collapsed.filter((c) => typeof c === 'string') : [],
    };
  } catch {
    return { favorites: [], recents: {}, recentsSeen: {}, selected: null, sort: 'default', grouped: false, collapsed: [] };
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

// ── List-organization prefs (state/listOrg.ts) — per-SURFACE sort/filter/group choices.
// Device-local curation exactly like the Lab bench prefs: how THIS player arranges each
// long list, never progression. The query is deliberately NOT persisted (a stale search
// silently hiding everything on return is a trap).
const LISTORG_KEY = 'assimilate.listorg';

export interface ListOrgPrefs {
  sort?: string;
  filters?: string[];
  group?: string | null;
  collapsed?: string[];
}

export function listOrgPrefs(surface: string): ListOrgPrefs {
  try {
    const all = JSON.parse(localStorage.getItem(LISTORG_KEY) ?? '{}') as Record<string, ListOrgPrefs>;
    const raw = all[surface];
    if (!raw || typeof raw !== 'object') return {};
    return {
      sort: typeof raw.sort === 'string' ? raw.sort : undefined,
      filters: Array.isArray(raw.filters) ? raw.filters.filter((f) => typeof f === 'string') : undefined,
      group: typeof raw.group === 'string' ? raw.group : raw.group === null ? null : undefined,
      collapsed: Array.isArray(raw.collapsed) ? raw.collapsed.filter((f) => typeof f === 'string') : undefined,
    };
  } catch {
    return {};
  }
}

export function setListOrgPrefs(surface: string, patch: Partial<ListOrgPrefs>): ListOrgPrefs {
  const next = { ...listOrgPrefs(surface), ...patch };
  try {
    const all = JSON.parse(localStorage.getItem(LISTORG_KEY) ?? '{}') as Record<string, ListOrgPrefs>;
    all[surface] = next;
    localStorage.setItem(LISTORG_KEY, JSON.stringify(all));
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

// ── Readiness calm-down (docs/PROGRESSION-LOOP.md §readiness) — the campaign stage this device
// just cleared FLAWLESSLY (zero Nucleus damage), so the very next deploy reads calm even a hair
// under the recommendation. Every campaign settle overwrites it (null = the last run wasn't one),
// so the calm lasts exactly one attempt. Device-local presentation memory — never progression.
const FLAWLESS_KEY = 'assimilate.lastFlawlessClear';

export function lastFlawlessClearPref(): { diff: string; stage: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(FLAWLESS_KEY) ?? 'null') as { diff?: unknown; stage?: unknown } | null;
    return v && typeof v.diff === 'string' && typeof v.stage === 'number' ? { diff: v.diff, stage: v.stage } : null;
  } catch {
    return null;
  }
}

export function setLastFlawlessClearPref(v: { diff: string; stage: number } | null): void {
  try {
    if (v) localStorage.setItem(FLAWLESS_KEY, JSON.stringify(v));
    else localStorage.removeItem(FLAWLESS_KEY);
  } catch {
    /* storage unavailable */
  }
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
  FLAWLESS_KEY, // readiness calm-down after a flawless campaign clear
];
