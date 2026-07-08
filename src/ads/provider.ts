// Rewarded-ad provider abstraction (docs/RESEARCH.md §providers). The game never
// talks to an ad network directly — it asks THE provider to run one "field study"
// and waits for a completion verdict. Swapping networks is one adapter + one env
// value + a CSP allowlist entry; the game code never changes.
//
//   VITE_ADS_PROVIDER = 'none'      → the lane is HIDDEN entirely (launch default)
//                     | 'simulated' → a themed in-page observation timer (dev/preview
//                                     builds — lets the whole reward loop be tested
//                                     with zero network and zero real ads)
//                     | future ids  → real adapters registered below
//
// Rules enforced at this layer: studies run ONLY when the player asks (never
// auto-play), never in combat (the UI only mounts in menus), and a study that
// fails/aborts grants nothing.

import { GoogleAdPlacementProvider } from './googleAdapter';

export type StudyResult = 'completed' | 'aborted' | 'unavailable';

export interface RewardedAdProvider {
  readonly id: string;
  /** Whether a study can start right now (inventory/network). */
  ready(): boolean;
  /** Run ONE user-initiated study; resolve its verdict. Must never reject. */
  show(): Promise<StudyResult>;
}

/** The dev/preview provider: a themed observation overlay with a real dwell time,
 *  so the claim flow, caps, reveal and analytics are all exercised end-to-end. */
class SimulatedProvider implements RewardedAdProvider {
  readonly id = 'simulated';
  ready(): boolean {
    return true;
  }
  show(): Promise<StudyResult> {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'study-overlay';
      host.innerHTML = `
        <div class="study-box" role="dialog" aria-label="Field study in progress">
          <div class="study-h">FIELD STUDY IN PROGRESS</div>
          <div class="study-sub">The hive observes a corporate specimen…</div>
          <div class="study-bar"><i></i></div>
          <button class="study-abort" type="button">Abort study</button>
        </div>`;
      document.body.appendChild(host);
      const done = (r: StudyResult): void => {
        window.clearTimeout(timer);
        host.remove();
        resolve(r);
      };
      const timer = window.setTimeout(() => done('completed'), 3_000);
      host.querySelector('.study-abort')?.addEventListener('click', () => done('aborted'));
    });
  }
}

class NoProvider implements RewardedAdProvider {
  readonly id = 'none';
  ready(): boolean {
    return false;
  }
  show(): Promise<StudyResult> {
    return Promise.resolve('unavailable');
  }
}

function resolveProvider(): RewardedAdProvider {
  const id = import.meta.env.VITE_ADS_PROVIDER ?? 'none';
  if (id === 'simulated') return new SimulatedProvider();
  if (id === 'google') {
    // Google H5 Games Ads (Ad Placement API). Enable end-to-end with
    // `npm run set-ads -- google --client ca-pub-…` (CSP + ads.txt) and the
    // VITE_ADS_GOOGLE_CLIENT env var. docs/RESEARCH.md §providers.
    return new GoogleAdPlacementProvider(import.meta.env.VITE_ADS_GOOGLE_CLIENT ?? '');
  }
  // Further adapters: one class + one branch here + set-ads CSP hosts.
  return new NoProvider();
}

export const adProvider: RewardedAdProvider = resolveProvider();

/** The lane is visible at all only when a provider exists — 'none' hides every surface. */
export function researchLaneEnabled(): boolean {
  return adProvider.id !== 'none';
}
