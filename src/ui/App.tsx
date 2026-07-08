import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Hub } from './Hub';
import { resumePendingClaims } from '../net/checkout';
import { initEvents, trackEvent } from '../net/events';
import { GameView } from './GameView';
import { Results } from './Results';
// Debug tooling is dev/opt-in only (?debug) — lazy-loaded so production players
// never download it and the boot chunk stays lean.
const DebugPanel = lazy(() => import('./DebugPanel').then((m) => ({ default: m.DebugPanel })));
import { AchievementToaster } from './AchievementToaster';
import { PowerToaster } from './components/PowerToaster';
import { LootToaster } from './LootToaster';
import { WhatsNew } from './WhatsNew';
import { CommanderName } from './components/CommanderName';
import { InitCutscene, introSeen } from './InitCutscene';
import { UpdateToast } from './components/UpdateToast';
import { startAutoCloudSync } from '../net/autoSync';
import { HudTour } from './HudTour';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import type { RunOutcome, RunResult } from '../state/meta';
import type { HeroKind, HeroProgress, MetaModifiers, TowerProgress } from '../core/types';
import type { CardEffect } from '../core/cards';
import type { RunMode } from '../core/game';
import type { ResolvedHeroKit } from '../core/config';
import { generateStage, recommendedPowerScore } from '../core/campaign';
import { resolveCampaignBoon } from '../core/campaignEvents';
import type { StageConfig } from '../core/campaign';
import { formatPower } from '../core/power';
import { EvolutionUnlock } from './EvolutionUnlock';
import type { EvolutionUnlockData } from './EvolutionUnlock';
import { HeroSlotUnlock } from './HeroSlotUnlock';
import type { HeroSlotUnlockData } from './HeroSlotUnlock';
import { difficultyPref, musicPref, sfxPref } from '../state/prefs';
import { BioRoulette } from './BioRoulette';
import { isBossRushUnlocked, isDailyUnlocked, isInfiniteUnlocked } from '../save/derive';
import { dailyKey, generateDaily, pickDailyHero } from '../core/daily';
import type { DailyPlan } from '../core/daily';
import { HERO_ORDER } from '../core/config';
import { sporesFromParts } from '../state/bioRoulette';
import { tutorial } from '../state/tutorial';
import { TutorialRunner } from './TutorialRunner';
import { DeployScreen } from './DeployScreen';
import type { DeployInfo } from './DeployScreen';
import { DIFFICULTIES } from '../core/difficulty';

type Screen = 'menu' | 'deploying' | 'playing' | 'results' | 'tutorial' | 'roulette';

/** How long the deployment interstitial breathes before the battlefield mounts. */
const DEPLOY_MS = 1600;

export function App(): JSX.Element {
  // First launch / after an Account Reset → open straight into the Combat Tutorial (its own mode).
  const [screen, setScreen] = useState<Screen>(() => (meta.shouldAutoTutorial() ? 'tutorial' : 'menu'));
  // The cold-open cinematic: first boot on this device (before even the tutorial),
  // replayable from Settings → Help. Overlays whatever screen is behind it.
  const [introActive, setIntroActive] = useState(() => !introSeen());
  const [last, setLast] = useState<{ result: RunResult; outcome: RunOutcome } | null>(null);
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
  // Run setup the player picks on the Play screen (uncontrolled → read at run start). Defaults are
  // identity ('standard' / 'none'), so an untouched menu plays exactly the baseline run.
  const difficultyRef = useRef('standard');
  const doctrineRef = useRef('none');

  // Apply the persisted audio preferences once on boot (Settings + the pause menu write them).
  useEffect(() => {
    audio.setEnabled(sfxPref());
    music.setEnabled(musicPref());
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
  // Prime the Help archive once so existing saves don't flood with "What's New" on first load.
  useEffect(() => { meta.primeHelp(); }, []);
  meta.use(); // subscribe App so the HUD Tour / What's New react to save changes (unlocks, tour completion)

  const [deployInfo, setDeployInfo] = useState<DeployInfo | null>(null);
  // Bio-Roulette (docs/BOSS-RUSH.md §roulette): spores earned by the LAST settled rush run —
  // Results routes through the ceremony while this is pending; its exit clears it.
  const [roulette, setRoulette] = useState<{ spores: number } | null>(null);
  const begin = useCallback((mode: RunMode, stage: StageConfig | null = null, extraRunEffects: CardEffect[] = []) => {
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    // Snapshot permanent progression + hero choice + equipped loadout at run start
    // (the run stays deterministic from this snapshot).
    modsRef.current = metaModifiers(meta.get());
    progRef.current = meta.towerProgress();
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
    effectsRef.current = [...meta.genomeRunEffects(), ...meta.collectionRunEffects(), ...extraRunEffects];
    modeRef.current = mode;
    stageRef.current = stage;
    // The deployment interstitial (docs/HUD.md §deploy): a short mode-aware breath instead of
    // being thrown straight onto the battlefield. The playing screen mounts after DEPLOY_MS.
    const diffName = DIFFICULTIES[difficultyRef.current]?.name ?? 'Standard';
    // Readiness surfacing (BALANCE_REPORT push-futility): an under-powered frontier attempt is
    // allowed — informed risk — but the briefing says so out loud before the wall does.
    const campaignWarn = (): string | undefined => {
      const rec = recommendedPowerScore(campaignStageRef.current, difficultyRef.current);
      const power = meta.power().score;
      return power < rec ? `⚠ Below recommended Power — ${formatPower(power)} of ${formatPower(rec)}. Expect a wall; failed attempts still recover field data.` : undefined;
    };
    setDeployInfo(
      mode === 'campaign' && stage
        ? { title: `STAGE ${campaignStageRef.current} — ${stage.biome.name.toUpperCase()}`, sub: `The Descent · ${diffName}`, accent: stage.biome.accent, warn: campaignWarn() }
        : mode === 'endless'
          ? { title: 'INFINITE MODE', sub: `AI Director · infinite depth · ${diffName}`, accent: 'var(--viral, #c98bff)' }
          : mode === 'bossRush'
            ? { title: 'BOSS RUSH', sub: `The gauntlet · wave N = N bosses · ${diffName}`, accent: 'var(--danger, #ff5d73)' }
            : mode === 'daily' && stage
              ? { title: `DAILY RUN — ${stage.biome.name.toUpperCase()}`, sub: 'One seed · one world · 20 waves', accent: stage.biome.accent }
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
  }, [begin]);

  const handleEnd = useCallback((result: RunResult) => {
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
    const outcome = meta.finishRun(result);
    // Bio-Roulette spores (docs/BOSS-RUSH.md §roulette): record delta + volume, from the parts
    // finishRun just computed. Zero spores ⇒ no ceremony (Results exits straight to the menu).
    if (outcome.rushProgress) {
      const spores = sporesFromParts(outcome.rushProgress.newRecordBosses, outcome.rushProgress.bossKills);
      setRoulette(spores > 0 ? { spores } : null);
    } else {
      setRoulette(null);
    }
    setLast({ result, outcome });
    // Crossed Campaign milestones play their cinematics over Results. Hero Slot is the bigger
    // milestone → it shows first; the Evolution Unlock follows once it's dismissed.
    setHeroSlotUnlock(outcome.heroSlotUnlock ?? null);
    setEvoUnlock(outcome.evolutionUnlock ?? null);
    setScreen('results');
  }, []);

  // Abandon: forfeit ALL rewards and go straight to the menu — NO finishRun, and roll back the
  // run's live-banked loot. The deliberate opposite of handleEnd.
  const handleAbandon = useCallback(() => {
    meta.abandonRun();
    setScreen('menu');
  }, []);

  const toMenu = useCallback(() => setScreen('menu'), []);
  // While a roulette is pending, EVERY Results exit passes through the ceremony (rewards are
  // collected there — even Skip collects; nothing earned is ever lost).
  const afterResults = useCallback(() => setScreen(roulette ? 'roulette' : 'menu'), [roulette]);
  // One-tap "Infect Again" from Results — re-run the SAME mode without a menu round-trip. The run
  // re-snapshots the now-updated save (begin() reads meta fresh), so the replay uses the progression
  // just earned. Campaign replays the same host stage; the map is where you advance to the next.
  const replayRun = useCallback(() => {
    if (modeRef.current === 'endless') startEndless();
    else if (modeRef.current === 'bossRush') startBossRush();
    else if (modeRef.current === 'campaign') startCampaign(campaignStageRef.current);
    else if (modeRef.current === 'daily') startDaily(); // same UTC day ⇒ the same plan (reward stays once/day)
    else startRun();
  }, [startEndless, startBossRush, startCampaign, startDaily, startRun]);
  // Clear the last-run recap once the Home screen has shown it (so it doesn't re-appear).
  const clearLast = useCallback(() => setLast(null), []);
  // First-launch HUD Tour: latch it ON when eligible (after the tutorial, on the menu). Latched
  // (not the reactive predicate) so its reward reveal survives completeHudTour marking it done.
  useEffect(() => { if (screen === 'menu' && meta.shouldHudTour()) setTourActive(true); }, [screen]);
  // Launch (or replay) the Combat Tutorial from Settings — its own mode.
  const launchTutorial = useCallback(() => { tutorial.start('combat'); setScreen('tutorial'); }, []);

  const debugOn = isDebugEnabled();

  // Purchase recovery (docs/DEPLOYMENT.md §purchases): claim any Stripe return /
  // interrupted checkout exactly once on boot, then surface the outcome. Sandbox
  // builds and sessions with nothing pending resolve to 'none' with zero network.
  const [purchaseNote, setPurchaseNote] = useState<string | null>(null);
  useEffect(() => {
    initEvents(); // privacy-friendly aggregate counters (docs/WEBSITE.md §analytics)
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
    if (screen === 'playing') trackEvent('run_start');
    if (screen === 'results') trackEvent('run_end');
  }, [screen]);

  useEffect(() => {
    if (screen !== 'menu') return;
    startAutoCloudSync(); // named accounts mirror to the cloud quietly (net/autoSync.ts)
    const start = (): void => music.play('menu');
    start(); // no-op until the AudioContext may run…
    window.addEventListener('pointerdown', start, { once: true }); // …then the first click unlocks it
    return () => window.removeEventListener('pointerdown', start);
  }, [screen]);

  return (
    <div className="app">
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
          onReplayTour={() => setTourActive(true)}
          onReplayIntro={() => setIntroActive(true)}
          difficultyRef={difficultyRef}
          doctrineRef={doctrineRef}
        />
      )}
      {screen === 'deploying' && deployInfo && <DeployScreen info={deployInfo} />}
      {screen === 'playing' && (
        <GameView
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
          daily={modeRef.current === 'daily' && dailyPlanRef.current
            ? { modifierIds: dailyPlanRef.current.modifierIds, towerPool: dailyPlanRef.current.towerPool, megaBoss: dailyPlanRef.current.megaBoss }
            : undefined}
          onEnd={handleEnd}
          onAbandon={handleAbandon}
        />
      )}
      {screen === 'results' && last && (
        <Results result={last.result} outcome={last.outcome} onContinue={afterResults} onReplay={roulette ? afterResults : replayRun} />
      )}
      {screen === 'tutorial' && <TutorialRunner onExit={toMenu} />}
      {introActive && <InitCutscene onDone={() => setIntroActive(false)} />}
      <UpdateToast />
      {screen === 'roulette' && roulette && (
        <BioRoulette spores={roulette.spores} onExit={() => { setRoulette(null); setScreen('menu'); }} />
      )}
      {/* Hero Slot Unlock — the biggest milestone; shows first, over Results. Dismiss → reveals the
          Evolution Unlock beneath it (if this run also raised the Star Cap). */}
      {screen === 'results' && heroSlotUnlock && (
        <HeroSlotUnlock unlock={heroSlotUnlock} onClose={() => setHeroSlotUnlock(null)} />
      )}
      {/* Evolution Unlock sequence — dramatic, over the Results screen; dismiss → continue to Results. */}
      {screen === 'results' && !heroSlotUnlock && evoUnlock && (
        <EvolutionUnlock unlock={evoUnlock} onClose={() => setEvoUnlock(null)} />
      )}
      {debugOn && <Suspense fallback={null}><DebugPanel /></Suspense>}
      {/* Off-menu, run-end milestones are shown inline on Results — suppress the floating toast so
          it never overlaps the summary. On the hub (e.g. a star-buy unlock) it toasts as usual. */}
      <AchievementToaster suppressed={screen !== 'menu'} />
      {screen === 'menu' && <PowerToaster />}
      {/* Loot-fill toast — bio-container earned on the live meter; queued, never interrupts play. */}
      <LootToaster />
      {/* Onboarding + discovery (menu only): the HUD Tour runs once after the tutorial, then the
          "What's New?" queue announces each newly-unlocked mechanic. */}
      {screen === 'menu' && tourActive && <HudTour onClose={() => setTourActive(false)} />}
      {screen === 'menu' && !tourActive && <WhatsNew />}
      {/* Commander designation: the FIRST prompt an unnamed save sees on reaching the hub
          (i.e. immediately after the tutorial completes or is skipped). */}
      {screen === 'menu' && !tourActive && <CommanderName />}
    </div>
  );
}
