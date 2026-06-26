import { useCallback, useRef, useState } from 'react';
import { MainMenu } from './MainMenu';
import { GameView } from './GameView';
import { Results } from './Results';
import { DebugPanel } from './DebugPanel';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import type { RunResult, RunReward } from '../state/meta';
import type { GameConfig } from '../core/game';
import type { MetaModifiers } from '../core/types';

type Screen = 'menu' | 'playing' | 'results';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  const [last, setLast] = useState<{ result: RunResult; reward: RunReward } | null>(null);
  const seedRef = useRef(0);
  const modsRef = useRef<MetaModifiers>(metaModifiers(meta.get()));
  const configRef = useRef<GameConfig>({ mode: 'classic' });

  const startRun = useCallback((config: GameConfig = { mode: 'classic' }) => {
    seedRef.current = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    modsRef.current = metaModifiers(meta.get());
    configRef.current = config;
    setScreen('playing');
  }, []);

  const handleEnd = useCallback((result: RunResult) => {
    const reward = meta.recordRun(result);
    setLast({ result, reward });
    setScreen('results');
  }, []);

  const toMenu = useCallback(() => setScreen('menu'), []);

  const debugOn = isDebugEnabled();

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu onStart={startRun} />}
      {screen === 'playing' && (
        <GameView seed={seedRef.current} mods={modsRef.current} config={configRef.current} onEnd={handleEnd} />
      )}
      {screen === 'results' && last && (
        <Results result={last.result} reward={last.reward} onContinue={toMenu} />
      )}
      {debugOn && <DebugPanel />}
    </div>
  );
}
