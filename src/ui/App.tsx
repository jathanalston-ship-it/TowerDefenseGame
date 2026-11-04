import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Hub } from './Hub';
import { resumePendingClaims } from '../net/checkout';
import { initEvents, trackEvent } from '../net/events';
import { telemetry } from '../net/telemetry';
import { waveBand } from '../core/analyticsEvents';
const GameView = lazyNamed(() => import('./GameView'), 'GameView');
const Results = lazyNamed(() => import('./Results'), 'Results');
// Debug tooling is dev/opt-in only (?debug) — lazy-loaded so production players
// never download it and the boot chunk stays lean.
const DebugPanel = lazy(() => import('./DebugPanel').then((m) => ({ default: m.DebugPanel })));
import { AchievementToaster } from './AchievementToaster';
import { PowerToaster } from './components/PowerToaster';
import { RewardToaster } from './components/RewardToaster';
import { AccountLevelToast } from './components/AccountXpBar';
import { GenomePromotionCinematic } from './components/GenomeRankPanel';
import { LootToaster } from './LootToaster';
import { WhatsNew } from './WhatsNew';
import { GuidedUnlock } from './GuidedUnlock';
import { guideBus, guideFor } from '../state/guidedUnlocks';
import type { GuideDef } from '../state/guidedUnlocks';
import { featureRevealed } from '../state/unlocks';
import { UpdateBriefing } from './UpdateBriefing';
import { CommanderName } from './components/CommanderName';
import { InitCutscene, introSeen } from './InitCutscene';
const CutscenePlayer = lazyNamed(() => import('./CutscenePlayer'), 'CutscenePlayer');
import { cutsceneDef } from '../core/cutscenes';
import { UpdateToast } from './components/UpdateToast';
import { SecurityPulse } from './SecurityPulse';
const SpectateView = lazyNamed(() => import('./SpectateView'), 'SpectateView');
import { decodeReplayCode } from '../net/replayShare';
import type { ReplayRecord } from '../core/replay';
import { startSyncEngine } from '../net/syncEngine';
const HudTour = lazyNamed(() => import('./HudTour'), 'HudTour');
import { WelcomeGate, ConflictModal } from './components/AccountPanel';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import { audio } from '../audio/sound';
import { applyWardrobeDressing } from './wardrobeDressing';
import { music } from '../audio/music';
import type { RunOutcome, RunResult } from '../state/meta';
import type { HeroKind, HeroProgress, MetaModifiers, TowerKind, TowerProgress } from '../core/types';
import type { CardEffect } from '../core/cards';
import type { RunMode } from '../core/game';
import type { ResolvedHeroKit } from '../core/config';
import { generateStage, recommendedPowerScore } from '../core/campaign';
import { layoutById } from '../core/mapLayouts';
import { resolveCampaignBoon } from '../core/campaignEvents';
import type { StageConfig } from '../core/campaign';
import { formatPower } from '../core/power';
const EvolutionUnlock = lazyNamed(() => import('./EvolutionUnlock'), 'EvolutionUnlock');
import type { EvolutionUnlockData } from './EvolutionUnlock';
const HeroSlotUnlock = lazyNamed(() => import('./HeroSlotUnlock'), 'HeroSlotUnlock');
import type { HeroSlotUnlockData } from './HeroSlotUnlock';
import { difficultyPref, musicPref, setLastFlawlessClearPref, sfxPref } from '../state/prefs';
import { deployReadiness } from '../state/progressionLoop';
const BioRoulette = lazyNamed(() => import('./BioRoulette'), 'BioRoulette');
import { campaignStageCleared, highestCampaignStage, isBossRushUnlocked, isDailyUnlocked, isInfiniteUnlocked } from '../save/derive';
import { chosenThreat } from './components/ThreatPicker';
import { dailyKey, generateDaily, pickDailyHero } from '../core/daily';
import { dailyMulliganAssignment } from '../core/mulligan';
import type { MulliganState } from '../core/mulligan';
import type { DailyPlan } from '../core/daily';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import { ROULETTE, sporesFromParts } from '../state/bioRoulette';
import { tutorial } from '../state/tutorial';
import { cutsceneBus, navBus, rouletteBus } from '../state/navBus';
const TutorialRunner = lazyNamed(() => import('./TutorialRunner'), 'TutorialRunner');
import { DeployScreen } from './DeployScreen';
const ArenaView = lazyNamed(() => import('./ArenaView'), 'ArenaView');
import type { ArenaMatchSetup } from '../core/arenaMatch';
import type { ArenaTransport } from '../net/arenaTransport';
import type { DeployInfo } from './DeployScreen';
import { DIFFICULTIES } from '../core/difficulty';
import { initLayoutProfile, setInRun } from './layoutProfile';
import { RotateGate } from './components/RotateGate';
import { lazyNamed } from './lazyNamed';
import { ScreenFallback } from './components/ScreenFallback';
import { useBrowserBack } from './browserBack';

initLayoutProfile(); // stamp data-layout/data-coarse on <html> before first paint (docs/RESPONSIVE-DESIGN.md)

type Screen = 'menu' | 'deploying' | 'playing' | 'results' | 'tutorial' | 'roulette';

/** Drop only the ?replay= param (other params — e.g. ?debug — survive untouched). */
function clearReplayParam(): void {
  const u = new URL(window.location.href);
  if (!u.searchParams.has('replay')) return;
  u.searchParams.delete('replay');
  window.history.replaceState(null, '', u.pathname + (u.searchParams.size > 0 ? `?${u.searchParams}` : '') + u.hash);
}

/** How long the deployment interstitial breathes before the battlefield mounts. */
const DEPLOY_MS = 1600;

/** Where a run ended, as a bounded telemetry dim: campaign pins the stage, everything else
 *  the wave band ('campaign:c12' / 'endless:w21-25') — docs/ANALYTICS.md §runs. */
function runLocDim(mode: RunMode, campaignStage: number, wave: number): string {
  const loc = mode === 'campaign' ? `c${campaignStage}` : waveBand(wave);
  return `${mode.toLowerCase()}:${loc}`;
}

/** The run-summary telemetry (docs/ANALYTICS.md §runs): one durable run_end plus the
 *  per-tower/hero/gene/equipment/mulligan usage lanes the balance dashboards live on.
 *  Reads the SAVE for loadout context; emits are fail-soft and cost microseconds. */
function emitRunTelemetry(result: RunResult, mode: RunMode, campaignStage: number): void {
  const save = meta.get();
  const modeTok = mode.toLowerCase();
  const fielded = (Object.entries(result.stats.towerBuilds) as [TowerKind, number][]).filter(([, n]) => n > 0);
  telemetry.emit('run_end', {
    d: modeTok,
    v: Math.max(0, Math.floor(result.wave)),
    x: {
      won: result.won ? 1 : 0,
      stage: result.campaignStage ?? 0,
      diff: (result.difficulty ?? 'standard').slice(0, 20),
      hero: result.stats.heroId.slice(0, 24),
      towers: fielded.map(([k]) => k).join(',').slice(0, 160),
      dur: Math.max(0, Math.round(result.durationSec ?? 0)),
      doctrine: (result.doctrine ?? 'none').slice(0, 24),
    },
  });
  if (!result.won) telemetry.emit('run_loss', { d: runLocDim(mode, campaignStage, result.wave) });
  for (const [kind, builds] of fielded) {
    telemetry.emit('tw_field', { d: kind, v: Math.min(500, builds) });
    if (result.won) telemetry.emit('tw_win', { d: kind });
    if (save.mulligans[kind]?.slots?.some(Boolean)) telemetry.emit('mull_use', { d: kind });
  }
  telemetry.emit('hero_pick', { d: result.stats.heroId });
  if (result.won) telemetry.emit('hero_win', { d: result.stats.heroId });
  for (const cardId of [...new Set(result.stats.cardIds)].slice(0, 24)) telemetry.emit('gene_use', { d: cardId });
  const inv = save.equipment.inventory;
  const wornDefs = new Set<string>();
  for (const uid of Object.values(save.equipment.loadouts[result.stats.heroId as HeroKind] ?? {})) {
    const item = uid ? inv.find((i) => i.uid === uid) : undefined;
    if (item) wornDefs.add(item.defId);
  }
  for (const defId of wornDefs) telemetry.emit('equip_use', { d: defId });
  telemetry.emit('power', { v: Math.min(100_000_000, Math.max(0, Math.round(meta.power().score))) });
}

export function App(): JSX.Element {
  // First launch / after an Account Reset → open straight into the Combat Tutorial (its own mode).
  const [screen, setScreen] = useState<Screen>(() => (meta.shouldAutoTutorial() ? 'tutorial' : 'menu'));
  // A live arena match (docs/ARENA.md) — rendered OVER the hub; null = none. Human matches
  // (docs/ONLINE-FOUNDATION.md §relay) also carry the live relay transport the matchmaker
  // paired on; the ArenaView owns its lifecycle from launch to exit.
  const [arenaSetup, setArenaSetup] = useState<ArenaMatchSetup | null>(null);
  const arenaTransportRef = useRef<ArenaTransport | null>(null);
  // The cold-open cinematic: first boot on this device (before even the tutorial),
  // replayable from Settings → Help. Overlays whatever screen is behind it.
  const [introActive, setIntroActive] = useState(() => !introSeen());
  // The descent's landing AFTERGLOW (docs/TUTORIAL.md §cinematic): the film ends on a full-screen
  // gold bloom — a ~500ms gold veil fades off the screen it lands on instead of a hard cut.
  const [afterglow, setAfterglow] = useState(false);
  useEffect(() => {
    if (!afterglow) return undefined;
    const t = window.setTimeout(() => setAfterglow(false), 560);
    return () => window.clearTimeout(t);
  }, [afterglow]);
  // Replay Theater (docs/REPLAY-SHARE.md): a decoded ReplayRecord being watched — set by a
  // shared ?replay= link on boot or by the Daily screen's watch/paste actions.
  const [spectate, setSpectate] = useState<ReplayRecord | null>(null);
  // powerBefore: the Power Score snapshot taken just before finishRun — Results counts up FROM it.
  const [last, setLast] = useState<{ result: RunResult; outcome: RunOutcome; powerBefore?: number } | null>(null);
  // A Campaign milestone that raised the Star Cap this run → the Evolution Unlock sequence (over Results).
  const [evoUnlock, setEvoUnlock] = useState<EvolutionUnlockData | null>(null);
  // A Campaign milestone that opened a new Hero Slot this run → the cinematic Hero Slot Unlock (HEROES.md).
  const [heroSlotUnlock, setHeroSlotUnlock] = useState<HeroSlotUnlockData | null>(null);
  const [tourActive, setTourActive] = useState(false); // first-launch HUD Tour is showing (docs/HELP.md)
  const seedRef = useRef(0);
  const modsRef = useRef<MetaModifiers>(metaModifiers(meta.get()));
  const progRef = useRef<TowerProgress>(meta.towerProgress());
  const heroRef = useRef<HeroKind>(meta.selectedHero());
  const rosterRef = useRef<HeroKind[]>(meta.fieldedLoadout()); // the fielded hero slots (HEROES.md)
  const heroProgRef = useRef<HeroProgress>(meta.heroProgress());
  const effectsRef = useRef<CardEffect[]>([]);
  const heroEquipRef = useRef<Partial<Record<HeroKind, CardEffect[]>>>({}); // per-hero gear effects (HEROES.md)
  const setEffectsRef = useRef<CardEffect[]>([]); // TEAM set bonuses pooled across the fielded roster (2pc/4pc)
  const heroAbilityKitsRef = useRef<Partial<Record<HeroKind, ResolvedHeroKit>>>({}); // per-hero fork-resolved abilities (★5/★8)
  const modeRef = useRef<RunMode>('stage');
  const stageRef = useRef<StageConfig | null>(null); // campaign: the generated stage being played
  const campaignStageRef = useRef(0); // campaign: the stage number (winning it unlocks the next)
  const dailyPlanRef = useRef<DailyPlan | null>(null); // daily: the day's rolled plan (docs/DAILY-RUN.md)
  // Daily only: the day's seeded Mulligan assignment (docs/MULLIGANS.md §daily) — substitutes the
  // account's organisms for THIS run (fold + visuals + Inspect). Null on every other mode.
  const dailyMulligansRef = useRef<Partial<Record<TowerKind, MulliganState>> | null>(null);
  // Run setup the player picks on the Play screen (uncontrolled → read at run start). Defaults are
  // identity ('standard' / 'none'), so an untouched menu plays exactly the baseline run.
  const difficultyRef = useRef('standard');
  const doctrineRef = useRef('none');
  // THREAT LADDER (docs/THREAT.md): the level this run carries — resolved at launch (begin) from the
  // mode's picker pref, clamped to what the save earned; 0 off the ladder modes / on frontier stages.
  const threatRef = useRef(0);

  // Apply the persisted audio preferences once on boot (Settings + the pause menu write them).
  useEffect(() => {
    audio.setEnabled(sfxPref());
    music.setEnabled(musicPref());
    // Wardrobe dressing on boot (docs/COSMETICS.md §wardrobe): covers reload-into-run paths
    // that never mount the Hub (which re-applies on every equip change).
    applyWardrobeDressing(meta.get());
  }, []);

  // Touch tooltips (docs/RESPONSIVE-DESIGN.md §touch): hover-less pointers TAP a .tt to
  // toggle its bubble; tapping anywhere else closes it. One delegated listener — every
  // existing and future tooltip inherits the behavior.
  useEffect(() => {
    if (window.matchMedia?.('(hover: hover)').matches) return; // hover devices keep hover
    const onTap = (e: Event): void => {
      const tt = (e.target as HTMLElement).closest?.('.tt');
      for (const open of document.querySelectorAll('.tt.tt-open')) if (open !== tt) open.classList.remove('tt-open');
      if (tt) tt.classList.toggle('tt-open');
    };
    document.addEventListener('click', onTap);
    return () => document.removeEventListener('click', onTap);
  }, []);

  // Boot the tutorial session if this is a first launch (screen was auto-set to 'tutorial').
  useEffect(() => { if (meta.shouldAutoTutorial()) tutorial.start('combat'); }, []);
  // A shared replay link (?replay=<code>) opens the theater on arrival. The param is kept
  // until the theater CLOSES (not stripped up front): the service worker's first-install
  // reload (controllerchange) would otherwise land on a param-less URL and eat the show —
  // and first-ever visitors from a shared link are exactly this path. Exit cleans the URL
  // so later reloads/bookmarks don't re-run someone else's game forever.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('replay');
    if (!code) return;
    void decodeReplayCode(code).then((r) => {
      if (r) setSpectate(r);
      else clearReplayParam(); // undecodable — clean the URL now, nothing to show
    });
  }, []);
  // Prime the Help archive once so existing saves don't flood with "What's New" on first load.
  useEffect(() => { meta.primeHelp(); }, []);
  meta.use(); // subscribe App so the HUD Tour / What's New react to save changes (unlocks, tour completion)

  const [deployInfo, setDeployInfo] = useState<DeployInfo | null>(null);
  // Bio-Roulette (docs/BOSS-RUSH.md §roulette): a pending wheel session — spores + where it
  // exits back to. A rush that earned spores routes Results through the ceremony; the Vault's
  // Roulette bay opens the BANKED spores from the hub and returns there.
  const [roulette, setRoulette] = useState<{ spores: number; from?: 'vault' } | null>(null);
  // Dev affordance (?debug&roulette=N): open the Bio-Roulette ceremony directly — the same
  // pre-rolled pipeline, granted on collect like a real run. Debug builds only.
  useEffect(() => {
    if (!isDebugEnabled()) return;
    const n = Number(new URL(window.location.href).searchParams.get('roulette'));
    if (Number.isFinite(n) && n > 0) { setRoulette({ spores: Math.min(40, Math.floor(n)) }); setScreen('roulette'); }
  }, []);
  // Hub surfaces (the Vault bay) fire rouletteBus to spin the banked spores. Menu-only —
  // never yanks a live run — and a no-op on an empty bank (the bay disables itself anyway).
  useEffect(() => rouletteBus.onOpen(() => {
    if (screen !== 'menu') return;
    const bank = Math.min(ROULETTE.sporeCap, meta.get().bioSpores);
    if (bank <= 0) return;
    setRoulette({ spores: bank, from: 'vault' });
    setScreen('roulette');
  }), [screen]);
  const begin = useCallback((mode: RunMode, stage: StageConfig | null = null, extraRunEffects: CardEffect[] = []) => {
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    // Snapshot permanent progression + hero choice + equipped loadout at run start
    // (the run stays deterministic from this snapshot).
    modsRef.current = metaModifiers(meta.get());
    progRef.current = meta.towerProgress();
    dailyMulligansRef.current = null; // non-daily runs field the account's own organisms
    heroRef.current = meta.selectedHero();
    rosterRef.current = meta.fieldedLoadout();
    heroProgRef.current = meta.heroProgress();
    // Per-hero equipment folds in per hero (never overwrites another's loadout); Genome Core
    // (run-effect seam) + collection completion bonuses stay battlefield-global run effects.
    heroEquipRef.current = meta.heroRosterEquip();
    setEffectsRef.current = meta.fieldedSetEffects(); // set pieces pool team-wide → the 4-piece tier can activate
    heroAbilityKitsRef.current = meta.heroAbilityKits(); // ★5/★8 forks patch each fielded hero's ability kit

    // Battlefield-global run effects: Genome Core seam + collection bonuses + any Campaign-event
    // Mutation boon the player chose before deploying (docs/CAMPAIGN-EVENTS.md).
    effectsRef.current = [...meta.genomeRunEffects(), ...meta.collectionRunEffects(), ...meta.trophyRunEffects(), ...meta.infestationRunEffects(), ...meta.cutsceneRunEffects(), ...meta.mulliganGlobalEffects(), ...meta.battlePassRunEffects(), ...meta.wardrobeRunEffects(), ...extraRunEffects];
    modeRef.current = mode;
    stageRef.current = stage;
    threatRef.current = mode === 'endless' || mode === 'bossRush' ? chosenThreat(mode)
      : mode === 'campaign' && campaignStageCleared(meta.get(), campaignStageRef.current, difficultyRef.current) ? chosenThreat('campaign')
        : 0; // Threat rides only solved content: Infinite, Boss Rush, and Campaign REPLAYS
    const threatTag = threatRef.current > 0 ? ` · ☣ Threat ${threatRef.current}` : '';
    telemetry.mode(mode.toLowerCase()); // events during the run stamp this mode
    // The deployment interstitial (docs/HUD.md §deploy): a short mode-aware breath instead of
    // being thrown straight onto the battlefield. The playing screen mounts after DEPLOY_MS.
    const diffName = DIFFICULTIES[difficultyRef.current]?.name ?? 'Standard';
    // Readiness surfacing (BALANCE_REPORT push-futility): an under-powered frontier attempt is
    // allowed — informed risk — but the briefing says so before the wall does. Outcome-first and
    // calm, and silent inside the readiness tolerance (docs/PROGRESSION-LOOP.md §readiness).
    const campaignWarn = (): string | undefined => {
      const rec = recommendedPowerScore(campaignStageRef.current, difficultyRef.current);
      const power = meta.power().score;
      return deployReadiness(power, rec, campaignStageRef.current, difficultyRef.current) === 'under'
        ? `Fighting anyway — recommended Power not met (${formatPower(power)} of ${formatPower(rec)}). Failed attempts still recover field data.`
        : undefined;
    };
    setDeployInfo(
      mode === 'campaign' && stage
        ? { title: `STAGE ${campaignStageRef.current} — ${stage.biome.name.toUpperCase()}`, sub: `The Descent · ${layoutById(stage.layout).name} · ${diffName}${threatTag}`, accent: stage.biome.accent, warn: campaignWarn() }
        : mode === 'endless'
          ? { title: 'INFINITE MODE', sub: `AI Director · infinite depth · ${diffName}${threatTag}`, accent: 'var(--viral, #c98bff)' }
          : mode === 'bossRush'
            ? { title: 'BOSS RUSH', sub: `The gauntlet · wave N = N bosses · ${diffName}${threatTag}`, accent: 'var(--danger, #ff5d73)' }
            : mode === 'daily' && stage
              ? { title: `DAILY RUN — ${stage.biome.name.toUpperCase()}`, sub: `One seed · one world · ${layoutById(stage.layout).name} · 20 waves`, accent: stage.biome.accent }
              : { title: 'QUICK SKIRMISH', sub: 'The authored 12-wave defense', accent: 'var(--kinetic, #5ad1ff)' },
    );
    setScreen('deploying');
  }, []);
  // Deployment breath → battlefield. Cleared on unmount so leaving mid-deploy never mounts a run.
  useEffect(() => {
    if (screen !== 'deploying') return;
    const t = window.setTimeout(() => setScreen('playing'), DEPLOY_MS);
    return () => window.clearTimeout(t);
  }, [screen]);
  const startRun = useCallback(() => begin('stage'), [begin]);
  // Infinite uses its OWN persisted difficulty (chosen inside Infinite, not the Main Menu).
  const startEndless = useCallback(() => {
    if (!isInfiniteUnlocked(meta.get())) return; // campaign-gated (docs/MODE-IDENTITY.md §gates); the UI never offers this locked
    difficultyRef.current = difficultyPref('infinite');
    begin('endless');
  }, [begin]);
  // Boss Rush uses its OWN persisted difficulty (chosen inside the gauntlet terminal).
  const startBossRush = useCallback(() => {
    if (!isBossRushUnlocked(meta.get())) return; // campaign-gated (docs/MODE-IDENTITY.md §gates)
    // The stamina entry is paid HERE so every launch path (terminal CTA, Results replay) pays
    // exactly once (docs/BOSS-RUSH.md §stamina). The terminal disables its CTA when short;
    // a short replay falls back to the menu instead of a free run.
    if (!meta.spendRushEntry().ok) {
      setScreen('menu');
      return;
    }
    difficultyRef.current = difficultyPref('bossrush');
    begin('bossRush');
  }, [begin]);
  // Campaign uses its OWN persisted difficulty; generate the chosen stage deterministically and play it.
  const startCampaign = useCallback((stage: number, boonId?: string) => {
    difficultyRef.current = difficultyPref('campaign');
    campaignStageRef.current = stage;
    const cfg = generateStage(stage, difficultyRef.current);
    // A Mutation event offers a run-scoped boon CHOICE (mission card); resolve the pick (else the
    // default first option) and fold it into the run's global effects. No event / no pick ⇒ [].
    const boon = resolveCampaignBoon(cfg.event?.boons, boonId);
    begin('campaign', cfg, boon?.effects ?? []);
  }, [begin]);
  // Daily Run (docs/DAILY-RUN.md): ONE deterministic plan per UTC day — the same run worldwide.
  // The run seed is the DAY seed (not the usual random roll) and the day dictates the fielded hero,
  // so every player faces the identical gauntlet; the difficulty is the shared 'standard' ruleset.
  const startDaily = useCallback(() => {
    if (!isDailyUnlocked(meta.get())) return; // campaign-gated (docs/MODE-IDENTITY.md §gates)
    const plan = generateDaily(dailyKey());
    dailyPlanRef.current = plan;
    difficultyRef.current = 'standard';
    begin('daily', plan.stage);
    // Post-begin overrides (begin() snapshots the ACCOUNT defaults synchronously; the run mounts
    // after the deploy interstitial, so these land before the Game constructs):
    seedRef.current = plan.seed; // the DAY seed ⇒ byte-identical run worldwide
    const hero = pickDailyHero(plan.seed, HERO_ORDER);
    heroRef.current = hero;
    rosterRef.current = [hero]; // the day's single champion — slots don't apply to the shared gauntlet
    // The day's towers arrive with PRE-ASSEMBLED Mulligans drawn from the player's OWN discovered
    // modifiers (loaner tutorial trio on an empty dex) — seeded by the day, so a rerun matches
    // (docs/MULLIGANS.md §daily). Folded into the run's TowerProgress snapshot before mount.
    const grafts = dailyMulliganAssignment(plan.seed, TOWER_ORDER, meta.get().mulliganDex);
    dailyMulligansRef.current = grafts.byKind;
    progRef.current = meta.towerProgress(grafts.byKind);
  }, [begin]);

  const handleEnd = useCallback((result: RunResult) => {
    if (threatRef.current > 0) result.threat = threatRef.current; // Threat ladder settle (docs/THREAT.md)
    // Campaign: tag the result so finishRun unlocks the next stage + scales the rewards.
    if (modeRef.current === 'campaign') {
      result.campaignStage = campaignStageRef.current;
      result.difficulty = difficultyRef.current;
      // Campaign-event payout (docs/CAMPAIGN-EVENTS.md): a Cache/Gauntlet stage folds its reward × on
      // top of the base stage reward — an authored bonus, kept off the base scaling curve.
      result.rewardMult = (stageRef.current?.rewardMult ?? 1) * (stageRef.current?.event?.rewardMult ?? 1);
    } else if (modeRef.current === 'endless') {
      result.difficulty = difficultyRef.current; // Infinite's difficulty drives its run-end economy
    } else if (modeRef.current === 'bossRush') {
      result.bossRush = true; // Boss Rush: per-boss payout lanes + rush records (docs/BOSS-RUSH.md)
      result.difficulty = difficultyRef.current;
    } else if (modeRef.current === 'daily') {
      // Daily: tag the day key (ledger + once-per-day clear reward) + the plan's reward scalar.
      result.dailyKey = dailyPlanRef.current?.key;
      result.rewardMult = stageRef.current?.rewardMult;
      result.difficulty = 'standard';
    }
    // First-clear detection for stage_clear telemetry — read BEFORE finishRun raises it.
    const prevCleared = modeRef.current === 'campaign' ? (meta.get().campaign.cleared[difficultyRef.current] ?? 0) : 0;
    const powerBefore = meta.power().score; // Results counts Power up from here, not from 0
    const outcome = meta.finishRun(result);
    // Readiness calm-down memory: a flawless campaign clear quiets the NEXT stage's deploy warning;
    // any other campaign settle ends the calm (docs/PROGRESSION-LOOP.md §readiness).
    if (modeRef.current === 'campaign') {
      setLastFlawlessClearPref(result.won && result.stats.integrityLost === 0 ? { diff: difficultyRef.current, stage: campaignStageRef.current } : null);
    }
    emitRunTelemetry(result, modeRef.current, campaignStageRef.current);
    if (modeRef.current === 'campaign' && result.won && campaignStageRef.current > prevCleared) {
      telemetry.emit('stage_clear', { d: `c${campaignStageRef.current}` });
    }
    // Bio-Roulette spores (docs/BOSS-RUSH.md §roulette): record delta + volume, from the parts
    // finishRun just computed. Earned spores BANK first (save.bioSpores), then the ceremony
    // plays the whole bank (carried quest/pass spores ride along), capped per session. Zero
    // earned ⇒ no forced ceremony — a carried bank stays spendable from the Vault bay.
    if (outcome.rushProgress) {
      const spores = sporesFromParts(outcome.rushProgress.newRecordBosses, outcome.rushProgress.bossKills);
      if (spores > 0) meta.addBioSpores(spores, 'Boss Rush');
      setRoulette(spores > 0 ? { spores: Math.min(ROULETTE.sporeCap, meta.get().bioSpores) } : null);
    } else {
      setRoulette(null);
    }
    setLast({ result, outcome, powerBefore });
    // Crossed Campaign milestones play their cinematics over Results. Hero Slot is the bigger
    // milestone → it shows first; the Evolution Unlock follows once it's dismissed.
    setHeroSlotUnlock(outcome.heroSlotUnlock ?? null);
    setEvoUnlock(outcome.evolutionUnlock ?? null);
    setScreen('results');
  }, []);

  // Abandon: forfeit ALL rewards and go straight to the menu — NO finishRun, and roll back the
  // run's live-banked loot. The deliberate opposite of handleEnd.
  const handleAbandon = useCallback((wave?: number) => {
    telemetry.emit('run_quit', { d: runLocDim(modeRef.current, campaignStageRef.current, wave ?? 0) });
    meta.abandonRun();
    setScreen('menu');
  }, []);

  const toMenu = useCallback(() => setScreen('menu'), []);
  // While a roulette is pending, EVERY Results exit passes through the ceremony (rewards are
  // collected there — even Skip collects; nothing earned is ever lost).
  // Story premieres (docs/CUTSCENES.md §autoplay): a first mega defeat queues its cutscene —
  // it plays AFTER the reward summary (Results dismiss), before the menu/roulette resumes.
  const [cutsceneQueue, setCutsceneQueue] = useState<string[]>([]);
  const afterResults = useCallback(() => {
    if (last?.outcome.megaCutscenes?.length) setCutsceneQueue(last.outcome.megaCutscenes);
    setScreen(roulette ? 'roulette' : 'menu');
  }, [roulette, last]);
  // Quest-finale premieres (docs/QUESTS.md §finale): a hub claim that unlocks a NEW film emits
  // over the bus — queued exactly like a first mega defeat (same player, same dismiss flow).
  useEffect(() => cutsceneBus.onPremiere((ids) => setCutsceneQueue((q) => [...q, ...ids.filter((id) => !q.includes(id))])), []);
  // One-tap "Infect Again" from Results — re-run the SAME mode without a menu round-trip. The run
  // re-snapshots the now-updated save (begin() reads meta fresh), so the replay uses the progression
  // just earned. Campaign replays the same host stage; a WIN advances via startNextStage below.
  const replayRun = useCallback(() => {
    if (modeRef.current === 'endless') startEndless();
    else if (modeRef.current === 'bossRush') startBossRush();
    else if (modeRef.current === 'campaign') startCampaign(campaignStageRef.current);
    else if (modeRef.current === 'daily') startDaily(); // same UTC day ⇒ the same plan (reward stays once/day)
    else startRun();
  }, [startEndless, startBossRush, startCampaign, startDaily, startRun]);
  // Campaign WIN → "Stage N+1 ▸" (docs/REWARD-PRESENTATION.md §next): the push phase advances
  // straight from Results through the SAME launch the Campaign map's Deploy uses — its persisted
  // difficulty + prediction baseline, the boon picked on Results, begin()'s readiness briefing (and
  // the doctrine already armed). Offered only while N+1 is open on that track; else replay stays.
  const nextStageN = last && last.result.won && last.result.campaignStage ? last.result.campaignStage + 1 : 0;
  const nextStageOpen = nextStageN > 0 && nextStageN <= (meta.get().campaign.cleared[last?.result.difficulty ?? 'standard'] ?? 0) + 1;
  // Stage N+1's Mutation boons are chosen ON Results (the same pick the Campaign panel offers).
  const nextEvent = useMemo(
    () => (nextStageOpen ? generateStage(nextStageN, difficultyPref('campaign')).event : undefined),
    [nextStageOpen, nextStageN],
  );
  const nextBoons = nextEvent?.kind === 'mutation' ? nextEvent.boons : undefined;
  const startNextStage = useCallback((boonId?: string) => {
    audio.cue('ui');
    meta.notePredictionBaseline('campaign', difficultyPref('campaign'));
    startCampaign(campaignStageRef.current + 1, boonId);
  }, [startCampaign]);
  // Clear the last-run recap once the Home screen has shown it (so it doesn't re-appear).
  const clearLast = useCallback(() => setLast(null), []);
  // First-launch HUD Tour: latch it ON when eligible (after the tutorial, on the menu). Latched
  // (not the reactive predicate) so its reward reveal survives completeHudTour marking it done.
  useEffect(() => { if (screen === 'menu' && meta.shouldHudTour()) setTourActive(true); }, [screen]);
  // Guided Unlock walkthrough (docs/GUIDED-UNLOCKS.md): armed over the guideBus — by a What's
  // New "Show me ▸" after it navigates, or a Help-wiki replay (re-teaches, never re-pays).
  // Dropped if the player leaves the menu (the wing being taught lives there).
  const [guided, setGuided] = useState<GuideDef | null>(null);
  useEffect(() => guideBus.onStart((mechId) => {
    const g = guideFor(mechId);
    if (g && featureRevealed(meta.get(), g.nav)) setGuided(g);
  }), []);
  useEffect(() => { if (screen !== 'menu') setGuided(null); }, [screen]);
  // Launch (or replay) the Combat Tutorial from Settings — its own mode.
  const launchTutorial = useCallback(() => { tutorial.start('combat'); setScreen('tutorial'); }, []);

  const debugOn = isDebugEnabled();

  // Purchase recovery (docs/DEPLOYMENT.md §purchases): claim any Stripe return /
  // interrupted checkout exactly once on boot, then surface the outcome. Sandbox
  // builds and sessions with nothing pending resolve to 'none' with zero network.
  const [purchaseNote, setPurchaseNote] = useState<string | null>(null);
  useEffect(() => {
    initEvents(); // privacy-friendly aggregate counters (docs/WEBSITE.md §analytics)
    // The telemetry pipe (docs/ANALYTICS.md §client): providers hand it batch context
    // lazily so it never imports meta. Boot-to-interactive lands as the 'load' event.
    telemetry.start({
      power: () => Math.max(0, Math.round(meta.power().score)),
      stage: () => highestCampaignStage(meta.get()),
    });
    telemetry.loaded();
    void resumePendingClaims().then((o) => {
      if (o.kind === 'delivered') setPurchaseNote(`✷ Purchase delivered — ${o.receipt.offer.name}. Open the Premium Store to view it.`);
      else if (o.kind === 'cancelled') setPurchaseNote('Checkout cancelled — nothing was charged.');
      else if (o.kind === 'pending' && meta.get().premium.pendingCheckout) {
        setPurchaseNote('◌ A purchase is still processing — it will be delivered automatically.');
      }
    });
  }, []);

  // Menu soundtrack (audio/music.ts): the Hive theme plays across the whole Command Center.
  // Autoplay policy: the FIRST start is armed on the first pointer gesture; category switches
  // afterwards are immediate. GameView drives combat/boss/victory/defeat itself.
  useEffect(() => {
    if (screen === 'playing') {
      trackEvent('run_start');
      telemetry.emit('run_start', { d: modeRef.current.toLowerCase() });
      telemetry.screen('battlefield');
    }
    if (screen === 'results') { trackEvent('run_end'); telemetry.screen('results'); }
    if (screen === 'menu') telemetry.mode('menu'); // back on the hub — events stamp menu again
  }, [screen]);
  // Portrait run allowance (docs/RESPONSIVE-DESIGN.md §run): the whole run FLOW — the deploy
  // breath, the battlefield and Results (+ its milestone cinematics) — plays in either
  // orientation; the rotate gate returns with the hub.
  useEffect(() => {
    // The Bio-Roulette ceremony closes a Boss Rush run (and the Vault's spore bay) — it belongs to the
    // same flow, so a portrait phone never meets the rotate gate between the run and its payout.
    setInRun(screen === 'deploying' || screen === 'playing' || screen === 'results' || screen === 'roulette', 'run-flow');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'menu') return;
    startSyncEngine(); // the account sync engine mirrors + pulls quietly (net/syncEngine.ts)
    music.setDuress(0); // any lingering near-death treatment ends with the run
    // Account progression → soundtrack evolution (audio/music.ts §progression): veterans hear
    // the darker late-game menu themes more. Campaign depth + molts, saturating ~stage 30.
    const s = meta.get();
    const cleared = Math.max(0, ...Object.values(s.campaign.cleared), 0);
    music.setProgression(Math.min(1, cleared / 30 + s.prestige.molts * 0.2));
    const start = (): void => music.play('menu');
    start(); // no-op until the AudioContext may run…
    window.addEventListener('pointerdown', start, { once: true }); // …then the first click unlocks it
    return () => window.removeEventListener('pointerdown', start);
  }, [screen]);

  // Browser/Android BACK walks the game, never out of it (docs/HUB-FLOW.md §back): the hub's
  // own history, a Pause during a live run (+ a beforeunload warning), a hold on everything else.
  useBrowserBack(screen === 'playing' || screen === 'tutorial' ? 'run' : screen === 'menu' && !arenaSetup ? 'menu' : 'other');
  // A live Arena match renders OVER the hub (screen stays 'menu'): ceremonies, toasts and prompts
  // wait until it ends — a real-time PvP field must never be covered (their queues persist).
  const menuIdle = screen === 'menu' && !arenaSetup;

  return (
    <div className="app">
      {/* Phone HUB screens are horizontal ONLY (RESPONSIVE-DESIGN.md §landscape) — the gate
          covers every non-run screen state (hub, deploy, results, overlays) and clears the frame
          the device rotates; a live run has its own portrait layout and is never gated.
          Mouse-pointer windows are never gated. */}
      <RotateGate />
      {screen === 'menu' && purchaseNote && (
        <div className="purchase-note" role="status">
          <span>{purchaseNote}</span>
          <button className="purchase-note-x" onClick={() => setPurchaseNote(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {screen === 'menu' && (
        <Hub
          onStart={startRun}
          onStartEndless={startEndless}
          onStartBossRush={startBossRush}
          onStartCampaign={startCampaign}
          onStartDaily={startDaily}
          last={last}
          onSeenLast={clearLast}
          onReplayTutorial={launchTutorial}
          onReplayTour={() => { navBus.go('home'); setTimeout(() => setTourActive(true), 50); }}
          onReplayIntro={() => setIntroActive(true)}
          onSpectate={setSpectate}
          onLaunchArenaMatch={(setup, transport) => { arenaTransportRef.current = transport ?? null; setArenaSetup(setup); }}
          difficultyRef={difficultyRef}
          doctrineRef={doctrineRef}
        />
      )}
      {screen === 'menu' && arenaSetup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60 }}>
          <Suspense fallback={<ScreenFallback />}><ArenaView
            setup={arenaSetup}
            transport={arenaTransportRef.current}
            onExit={() => { arenaTransportRef.current = null; setArenaSetup(null); }}
          /></Suspense>
        </div>
      )}
      {screen === 'deploying' && deployInfo && <DeployScreen info={deployInfo} />}
      {screen === 'playing' && (
        <Suspense fallback={<ScreenFallback />}><GameView
          seed={seedRef.current}
          mods={modsRef.current}
          progress={progRef.current}
          heroKind={heroRef.current}
          heroRoster={rosterRef.current}
          heroProgress={heroProgRef.current}
          runEffects={effectsRef.current}
          heroEquip={heroEquipRef.current}
          setEffects={setEffectsRef.current}
          heroAbilityKits={heroAbilityKitsRef.current}
          mode={modeRef.current}
          stage={stageRef.current ?? undefined}
          difficulty={difficultyRef.current}
          doctrine={doctrineRef.current}
          threat={threatRef.current}
          daily={modeRef.current === 'daily' && dailyPlanRef.current
            ? { modifierIds: dailyPlanRef.current.modifierIds, towerPool: dailyPlanRef.current.towerPool, megaBoss: dailyPlanRef.current.megaBoss }
            : undefined}
          mulliganOverride={dailyMulligansRef.current ?? undefined}
          onEnd={handleEnd}
          onAbandon={handleAbandon}
        /></Suspense>
      )}
      {screen === 'results' && last && (
        <Suspense fallback={<ScreenFallback />}><Results result={last.result} outcome={last.outcome} powerBefore={last.powerBefore} paused={!!heroSlotUnlock || !!evoUnlock} onContinue={afterResults} onReplay={roulette ? afterResults : replayRun} onNext={!roulette && nextStageOpen ? startNextStage : undefined} nextBoons={nextBoons} nextAccent={nextEvent?.accent} /></Suspense>
      )}
      {screen === 'tutorial' && <Suspense fallback={<ScreenFallback />}><TutorialRunner onExit={toMenu} /></Suspense>}
      {/* Replay Theater — a full-screen overlay; never mounts over a LIVE run (the daily
          screen and shared links are menu-side surfaces, but guard it anyway). */}
      {spectate && screen !== 'playing' && (
        <Suspense fallback={<ScreenFallback />}><SpectateView record={spectate} onExit={() => { setSpectate(null); clearReplayParam(); }} /></Suspense>
      )}
      {introActive && (
        <InitCutscene
          onDone={(dived) => {
            setIntroActive(false);
            if (dived) setAfterglow(true);
            // The film ran the 'cinema' score; hand the baton to the screen it lands on (the
            // tutorial's combat bed on first boot, the menu theme on a Settings replay).
            music.play(screen === 'tutorial' ? 'combat' : 'menu');
          }}
        />
      )}
      {afterglow && <div className="intro-afterglow" aria-hidden />}
      {/* Story premieres — first mega defeats, played in order after the reward summary
          (docs/CUTSCENES.md §autoplay). Fullscreen over whatever the run exits into. */}
      {!introActive && cutsceneQueue.length > 0 && cutsceneDef(cutsceneQueue[0]) && (
        <Suspense fallback={null}><CutscenePlayer
          key={cutsceneQueue[0]}
          def={cutsceneDef(cutsceneQueue[0])!}
          onDone={() => {
            setCutsceneQueue((q) => {
              const rest = q.slice(1);
              if (rest.length === 0) music.play('menu'); // the film ran 'cinema'; hand back the hall theme
              return rest;
            });
          }}
        /></Suspense>
      )}
      <UpdateToast />
      {screen === 'roulette' && roulette && (
        <Suspense fallback={<ScreenFallback />}><BioRoulette
          spores={roulette.spores}
          onExit={() => {
            const from = roulette.from;
            setRoulette(null);
            setScreen('menu');
            // A Vault-launched session lands back in the Vault (the Hub mounts next tick).
            if (from === 'vault') setTimeout(() => navBus.go('vault'), 50);
          }}
        /></Suspense>
      )}
      {/* Hero Slot Unlock — the biggest milestone; shows first, over Results. Dismiss → reveals the
          Evolution Unlock beneath it (if this run also raised the Star Cap). */}
      {screen === 'results' && heroSlotUnlock && (
        <Suspense fallback={null}><HeroSlotUnlock unlock={heroSlotUnlock} onClose={() => setHeroSlotUnlock(null)} /></Suspense>
      )}
      {/* Evolution Unlock sequence — dramatic, over the Results screen; dismiss → continue to Results. */}
      {screen === 'results' && !heroSlotUnlock && evoUnlock && (
        <Suspense fallback={null}><EvolutionUnlock unlock={evoUnlock} onClose={() => setEvoUnlock(null)} /></Suspense>
      )}
      {debugOn && <Suspense fallback={null}><DebugPanel /></Suspense>}
      {/* Off-menu, run-end milestones are shown inline on Results — suppress the floating toast so
          it never overlaps the summary. On the hub (e.g. a star-buy unlock) it toasts as usual. */}
      <AchievementToaster />
      {/* Claim receipts (docs/NOTIFICATIONS.md §claim-popups) — hub claims only, so the
          popup can never cover a live run. Held while an unlock announcement is up: the
          post-run placards (achievements…) land AFTER the What's New card/summary, collapsed. */}
      {menuIdle && <RewardToaster held={meta.whatsNew().length > 0} />}
      {menuIdle && <PowerToaster />}
      {/* Account level-ups earned off-run (star buys, molts …) celebrate here; run-settle level-ups
          render inline on Results instead, so the toaster only drains on the menu — and waits
          behind an unlock announcement exactly like the reward placards (same `held` gate). */}
      {menuIdle && <AccountLevelToast held={meta.whatsNew().length > 0} />}
      {/* Genome Rank promotions (docs/GENOME-RANK.md) — the full-screen ceremony, menu only. */}
      {menuIdle && <GenomePromotionCinematic />}
      {/* Loot-fill toast — bio-container earned on the live meter; queued, never interrupts play. */}
      <LootToaster />
      {/* Onboarding + discovery (menu only): the HUD Tour runs once after the tutorial, then the
          "What's New?" queue announces each newly-unlocked mechanic. */}
      {menuIdle && tourActive && <Suspense fallback={null}><HudTour onClose={() => setTourActive(false)} /></Suspense>}
      {/* Guided Unlock (docs/GUIDED-UNLOCKS.md): "Show me ▸" on a What's New card walks the new
          wing itself — the card queue waits (WhatsNew unmounts) until the walkthrough closes. */}
      {menuIdle && !tourActive && guided && <GuidedUnlock guide={guided} onClose={() => setGuided(null)} />}
      {menuIdle && !tourActive && !guided && <WhatsNew />}
      {menuIdle && !tourActive && !guided && <UpdateBriefing />}
      {/* Commander designation: the FIRST prompt an unnamed save sees on reaching the hub
          (i.e. immediately after the tutorial completes or is skipped). */}
      {menuIdle && !tourActive && <CommanderName />}
      {/* Account platform (docs/ACCOUNTS.md): first-launch choice + the sync engine's
          conflict resolution — the modal can surface during ANY screen (a push can 409). */}
      {menuIdle && <WelcomeGate />}
      <ConflictModal />
      {/* Game Action Security Layer feedback (docs/SECURITY.md §feedback) — the one visible
          surface of the guard engine: a throttled "hold on" pulse when an action is blocked. */}
      <SecurityPulse />
    </div>
  );
}
