import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Game } from '../core/game';
import type { RunMode } from '../core/game';
import type { StageConfig } from '../core/campaign';
import { drawGame } from '../render/renderer';
import type { Pointer, MulliganRender } from '../render/renderer';
import { pollAmbientCue } from '../render/organism';
import { setGoreAnchors } from '../render/gore';
import { WIDTH as BOARD_W, HEIGHT as BOARD_H } from '../core/map';
import { getAssimilationDebug } from '../render/livingBattlefield';
import { resolveMulligan } from '../core/mulligan';
import type { MulliganState } from '../core/mulligan';
import { deriveMulliganProjectile } from '../render/mulliganOrganism';
import { deriveHeroGear } from '../render/equipmentArt';
import type { HeroGearSpec } from '../render/equipmentArt';
import type { HeroSymbioteRender } from '../render/heroSymbiotes';
import { activeSets, itemDef } from '../core/equipment';
import { BRANCH_COLOR } from '../render/towerEvolution';
import { HEIGHT, WIDTH } from '../core/map';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import type { ResolvedHeroKit } from '../core/config';
import { AUTOSTART_KEY, motionPrefs, onMotionPrefs, resolveMotion, systemReducedMotion } from '../state/prefs';
import { masteryLevel, meta, equippedCosmeticThemes } from '../state/meta';
import { automationFor } from '../save/derive';
import { frontDeploy } from '../state/frontDeploy';
import { announcePower } from '../state/powerEvents';
import { announceMasteryLevelUp } from '../state/masteryEvents';
import type { LiveMasteryView } from '../state/masteryEvents';
import { MasteryToaster } from './components/MasteryToaster';
import { AudioToggles } from './components/AudioToggles';
import { MotionSettings } from './components/MotionSettings';
import { MASTERY, TOWER_DEFS, FX } from '../core/config';
import { resolveDoctrine } from '../core/doctrines';
import { vowById } from '../core/vows';
import type { VowDef } from '../core/vows';
import { MASTERY_RANK_EVERY, masteryRankTitle } from '../core/mastery';
import { masteryProgress, masteryXpMults, masteryXpRaw } from '../state/meta';
import { music } from '../audio/music';
import { PowerToaster } from './components/PowerToaster';
import { cardRegistry } from '../core/cards';
import { masteryRank } from '../core/mastery';
import { adaptVisualTier } from '../core/adaptation';
import { dangerCurve } from '../core/dangerCamera';
import { computeAssimilationTarget, stepAssimilation, assimilationPresentation, assimilationPresentationInto } from '../core/assimilation';
import type { AssimilationPresentation } from '../core/assimilation';
import { drawAssimilationFx } from '../render/assimilationFx';
import { Announcer, FEEL, viewFeel } from '../render/feel';
import type { FeelRow, Shown } from '../render/feel';
import { clearImpacts, drawImpacts, pushImpactBloom, pushImpactRing } from '../render/impactFx';
import { megaBossDef } from '../core/megaboss';
import { tutorial as tutorialStore } from '../state/tutorial';
import { gameEvents } from '../core/events';
import { MODULE_LABEL } from '../core/boss';
import type { BossModuleKind } from '../core/boss';
import { currentCheckpoint } from '../core/tutorial';
import { audio } from '../audio/sound';
import { telemetry } from '../net/telemetry';
import { setActiveGame } from '../debug/debug';
import { attachRecorder, MAX_REPLAY_BYTES } from '../core/replay';
import type { Recorder, ReplayCtorArgs } from '../core/replay';
import { Hud } from './Hud';
import { setInRun, useLayoutProfile } from './layoutProfile';
import { HeroSelectPanel } from './HeroSelectPanel';
import { Toolbar } from './Toolbar';
import { BuildControls } from './BuildControls';
import { BuildPanel } from './BuildPanel';
import { HeroEvolutionPanel } from './HeroEvolutionPanel';
import { Inspector } from './Inspector';
import { DraftModal } from './DraftModal';
import { setNucleusDress } from '../render/nucleusDress';
import type { HeroKind, HeroProgress, HudSnapshot, MetaModifiers, TowerKind, TowerProgress } from '../core/types';
import type { CardEffect } from '../core/cards';
import type { MegaEncounter } from '../core/megaboss';
import type { RunResult } from '../state/meta';
import { runBus } from '../state/navBus';

// Per-event camera trauma (shake), hit-stop, ducking and stingers live in ONE table:
// render/feel.ts FEEL (docs/GAME-FEEL.md §feel table). Rendered shake = trauma² · SHAKE_MAX ·
// viewFeel.shake (the player's Screen-shake % × motionScale — 0 under reduced motion).
// Hive damage-state thresholds (docs/HIVE-SIEGE.md §states) — a GROAN marks each failure.
const HIVE_STATES = [0.75, 0.5, 0.25, 0.1];
const SHAKE_MAX = 16; // px
const SHAKE_DECAY = 2.0; // trauma/sec
// Saturating trauma add (docs/CAMERA.md): each impulse contributes LESS as trauma nears FX.shakeCap
// and never exceeds it — so a lone boss death still thumps, but 20 simultaneous deaths deep in a run
// stop stacking into an unreadable quake. Presentation-only (trauma never feeds the sim).
function addTrauma(current: number, impulse: number): number {
  const cap = FX.shakeCap;
  return Math.min(cap, current + impulse * (cap / (cap + current)));
}

// How long the battlefield outro lingers before the summary takes over (a beat, then auto-advance;
// a tap skips it). Shorter under reduced motion (motionScale 0) — still a pause, never a hard cut.
const OUTRO_HOLD_MS = { full: 3400, reduced: 1200 } as const;

/** CENTRE STAGE cards (docs/GAME-FEEL.md §centre-stage) — everything that wants the middle of the
 *  board goes through ONE announcer (render/feel.ts ANNOUNCE: priorities + durations). */
type StageCard =
  | { kind: 'wave'; label: string }
  | { kind: 'bossIntro'; name: string; epithet: string; kit: string[]; phases: number }
  | { kind: 'megaIntro'; name: string; title: string; glow: string }
  | { kind: 'tier'; tier: number }
  | { kind: 'weakPoint'; name: string; note: string }
  | { kind: 'bossFall'; name: string; epithet: string }
  | { kind: 'megaFall'; name: string; title: string; glow: string; sub: string };

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// A pointer that travels more than this (screen px) between press and release is a DRAG,
// not a tap — we swallow the click so a stray drag never places a tower, casts an ability,
// or moves the rally point by accident.
const CLICK_SLOP = 8;

/** Serialize a finished recording for submission — undefined when not recording or oversized. */
function packReplay(rec: Recorder | null, game: Game): string | undefined {
  if (!rec) return undefined;
  try {
    const blob = JSON.stringify(rec.finish({ wave: game.waveIndex, kills: game.kills }));
    return blob.length <= MAX_REPLAY_BYTES ? blob : undefined;
  } catch {
    return undefined; // a non-serializable arg — the entry simply stays unverifiable
  }
}

/** Construct the run's Game from its FULL argument tuple; for competitive (daily) runs,
 *  wrap the input surface with the replay recorder BEFORE any input can land. */
function newRecordedGame(
  recorderRef: { current: Recorder | null },
  record: boolean,
  ...args: ReplayCtorArgs
): Game {
  const g = new Game(...args);
  if (record) recorderRef.current = attachRecorder(g, args);
  return g;
}

export function GameView({
  seed,
  mods,
  progress,
  heroKind,
  heroRoster,
  heroProgress,
  runEffects,
  heroEquip,
  setEffects,
  heroAbilityKits,
  mode,
  stage,
  difficulty,
  doctrine,
  threat,
  daily,
  mulliganOverride,
  onEnd,
  onAbandon,
  tutorial,
  onReady,
}: {
  seed: number;
  mods: MetaModifiers;
  progress: TowerProgress;
  heroKind: HeroKind;
  heroRoster?: HeroKind[];
  heroProgress: HeroProgress;
  runEffects?: CardEffect[];
  heroEquip?: Partial<Record<HeroKind, CardEffect[]>>;
  setEffects?: CardEffect[]; // TEAM set bonuses pooled across the fielded roster (2pc/4pc)
  heroAbilityKits?: Partial<Record<HeroKind, ResolvedHeroKit>>; // ★5/★8 fork-resolved ability kits
  mode?: RunMode;
  stage?: StageConfig;
  difficulty?: string;
  doctrine?: string;
  threat?: number; // THREAT LADDER level (docs/THREAT.md) — App passes it only on ladder modes
  daily?: { modifierIds: string[]; towerPool: TowerKind[]; megaBoss?: MegaEncounter }; // Daily Run (docs/DAILY-RUN.md): modifiers + trial pool + the rare Mega variant (docs/MEGA-BOSS.md §daily)
  mulliganOverride?: Partial<Record<TowerKind, MulliganState>>; // Daily's seeded organisms (docs/MULLIGANS.md §daily) — substitutes the account's for this run
  onEnd: (r: RunResult) => void;
  onAbandon: (wave?: number) => void;
  tutorial?: boolean; // TUTORIAL mode: don't bank loot + don't auto-hand-off on run end (the tutorial director drives completion)
  onReady?: (g: Game) => void; // fires once with the live game so the tutorial director can script beats
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  // Daily runs record their input log for leaderboard replay verification (core/replay.ts).
  const recorderRef = useRef<Recorder | null>(null);
  // THE AUTOMATION GATE (docs/HIVE-MIND.md §solved-content): Hive Intelligence + Auto Gene only on
  // content this account has beaten — decided ONCE from the save, threaded into the sim as an option.
  const [automation] = useState(() => automationFor(meta.get(), { mode: mode ?? 'stage', tutorial: !!tutorial, stage: stage?.stage, difficulty: stage?.difficulty ?? difficulty, threat }));
  const game = (gameRef.current ??= newRecordedGame(recorderRef, !!daily && !tutorial, seed, mods, progress, heroKind, heroProgress, {
    runEffects, mode, stage, difficulty, doctrine, heroRoster, heroEquip, setEffects, heroAbilityKits,
    threat, automationAllowed: automation.allowed, // Threat ladder (docs/THREAT.md) + the automation gate
    // Daily Run (docs/DAILY-RUN.md): the day's 3-tower trial pool REPLACES the account roster for
    // this run (favorite = the pool's first kind so nothing leaks a 4th kind); its two modifiers
    // ride the dedicated option. Off-daily, the account's own favorite/roster apply as always.
    favorite: daily ? daily.towerPool[0] : meta.favoriteTower(), // Biomorph Conveyor favorite (docs/STRAIN.md §conveyor)
    unlocked: daily ? [...new Set(daily.towerPool)] : meta.unlockedTowers(), // gates placement/belt/drafts (docs/TOWERS.md §expansion)
    ...(daily ? { daily: { modifierIds: daily.modifierIds } } : {}),
    ...(daily?.megaBoss ? { megaDaily: daily.megaBoss } : {}), // the Daily MEGA variant replaces the wave plan
    // NEMESIS (docs/NEMESIS.md): the hunt rides every run EXCEPT the shared daily gauntlet.
    ...(!daily && meta.get().nemesis ? { nemesis: meta.get().nemesis! } : {}),
    // MOLT VOWS (docs/VOWS.md): the armed wager warps every run of the cycle EXCEPT the shared
    // daily gauntlet (fair worldwide board — same exclusion as the nemesis) and the tutorial.
    ...(!daily && !tutorial && meta.get().prestige.vows.length > 0 ? { vows: meta.get().prestige.vows } : {}),
    // THE FRONT (docs/INFESTATION.md §front): an explicit Deploy arms exactly ONE run with its
    // region warp — consumed at boot, never on the shared daily board or the tutorial sandbox.
    ...(!daily && !tutorial ? frontDeploy.consumeWarp() : {}),
    geneLevels: meta.geneLevels(),
    geneTranscends: meta.geneTranscends(), // chosen Transcendence second lines (§Transcendence)
    // Nucleus Mulligans (docs/NUCLEUS.md): the Hive's own chamber organs fold at boot. Kept OUT of
    // the tutorial sandbox and the shared Daily gauntlet (same fairness rule as tower Mulligans).
    nucleusEffects: tutorial || daily ? [] : meta.nucleusEffects(),
    // Starting Gene Loadout — equipped genes auto-activate at boot (skip in the tutorial's clean sandbox).
    startingGenes: tutorial ? [] : meta.startingGenes(),
    // Progression-gated gene cards the account has earned (campaign depth / best wave / owning the
    // Coil) — injected into the draft pool. A fresh account passes none ⇒ ungated catalog only.
    unlockedCardIds: meta.unlockedCardIds(),
    draftPool: meta.discoveredGeneIds(), // discovery overhaul: only DISCOVERED strands draft (docs/CARDS.md §discovery)
  }));
  // MOLT VOW chips (docs/VOWS.md): the armed wager's compact HUD marker — captured once at
  // game creation (the same exclusions as the run opts: never on dailies or the tutorial).
  const [vowChips] = useState<{ icon: string; name: string }[]>(() =>
    !daily && !tutorial
      ? meta.get().prestige.vows.map((id) => vowById(id)).filter((v): v is VowDef => !!v).map((v) => ({ icon: v.icon, name: v.name }))
      : []);
  // Nucleus dress (docs/NUCLEUS.md §visuals): hand the renderer the resolved mutations for THIS
  // run — account visuals stay out of the daily/tutorial exactly like the sim fold above.
  useEffect(() => {
    if (tutorial || daily) { setNucleusDress(null); return; }
    setNucleusDress({ mutations: meta.nucleusResolved().mutations, crowns: 0 });
    return () => setNucleusDress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The starting-genes CINEMATIC: a brief splash naming the genes that just activated (auto-fades).
  const [geneSplash, setGeneSplash] = useState<string[]>(() => (tutorial ? [] : meta.startingGenes()));
  useEffect(() => {
    if (geneSplash.length === 0) return;
    const t = setTimeout(() => setGeneSplash([]), 3200);
    return () => clearTimeout(t);
  }, [geneSplash.length]);

  // Gore anchor calibration (render/gore.ts setGoreAnchors): project the REAL biomass + loot HUD
  // cells into BOARD coordinates so reward streams aim at the actual readouts on EVERY layout.
  // On desktop the canvas is a centered, aspect-locked strip — the meters sit outside it, so the
  // setter clamps each point to the arena edge nearest its meter (the stream points AT the cell
  // instead of at a portrait-tuned fixed fraction). Re-measured on resize; defaults on unmount.
  useEffect(() => {
    const measure = (): void => {
      const cv = canvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const toBoard = (el: Element | null): { x: number; y: number } | null => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        if (b.width === 0) return null; // hidden variant (other layout) — fall back
        return {
          x: ((b.x + b.width / 2 - rect.x) / rect.width) * BOARD_W,
          y: ((b.bottom - rect.y) / rect.height) * BOARD_H + 10,
        };
      };
      setGoreAnchors({
        biomass: toBoard(document.querySelector('[data-tut="biomass"]')),
        assim: toBoard(document.querySelector('.hud-loot')),
      });
    };
    measure();
    const settle = setTimeout(measure, 700); // once more after the HUD settles
    window.addEventListener('resize', measure);
    return () => { clearTimeout(settle); window.removeEventListener('resize', measure); setGoreAnchors({}); };
  }, []);

  const [hud, setHud] = useState<HudSnapshot>(() => game.getSnapshot());
  const [crashed, setCrashed] = useState<string | null>(null);
  // Run soundtrack: combat by default, boss while a boss banner is live, victory/defeat cadence
  // at run end (one-shots). Categories only — the manager owns all playback (audio/music.ts).
  // DAILY runs voice the 'events' category between bosses (docs/MUSIC.md §events): the seeded
  // worldwide gauntlet has its own identity instead of borrowing plain combat.
  const bossLive = hud.bossBanner !== null || hud.megaBanner !== null; // a Mega Boss IS a boss theme
  useEffect(() => {
    if (hud.phase === 'won') { music.play('victory'); return; }
    if (hud.phase === 'lost') { music.play('defeat'); return; }
    if (hud.megaBanner !== null) { music.play('mega'); return; } // the Colossus Hymn owns mega raids
    if (bossLive) { music.play('boss', { boss: hud.bossBanner?.name }); return; } // each boss binds ITS theme
    music.play(daily && !tutorial ? 'events' : 'combat');
    // Intensity is driven LIVE by the run loop (pressure → layers); the floor rises for bosses.
  }, [hud.phase, bossLive, hud.megaBanner !== null, hud.bossBanner?.name, !!daily, tutorial]); // mega → boss handoff (and boss → boss) must re-pick the track
  // Pause: freezes the sim (the rAF loop skips advance) — both a hotkey (P) and a button drive it.
  // `pausedRef` is read inside the loop (so toggling never restarts the effect); `paused` drives UI.
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false); // 2-step guard on the destructive quit
  const togglePause = useCallback(() => {
    setPaused((p) => { pausedRef.current = !p; return !p; });
    setConfirmAbandon(false); // reset the abandon guard whenever pause toggles
  }, []);
  // Browser/Android BACK mid-run opens the Pause sheet instead of leaving (ui/browserBack.ts).
  useEffect(() => runBus.onPause(() => { if (!pausedRef.current) togglePause(); }), [togglePause]);
  // TUTORIAL GATES (docs/TUTORIAL.md): the overlay's Pause must freeze the SIM too (not just
  // the lesson), and the active checkpoint may request a gentle canvas focus. Subscribing is a
  // no-op cost outside the tutorial (the store is null on normal runs).
  const tutSession = tutorialStore.use();
  const tutPausedRef = useRef(false);
  tutPausedRef.current = !!(tutorial && tutSession?.progress.status === 'paused');
  const tutCue = tutorial && tutSession ? currentCheckpoint(tutSession.progress, tutSession.def)?.cue : undefined;
  const tutFocusRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  tutFocusRef.current = tutCue?.canvasFocus ?? null;
  const tutCamRef = useRef({ x: WIDTH / 2, y: HEIGHT / 2, z: 1 }); // eased — never snaps
  // PHONE DRAWERS (docs/RESPONSIVE-DESIGN.md §run): on the portrait/landscape phone profiles the
  // board takes the screen, so the side panels become overlay drawers — closed by default and
  // reset whenever the profile flips (a rotated tablet never lands with a drawer over the board).
  const drawers = useLayoutProfile().profile !== 'desktop';
  const [leftOpen, setLeftOpen] = useState(!drawers); // Run Build panel (collapsible)
  const [rightOpen, setRightOpen] = useState(!drawers); // Status/Inspector panel (collapsible)
  const drawersRef = useRef(drawers);
  const veilDownRef = useRef(false);
  useEffect(() => {
    if (drawersRef.current === drawers) return;
    drawersRef.current = drawers;
    setLeftOpen(!drawers);
    setRightOpen(!drawers);
  }, [drawers]);
  const [evoOpen, setEvoOpen] = useState(false); // Hero Combat Console (auto-pauses the sim while open)
  const evoOpenRef = useRef(false);
  evoOpenRef.current = evoOpen;
  const pausedBeforeConsole = useRef(false); // restore the player's own pause state on close
  // ── Gameplay Speed (docs/HUD.md §speed): 1×/2×/5× run MORE fixed SIM_DT steps per frame —
  //    byte-identical simulation at any speed. Auto-slow triggers fire once per run each.
  const [speed, setSpeedState] = useState(1);
  const [speedNote, setSpeedNote] = useState<string | null>(null);
  // HIVE INTELLIGENCE (docs/HIVE-MIND.md): the pulse report ticker — what the hive just
  // bought, fading on its own (keyed by `at` so every pulse restarts the animation).
  const [hiveTicker, setHiveTicker] = useState<{ at: number; lines: string[]; spent: number } | null>(null);
  const autoSlowFired = useRef({ finale: false, record: false, danger: false }); // finale/record: once per RUN; danger: once per WAVE (re-armed in prep)
  const setSpeed = useCallback((x: number) => {
    game.timeScale = x;
    setSpeedState(x);
  }, [game]);
  // The Combat Console AUTO-PAUSES the battlefield: upgrading is a decision moment, not a
  // dexterity test. Closing restores the player's own pause state (a manual pause survives).
  useEffect(() => {
    if (evoOpen) {
      pausedBeforeConsole.current = pausedRef.current;
      pausedRef.current = true;
      setPaused(true);
    } else if (!pausedBeforeConsole.current) {
      pausedRef.current = false;
      setPaused(false);
    }
  }, [evoOpen]);
  // MOTION & FEEDBACK (docs/GAME-FEEL.md §4): the device prefs resolve to ONE motionScale (0 when
  // the OS asks for reduced motion, unless the player allowed motion) + shake % / numbers / flashes.
  // Pushed into the render layer's viewFeel; follows a pause-menu change or an OS toggle live.
  const [feelPrefs, setFeelPrefs] = useState(motionPrefs);
  const [osReduced, setOsReduced] = useState(systemReducedMotion);
  useEffect(() => {
    const off = onMotionPrefs(setFeelPrefs);
    const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
    const onMq = (): void => setOsReduced(systemReducedMotion());
    mq?.addEventListener?.('change', onMq);
    return () => { off(); mq?.removeEventListener?.('change', onMq); };
  }, []);
  const feelNow = useMemo(() => resolveMotion(feelPrefs, osReduced), [feelPrefs, osReduced]);
  // The render modules read viewFeel on the next frame (mutated in place — no realloc). Declared
  // before the run loop's effect, so the very first frame already honors the prefs.
  useEffect(() => { Object.assign(viewFeel, feelNow); }, [feelNow]);
  // A new run is a launch: the confident "engage" swell (the Deploy click unlocked the audio).
  useEffect(() => { audio.cue('launch'); }, []);
  useEffect(() => () => clearImpacts(), []);

  // CENTRE STAGE (docs/GAME-FEEL.md §centre-stage): WAVE N, boss/mega intros, the assimilation tier
  // banner, weak-point callouts and the fall cards share ONE announcer — a higher-priority card
  // preempts, a lower one waits its turn (or is dropped once stale); they never overprint.
  const announcerRef = useRef<Announcer<StageCard> | null>(null);
  announcerRef.current ??= new Announcer<StageCard>();
  const [stageCard, setStageCard] = useState<Shown<StageCard> | null>(null);
  const announce = useCallback((card: StageCard): void => {
    const a = announcerRef.current!;
    if (a.push(card, performance.now())) setStageCard(a.current);
  }, []);
  // WAVE START spectacle (docs/GAME-FEEL.md): a sweeping banner + a small camera push-in on
  // every wave launch (button, hotkey, auto, tutorial director — all fire waveStarted).
  const [breachAt, setBreachAt] = useState(0);
  const wavePushRef = useRef(0); // 0..1, decays in the loop → eased zoom pulse
  useEffect(() => {
    const off = gameEvents.on('waveStarted', ({ wave, endless }) => {
      setBreachAt(Date.now());
      wavePushRef.current = 1;
      const rush = game.mode === 'bossRush';
      announce({ kind: 'wave', label: endless ? `DEPTH ${wave}` : rush ? `WAVE ${wave} — ${wave} ${wave === 1 ? 'BOSS' : 'BOSSES'}` : `WAVE ${wave}` });
    });
    return off;
  }, [announce, game]);
  useEffect(() => {
    if (!breachAt) return undefined;
    const id = setTimeout(() => setBreachAt(0), 1700);
    return () => clearTimeout(id);
  }, [breachAt]);
  // BOSS ARRIVAL spectacle: the banner snapshot flipping null→present IS the arrival. Identity
  // fields (docs/BOSS-DESIGN.md §identity) ride the same snapshot, so the intro card reads the
  // FIGHT — epithet + kit verbs — not just a name.
  const bossWasLive = useRef(false);
  useEffect(() => {
    const live = !!hud.bossBanner;
    if (live && !bossWasLive.current && hud.bossBanner) {
      const kit = hud.bossBanner.kit.map((k) => MODULE_LABEL[k as BossModuleKind] ?? k);
      announce({ kind: 'bossIntro', name: hud.bossBanner.name, epithet: hud.bossBanner.epithet, kit, phases: hud.bossBanner.phases });
      audio.cue('boss');
      applyFeel(FEEL.bossArrive);
      wavePushRef.current = 1;
    }
    bossWasLive.current = live;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.bossBanner]);
  // BOSS DEFEAT beat (docs/BOSS-DESIGN.md §identity): the title that announced the threat falls
  // with the body — the epithet's return is the payoff for surviving what it promised. The kill
  // LANDS (docs/GAME-FEEL.md §boss kills): the sim's `bossFall` cue carries the shake + hit-stop +
  // duck + stinger (FEEL.bossFall); here, a gold shock ring at the body and the centre-stage card.
  useEffect(() => gameEvents.on('bossKilled', (e) => {
    pushImpactRing(e.x, e.y, 150, '#ffd24d', performance.now());
    announce({ kind: 'bossFall', name: e.name, epithet: e.epithet ?? '' });
  }), [announce]);
  // Boss PHASE SHIFT roar (docs/BOSS-DESIGN.md §phases): the sim's splice-crunch marks the cut;
  // this dedicated mutation roar gives the evolution a throat. Rides the bossPhase event.
  useEffect(() => gameEvents.on('bossPhase', () => audio.cue('boss_phase')), []);
  // NEMESIS entrance (docs/NEMESIS.md): the personal hunt returning earns its own vengeful roar,
  // distinct from a normal boss intro — the moment you recognize your rival cresting the membrane.
  useEffect(() => gameEvents.on('bossSpawned', (e) => { if (e.nemesis) audio.cue('nemesis_roar'); }), []);
  // STATUS APPLICATION cues (docs/COMBAT-VISUAL-STANDARDS.md §audio): a landed framework status
  // sounds its CATEGORY — a wet corruption squelch for DoTs/debuffs, a crystalline arrest chime
  // for control. Hard-throttled: applications arrive in bursts and must never machine-gun.
  const statusCueAt = useRef(0);
  useEffect(() => gameEvents.on('statusApplied', (e) => {
    if (e.category === 'buff') return; // enemy-side buffs have no player payoff — stay silent
    const now = Date.now();
    if (now - statusCueAt.current < 160) return;
    statusCueAt.current = now;
    audio.cue(e.category === 'control' ? 'status_control' : 'status_dot');
  }), []);
  // HERO ULT IMPACT FRAME (docs/HERO-CINEMATICS.md §impact): the payload LANDS — a ~60 ms view-only
  // hit-stop + one light kick (FEEL.abilityImpact), a sub thump, a bloom inside the zone and ONE
  // grouped damage total. Casting never shakes; only the landing does.
  useEffect(() => gameEvents.on('abilityImpact', (e) => {
    applyFeel(FEEL.abilityImpact);
    audio.cue('abilityImpact');
    pushImpactBloom(e.x, e.y, e.radius, e.color, e.damage, performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  // MEGA BOSS arrival spectacle (docs/MEGA-BOSS.md): the raid banner flipping null→present IS the
  // arrival — a grander card than the boss intro (the audio roar + quake ride the sfx queue).
  const megaWasLive = useRef(false);
  useEffect(() => {
    const live = hud.megaBanner !== null;
    if (live && !megaWasLive.current && hud.megaBanner) {
      announce({ kind: 'megaIntro', name: hud.megaBanner.name, title: hud.megaBanner.title, glow: hud.megaBanner.glow });
      wavePushRef.current = 1;
    }
    megaWasLive.current = live;
  }, [hud.megaBanner, announce]);
  // Mega CAST impact: the banner's telegraph resolving (present → gone while alive and NOT
  // stunned) is the strike landing — the riser (sim's megaAbility cue) finally pays off.
  // A stunned edge is an eye INTERRUPT, the player's win: it must not thump like a hit.
  const megaTeleWas = useRef(false);
  useEffect(() => {
    const b = hud.megaBanner;
    const tele = !!b?.telegraph;
    if (megaTeleWas.current && b && !tele && !b.stunned) {
      audio.cue('mega_cast');
      applyFeel(FEEL.mega_cast);
    }
    megaTeleWas.current = tele;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.megaBanner]);
  // Weak-point consequence callouts (docs/MEGA-BOSS.md §hud): the player must always know WHY
  // that organ mattered — "Shield Generator Destroyed — shields purged".
  useEffect(() => gameEvents.on('megaWeakPointDown', (e) => {
    announce({ kind: 'weakPoint', name: e.kind.replace(/_/g, ' ').toUpperCase(), note: e.note });
  }), [announce]);
  // MEGA FALL card (docs/GAME-FEEL.md §boss kills): the organism's collapse is the top of the
  // centre-stage ladder — it clears every lesser card; the quake + duck + stinger ride megaDeath.
  useEffect(() => gameEvents.on('megaKilled', (e) => {
    const def = megaBossDef(e.defId);
    const sub = [e.weakPoints > 0 ? `${e.weakPoints} ${e.weakPoints === 1 ? 'organ' : 'organs'} ruptured` : '', mmss(e.killSec), e.perfect ? 'FLAWLESS' : '']
      .filter(Boolean).join(' · ');
    announce({ kind: 'megaFall', name: def?.name ?? 'The organism', title: def?.title ?? '', glow: def?.palette.glow ?? '#ffd24d', sub });
  }), [announce]);
  const pointerRef = useRef<Pointer | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null); // press origin for click-vs-drag
  const traumaRef = useRef(0);
  const peakTierRef = useRef(game.assimilation.peakTier); // the deepest assimilation tier already announced
  /** Apply one FEEL row (render/feel.ts): camera trauma + a view-only hit-stop that never stacks
   *  and never fires at motionScale 0. Ducks/stingers are sound.ts's half of the same row. */
  const applyFeel = (row: FeelRow | undefined): void => {
    if (!row) return;
    if (row.shake) traumaRef.current = addTrauma(traumaRef.current, row.shake);
    if (row.hitstop && viewFeel.motion > 0) game.hitstop = Math.max(game.hitstop, row.hitstop);
  };
  const intensityRef = useRef(-1); // last music intensity sent (throttle — see the run loop)
  const duressRef = useRef(0); // last near-death music treatment sent (throttle — see the run loop)
  const assimTargetRef = useRef(0); // last Assimilation Index target (recomputed at ~8Hz; smoothed every frame)
  const assimHudRef = useRef(-1); // last HUD-glow value pushed to CSS (throttle)
  const assimAscendRef = useRef(-1); // last Ascension-flourish pulse pushed to CSS (throttle)
  const assimPresRef = useRef<AssimilationPresentation | null>(null); // reused presentation bundle (zero-alloc/frame)
  const hiveStateRef = useRef(0); // deepest damage-state index announced (0 = healthy … 4 = collapsing)
  const heartbeatRef = useRef(0); // seconds until the next critical-integrity heartbeat
  const graftPulseAtRef = useRef(0); // sim time of the next graft-organism heartbeat (docs/MULLIGANS.md §audio)
  const lbStageRef = useRef(-1); // last Living-Battlefield stage seen (docs/LIVING-BATTLEFIELD.md) — cue on deepen
  // ── Live Mastery projection (docs/MASTERY.md §live) — the EXACT banking math, watched
  //    per HUD tick: banked XP (run-start snapshot; mastery only banks at finishRun) +
  //    this run's accrual × the run-constant multipliers. Level-ups celebrate instantly.
  const masteryBankRef = useRef<Record<string, number>>({});
  const masteryMultRef = useRef(1);
  const masteryPrevRef = useRef<Record<string, { level: number; total: number }> | null>(null);
  const celebRef = useRef<{ x: number; y: number; color: string; start: number }[]>([]);
  const [liveMastery, setLiveMastery] = useState<Partial<Record<string, LiveMasteryView>>>({});
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const endedRef = useRef(false);
  // Run-end OUTRO: when the run ends we don't cut straight to the summary — we linger on the
  // (already-quieted) battlefield with a Victory/Defeat title + a resolved sting, then hand off.
  const outroRef = useRef<{ won: boolean; startedAt: number } | null>(null);
  const skipRef = useRef(false); // tap during the linger to proceed immediately
  const [outro, setOutro] = useState<{ won: boolean; endless: boolean } | null>(null);

  // Per-kind mastery-rank → cosmetic tier (MASTERY.md visual mutations) for BOTH towers and
  // heroes (their kind ids don't collide). Fixed for the run (mastery banks at run end), so
  // compute once; the renderer draws a veteran halo per tier.
  const cosmeticTiers = useMemo(() => {
    const s = meta.get();
    const m: Record<string, number> = {};
    for (const k of TOWER_ORDER) m[k] = masteryRank(masteryLevel(s.towerMasteryXp[k] ?? 0));
    for (const k of HERO_ORDER) m[k] = masteryRank(masteryLevel(s.heroMasteryXp[k] ?? 0));
    return m;
  }, []);
  // Equipped Phenotypes (docs/COSMETICS.md) — snapshotted at run start like every other
  // account visual; {} on a fresh save ⇒ the default dress + default firing timbre.
  const skins = useMemo(() => equippedCosmeticThemes(meta.get()), []);

  // Per-kind permanent STAR count → visual evolution on the battlefield (docs/
  // TOWER-VISUAL-EVOLUTION.md). Fixed for the run (stars are bought in the Lab between runs).
  const starTiers = useMemo(() => {
    const s = meta.get();
    const m: Record<string, number> = {};
    for (const k of TOWER_ORDER) m[k] = s.towerStars[k] ?? 0;
    return m;
  }, []);

  // Per-kind Adaptation FORM stage (docs/ADAPTATION.md §visual evolution) — keystone/apex picks
  // physically mutate the strain on the field. Fixed for the run (Antigen is spent in the Lab).
  const adaptTiers = useMemo(() => {
    const s = meta.get();
    const m: Record<string, number> = {};
    for (const k of TOWER_ORDER) m[k] = adaptVisualTier(s.adaptation?.[`tower:${k}`] ?? []);
    return m;
  }, []);

  // Per-kind MULLIGAN organism (docs/MULLIGANS.md) — the resolved biomechanical creature grafted onto
  // each tower, procedurally drawn from its modifiers' stat profile + seeds. Only ACTIVE organisms
  // (all three slots filled) enter the map; a fresh account contributes none (renders identically).
  const mulliganRender = useMemo(() => {
    const s = meta.get();
    const m: Record<string, MulliganRender> = {};
    for (const k of TOWER_ORDER) {
      // The Daily's seeded assignment substitutes the account's organisms for this run
      // (docs/MULLIGANS.md §daily) — same fold, same visuals, same Inspect.
      const st = mulliganOverride ? mulliganOverride[k] : s.mulligans?.[k];
      const resolved = resolveMulligan(st, TOWER_DEFS[k].combatClass);
      if (resolved.active && st) {
        m[k] = { resolved, visualSeed: st.visualSeed, animSeed: st.animSeed, projectile: deriveMulliganProjectile(resolved, st.visualSeed) };
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshotted once at run start, like every account visual
  }, []);

  // Per-HERO equipped GEAR (docs/EQUIPMENT.md §visuals) — the equipped loadout + active set bonuses
  // resolved into the on-battlefield gear spec, so a geared hero visibly wears its equipment. Fixed
  // for the run (gear is changed in the Armory between runs). Empty loadout ⇒ omitted (classic look).
  const heroGearRender = useMemo(() => {
    const s = meta.get();
    const inv = s.equipment.inventory;
    const m: Record<string, HeroGearSpec> = {};
    for (const k of HERO_ORDER) {
      const lo = meta.loadoutOf(k);
      const items = [lo.weapon, lo.armor, lo.relic].flatMap((uid) => {
        if (!uid) return [];
        const it = inv.find((x) => x.uid === uid);
        const def = it && itemDef(it.defId);
        return def ? [{ def, rarity: it!.rarity }] : [];
      });
      const setBonuses = activeSets(inv, lo).reduce((n, se) => n + (se.bonus2 ? 1 : 0) + (se.bonus4 ? 1 : 0), 0);
      const spec = deriveHeroGear(items, setBonuses);
      if (spec.hasGear || setBonuses > 0) m[k] = spec;
    }
    return m;
  }, []);

  // Per-HERO permanent STAR count → visual evolution on the battlefield (docs/HERO-EVOLUTION.md
  // §visuals). Fixed for the run (hero stars are bought in the Hero Lab between runs).
  const heroStarTiers = useMemo(() => {
    const s = meta.get();
    const m: Record<string, number> = {};
    for (const k of HERO_ORDER) m[k] = s.heroStars[k] ?? 0;
    return m;
  }, []);

  // Per-HERO Symbiote mutation summary (docs/HERO-SYMBIOTES.md §visuals) — stage/motifs/resonance
  // for the grafted-organism layer. Fixed for the run (grafts are seated between runs).
  const heroSymbioteRender = useMemo(() => {
    const m: Record<string, HeroSymbioteRender> = {};
    for (const k of HERO_ORDER) {
      const r = meta.heroSymbioteResolved(k);
      if (r.active) m[k] = { stage: r.slotsActive, fx: r.fx, resonant: r.resonance !== null };
    }
    return m;
  }, []);

  // In-run Hero Evolution total (Hero Console) → the renderer's live "battle-dress" intensity. A
  // ref (synced each render), so the long-lived RAF draw loop reads the CURRENT value as it climbs.
  const heroEvoRef = useRef(0);
  heroEvoRef.current = hud.heroEvo.totalOwned;

  // Live run Power Score = account × this run's temporary buffs (drafted genes + Hero Evolution).
  // Recomputed only when those change (not every frame) — account power is static mid-run.
  const power = useMemo(
    () => meta.powerWith(game.powerEffects()).score,
    [game, hud.cards.length, hud.heroEvo.totalOwned],
  );

  const refresh = (): void => setHud(game.getSnapshot());

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    // Hi-DPI battlefield: back the canvas at devicePixelRatio (clamped ×3) so retina /
    // zoomed / high-res-capture displays render CRISP instead of CSS-upscaling a 720×960
    // store. Every draw stays in sim coordinates — this one base transform maps them to
    // device pixels, and the renderer's save/restore pairs compose on top of it. Pointer
    // math (toCoords) is bounding-rect based and unaffected. dpr=1 is byte-identical.
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    if (dpr !== 1) {
      canvas.width = Math.round(WIDTH * dpr);
      canvas.height = Math.round(HEIGHT * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    let assimAt = 0; // wall-clock of the last Assimilation target recompute (throttle to ~8Hz)

    const loop = (now: number): void => {
      try {
        // Paused: keep the loop alive (so resume is instant) but skip the sim + render. Advancing
        // `last` here means resume doesn't fast-forward by the whole pause duration. The canvas
        // keeps its last-drawn frame; the React PAUSED overlay covers the board.
        if (pausedRef.current || tutPausedRef.current) { last = now; raf = requestAnimationFrame(loop); return; }
        const dt = (now - last) / 1000;
        last = now;
        telemetry.fpsTick(dt); // O(1) histogram bump — the session's FPS summary lane
        // Hitstop: a brief view-loop freeze on a juicy event (a branch-tier purchase). The sim is
        // paused, but cues/shake/render still run below — so the screen shakes + the banner pops
        // against a frozen battlefield. advance() never reads this, so stepping stays deterministic.
        // Reduced motion (motionScale 0) kills hit-stop at the source — sim-set ones included.
        if (viewFeel.motion === 0) game.hitstop = 0;
        if (game.hitstop > 0) game.hitstop = Math.max(0, game.hitstop - dt);
        else game.advance(dt);

        // Drain presentation cues → audio + screen-shake trauma.
        const cues = game.drainSfx();
        if (cues.length) {
          const tally: Record<string, number> = {};
          for (const c of cues) {
            // Phenotype firing variants: a 'tfire_X:kind' cue re-keys to 'tfire_X~variant'
            // when that kind's equipped skin carries one (sound.ts §variants); unthemed
            // kinds strip back to the base cue. Trauma reads the base id either way.
            let key = c;
            let base = c;
            const m = /^(tfire_\w+):(\w+)$/.exec(c);
            if (m) {
              base = m[1];
              const th = skins.towers[m[2] as TowerKind];
              key = th && th.sfx !== 'default' ? `${m[1]}~${th.sfx}` : m[1];
            }
            tally[key] = (tally[key] ?? 0) + 1;
            applyFeel(FEEL[base.indexOf('@') < 0 ? base : base.slice(0, base.indexOf('@'))]);
          }
          audio.cueBatch(tally);
        }
        traumaRef.current = Math.max(0, traumaRef.current - SHAKE_DECAY * dt);

        // ── Hive vital audio (docs/HIVE-SIEGE.md §audio): a GROAN as each damage state fails
        //    (75/50/25/10%), a pounding heartbeat while critical. Heals re-arm silently.
        const intFrac = game.maxIntegrity > 0 ? game.integrity / game.maxIntegrity : 1;
        let stateIdx = HIVE_STATES.findIndex((th) => intFrac > th); // 0 healthy … 
        if (stateIdx < 0) stateIdx = HIVE_STATES.length; // … 4 collapsing
        if (stateIdx > hiveStateRef.current) audio.cue('hiveGroan');
        hiveStateRef.current = stateIdx;
        if (intFrac <= 0.25 && game.phase === 'wave') {
          heartbeatRef.current -= dt;
          if (heartbeatRef.current <= 0) {
            heartbeatRef.current = intFrac <= 0.1 ? 0.85 : 1.3; // pounds harder near collapse
            audio.cue('heartbeat');
          }
        }

        // ── ASSIMILATION INDEX (docs/ASSIMILATION.md): the run's MASTER STATE. Recompute the
        //    target at ~8Hz (it folds run aggregates — event-ish, not per-frame), smooth it every
        //    frame, and derive the ONE presentation bundle every dynamic system below keys on
        //    (music floor, camera breath, screen veil, HUD glow). Render-only — the sim never reads it.
        if (now - assimAt >= 120) { assimTargetRef.current = computeAssimilationTarget(game.assimilationSignals()); assimAt = now; }
        stepAssimilation(game.assimilation, assimTargetRef.current, dt);
        // One presentation bundle, reused every frame (overwritten wholesale by the Into variant) —
        // the whole assimilation pipeline is allocation-free at 60fps. Consumed synchronously below.
        assimPresRef.current ??= assimilationPresentation(game.assimilation);
        const assimPres = assimilationPresentationInto(game.assimilation, assimPresRef.current);

        // CENTRE STAGE clock: retire the expired card, promote the next (allocation-free when idle).
        // The assimilation tier crossing is a centre-stage card too — announced, never overprinted.
        const stage = announcerRef.current!;
        if (game.assimilation.peakTier > peakTierRef.current) {
          peakTierRef.current = game.assimilation.peakTier;
          announce({ kind: 'tier', tier: game.assimilation.peakTier });
        }
        if (stage.tick(now)) setStageCard(stage.current);

        // Render with shake (pre-fill covers the shake margin so no gap shows). The player's
        // Screen-shake % × motionScale scales it at the camera (viewFeel.shake; 0 = still).
        const mag = traumaRef.current * traumaRef.current * SHAKE_MAX * viewFeel.shake;
        const dx = mag ? (Math.random() * 2 - 1) * mag : 0;
        const dy = mag ? (Math.random() * 2 - 1) * mag : 0;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // re-assert the Hi-DPI base transform each frame
        ctx.fillStyle = '#070a10';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.save();
        ctx.translate(dx, dy);
        // NOTE: danger mode deliberately applies NO view scaling (docs/CAMERA.md §5) — any
        // zoom keyed to the zone boundary reads as the screen changing size (player feedback).
        // Its tension channels are non-geometric: vignette, red edge, saturation, banner, music.
        // Wave/boss push-in: a small eased zoom pulse that decays over ~1s — the launch has
        // physical weight without ever disorienting (composes under the danger zoom).
        if (wavePushRef.current > 0.002) {
          wavePushRef.current *= Math.exp(-2.4 * dt);
          const wz = 1 + 0.012 * dangerCurve(wavePushRef.current) * viewFeel.motion; // motionScale 0 ⇒ no push
          ctx.translate(WIDTH / 2, HEIGHT * 0.5);
          ctx.scale(wz, wz);
          ctx.translate(-WIDTH / 2, -HEIGHT * 0.5);
        }
        // Assimilation HEARTBEAT (docs/ASSIMILATION.md §Camera): a barely-perceptible view breath
        // that deepens with the index — the battlefield feels ALIVE as the run assimilates. Capped
        // at a fraction of a percent so it reads as a pulse, never a zoom; composes under the above.
        if (assimPres.cameraAmp > 0.0001 && viewFeel.motion > 0) {
          const hb = 1 + assimPres.cameraAmp * Math.sin(game.time * assimPres.cameraHz * Math.PI * 2);
          ctx.translate(WIDTH / 2, HEIGHT * 0.5);
          ctx.scale(hb, hb);
          ctx.translate(-WIDTH / 2, -HEIGHT * 0.5);
        }
        // Smart tutorial camera (docs/TUTORIAL.md): ease toward the lesson's focus point (or
        // back to neutral) — exponential glide, so entering/leaving a step never snaps the view.
        {
          const cam = tutCamRef.current;
          const want = tutFocusRef.current;
          const k = Math.min(1, 1.6 * dt);
          cam.x += ((want ? want.x : WIDTH / 2) - cam.x) * k;
          cam.y += ((want ? want.y : HEIGHT / 2) - cam.y) * k;
          cam.z += ((want ? want.zoom : 1) - cam.z) * k;
          if (cam.z > 1.0005) {
            ctx.translate(cam.x, cam.y);
            ctx.scale(cam.z, cam.z);
            ctx.translate(-cam.x, -cam.y);
          }
        }
        const rs = game.getRenderState();
        // Graft ambience (docs/MULLIGANS.md §audio): a fielded ACTIVE organism audibly BREATHES —
        // a soft wet pulse every few seconds while its host stands. Sim-time keyed (pause holds it);
        // silent with no assembled organisms on the field.
        if (game.phase === 'wave' && rs.time >= graftPulseAtRef.current
          && rs.towers.some((tw) => mulliganRender[tw.kind])) {
          graftPulseAtRef.current = rs.time + 5.5;
          audio.cue('graftPulse');
        }
        // The Living Battlefield terrain reads the SAME canonical Assimilation Index as the mood FX
        // above (game.assimilation.index) ⇒ ground evolution, music floor and HUD glow stay coherent.
        drawGame(ctx, rs, pointerRef.current, cosmeticTiers, starTiers, adaptTiers, heroStarTiers, heroEvoRef.current, skins.towers, skins.heroes, mulliganRender, heroGearRender, power, game.assimilation.index, heroSymbioteRender);
        drawImpacts(ctx, now); // boss-fall rings + ult impact frames ride the same camera kick
        // Living Organism ambience (docs/LIVING-BATTLEFIELD.md §organisms/audio): the render-side
        // murmur director — at most one quiet per-family cue every few seconds (anticipation
        // murmurs while enemies close in, rarer calm breaths between waves), silent under din.
        if (game.phase === 'wave' || game.phase === 'prep') {
          const orgCue = pollAmbientCue(rs, now);
          if (orgCue) audio.cue(orgCue);
        }
        // Living Battlefield reactivity (docs/LIVING-BATTLEFIELD.md §audio): a subtle organic swell when the
        // arena deepens a stage — never on the first frame (avoids a cue on load), never on decrease.
        {
          const st = getAssimilationDebug()?.stage ?? 0;
          if (lbStageRef.current >= 0 && st > lbStageRef.current) audio.cue('bioStage');
          lbStageRef.current = st;
        }
        // Mastery level-up rings — pure presentation over the sim frame (never sim state).
        if (celebRef.current.length > 0) {
          const RING_MS = 900;
          celebRef.current = celebRef.current.filter((c) => now - c.start < RING_MS);
          for (const c of celebRef.current) {
            const pr = (now - c.start) / RING_MS;
            ctx.globalAlpha = (1 - pr) * 0.85;
            ctx.strokeStyle = c.color;
            ctx.lineWidth = 1 + 2.5 * (1 - pr);
            ctx.beginPath();
            ctx.arc(c.x, c.y, 16 + pr * 48, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = (1 - pr) * 0.3;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 8 + pr * 24, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        ctx.restore();

        // ASSIMILATION VEIL (docs/ASSIMILATION.md §Screen effects): the living-screen post-process
        // — organic vignette, tier-tinted rim glow, drifting spores, faint biome tint, all breathing
        // on the master state. Drawn over the finished frame in un-shaken screen space; a true no-op
        // at the Contained baseline (index ≈ 0), so early game is untouched.
        // The ascension flourish plays only while the announcer grants the tier card the stage.
        const sc = stage.current;
        const tierCard = sc !== null && sc.item.kind === 'tier' ? sc : null;
        drawAssimilationFx(ctx, assimPres, game.time, WIDTH, HEIGHT,
          tierCard ? Math.max(0, 1 - (now - tierCard.at) / tierCard.ms) : 0,
          tierCard && tierCard.item.kind === 'tier' ? tierCard.item.tier : assimPres.ascendedTier);

        // Dynamic music intensity (audio/music.ts): battlefield pressure — enemies massing +
        // a wounded core — breathes the track's layers in and out. Danger mode swells the mix
        // on the SMOOTHED camera intensity (docs/CAMERA.md §audio), so the low layers fade in
        // and out with the tension instead of stepping. Throttled to real changes.
        const intRatio = game.maxIntegrity > 0 ? game.integrity / game.maxIntegrity : 1;
        const pressure = Math.min(1, Math.max(
          (game.enemies.length / 30) * 0.6 + (1 - intRatio) * 0.6,
          game.dangerCam.intensity * 0.9,
        ));
        // The Assimilation Index raises the FLOOR: a deeply-assimilated run keeps the score grand
        // even in a lull, while live combat pressure still spikes it (docs/ASSIMILATION.md §Music).
        const intensity = game.phase === 'won' || game.phase === 'lost' ? 0 : Math.max(0.25 + pressure * 0.75, assimPres.musicIntensity);
        if (Math.abs(intensity - intensityRef.current) > 0.04) {
          intensityRef.current = intensity;
          music.setIntensity(intensity);
        }
        // NEAR-DEATH treatment (audio/music.ts §duress): under 35% Nucleus integrity the mix
        // starts to drown (low-pass sweep) — fully reversible when the run recovers or ends.
        const duress = game.phase === 'won' || game.phase === 'lost' ? 0 : Math.min(1, Math.max(0, (0.35 - intRatio) / 0.35));
        if (Math.abs(duress - duressRef.current) > 0.03) {
          duressRef.current = duress;
          music.setDuress(duress);
        }
        // HUD organic accent (docs/ASSIMILATION.md §HUD): publish the master state to CSS as
        // variables the run HUD reads for a subtle living glow — throttled to real changes, and
        // readability-preserving (the HUD styling only ever ADDS a faint tinted aura).
        if (Math.abs(assimPres.hudGlow - assimHudRef.current) > 0.03) {
          assimHudRef.current = assimPres.hudGlow;
          const root = canvas.parentElement;
          if (root) {
            root.style.setProperty('--assim-glow', assimPres.hudGlow.toFixed(3));
            root.style.setProperty('--assim-color', `${assimPres.color[0]},${assimPres.color[1]},${assimPres.color[2]}`);
            root.dataset.assimTier = String(assimPres.tier);
          }
        }
        // Ascension flourish (docs/ASSIMILATION.md §Ascension Moment): pulse the HUD frame in the new
        // tier's color when the run crosses a boundary. Published while the pulse is live (it decays
        // fast, so throttle on a coarse step) and once more when it returns to rest.
        if (Math.abs(assimPres.ascensionPulse - assimAscendRef.current) > 0.02 || (assimPres.ascensionPulse === 0 && assimAscendRef.current !== 0)) {
          assimAscendRef.current = assimPres.ascensionPulse;
          canvas.parentElement?.style.setProperty('--assim-ascend', assimPres.ascensionPulse.toFixed(3));
        }

        if (now - lastHud > 80) {
          const snap = game.getSnapshot();
          setHud(snap);
          if (!tutorial) meta.syncRunLoot(game.waveIndex, game.kills, snap.endless); // bank loot LIVE (never in the tutorial); endless applies the depth-camping taper (docs/MODE-IDENTITY.md §anti-grind)
          // Live Mastery: project every kind's level from the sim accrual; celebrate crossings.
          const accrual = game.getMasteryAccrual();
          const lm: Partial<Record<string, LiveMasteryView>> = {};
          const prev = masteryPrevRef.current;
          const nextPrev: Record<string, { level: number; total: number }> = {};
          for (const k of TOWER_ORDER) {
            const gained = Math.round(masteryXpRaw(accrual[k]) * masteryMultRef.current);
            const total = (masteryBankRef.current[k] ?? 0) + gained;
            const mp = masteryProgress(total);
            lm[k] = { level: mp.level, into: mp.into, need: mp.need, gained };
            nextPrev[k] = { level: mp.level, total };
            const p = prev?.[k];
            if (p && mp.level > p.level && !tutorial) {
              // Power this level banks: the real preview model at both XP totals.
              const powerAt = (xp: number): number =>
                meta.previewPower((sv) => ({ ...sv, towerMasteryXp: { ...sv.towerMasteryXp, [k]: xp } })).score;
              announceMasteryLevelUp({
                kind: k,
                name: TOWER_DEFS[k].name,
                color: TOWER_DEFS[k].color,
                level: mp.level,
                rank: mp.level % MASTERY_RANK_EVERY === 0 ? masteryRankTitle(mp.level) : null,
                bonus: `+${(MASTERY.damagePerLevel * 100).toFixed(1)}% damage / level`,
                powerGained: Math.max(0, powerAt(total) - powerAt(p.total)),
                at: Date.now(),
              });
              // The organisms themselves celebrate: a ring blooms from every deployed unit
              // of the kind, and the field registers a heartbeat of impact.
              for (const t of game.towers) if (t.kind === k) celebRef.current.push({ x: t.x, y: t.y, color: TOWER_DEFS[k].color, start: now });
              applyFeel(FEEL.masteryUp);
            }
          }
          masteryPrevRef.current = nextPrev;
          setLiveMastery(lm);
          // AUTO-SLOW (docs/HUD.md §speed): the moments that deserve full attention pull the
          // throttle back to 1× — finale/record ONCE each per run; the breach guard once PER WAVE.
          // The control stays free to re-raise after each.
          if (game.phase === 'prep') autoSlowFired.current.danger = false; // re-arm the breach guard every wave
          if (game.timeScale > 1) {
            const fired = autoSlowFired.current;
            // BREACH guard (per wave): an enemy reached the red Final Defense Zone or is sieging the
            // Hive — drop to 1× so the player can react. Independent of the finale/record triggers.
            if (!fired.danger && game.phase === 'wave' && (snap.emergency || snap.hiveAttackers > 0)) {
              fired.danger = true;
              setSpeed(1);
              setSpeedNote('Breach — speed returned to 1×.');
            }
            if (!fired.finale && game.mode !== 'endless' && game.mode !== 'bossRush' && game.waveIndex >= game.totalWaves && game.phase === 'wave') {
              fired.finale = true;
              setSpeed(1);
              setSpeedNote('Final wave — speed returned to 1×. Raise it again if you dare.');
            } else if (!fired.record && game.mode === 'endless') {
              const best = meta.get().bestWave;
              if (best >= 12 && game.waveIndex >= Math.ceil(best * 0.95)) {
                fired.record = true;
                setSpeed(1);
                setSpeedNote(`Approaching your record (wave ${best}) — speed returned to 1×.`);
              }
            } else if (!fired.record && game.mode === 'bossRush') {
              const best = meta.get().rushBestWave;
              if (best >= 4 && game.waveIndex >= Math.ceil(best * 0.95)) {
                fired.record = true;
                setSpeed(1);
                setSpeedNote(`Approaching your Boss Rush record (wave ${best}) — speed returned to 1×.`);
              }
            }
          }
          lastHud = now;
        }
        // Run ended → begin the outro (once): resolve the music, raise the Victory/Defeat title,
        // and linger on the frozen, quieted battlefield before the summary. The tutorial drives its
        // own completion (via the director), so it never auto-hands-off here.
        const over = !tutorial && (game.phase === 'won' || game.phase === 'lost');
        if (over && !outroRef.current && !endedRef.current) {
          outroRef.current = { won: game.phase === 'won', startedAt: now };
          setHud(game.getSnapshot());
          setOutro({ won: game.phase === 'won', endless: game.mode === 'endless' || game.mode === 'bossRush' });
        }
        // After the linger (or a tap), hand off to the End-of-Run Summary.
        if (outroRef.current && !endedRef.current && (skipRef.current || now - outroRef.current.startedAt >= (viewFeel.motion > 0 ? OUTRO_HOLD_MS.full : OUTRO_HOLD_MS.reduced))) {
          endedRef.current = true;
          onEndRef.current({ wave: game.waveIndex, kills: game.kills, won: game.phase === 'won', mastery: game.getMasteryAccrual(), heroMastery: game.getHeroMasteryAccrual(), stats: game.getRunStats(), endless: game.mode === 'endless', durationSec: game.time, doctrine, dailyReplay: packReplay(recorderRef.current, game) });
        }
        raf = requestAnimationFrame(loop);
      } catch (err) {
        // Surface the failure and stop cleanly — never freeze silently or spam.
        console.error('[GameView] run loop error — stopping:', err);
        setCrashed(err instanceof Error ? err.message : String(err));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [game]);

  // Snapshot the mastery banking inputs at run start (they are run-constant).
  useEffect(() => {
    const save = meta.get();
    masteryBankRef.current = { ...save.towerMasteryXp };
    masteryMultRef.current = masteryXpMults(save, { endless: mode === 'endless', campaign: mode === 'campaign' }, difficulty).tower;
    masteryPrevRef.current = null; // first tick initializes silently (no phantom level-ups)
    celebRef.current = [];
  }, [game, mode, difficulty]);

  // expose the live run to the debug panel
  useEffect(() => {
    setActiveGame(game);
    return () => setActiveGame(null);
  }, [game]);

  // The run screen is up — the phone rotate gate stands down (layoutProfile §in-run).
  useEffect(() => {
    setInRun(true);
    return () => setInRun(false);
  }, []);

  // Hand the live game to the tutorial director (once) so it can script beats + read state.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => { onReadyRef.current?.(game); }, [game]);

  // Restore the persisted auto-start preference for this run — but never inside the tutorial,
  // where the director owns every wave start (a veteran's replay must not auto-fire waves).
  useEffect(() => {
    if (tutorial) return;
    try {
      game.setAutoStart(localStorage.getItem(AUTOSTART_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, [game, tutorial]);

  // ── Desktop keyboard shortcuts (1-N towers · Q ability · Space wave · Esc) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      audio.resume();
      // Board hotkeys only during active play — the draft owns the keyboard while open.
      if (game.phase !== 'prep' && game.phase !== 'wave') return;
      const k = e.key;
      // Tutorial: the director scripts wave starts and pins 1× speed — swallow their hotkeys.
      if (tutorial && (k === ' ' || k === 'Spacebar' || k === 'f' || k === 'F')) { e.preventDefault(); return; }
      if (k === 'p' || k === 'P') { togglePause(); return; }
      if (k >= '1' && k <= '4') {
        // The number row mirrors the DEPLOY DOCK left→right: 1 = the favorite rail card,
        // 2-4 = the conveyor pods (the chips on those cards ARE these keys). The old 1-N
        // TOWER_ORDER map was a classic-rail ghost — it armed kinds the conveyor model can't
        // place, and its string compare ('3' <= '20' is false) had killed keys 3-9 anyway.
        if (k === '1') {
          const fav = game.favoriteTower;
          game.selectTower(game.selectedTower === fav ? null : fav);
          audio.cue('select');
        } else {
          const item = game.conveyor[Number(k) - 2];
          if (item) {
            game.selectConveyorItem(game.selectedConveyorId === item.id ? null : item.id);
            audio.cue('select');
          }
        }
      } else if (k === 'q' || k === 'Q') {
        const wasArmed = game.armedAbility;
        game.armAbility();
        if (!wasArmed && game.armedAbility) telemetry.emit('ability', { d: heroKind, v: 1 });
      } else if (k === 'e' || k === 'E') {
        setEvoOpen((v) => !v); // Hero Combat Console (docs/HERO-EVOLUTION.md §console)
      } else if (k === 'f' || k === 'F') {
        setSpeed(game.timeScale >= 5 ? 1 : game.timeScale >= 2 ? 5 : 2); // cycle 1→2→5→1
      } else if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        game.startWave();
      } else if (k === 'Escape') {
        if (evoOpenRef.current) { setEvoOpen(false); return; } // console first, then board intents
        game.cancelInteractions(); // close inspect / cancel move / disarm placement
      } else {
        return;
      }
      setHud(game.getSnapshot());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, togglePause, setSpeed, tutorial]);

  const toCoords = (clientX: number, clientY: number): Pointer => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (WIDTH / rect.width),
      y: (clientY - rect.top) * (HEIGHT / rect.height),
    };
  };

  // Phase skin for the whole combat shell (docs/HUD.md): BUILD = calm green preparation,
  // COMBAT = heated accents, DANGER = the committed emergency state. Pure presentation.
  const hphase = hud.emergency ? 'danger' : hud.phase === 'wave' ? 'combat' : 'prep';

  // Drawer mode: the Inspector also opens on its own for a tapped tower (the Mutate decision
  // surface — not while it's picked up for a move, the board needs the tap) and for a tutorial
  // cue that points at it; closing the drawer then drops that selection.
  const sp = hud.selectedPlaced;
  const tutInspector = !!tutCue && [tutCue.spotlight, tutCue.arrow?.target, tutCue.callout?.target].some((t) => !!t && t.includes('.inspector'));
  const insShown = rightOpen || (drawers && ((!!sp && !sp.moving) || tutInspector));
  const closeRight = (): void => {
    setRightOpen(false);
    if (drawers && sp) {
      game.selectPlacedTower(null);
      refresh();
    }
  };

  return (
    <div className="game" data-hphase={hphase} data-motion={feelNow.motion > 0 ? 'full' : 'reduced'} data-flashes={feelNow.flashes ? 'on' : 'off'}>
      <Hud hud={hud} power={power} onOpenConsole={() => setEvoOpen(true)} tutorial={!!tutorial && !!tutSession} doctrine={doctrine && doctrine !== 'none' ? resolveDoctrine(doctrine) : null} vows={vowChips} />
      <PowerToaster />
      <MasteryToaster />
      <div className="stage">
        {drawers && (leftOpen || insShown) && (
          <div
            className="run-drawer-veil"
            // Close only on a tap that STARTED on the veil — the synthesized click of the very
            // board tap that opened the Inspector lands here too and must not shut it again.
            onPointerDown={() => { veilDownRef.current = true; }}
            onClick={() => {
              if (!veilDownRef.current) return;
              veilDownRef.current = false;
              setLeftOpen(false);
              closeRight();
            }}
            aria-hidden
          />
        )}
        {leftOpen && <BuildPanel hud={hud} onCollapse={() => setLeftOpen(false)} onOpenEvolution={() => setEvoOpen(true)} />}
        {(!leftOpen || drawers) && (
          <button className="panel-rail" onClick={() => setLeftOpen((v) => !v)} aria-label="Show Run Build" aria-expanded={leftOpen}>
            <span className="rail-arrow">»</span>
            <span className="rail-label">RUN BUILD</span>
          </button>
        )}
        {evoOpen && <HeroEvolutionPanel game={game} hud={hud} refresh={refresh} onClose={() => setEvoOpen(false)} />}
        <div className={`canvas-wrap ${outro ? 'is-ending' : ''}`}>
        <canvas
          ref={canvasRef}
          className="board"
          role="img"
          aria-label="Battlefield — enemies descend from the top toward your Hive Core; towers on the defensive line hold them"
          width={WIDTH}
          height={HEIGHT}
          onPointerMove={(e) => {
            pointerRef.current = toCoords(e.clientX, e.clientY);
          }}
          onPointerDown={(e) => {
            audio.resume();
            pointerRef.current = toCoords(e.clientX, e.clientY);
            downRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            if (e.button !== 0) return;
            const down = downRef.current;
            downRef.current = null;
            // Ignore the release if the pointer was dragged — only deliberate taps act.
            if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP) return;
            const p = toCoords(e.clientX, e.clientY);
            // Shift keeps the build tool armed for rapid placement (docs/TOWER-MANAGEMENT.md §4).
            game.click(p.x, p.y, { shift: e.shiftKey });
            refresh();
          }}
          onDoubleClick={(e) => {
            const p = toCoords(e.clientX, e.clientY);
            game.inspectAt(p.x, p.y); // double-click a placed tower → open Inspect immediately
            refresh();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') pointerRef.current = null;
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const p = toCoords(e.clientX, e.clientY);
            // Right-click closes any tower interaction; only re-anchors the hero rally when there
            // was nothing to close (so a stray right-click never yanks the hero mid-build).
            if (game.selectedTower || game.selectedPlacedId !== null || game.movingTowerId !== null) {
              game.cancelInteractions();
            } else {
              game.setRally(p.x, p.y);
            }
            refresh();
          }}
        />
        <BuildControls game={game} hud={hud} refresh={refresh} tutorialLock={!!tutorial && !!tutSession} autoGeneLock={automation.allowed ? null : automation.reason} />
        {breachAt > 0 && <div className="wave-breach" key={`br${breachAt}`} aria-hidden />}
        {stageCard && <CentreStage shown={stageCard} />}
        {/* RUN CONTROLS STRIP (docs/HUD.md §run-controls): speed · Hive Intelligence · Pause (+ the
            Hive ticker / speed note) share ONE flex row reserved at the top of the board, so they
            can never collide with each other, the wave briefing, or the boss bars below it. */}
        <div className="run-ctl">
        {!tutorial && (hud.phase === 'prep' || hud.phase === 'wave') && (
          <div className="speed-ctl" role="group" aria-label="Game speed (F)">
            {[1, 2, 5].map((x) => (
              <button key={x} className={`speed-btn${speed === x ? ' on' : ''}`} onClick={() => setSpeed(x)} title={`${x}× simulation speed (F cycles)`}>
                {x}×
              </button>
            ))}
          </div>
        )}
        {speedNote && (
          <div className="speed-note" role="status">
            <span>⏱ {speedNote}</span>
            <button onClick={() => setSpeedNote(null)}>OK</button>
          </div>
        )}
        {/* HIVE INTELLIGENCE (docs/HIVE-MIND.md): one press evaluates EVERY biomass purchase
            and executes the best ones — glowing whenever something worthwhile is affordable.
            Manual play is untouched; the ticker names each action the hive took. */}
        {!tutorial && (hud.phase === 'prep' || hud.phase === 'wave') && (
          <button
            className={`hive-mind-btn${hud.hiveReady ? ' is-ready' : ''}`}
            disabled={!automation.allowed}
            onClick={() => {
              audio.resume();
              const rep = game.hivePulse();
              if (rep.actions.length > 0) setHiveTicker({ at: Date.now(), lines: rep.actions.map((a) => a.label), spent: rep.spent });
              refresh();
            }}
            title={!automation.allowed
              ? `Hive Intelligence — ${automation.reason}`
              : hud.hiveReady
                ? 'Hive Intelligence — evaluate every Biomass purchase and execute the best ones (keeps a reserve; manual play is untouched)'
                : 'Hive Intelligence — nothing worthwhile is affordable right now'}
          >
            <i className="hive-mind-core" aria-hidden />
            ◈ HIVE INTELLIGENCE
            {!automation.allowed && <small className="hive-mind-why">{automation.reason}</small>}
          </button>
        )}
        {hiveTicker && (
          <div className="hive-ticker" key={hiveTicker.at} role="status">
            <b>◈ HIVE INTELLIGENCE{hiveTicker.spent > 0 ? ` · −${hiveTicker.spent} Biomass` : ''}</b>
            {hiveTicker.lines.slice(0, 6).map((l) => <span key={l}>{l}</span>)}
            {hiveTicker.lines.length > 6 && <span>+{hiveTicker.lines.length - 6} more</span>}
          </div>
        )}
        {(hud.phase === 'prep' || hud.phase === 'wave') && (
          <button
            className="pause-btn"
            onClick={togglePause}
            title={paused ? 'Resume (P)' : 'Pause (P)'}
            aria-label={paused ? 'Resume' : 'Pause'}
          >
            {paused ? '▶ Resume' : '❚❚ Pause'}
          </button>
        )}
        </div>
        {paused && !evoOpen && (
          <div
            className="pause-overlay"
            role="button"
            tabIndex={0}
            aria-label="Resume"
            onClick={togglePause}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePause(); } }}
          >
            <div className="pause-card" onClick={(e) => e.stopPropagation()}>
              <div className="pause-eyebrow">Simulation held</div>
              <div className="pause-title">PAUSED</div>
              <div className="pause-vitals">
                <span><i>Wave</i><b>{Math.max(1, hud.wave)}{hud.endless || hud.bossRush ? '' : `/${hud.totalWaves}`}</b></span>
                <span><i>Kills</i><b>{hud.kills}</b></span>
                <span><i>Biomass</i><b>{hud.biomass}</b></span>
                <span><i>Integrity</i><b>{Math.min(Math.round(hud.integrity), Math.round(hud.maxIntegrity))}/{Math.round(hud.maxIntegrity)}</b></span>
              </div>
              {confirmAbandon ? (
                <>
                  <div className="pause-warn">
                    Abandon the run? You <b>forfeit ALL rewards</b> from this run — no Genome Cores,
                    mastery, gear, or bio-containers. This can't be undone.
                  </div>
                  <div className="pause-row">
                    <button className="set-danger" onClick={(e) => { e.stopPropagation(); onAbandon(game.waveIndex); }}>Forfeit &amp; Quit</button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmAbandon(false); }}>Keep Playing</button>
                  </div>
                </>
              ) : (
                <>
                  <button className="primary pause-resume" onClick={(e) => { e.stopPropagation(); togglePause(); }}>▶ Resume</button>
                  <div className="pause-settings" onClick={(e) => e.stopPropagation()}>
                    <div className="pause-set-k">Settings</div>
                    <AudioToggles compact />
                    <MotionSettings compact />
                  </div>
                  <button className="pause-abandon" onClick={(e) => { e.stopPropagation(); setConfirmAbandon(true); }}>Abandon Run</button>
                  <div className="pause-hint">P or tap outside to resume</div>
                </>
              )}
            </div>
          </div>
        )}
        {hud.megaBanner && (
          <div className={`mega-banner${hud.megaBanner.exposed ? ' is-exposed' : ''}${hud.megaBanner.stunned ? ' is-stunned' : ''}${hud.megaBanner.staggered ? ' is-staggered' : ''}${hud.megaBanner.dormant ? ' is-dormant' : ''}`} style={{ ['--mega']: hud.megaBanner.glow } as CSSProperties}>
            <div className="mega-banner-row">
              <span className="mega-name">{hud.megaBanner.name}</span>
              <span className="mega-title">{hud.megaBanner.title}</span>
              <span className="mega-phase">PHASE {hud.megaBanner.phase}/{hud.megaBanner.phases}</span>
            </div>
            <div className="mega-hp">
              <div className="mega-hp-fill" style={{ width: `${hud.megaBanner.hpPct * 100}%` }} />
            </div>
            {/* Stagger posture (docs/MEGA-BOSS.md §stagger): ruptures fill it; full = TOPPLED. */}
            <div className="mega-stagger" title="Stagger — weak-point ruptures fill it; full topples the organism">
              <div className={`mega-stagger-fill${hud.megaBanner.staggered ? ' is-full' : ''}`} style={{ width: `${(hud.megaBanner.staggered ? 1 : hud.megaBanner.stagger) * 100}%` }} />
            </div>
            <div className="mega-banner-row2">
              {/* §dormancy: buried between waves — ONE chip explains the greyed bar; every
                  combat chip yields (a frozen telegraph/effect list would lie while dormant). */}
              {hud.megaBanner.dormant && (
                <span className="mega-chip mega-chip-dormant" title="The organism has burrowed between waves — it cannot be damaged and does nothing until the next wave surfaces it">⛰ BURROWED — RESURFACES WITH THE WAVE</span>
              )}
              {!hud.megaBanner.dormant && <>
                {hud.megaBanner.staggered && <span className="mega-chip mega-chip-staggered">STAGGERED — POUR IT ON</span>}
                {hud.megaBanner.stunned && !hud.megaBanner.staggered && <span className="mega-chip mega-chip-stun">STUNNED</span>}
                {hud.megaBanner.exposed && <span className="mega-chip mega-chip-exposed">EXPOSED</span>}
                {hud.megaBanner.telegraph && (
                  <span className={`mega-chip mega-chip-cast${hud.megaBanner.telegraph.kind === 'cataclysm' ? ' is-cataclysm' : ''}`}>
                    {hud.megaBanner.telegraph.kind === 'cataclysm' ? '⚠ CATACLYSM — INTERRUPT IT' : hud.megaBanner.telegraph.kind.toUpperCase()}
                    <i className="mega-cast-fill" style={{ width: `${hud.megaBanner.telegraph.frac * 100}%` }} />
                  </span>
                )}
                {/* Damage-gate honesty (docs/MEGA-BOSS.md §hud): when nothing is open, SAY so —
                    the fight is in armored-chip mode, not frozen. Regen/armor explain a slow bar. */}
                {hud.megaBanner.weakPoints.length === 0 && !hud.megaBanner.exposed && !hud.megaBanner.staggered && (
                  <span className="mega-chip mega-chip-sealed" title="No organs are open — idle guns chip the armored body at reduced damage until the next window opens">CARAPACE SEALED · CHIPPING</span>
                )}
                {hud.megaBanner.regenActive && <span className="mega-chip mega-chip-regen" title="The organism is regenerating — rupture a Regen Gland to stop it">▲ REGENERATING</span>}
                {hud.megaBanner.armored && !hud.megaBanner.exposed && !hud.megaBanner.staggered && (
                  <span className="mega-chip mega-chip-armor" title="Body armor blunts chip damage — an Armor Node rupture breaks it">◆ ARMORED</span>
                )}
                {hud.megaBanner.effects.map((fx) => <span key={fx} className="mega-chip">{fx}</span>)}
              </>}
            </div>
            {!hud.megaBanner.dormant && hud.megaBanner.weakPoints.length > 0 && (
              <div className="mega-wps">
                {hud.megaBanner.weakPoints.map((w) => (
                  <span key={w.kind} className="mega-wp" title={w.note}>
                    ⊙ {w.name} <i className="mega-wp-hp"><b style={{ width: `${w.hpPct * 100}%` }} /></i>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {hud.bossBanner && (
          <div className="boss-banner">
            <div className="boss-banner-row">
              <span className="boss-name">
                {hud.bossBanner.name}
                {hud.bossBanner.epithet && <em className="boss-epithet">{hud.bossBanner.epithet}</em>}
              </span>
              <span className="boss-phase">
                PHASE {hud.bossBanner.phase}/{hud.bossBanner.phases}
              </span>
            </div>
            <div className="boss-hp">
              <div className="boss-hp-fill" style={{ width: `${hud.bossBanner.hpPct * 100}%` }} />
            </div>
            {hud.bossBanner.telegraph && <div className="boss-telegraph">{hud.bossBanner.telegraph}</div>}
          </div>
        )}
        {hud.mutation && (
          // Re-keyed by id so each purchase restarts the pop + flash animations.
          <div key={hud.mutation.id} className="mutation-fx" style={{ ['--mut']: BRANCH_COLOR[hud.mutation.branchId] ?? hud.mutation.color } as CSSProperties}>
            <div className="mutation-flash" aria-hidden />
            <div className="mutation-banner" role="status">
              <span className="mutation-kicker">⬢ MUTATION</span>
              <span className="mutation-title">{hud.mutation.title}</span>
              <span className="mutation-sub">{hud.mutation.sub}</span>
            </div>
          </div>
        )}
        {/* Hero selection readout — non-modal (the sim keeps running); dismiss deselects the hero. */}
        {hud.selectedHero && (
          <HeroSelectPanel hero={hud.selectedHero} onClose={() => { game.selectHero(null); refresh(); }} />
        )}
        {geneSplash.length > 0 && (
          // Starting Gene Loadout cinematic (docs/GENE-EVOLUTION.md §Loadouts): a brief splash naming
          // the permanent genes that just auto-activated, then it fades. Tap to dismiss early.
          <div className="gene-splash" role="status" onClick={() => setGeneSplash([])}>
            <div className="gene-splash-k">⌬ STARTING GENES ACTIVE</div>
            <div className="gene-splash-cards">
              {geneSplash.map((id, i) => {
                const c = cardRegistry.get(id);
                const lvl = meta.geneLevels()[id] ?? 0;
                return (
                  <span className="gene-splash-card" key={id} style={{ animationDelay: `${0.15 + i * 0.18}s` }}>
                    {c?.name ?? id}{lvl > 0 ? <b> L{lvl}</b> : null}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {outro && (
          // The run-end linger: a vignette + Victory/Defeat title over the frozen battlefield.
          // A tap proceeds immediately; otherwise the loop auto-hands-off to the summary.
          <div
            className={`run-outro ${outro.won ? 'win' : 'lose'}`}
            role="button"
            tabIndex={0}
            aria-label="Continue to summary"
            onClick={() => { skipRef.current = true; }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') skipRef.current = true; }}
          >
            <div className="run-outro-title">{outro.endless ? 'RUN ENDED' : outro.won ? 'VICTORY' : 'DEFEAT'}</div>
            <div className="run-outro-sub">{outro.won ? 'The hive holds the line.' : 'The Nucleus is lost.'}</div>
            <div className="run-outro-hint">tap to continue</div>
          </div>
        )}
        {hud.phase === 'draft' && hud.draft && (
          <DraftModal
            options={hud.draft}
            clearedWave={hud.wave}
            forceManual={!!tutorial || !automation.allowed}
            rerollCost={hud.draftRerollCost}
            biomass={hud.biomass}
            chosen={hud.cards}
            onReroll={() => {
              if (game.rerollDraft()) refresh();
            }}
            onPick={(id) => {
              game.chooseCard(id);
              refresh();
            }}
          />
        )}
        {crashed && (
          <div className="overlay">
            <h2>RUN ERROR</h2>
            <p className="hint">The run hit an error and stopped. Your permanent progress is safe.</p>
            <pre className="crash-msg">{crashed}</pre>
            <button
              className="primary"
              onClick={() => {
                if (endedRef.current) return;
                endedRef.current = true;
                onEndRef.current({ wave: game.waveIndex, kills: game.kills, won: false, mastery: game.getMasteryAccrual(), heroMastery: game.getHeroMasteryAccrual(), stats: game.getRunStats(), endless: game.mode === 'endless', dailyReplay: packReplay(recorderRef.current, game) });
              }}
            >
              End Run
            </button>
          </div>
        )}
        </div>
        {insShown && (
          <Inspector
            hud={hud}
            liveMastery={liveMastery}
            mulliganStates={mulliganOverride ?? meta.get().mulligans}
            onCollapse={closeRight}
            onBranchBuy={(towerId, branchId) => {
              audio.resume(); // ensure the splice cue is audible (the click is the unlock gesture)
              const powerBefore = meta.powerWith(game.powerEffects()).score;
              if (game.buyBranchTier(towerId, branchId) === 'ok') {
                announcePower('Tower Branch upgrade', powerBefore, meta.powerWith(game.powerEffects()).score);
              }
              refresh();
            }}
            onDeselect={() => {
              game.selectPlacedTower(null);
              refresh();
            }}
            onSell={(towerId) => {
              audio.resume();
              game.sellTower(towerId); // dissolve FX + refund; closes Inspect (selectedPlacedId cleared)
              refresh();
            }}
            onMove={(towerId) => {
              audio.resume();
              game.beginMove(towerId); // pick up → tap a valid slot on the board to relocate
              refresh();
            }}
            onCancelMove={() => {
              game.cancelMove();
              refresh();
            }}
          />
        )}
        {(!insShown || drawers) && (
          <button className="panel-rail right" onClick={() => (insShown ? closeRight() : setRightOpen(true))} aria-label="Show Status" aria-expanded={insShown}>
            <span className="rail-label">STATUS</span>
            <span className="rail-arrow">«</span>
          </button>
        )}
      </div>
      <Toolbar game={game} hud={hud} refresh={refresh} />
    </div>
  );
}

/** The centre-stage card on show (docs/GAME-FEEL.md §centre-stage). Each card keeps its own look;
 *  `--stage-ms` hands it the announcer's duration so the CSS timeline and the slot always agree.
 *  The tier card is drawn on the canvas (render/assimilationFx.ts) — nothing to mount here. */
function CentreStage({ shown }: { shown: Shown<StageCard> }): JSX.Element | null {
  const c = shown.item;
  const ms = { ['--stage-ms']: `${shown.ms}ms` } as CSSProperties;
  switch (c.kind) {
    case 'wave':
      return (
        <div className="wave-banner" key={shown.seq} style={ms} aria-hidden>
          <span className="wave-banner-t">{c.label}</span>
        </div>
      );
    case 'bossIntro':
      return (
        <div className="boss-intro" key={shown.seq} role="alert" style={ms}>
          <span className="boss-intro-eyebrow">◆ APEX THREAT DETECTED ◆</span>
          <span className="boss-intro-name">{c.name}</span>
          {c.epithet && <span className="boss-intro-epithet">— {c.epithet} —</span>}
          {c.kit.length > 0 && (
            <span className="boss-intro-kit" aria-label="Boss abilities">
              {c.kit.map((k) => <i key={k}>{k}</i>)}
            </span>
          )}
          <span className="boss-intro-sub">{c.phases > 1 ? `${c.phases}-phase organism — read the telegraphs` : 'Hold the line'}</span>
        </div>
      );
    case 'bossFall':
      return (
        <div className="boss-fall" key={shown.seq} role="status" style={ms}>
          <span className="boss-fall-name">{c.name}</span>
          <span className="boss-fall-sub">{c.epithet ? `${c.epithet} — FALLEN` : 'FALLEN'}</span>
        </div>
      );
    case 'megaIntro':
      return (
        <div className="mega-intro" key={shown.seq} role="alert" style={{ ...ms, ['--mega']: c.glow } as CSSProperties}>
          <span className="mega-intro-eyebrow">▼ BATTLEFIELD-SCALE ORGANISM ▼</span>
          <span className="mega-intro-name">{c.name}</span>
          <span className="mega-intro-title">{c.title}</span>
          <span className="mega-intro-sub">Burst its weak points — the battle continues beneath it</span>
        </div>
      );
    case 'megaFall':
      return (
        <div className="mega-intro mega-fall" key={shown.seq} role="status" style={{ ...ms, ['--mega']: c.glow } as CSSProperties}>
          <span className="mega-intro-eyebrow">◆ ORGANISM DESTROYED ◆</span>
          <span className="mega-intro-name">{c.name} FALLS</span>
          {c.title && <span className="mega-intro-title">{c.title}</span>}
          <span className="mega-intro-sub">{c.sub}</span>
        </div>
      );
    case 'weakPoint':
      return (
        <div className="wp-callout" key={shown.seq} role="status" style={ms}>
          <span className="wp-callout-name">{c.name} DESTROYED</span>
          <span className="wp-callout-note">{c.note}</span>
        </div>
      );
    case 'tier':
      return null;
  }
}
