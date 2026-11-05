// FEEL — the one table of per-event game feel (docs/GAME-FEEL.md §feel table), plus the
// centre-stage announcer that owns the middle of the battlefield. Pure presentation data:
// the sim never reads any of this (it only EMITS cue ids / presentation events), so goldens
// stay byte-identical.
//
// Readers:
//   • GameView — camera trauma (shake) + view-only hit-stop for every drained sim cue and for
//     the view's own moments (boss arrival, ult impact, mastery rings).
//   • audio/sound.ts — sidechain ducking of the score + musical stingers per cue.
// Adding feel to a moment = one row here. A cue with no row is simply calm (no shake/duck).

import type { StingerId } from '../audio/music';

/** One event's feel. Every field optional — absent means "none". */
export interface FeelRow {
  /** Camera trauma impulse (0..1). Rendered shake = trauma² · SHAKE_MAX · the player's Screen
   *  shake % · motionScale, so reduced motion (or 0%) zeroes it at the camera, not here. */
  shake?: number;
  /** Seconds of VIEW-ONLY freeze (game.hitstop). Never stacks — the longest pending one wins.
   *  Skipped entirely when motionScale is 0 (docs/GAME-FEEL.md §4: reduce motion kills hit-stop). */
  hitstop?: number;
  /** Sidechain-duck the score under this sting: [depth removed 0..1, recovery seconds]. */
  duck?: readonly [number, number];
  /** Musical stinger layered over the score (throttled per stinger id in sound.ts). */
  stinger?: StingerId;
}

/** Per-event feel, keyed by cue id (sim pushSfx / audio.cue) or by a named view moment. */
export const FEEL: Readonly<Record<string, FeelRow>> = {
  // ── the constant combat hum (tiny impulses; saturating trauma keeps swarms readable) ──
  hit: { shake: 0.0036 },
  kill: { shake: 0.015 },
  mine: { shake: 0.02 }, // spore-mine bursts: a light patter even when a field chains
  place: { shake: 0.03 },
  wave: { shake: 0.08 },
  shred: { shake: 0.1 },
  dissolve: { shake: 0.14 },
  hiveHit: { shake: 0.055 }, // per landed bite: a sustained siege reads as a low rumble
  breach: { shake: 0.45, duck: [0.25, 0.6] },
  splice: { shake: 0.34, duck: [0.3, 0.8] },
  // Hero casts never shake (docs/HERO-CINEMATICS.md §3 calm covenant): the performance is the
  // read. An ULT's landing earns ONE light kick + a 60 ms impact frame — the `abilityImpact` row.
  ability: {},
  abilityImpact: { shake: 0.22, hitstop: 0.06 },
  // ── bosses ──
  bossArrive: { shake: 0.32 }, // the APEX THREAT intro (the 'boss' sting + banner land together)
  bossFall: { shake: 0.4, hitstop: 0.12, duck: [0.3, 1.0], stinger: 'bossDown' }, // a stage boss dies: the kill LANDS
  boss_phase: { duck: [0.28, 0.8] },
  nemesis_roar: { duck: [0.34, 1.2] },
  // ── Mega Boss (docs/MEGA-BOSS.md §visuals) — the biggest impulses in the game, by design ──
  mega: { shake: 0.5, duck: [0.45, 1.4] },
  megaPhase: { shake: 0.3, duck: [0.3, 0.9] },
  megaAbility: { shake: 0.06 },
  mega_cast: { shake: 0.12, duck: [0.22, 0.6] }, // the telegraph resolving: the strike lands
  wpOpen: { shake: 0.05 },
  wpBreak: { shake: 0.24, duck: [0.28, 0.7] },
  megaStagger: { shake: 0.3, duck: [0.32, 1.0] },
  megaCataclysm: { shake: 0.55, duck: [0.5, 1.6] },
  megaGorge: { shake: 0.12, duck: [0.24, 0.7] },
  megaDeath: { shake: 0.6, hitstop: 0.12, duck: [0.5, 1.8], stinger: 'bossDown' },
  // ── progression moments ──
  masteryUp: { shake: 0.06 }, // a live mastery level-up: rings bloom from every unit of the kind
  // ── reward cues that pay off musically (no per-site wiring) ──
  jackpot: { stinger: 'legendary' },
  achieve: { stinger: 'achievement' },
  mastery: { stinger: 'mastery' },
  rankup: { stinger: 'unlock' },
  power: { stinger: 'power' },
  strandFound: { stinger: 'discovery' },
  clear: { duck: [0.22, 0.6] }, // the wave-clear fanfare, landing ON the last kill (LAST_KILL below)
};

/** The feel row for a cue tag (suffixes `@tier` / `:kind` / `~variant` already stripped). */
export function feelOf(tag: string): FeelRow | undefined {
  return FEEL[tag];
}

// ── View feel options (Settings → Motion; docs/GAME-FEEL.md §4) ─────────────────────────────
// Device prefs resolved by GameView (state/prefs.ts resolveMotion) and pushed here, so render
// modules read them without importing the state layer. Mutated in place — never reallocated.
export const viewFeel = {
  /** 0 when the OS asks for reduced motion (unless the player allowed motion), else 1. Scales
   *  the wave push-in, the assimilation camera breath, hit-stop and every shake. */
  motion: 1,
  /** Rendered shake multiplier: Screen shake % × motion. */
  shake: 1,
  /** Damage numbers (aggregated hits, crits, ult totals) on the battlefield. */
  numbers: true,
  /** Full-screen flashes (ascension bloom, biome / mega-death flash, impact blooms). */
  flashes: true,
};

// ── Damage numbers (renderer float pass) — bounded magnitude scaling + pop-in ──────────────
export const DAMAGE_NUMBERS = {
  minPx: 17, // a 1-damage tick
  perDecade: 3, // +px per ×10 damage
  maxPx: 28, // ceiling — a nuke reads big, never screen-filling
  popSec: 0.09, // pop-in window
  popScale: 0.4, // overshoot at birth (1.4× → 1×)
  life: 0.55, // the sim's aggregated-number lifetime (game.ts damage aggregation)
  outline: 3.5, // dark stroke width — legible over acid pools / bright gore
  // CROWD BUDGET (docs/COMBAT-VISUAL-STANDARDS.md §hit-confirmation): past `crowdAt` live numbers,
  // the ones under `crowdFrac` × the biggest on screen recede to `crowdAlpha` — at 150 bodies the
  // chip damage stops papering the field and the heavy hits stay legible. Crits never recede.
  crowdAt: 24,
  crowdFrac: 0.4,
  crowdAlpha: 0.3,
} as const;

// ── LAST KILL — the wave's final enemy LANDS (docs/SIGNATURE-MOMENTS.md §1, render/lastKill.ts) ──
// The owner's taste values. Times are wall-clock ms from the kill at 1× (see speedCompress).
export interface LastKillSpec {
  depth: number; // view-time scale at the bottom of the dip, vs 1× real time (0.5 = half speed)
  easeInMs: number; // 100 % → depth
  holdMs: number; // the dip holds (and the camera arrives) until here
  outMs: number; // depth → 100 % (and the camera home) by here
  zoom: number; // camera nudge toward the kill (0.04 = 4 %; docs/CAMERA.md caps it there)
  fanfareMs: number; // the `clear` fanfare lands here (it used to play when the draft opened)
}

export const LAST_KILL: Readonly<{ normal: LastKillSpec; boss: LastKillSpec; rushBossBeat: boolean; leakFanfareMs: number; speedCompress: number }> = {
  normal: { depth: 0.5, easeInMs: 80, holdMs: 400, outMs: 650, zoom: 0.04, fanfareMs: 120 },
  // A boss or the Mega fell this wave: deeper, ~1.5× longer; the fanfare waits out the fall's hit-stop.
  boss: { depth: 0.35, easeInMs: 120, holdMs: 600, outMs: 975, zoom: 0.04, fanfareMs: 180 },
  // Boss Rush: every wave IS a boss wave, so only a Mega column earns the long beat there.
  rushBossBeat: false,
  // The wave ENDED on a breach (no kill): no slow-mo or camera — nothing to celebrate at the body —
  // and the fanfare waits out the breach alarm (≈ the 0.7 s settle, where it used to play).
  leakFanfareMs: 700,
  // At game speed s the beat's durations scale by s^-k (2× → 0.81, 5× → 0.62): it still lands at
  // speed (the dip's floor is absolute — the last kill always reads at the same visible pace) but
  // never drags a fast run.
  speedCompress: 0.3,
};

// ── CENTRE STAGE — one announcer owns the middle of the board ──────────────────────────────
// WAVE N, boss/mega intros, the assimilation tier banner, weak-point callouts and the fall
// cards all want the centre. They never overlap: a higher-priority arrival preempts (the
// preempted card re-queues if it had barely started), a lower one WAITS its turn, and anything
// that waited past its staleness budget is dropped — old news never plays late.
export type AnnounceKind = 'wave' | 'bossIntro' | 'megaIntro' | 'tier' | 'weakPoint' | 'bossFall' | 'megaFall';

export interface AnnounceSpec {
  priority: number; // higher preempts lower
  ms: number; // how long the card owns the stage (its CSS timeline reads --stage-ms)
  maxWaitMs: number; // staleness budget while queued — past it, the card is dropped
}

export const ANNOUNCE: Readonly<Record<AnnounceKind, AnnounceSpec>> = {
  megaFall: { priority: 100, ms: 3600, maxWaitMs: 1500 },
  megaIntro: { priority: 90, ms: 3700, maxWaitMs: 2500 },
  bossFall: { priority: 80, ms: 2200, maxWaitMs: 1500 },
  bossIntro: { priority: 70, ms: 3000, maxWaitMs: 2500 },
  weakPoint: { priority: 50, ms: 3100, maxWaitMs: 1500 },
  wave: { priority: 40, ms: 1700, maxWaitMs: 400 },
  tier: { priority: 20, ms: 2600, maxWaitMs: 6000 },
};

/** A card currently on stage. `seq` re-keys the DOM so a re-show restarts its animation. */
export interface Shown<T> {
  item: T;
  seq: number;
  at: number; // stage time it took the stage (ms)
  ms: number;
}

/** The centre-stage priority queue. Clock-agnostic (callers pass `now` in ms), allocation-free
 *  on the per-frame `tick` path, and generic over the payload (anything with a `kind`). */
export class Announcer<T extends { kind: AnnounceKind }> {
  current: Shown<T> | null = null;
  private waiting: { item: T; since: number }[] = [];
  private seq = 0;

  constructor(private readonly table: Readonly<Record<AnnounceKind, AnnounceSpec>> = ANNOUNCE) {}

  /** Offer a card. Returns true when the card on stage changed (the caller re-renders). */
  push(item: T, now: number): boolean {
    const retired = this.tick(now); // an expired card leaves first, so earlier waiters keep their turn
    const cur = this.current;
    if (!cur) { this.show(item, now); return true; }
    if (cur.item.kind === item.kind) { this.show(item, now); return true; } // newer news of the same slot replaces
    if (this.table[item.kind].priority > this.table[cur.item.kind].priority) {
      // Preempt. A card that had barely begun gets its turn again later; one mostly seen is done.
      if (now - cur.at < cur.ms * 0.5) this.enqueue(cur.item, now);
      this.show(item, now);
      return true;
    }
    this.enqueue(item, now);
    return retired;
  }

  /** Advance the clock: retire the expired card and promote the best fresh waiter. Returns true
   *  when the stage changed. Allocation-free when nothing changes (called every frame). */
  tick(now: number): boolean {
    const cur = this.current;
    if (cur === null || now < cur.at + cur.ms) return false;
    this.current = null;
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const w = this.waiting[i];
      if (now - w.since > this.table[w.item.kind].maxWaitMs) this.waiting.splice(i, 1); // stale: old news is dropped
    }
    let best = -1;
    for (let i = 0; i < this.waiting.length; i++) {
      // Highest priority wins; equal priority → the earlier arrival (strict > keeps the first).
      if (best < 0 || this.table[this.waiting[i].item.kind].priority > this.table[this.waiting[best].item.kind].priority) best = i;
    }
    if (best >= 0) {
      const [w] = this.waiting.splice(best, 1);
      this.show(w.item, now);
    }
    return true;
  }

  /** The stage is cleared (run end / unmount). */
  clear(): void {
    this.current = null;
    this.waiting.length = 0;
  }

  /** Cards waiting their turn (diagnostics/tests). */
  get queued(): readonly T[] {
    return this.waiting.map((w) => w.item);
  }

  private show(item: T, now: number): void {
    // Showing a kind retires any stale copy of it still in line (the stage now carries the news).
    for (let i = this.waiting.length - 1; i >= 0; i--) if (this.waiting[i].item.kind === item.kind) this.waiting.splice(i, 1);
    this.current = { item, seq: ++this.seq, at: now, ms: this.table[item.kind].ms };
  }

  private enqueue(item: T, now: number): void {
    const same = this.waiting.findIndex((w) => w.item.kind === item.kind);
    if (same >= 0) this.waiting[same] = { item, since: this.waiting[same].since }; // keep its place, take the newer payload
    else this.waiting.push({ item, since: now });
  }
}
