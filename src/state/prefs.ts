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

// Per-mode difficulty — Campaign and Infinite each remember their OWN choice, independently
// (selection lives inside each mode, not the Main Menu). Default 'standard' (identity/golden-safe).
const DIFF_KEY = { campaign: 'assimilate.diff.campaign', infinite: 'assimilate.diff.infinite' } as const;
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
