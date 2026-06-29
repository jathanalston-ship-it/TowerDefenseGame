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

type Screen = 'menu' | 'playing' | 'results';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  const [last, setLast] = useState<{ result: RunResult; outcome: RunOutcome } | null>(null);
  const seedRef = useRef(0);
  const modsRef = useRef<MetaModifiers>(metaModifiers(meta.get()));
  const progRef = useRef<TowerProgress>(meta.towerProgress());
  const heroRef = useRef<HeroKind>(meta.selectedHero());
  const heroProgRef = useRef<HeroProgress>(meta.heroProgress());
  const effectsRef = useRef<CardEffect[]>([]);
  const modeRef = useRef<RunMode>('stage');
  // Run setup the player picks on the Play screen (uncontrolled → read at run start). Defaults are
  // identity ('standard' / 'none'), so an untouched menu plays exactly the baseline run.
  const difficultyRef = useRef('standard');
  const doctrineRef = useRef('none');

  // Apply the persisted audio preference once on boot (the Settings screen writes it).
  useEffect(() => {
    try { audio.setEnabled(localStorage.getItem('audioOn') !== 'false'); } catch { /* private mode */ }
  }, []);

  const begin = useCallback((mode: RunMode) => {
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    // Snapshot permanent progression + hero choice + equipped loadout at run start
    // (the run stays deterministic from this snapshot).
    modsRef.current = metaModifiers(meta.get());
    progRef.current = meta.towerProgress();
    heroRef.current = meta.selectedHero();
    heroProgRef.current = meta.heroProgress();
    // Equipped loadout + any unlocked collection completion bonuses (both fold in at start).
    effectsRef.current = [...meta.loadoutEffects(), ...meta.collectionRunEffects()];
    modeRef.current = mode;
    setScreen('playing');
  }, []);
  const startRun = useCallback(() => begin('stage'), [begin]);
  const startEndless = useCallback(() => begin('endless'), [begin]);

  const handleEnd = useCallback((result: RunResult) => {
    const outcome = meta.finishRun(result);
    setLast({ result, outcome });
    setScreen('results');
  }, []);

  // Abandon: forfeit ALL rewards and go straight to the menu — NO finishRun, and roll back the
  // run's live-banked loot. The deliberate opposite of handleEnd.
  const handleAbandon = useCallback(() => {
    meta.abandonRun();
    setScreen('menu');
  }, []);

  const toMenu = useCallback(() => setScreen('menu'), []);

  const debugOn = isDebugEnabled();

  return (
    <div className="app">
      {screen === 'menu' && (
        <Hub
          onStart={startRun}
          onStartEndless={startEndless}
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
          heroProgress={heroProgRef.current}
          runEffects={effectsRef.current}
          mode={modeRef.current}
          difficulty={difficultyRef.current}
          doctrine={doctrineRef.current}
          onEnd={handleEnd}
          onAbandon={handleAbandon}
        />
      )}
      {screen === 'results' && last && (
        <Results result={last.result} outcome={last.outcome} onContinue={toMenu} />
      )}
      {debugOn && <DebugPanel />}
      {/* Off-menu, run-end milestones are shown inline on Results — suppress the floating toast so
          it never overlaps the summary. On the hub (e.g. a star-buy unlock) it toasts as usual. */}
      <AchievementToaster suppressed={screen !== 'menu'} />
    </div>
  );
}
