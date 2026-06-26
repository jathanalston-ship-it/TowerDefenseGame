import { useCallback, useRef, useState } from 'react';
import { MainMenu } from './MainMenu';
import { GameView } from './GameView';
import { Results } from './Results';
import { DebugPanel } from './DebugPanel';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
import type { HeroKind, HeroProgress, MetaModifiers, TowerProgress } from '../core/types';

type Screen = 'menu' | 'playing' | 'results';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  const [last, setLast] = useState<{ result: RunResult; outcome: RunOutcome } | null>(null);
  const seedRef = useRef(0);
  const modsRef = useRef<MetaModifiers>(metaModifiers(meta.get()));
  const progRef = useRef<TowerProgress>(meta.towerProgress());
  const heroRef = useRef<HeroKind>(meta.selectedHero());
  const heroProgRef = useRef<HeroProgress>(meta.heroProgress());

  const startRun = useCallback(() => {
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    // Snapshot permanent progression + hero choice at run start (run stays deterministic).
    modsRef.current = metaModifiers(meta.get());
    progRef.current = meta.towerProgress();
    heroRef.current = meta.selectedHero();
    heroProgRef.current = meta.heroProgress();
    setScreen('playing');
  }, []);

  const handleEnd = useCallback((result: RunResult) => {
    const outcome = meta.finishRun(result);
    setLast({ result, outcome });
    setScreen('results');
  }, []);

  const toMenu = useCallback(() => setScreen('menu'), []);

  const debugOn = isDebugEnabled();

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu onStart={startRun} />}
      {screen === 'playing' && (
        <GameView
          seed={seedRef.current}
          mods={modsRef.current}
          progress={progRef.current}
          heroKind={heroRef.current}
          heroProgress={heroProgRef.current}
          onEnd={handleEnd}
        />
      )}
      {screen === 'results' && last && (
        <Results result={last.result} outcome={last.outcome} onContinue={toMenu} />
      )}
      {debugOn && <DebugPanel />}
    </div>
  );
}
