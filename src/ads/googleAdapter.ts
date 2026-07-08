// Google H5 Games Ads adapter (Ad Placement API) for the Field Research lane.
// docs/RESEARCH.md §providers · enable with `npm run set-ads -- google --client ca-pub-…`
// (which also swaps the CSP and writes ads.txt), then set the two VITE_ vars and deploy.
//
// The Ad Placement API exposes window.adBreak/adConfig once the adsbygoogle loader runs.
// Reward semantics: adBreak({type:'reward'}) → beforeReward(showAdFn) hands US the trigger
// (player-initiated by design), adViewed = reward earned, adDismissed = quit early,
// adBreakDone always fires last (its breakStatus tells us when no ad existed at all).
// Defensive everywhere: any missing global, load failure, or timeout resolves
// 'unavailable'/'aborted' — the game already fail-softs and grants NOTHING.
//
// NOTE (honest constraint): this integration can only be verified end-to-end with an
// approved AdSense account + H5 Games Ads access on a real domain. Until then the
// 'simulated' provider remains the test path; this adapter is the wiring, not the proof.

import type { RewardedAdProvider, StudyResult } from './provider';

interface AdBreakPlacement {
  type: 'reward';
  name: string;
  beforeReward: (showAdFn: () => void) => void;
  adViewed: () => void;
  adDismissed: () => void;
  adBreakDone: (info: { breakStatus?: string }) => void;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (p: AdBreakPlacement) => void;
    adConfig?: (c: { preloadAdBreaks?: 'on'; sound?: 'on' | 'off'; onReady?: () => void }) => void;
  }
}

const LOADER = (client: string): string =>
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;

export class GoogleAdPlacementProvider implements RewardedAdProvider {
  readonly id = 'google';
  private loading: Promise<boolean> | null = null;

  constructor(private client: string) {}

  ready(): boolean {
    // Availability is only truly known at show-time (frequency caps, fill); the
    // button stays active and a no-fill study resolves 'unavailable' quietly.
    return /^ca-pub-\d{10,20}$/.test(this.client);
  }

  private load(): Promise<boolean> {
    if (window.adBreak) return Promise.resolve(true);
    if (!this.loading) {
      this.loading = new Promise<boolean>((resolve) => {
        const el = document.createElement('script');
        el.src = LOADER(this.client);
        el.async = true;
        el.dataset.adFrequencyHint = '120s'; // rewarded-only surface; be conservative
        el.onload = () => {
          window.adsbygoogle = window.adsbygoogle ?? [];
          window.adConfig?.({ preloadAdBreaks: 'on', sound: 'off' });
          resolve(true);
        };
        el.onerror = () => {
          this.loading = null; // a later study may retry (network blip / blocker off)
          resolve(false);
        };
        document.head.appendChild(el);
      });
    }
    return this.loading;
  }

  async show(): Promise<StudyResult> {
    if (!this.ready()) return 'unavailable';
    const loaded = await this.load();
    const adBreak = window.adBreak;
    if (!loaded || !adBreak) return 'unavailable'; // blocked loader / no API ⇒ lane degrades
    return new Promise<StudyResult>((resolve) => {
      let settled = false;
      const settle = (r: StudyResult): void => {
        if (!settled) {
          settled = true;
          window.clearTimeout(guard);
          resolve(r);
        }
      };
      // A stuck placement must never hang the UI — generous guard, then give up quietly.
      const guard = window.setTimeout(() => settle('unavailable'), 30_000);
      try {
        adBreak({
          type: 'reward',
          name: 'field_study',
          beforeReward: (showAdFn) => showAdFn(), // the player already opted in by clicking
          adViewed: () => settle('completed'),
          adDismissed: () => settle('aborted'),
          adBreakDone: (info) => {
            // Fires last in every case; if nothing else settled us, there was no ad
            // (no fill / frequency-capped / not yet approved).
            void info;
            window.setTimeout(() => settle('unavailable'), 0);
          },
        });
      } catch {
        settle('unavailable');
      }
    });
  }
}
