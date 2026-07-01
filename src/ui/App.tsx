import { useCallback, useEffect, useRef, useState } from 'react';
import { Hub } from './Hub';
import { GameView } from './GameView';
import { Results } from './Results';
import { DebugPanel } from './DebugPanel';
import { AchievementToaster } from './AchievementToaster';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import { audio } from '../audio/sound';
import type { RunOutcome, RunResult } from '../state/meta';
import type { HeroKind, HeroProgress, MetaModifiers, TowerProgress } from '../core/types';
import type { CardEffect } from '../core/cards';
import type { RunMode } from '../core/game';
import { generateStage } from '../core/campaign';
import type { StageConfig } from '../core/campaign';
import { EvolutionUnlock } from './EvolutionUnlock';
import type { EvolutionUnlockData } from './EvolutionUnlock';

type Screen = 'menu' | 'playing' | 'results';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  const [last, setLast] = useState<{ result: RunResult; outcome: RunOutcome } | null>(null);
  // A Campaign milestone that raised the Star Cap this run → the Evolution Unlock sequence (over Results).
  const [evoUnlock, setEvoUnlock] = useState<EvolutionUnlockData | null>(null);
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
    try { audio.setEnabled(localStorage.getItem('audioOn') !== 'false'); } catch { /* private mode */ }
  }, []);

  const begin = useCallback((mode: RunMode, stage: StageConfig | null = null) => {
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    // Snapshot permanent progression + hero choice + equipped loadout at run start
    // (the run stays deterministic from this snapshot).
    modsRef.current = metaModifiers(meta.get());
    progRef.current = meta.towerProgress();
    heroRef.current = meta.selectedHero();
    rosterRef.current = meta.fieldedLoadout();
    heroProgRef.current = meta.heroProgress();
    // Per-hero equipment folds in per hero (never overwrites another's loadout); collection
    // completion bonuses stay battlefield-global run effects.
    heroEquipRef.current = meta.heroRosterEquip();
    effectsRef.current = [...meta.collectionRunEffects()];
    modeRef.current = mode;
    stageRef.current = stage;
    setScreen('playing');
  }, []);
  const startRun = useCallback(() => begin('stage'), [begin]);
  const startEndless = useCallback(() => begin('endless'), [begin]);
  // Campaign: generate the chosen stage deterministically from (stage #, difficulty) and play it.
  const startCampaign = useCallback((stage: number) => {
    campaignStageRef.current = stage;
    begin('campaign', generateStage(stage, difficultyRef.current));
  }, [begin]);

  const handleEnd = useCallback((result: RunResult) => {
    // Campaign: tag the result so finishRun unlocks the next stage + scales the rewards.
    if (modeRef.current === 'campaign') {
      result.campaignStage = campaignStageRef.current;
      result.difficulty = difficultyRef.current;
      result.rewardMult = stageRef.current?.rewardMult;
    }
    const outcome = meta.finishRun(result);
    setLast({ result, outcome });
    // A crossed Campaign milestone plays the Evolution Unlock sequence over the Results screen.
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
  // Clear the last-run recap once the Home screen has shown it (so it doesn't re-appear).
  const clearLast = useCallback(() => setLast(null), []);

  const debugOn = isDebugEnabled();

  return (
    <div className="app">
      {screen === 'menu' && (
        <Hub
          onStart={startRun}
          onStartEndless={startEndless}
          onStartCampaign={startCampaign}
          last={last}
          onSeenLast={clearLast}
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
        <Results result={last.result} outcome={last.outcome} onContinue={toMenu} />
      )}
      {/* Evolution Unlock sequence — dramatic, over the Results screen; dismiss → continue to Results. */}
      {screen === 'results' && evoUnlock && (
        <EvolutionUnlock unlock={evoUnlock} onClose={() => setEvoUnlock(null)} />
      )}
      {debugOn && <DebugPanel />}
      {/* Off-menu, run-end milestones are shown inline on Results — suppress the floating toast so
          it never overlaps the summary. On the hub (e.g. a star-buy unlock) it toasts as usual. */}
      <AchievementToaster suppressed={screen !== 'menu'} />
    </div>
  );
}
