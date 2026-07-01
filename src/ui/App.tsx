import { useCallback, useEffect, useRef, useState } from 'react';
import { Hub } from './Hub';
import { GameView } from './GameView';
import { Results } from './Results';
import { DebugPanel } from './DebugPanel';
import { AchievementToaster } from './AchievementToaster';
import { PowerToaster } from './components/PowerToaster';
import { LootToaster } from './LootToaster';
import { WhatsNew } from './WhatsNew';
import { HudTour } from './HudTour';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import type { RunOutcome, RunResult } from '../state/meta';
import type { HeroKind, HeroProgress, MetaModifiers, TowerProgress } from '../core/types';
import type { CardEffect } from '../core/cards';
import type { RunMode } from '../core/game';
import { generateStage } from '../core/campaign';
import type { StageConfig } from '../core/campaign';
import { EvolutionUnlock } from './EvolutionUnlock';
import type { EvolutionUnlockData } from './EvolutionUnlock';
import { HeroSlotUnlock } from './HeroSlotUnlock';
import type { HeroSlotUnlockData } from './HeroSlotUnlock';
import { difficultyPref } from '../state/prefs';
import { tutorial } from '../state/tutorial';
import { TutorialRunner } from './TutorialRunner';

type Screen = 'menu' | 'playing' | 'results' | 'tutorial';

export function App(): JSX.Element {
  // First launch / after an Account Reset → open straight into the Combat Tutorial (its own mode).
  const [screen, setScreen] = useState<Screen>(() => (meta.shouldAutoTutorial() ? 'tutorial' : 'menu'));
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
  const modeRef = useRef<RunMode>('stage');
  const stageRef = useRef<StageConfig | null>(null); // campaign: the generated stage being played
  const campaignStageRef = useRef(0); // campaign: the stage number (winning it unlocks the next)
  // Run setup the player picks on the Play screen (uncontrolled → read at run start). Defaults are
  // identity ('standard' / 'none'), so an untouched menu plays exactly the baseline run.
  const difficultyRef = useRef('standard');
  const doctrineRef = useRef('none');

  // Apply the persisted audio preference once on boot (the Settings screen writes it).
  useEffect(() => {
    try {
      const on = localStorage.getItem('audioOn') !== 'false';
      audio.setEnabled(on);
      music.setEnabled(on);
    } catch { /* private mode */ }
  }, []);

  // Boot the tutorial session if this is a first launch (screen was auto-set to 'tutorial').
  useEffect(() => { if (meta.shouldAutoTutorial()) tutorial.start('combat'); }, []);
  // Prime the Help archive once so existing saves don't flood with "What's New" on first load.
  useEffect(() => { meta.primeHelp(); }, []);
  meta.use(); // subscribe App so the HUD Tour / What's New react to save changes (unlocks, tour completion)

  const begin = useCallback((mode: RunMode, stage: StageConfig | null = null) => {
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
    effectsRef.current = [...meta.genomeRunEffects(), ...meta.collectionRunEffects()];
    modeRef.current = mode;
    stageRef.current = stage;
    setScreen('playing');
  }, []);
  const startRun = useCallback(() => begin('stage'), [begin]);
  // Infinite uses its OWN persisted difficulty (chosen inside Infinite, not the Main Menu).
  const startEndless = useCallback(() => {
    difficultyRef.current = difficultyPref('infinite');
    begin('endless');
  }, [begin]);
  // Campaign uses its OWN persisted difficulty; generate the chosen stage deterministically and play it.
  const startCampaign = useCallback((stage: number) => {
    difficultyRef.current = difficultyPref('campaign');
    campaignStageRef.current = stage;
    begin('campaign', generateStage(stage, difficultyRef.current));
  }, [begin]);

  const handleEnd = useCallback((result: RunResult) => {
    // Campaign: tag the result so finishRun unlocks the next stage + scales the rewards.
    if (modeRef.current === 'campaign') {
      result.campaignStage = campaignStageRef.current;
      result.difficulty = difficultyRef.current;
      result.rewardMult = stageRef.current?.rewardMult;
    } else if (modeRef.current === 'endless') {
      result.difficulty = difficultyRef.current; // Infinite's difficulty drives its run-end economy
    }
    const outcome = meta.finishRun(result);
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
  // One-tap "Infect Again" from Results — re-run the SAME mode without a menu round-trip. The run
  // re-snapshots the now-updated save (begin() reads meta fresh), so the replay uses the progression
  // just earned. Campaign replays the same host stage; the map is where you advance to the next.
  const replayRun = useCallback(() => {
    if (modeRef.current === 'endless') startEndless();
    else if (modeRef.current === 'campaign') startCampaign(campaignStageRef.current);
    else startRun();
  }, [startEndless, startCampaign, startRun]);
  // Clear the last-run recap once the Home screen has shown it (so it doesn't re-appear).
  const clearLast = useCallback(() => setLast(null), []);
  // First-launch HUD Tour: latch it ON when eligible (after the tutorial, on the menu). Latched
  // (not the reactive predicate) so its reward reveal survives completeHudTour marking it done.
  useEffect(() => { if (screen === 'menu' && meta.shouldHudTour()) setTourActive(true); }, [screen]);
  // Launch (or replay) the Combat Tutorial from Settings — its own mode.
  const launchTutorial = useCallback(() => { tutorial.start('combat'); setScreen('tutorial'); }, []);

  const debugOn = isDebugEnabled();

  // Menu soundtrack (audio/music.ts): the Hive theme plays across the whole Command Center.
  // Autoplay policy: the FIRST start is armed on the first pointer gesture; category switches
  // afterwards are immediate. GameView drives combat/boss/victory/defeat itself.
  useEffect(() => {
    if (screen !== 'menu') return;
    const start = (): void => music.play('menu');
    start(); // no-op until the AudioContext may run…
    window.addEventListener('pointerdown', start, { once: true }); // …then the first click unlocks it
    return () => window.removeEventListener('pointerdown', start);
  }, [screen]);

  return (
    <div className="app">
      {screen === 'menu' && (
        <Hub
          onStart={startRun}
          onStartEndless={startEndless}
          onStartCampaign={startCampaign}
          last={last}
          onSeenLast={clearLast}
          onReplayTutorial={launchTutorial}
          difficultyRef={difficultyRef}
          doctrineRef={doctrineRef}
        />
      )}
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
          mode={modeRef.current}
          stage={stageRef.current ?? undefined}
          difficulty={difficultyRef.current}
          doctrine={doctrineRef.current}
          onEnd={handleEnd}
          onAbandon={handleAbandon}
        />
      )}
      {screen === 'results' && last && (
        <Results result={last.result} outcome={last.outcome} onContinue={toMenu} onReplay={replayRun} />
      )}
      {screen === 'tutorial' && <TutorialRunner onExit={toMenu} />}
      {/* Hero Slot Unlock — the biggest milestone; shows first, over Results. Dismiss → reveals the
          Evolution Unlock beneath it (if this run also raised the Star Cap). */}
      {screen === 'results' && heroSlotUnlock && (
        <HeroSlotUnlock unlock={heroSlotUnlock} onClose={() => setHeroSlotUnlock(null)} />
      )}
      {/* Evolution Unlock sequence — dramatic, over the Results screen; dismiss → continue to Results. */}
      {screen === 'results' && !heroSlotUnlock && evoUnlock && (
        <EvolutionUnlock unlock={evoUnlock} onClose={() => setEvoUnlock(null)} />
      )}
      {debugOn && <DebugPanel />}
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
    </div>
  );
}
