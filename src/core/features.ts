// Feature flags — the single switchboard for modes/systems that are DESIGNED but not yet BUILT.
// Rationale (docs/EA-DESIGN-AUDIT §3, P1 #15): a disabled "Soon" tile on the main menu is a dead
// entrance that "advertises absence." Rather than render dead ends, we hide an unbuilt mode behind
// a flag here; flip it to `true` in the same commit that ships the mode. One obvious place to look,
// so nothing renders as a promise the build can't keep.

export interface Features {
  /** Player-authored challenge runs (custom rules/modifiers). Not built. */
  customChallenge: boolean;
  /** A no-stakes practice sandbox. The Combat Tutorial covers onboarding today (Settings → Replay). */
  trainingMode: boolean;
}

export const FEATURES: Features = {
  customChallenge: false,
  trainingMode: false,
};
