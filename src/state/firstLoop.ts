// THE FIRST LOOP (docs/TUTORIAL.md §first-loop) — the hands-on coach for a new account's first
// trips through the hub. The Combat Tutorial teaches the FIGHT; this teaches the LOOP around it
// (fight → collect → grow → fight again) by having the player do it, one control at a time: each
// step spotlights the REAL control and waits for the player's own click (or for the save to show the
// action happened), never a "Next" through a wall of text. Playtest finding it answers (2026-11-06):
// "a LOT on the screen in one go — walk me through the menus and 'what's next' the first time or two".
//
// THREE BEATS, one per hub visit of the first runs: DEPLOY (before run 1), GROW (after run 1: open a
// hub, open a wing, buy, read Power, back home, read "what's next", deploy), COLLECT (after run 2:
// crack a container, meet BEST MOVE, claim the Daily Bio-Cache). While a beat is due the coach owns
// the hub: What's New, the update briefing and the reward placards wait behind it, and the Command
// Center shows only the panels the loop has introduced so far (ui/homeModel.ts `when` gates) — the
// full board arrives when the loop is done. A beat's mechanics are archived as it completes, so What's
// New never re-announces what the player just did. Skippable at every step ("Skip the guide").
//
// DATA: a beat is one row — its run window (veterans never see it) and its steps. A step names the
// control (`anchor`, a CSS selector the UI renders — firstLoop.test.ts pins every one), the screen it
// lives on (`nav`, for the "take me there" recovery), how it completes (`advance`) and, for actions,
// the save change that proves it (`done`). Pure — no React, no meta.

import type { SaveData } from '../save/saveStore';
import { featureRevealed } from './unlocks';

export type CoachBeatId = 'deploy' | 'grow' | 'collect';

export interface CoachStep {
  /** Selector of the real control (first VISIBLE match wins). Absent ⇒ a centered card. */
  anchor?: string;
  /** The hub screen the control lives on — the recovery button navigates here when the anchor is
   *  missing (the player wandered off). 'home' = the Command Center. */
  nav?: string;
  /** The control sits in the hub RAIL: on a narrow shell the rail is a drawer, so the coach first
   *  points at the ☰ menu button. */
  rail?: boolean;
  title: string; // verb-first, short
  text: string; // ≤ 2 short sentences (length-tested)
  /** 'click': the player's real click inside the anchor completes it (the click still lands).
   *  'next': an explanation — a Next button. */
  advance: 'click' | 'next';
  /** For action steps: true once the save shows the action happened (compared to the save when the
   *  step began) — completes the step even if the click landed elsewhere (a keyboard, a shortcut). */
  done?: (before: SaveData, now: SaveData) => boolean;
}

export interface CoachBeat {
  id: CoachBeatId;
  /** Inclusive window of `save.totalRuns` in which the beat may run — outside it, it never shows. */
  runs: [number, number];
  /** The wing the beat walks into — it waits until that screen is revealed (a lost stage can delay it). */
  needs?: string;
  /** Mechanics this beat teaches hands-on — archived (help.seen) when it completes or is skipped,
   *  so their What's New cards never repeat the lesson. */
  teaches: string[];
  steps: CoachStep[];
}

const starsTotal = (s: SaveData): number => Object.values(s.towerStars).reduce<number>((n, v) => n + (v ?? 0), 0);

export const FIRST_LOOP: CoachBeat[] = [
  {
    id: 'deploy', runs: [0, 0], teaches: [],
    steps: [
      { anchor: '.mc-campaign', nav: 'home', advance: 'next', title: 'This is your next fight',
        text: 'The Campaign is the spine of the hive. Every stage you clear opens more of it.' },
      { anchor: '.mc-deploy', nav: 'home', advance: 'click', title: 'Deploy',
        text: 'Tap Continue Campaign to start Stage 1.' },
    ],
  },
  {
    id: 'grow', runs: [1, 2], needs: 'towers', teaches: ['towers'],
    steps: [
      { anchor: '[data-cur="genomeCores"]', nav: 'home', advance: 'next', title: 'Your run paid you',
        text: 'Every run pays Genome Cores and Strain Samples. Spending them makes you permanently stronger.' },
      { anchor: '[data-hub="progression"]', nav: 'home', rail: true, advance: 'click', title: 'Open the Evolution Hub',
        text: 'This menu holds everything you upgrade between runs.' },
      { anchor: '.hubl-grid [data-nav="towers"]', advance: 'click', title: 'Open the Tower Lab',
        text: 'Your towers get permanent upgrades here.' },
      { anchor: '[data-guide="lab-buy"]', nav: 'towers', advance: 'click', title: 'Buy a star',
        text: 'Spend Strain Samples on a star. It is permanent: this tower is stronger in every run from now on.',
        done: (b, n) => starsTotal(n) > starsTotal(b) },
      { anchor: '.hub-power', advance: 'next', title: 'Power went up',
        text: 'Power is your whole strength in one number. Each stage recommends a Power to bring.' },
      { anchor: '.hub-nav [data-nav="home"]', rail: true, advance: 'click', title: 'Head home',
        text: 'Back to the Command Center.' },
      { anchor: '.mc-ledger', nav: 'home', advance: 'next', title: 'What to do next',
        text: 'This list always holds your next goals, with what each pays. When in doubt, look here.' },
      { anchor: '.mc-deploy', nav: 'home', advance: 'click', title: 'Next stage',
        text: 'Deploy into Stage 2.' },
    ],
  },
  {
    id: 'collect', runs: [2, 3], needs: 'vault', teaches: ['containers', 'daily-login'],
    steps: [
      { anchor: '[data-hub="rewards"]', nav: 'home', rail: true, advance: 'click', title: 'Collect your loot',
        text: 'Runs bank sealed Bio-Containers. Open the Rewards Hub.' },
      { anchor: '.hubl-grid [data-nav="vault"]', advance: 'click', title: 'Open the Genetic Vault',
        text: 'Your containers wait here.' },
      { anchor: '[data-guide="vault-crack"]', nav: 'vault', advance: 'click', title: 'Crack one open',
        text: 'Gear, samples and materials pour out.',
        done: (b, n) => (n.pendingContainers ?? []).length < (b.pendingContainers ?? []).length },
      { anchor: '.hub-nav [data-nav="home"]', rail: true, advance: 'click', title: 'Head home',
        text: 'Back to the Command Center.' },
      { anchor: '.gp-best-row', nav: 'home', advance: 'next', title: 'Best move',
        text: 'This names the strongest upgrade you can afford right now. Buy tells you exactly what you get.' },
      { anchor: '.bc-open, .bc-pod-mini', nav: 'home', advance: 'click', title: 'Your daily cache',
        text: 'Open it once a day. It grows for every day in a row you come back.',
        done: (b, n) => n.login.last !== b.login.last },
      { advance: 'next', title: 'That is the loop',
        text: 'Fight, collect, grow, fight again. New systems open as you go deeper, and each gets its own short tour.' },
    ],
  },
];

export const FIRST_LOOP_BY_ID: ReadonlyMap<CoachBeatId, CoachBeat> = new Map(FIRST_LOOP.map((b) => [b.id, b]));

/** The tutorial-milestone key a finished (or skipped) beat writes (save.tutorial.milestones). */
export const beatKey = (id: CoachBeatId | 'skip'): string => `first-loop:${id}`;

/** Mission Control's objective ledger shows only this many rows until the loop is done (a new
 *  player reads two goals, not a long-term wall). */
export const FIRST_LOOP_LEDGER_ROWS = 2;

/** Past this many runs the loop is over whatever was recorded — a veteran never meets the coach. */
export const FIRST_LOOP_MAX_RUNS = 4;

export function beatDone(save: SaveData, id: CoachBeatId): boolean {
  const ms = save.tutorial.milestones;
  return ms.includes(beatKey(id)) || ms.includes(beatKey('skip'));
}

/** The beat the coach should run now, or null. Needs a graduated account (the Combat Tutorial done):
 *  the first not-done beat whose run window holds the account's run count — once its wing is open. */
export function dueBeat(save: SaveData): CoachBeat | null {
  if (!save.tutorial.completed.includes('combat') || save.totalRuns >= FIRST_LOOP_MAX_RUNS) return null;
  for (const b of FIRST_LOOP) {
    if (beatDone(save, b.id)) continue;
    if (save.totalRuns < b.runs[0] || save.totalRuns > b.runs[1]) continue;
    if (b.needs && !featureRevealed(save, b.needs)) return null; // its wing isn't open yet — wait (in order)
    return b;
  }
  return null;
}

/** Has the account been through (or past) a beat? Drives the Command Center's progressive reveal. */
export function loopPast(save: SaveData, id: CoachBeatId): boolean {
  if (save.totalRuns >= FIRST_LOOP_MAX_RUNS || beatDone(save, id)) return true;
  if (!save.tutorial.completed.includes('combat')) return true; // no coach without a graduate — never a bare board
  const b = FIRST_LOOP_BY_ID.get(id)!;
  return save.totalRuns > b.runs[1]; // the window closed (an older account) — never hold it back
}

/** The whole loop is behind the account: the full Command Center shows. */
export const firstLoopDone = (save: SaveData): boolean => FIRST_LOOP.every((b) => loopPast(save, b.id));
