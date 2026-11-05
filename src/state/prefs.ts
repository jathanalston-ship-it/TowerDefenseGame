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

// Auto-Claim (docs/NOTIFICATIONS.md §auto-claim) — quest, Season Pass, Milestone and Evolution
// Track rewards claim themselves when a run settles and read back as ONE Results row. DEFAULT ON
// (chores → decisions); players who enjoy claiming by hand turn it off in Settings.
const AUTO_CLAIM_KEY = 'assimilate.autoclaim';

export function autoClaimPref(): boolean {
  try {
    return localStorage.getItem(AUTO_CLAIM_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAutoClaimPref(on: boolean): void {
  try {
    localStorage.setItem(AUTO_CLAIM_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

// Vault reveal "Skip animations" (docs/LOOTBOX.md §opening) — remembered per DEVICE, toggled
// inline in the reveal: on ⇒ flips land instantly and Reveal all goes straight to the harvest.
// Default OFF (the ceremony is the point the first time).
const VAULT_SKIP_KEY = 'assimilate.vault.skipAnims';

export function vaultSkipAnimsPref(): boolean {
  try {
    return localStorage.getItem(VAULT_SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setVaultSkipAnimsPref(on: boolean): void {
  try {
    localStorage.setItem(VAULT_SKIP_KEY, on ? '1' : '0');
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
// Volumes (Settings → Sound effects / Music, docs/AUDIO.md §settings): 0..1 of each engine's DESIGNED
// level — 1 (the default) plays the mix exactly as measured and balanced; App applies them on boot.
const SFX_VOLUME_KEY = 'assimilate.sfxVolume';
const MUSIC_VOLUME_KEY = 'assimilate.musicVolume';
function volumePref(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    const v = raw === null ? 1 : Number(raw);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  } catch { return 1; }
}
function setVolumePref(key: string, v: number): void {
  try { localStorage.setItem(key, String(Math.max(0, Math.min(1, v)))); } catch { /* storage unavailable */ }
}
export const sfxVolumePref = (): number => volumePref(SFX_VOLUME_KEY);
export const setSfxVolumePref = (v: number): void => setVolumePref(SFX_VOLUME_KEY, v);
export const musicVolumePref = (): number => volumePref(MUSIC_VOLUME_KEY);
export const setMusicVolumePref = (v: number): void => setVolumePref(MUSIC_VOLUME_KEY, v);

// ── Motion & feedback prefs (docs/GAME-FEEL.md §4) — Screen shake %, Damage numbers, Flashes,
// plus the explicit override for players whose OS asks for reduced motion but who want it anyway.
// Device-local presentation, never progression. Listeners let a live run follow a change made in
// the pause menu without a remount.
const MOTION_KEY = 'assimilate.motion';

export interface MotionPrefs {
  shake: number; // 0..1 — Screen shake multiplier
  numbers: boolean; // battlefield damage numbers
  flashes: boolean; // full-screen flashes
  allowMotion: boolean; // override an OS reduced-motion request (default: honor it)
}
export const MOTION_DEFAULTS: Readonly<MotionPrefs> = { shake: 1, numbers: true, flashes: true, allowMotion: false };

export function motionPrefs(): MotionPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(MOTION_KEY) ?? '{}') as Partial<MotionPrefs>;
    return {
      shake: typeof raw.shake === 'number' && Number.isFinite(raw.shake) ? Math.min(1, Math.max(0, raw.shake)) : MOTION_DEFAULTS.shake,
      numbers: typeof raw.numbers === 'boolean' ? raw.numbers : MOTION_DEFAULTS.numbers,
      flashes: typeof raw.flashes === 'boolean' ? raw.flashes : MOTION_DEFAULTS.flashes,
      allowMotion: raw.allowMotion === true,
    };
  } catch {
    return { ...MOTION_DEFAULTS };
  }
}

const motionListeners = new Set<(p: MotionPrefs) => void>();

export function setMotionPrefs(patch: Partial<MotionPrefs>): MotionPrefs {
  const next = { ...motionPrefs(), ...patch };
  try { localStorage.setItem(MOTION_KEY, JSON.stringify(next)); } catch { /* storage unavailable — still applies live */ }
  for (const fn of motionListeners) fn(next);
  return next;
}

/** Follow motion-pref changes (returns the unsubscribe). */
export function onMotionPrefs(fn: (p: MotionPrefs) => void): () => void {
  motionListeners.add(fn);
  return () => { motionListeners.delete(fn); };
}

/** The OS-level `prefers-reduced-motion: reduce` request (false where matchMedia is absent). */
export function systemReducedMotion(): boolean {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** The in-run feel the prefs resolve to. `motion` is THE one motionScale: 0 when the OS asks for
 *  reduced motion and the player hasn't overridden it — it zeroes shake, camera pulses, hit-stop
 *  and flashes in one place. Pure (tests pass `osReduced`). */
export function resolveMotion(p: MotionPrefs, osReduced: boolean): { motion: 0 | 1; shake: number; numbers: boolean; flashes: boolean } {
  const motion = osReduced && !p.allowMotion ? 0 : 1;
  return { motion, shake: p.shake * motion, numbers: p.numbers, flashes: p.flashes && motion > 0 };
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

// ── Section collapse state (ui/components/SectionNav.tsx — docs/UI-STANDARDS.md §long-screens):
// which sections of a long screen THIS device opened or folded, per screen. Only explicit
// toggles are stored (`{ [screen]: { [sectionId]: open } }`); an unset id falls back to the
// section's own default, so new sections never inherit a stale choice.
const SECTIONS_KEY = 'assimilate.sections';

export function sectionPrefs(screen: string): Record<string, boolean> {
  try {
    const all = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}') as Record<string, unknown>;
    const raw = all[screen];
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, boolean> = {};
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'boolean') out[id] = v;
    return out;
  } catch {
    return {};
  }
}

export function setSectionPrefs(screen: string, patch: Record<string, boolean>): Record<string, boolean> {
  const next = { ...sectionPrefs(screen), ...patch };
  try {
    const all = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}') as Record<string, unknown>;
    all[screen] = next;
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — the session still toggles */
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
// ── Mobile-browser shell (docs/RESPONSIVE-DESIGN.md §browser) ──
const IMMERSIVE_KEY = 'assimilate.immersive';
const INSTALL_HINT_KEY = 'assimilate.installHint';

/** Full screen in a mobile browser (Android / iPad): the first tap of a session hides the browser's
 *  address bar. DEFAULT ON — a phone browser is the only place the toolbar steals the game's height. */
export function immersivePref(): boolean {
  try { return localStorage.getItem(IMMERSIVE_KEY) !== '0'; } catch { return true; }
}
export function setImmersivePref(on: boolean): void {
  try { localStorage.setItem(IMMERSIVE_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}
/** The iPhone "Add to Home Screen" hint — shown until dismissed (iPhone Safari has no full-screen API). */
export function installHintDismissed(): boolean {
  try { return localStorage.getItem(INSTALL_HINT_KEY) === 'dismissed'; } catch { return true; }
}
export function dismissInstallHint(): void {
  try { localStorage.setItem(INSTALL_HINT_KEY, 'dismissed'); } catch { /* storage unavailable */ }
}

export const DEVICE_PREF_KEYS: readonly string[] = [
  'audioOn', // SFX toggle (App boot + Settings + pause menu)
  'musicOn', // Music toggle (independent of SFX)
  SFX_VOLUME_KEY, // Settings → Effects volume
  MUSIC_VOLUME_KEY, // Settings → Music volume
  AUTO_GENE_KEY,
  DIFF_KEY.campaign,
  DIFF_KEY.infinite,
  AUTOSTART_KEY,
  'assimilate.debug', // debug flag (src/debug/debug.ts)
  'assimilate.notif.seen', // notification watermarks (state/notifications.ts)
  LAB_KEY, // Tower Lab bench prefs (favorites/recents/selection/sort)
  VAULT_KEY, // Genetic Vault opening ledger (history/statistics)
  FLAWLESS_KEY, // readiness calm-down after a flawless campaign clear
  SECTIONS_KEY, // SectionNav open/folded sections per long screen (ui/components/SectionNav.tsx)
  VAULT_SKIP_KEY, // Vault reveal "Skip animations"
  MOTION_KEY, // Settings → Motion (screen shake %, damage numbers, flashes, reduced-motion override)
  IMMERSIVE_KEY, // Settings → Full screen in mobile browsers (ui/mobileBrowser.ts)
  INSTALL_HINT_KEY, // the iPhone "Add to Home Screen" hint was dismissed (ui/components/BrowserShell.tsx)
];
