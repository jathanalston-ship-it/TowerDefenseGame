import { useCallback, useRef, useState } from 'react';
import { MainMenu } from './MainMenu';
import { GameView } from './GameView';
import { Results } from './Results';
import { meta, metaModifiers } from '../state/meta';
import type { RunResult, RunReward } from '../state/meta';
import type { MetaModifiers } from '../core/types';

type Screen = 'menu' | 'playing' | 'results';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  const [last, setLast] = useState<{ result: RunResult; reward: RunReward } | null>(null);
  const seedRef = useRef(0);
  const modsRef = useRef<MetaModifiers>(metaModifiers(meta.get()));

  const startRun = useCallback(() => {
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    modsRef.current = metaModifiers(meta.get());
    setScreen('playing');
  }, []);

  const handleEnd = useCallback((result: RunResult) => {
    const reward = meta.recordRun(result);
    setLast({ result, reward });
    setScreen('results');
  }, []);

  const toMenu = useCallback(() => setScreen('menu'), []);

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu onStart={startRun} />}
      {screen === 'playing' && (
        <GameView seed={seedRef.current} mods={modsRef.current} onEnd={handleEnd} />
      )}
      {screen === 'results' && last && (
        <Results result={last.result} reward={last.reward} onContinue={toMenu} />
      )}
    </div>
  );
}
