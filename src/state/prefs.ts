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
