import { useCallback, useEffect, useRef, useState } from 'react';
import { MainMenu } from './MainMenu';
import { audio } from '../audio/audio';
import { GameView } from './GameView';
import { Results } from './Results';
import { DebugPanel } from './DebugPanel';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import { heroSelect } from '../state/heroStore';
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
    // A stage replays identically from its own seed; other modes get a fresh seed.
    seedRef.current = config.stage
      ? config.stage.seed
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    modsRef.current = metaModifiers(meta.get());
    configRef.current = { ...config, heroId: heroSelect.get() }; // fold in the chosen hero
    audio.unlock();
    audio.play('confirm');
    setScreen('playing');
  }, []);

  const handleEnd = useCallback((result: RunResult) => {
    const reward = meta.recordRun(result);
    setLast({ result, reward });
    setScreen('results');
  }, []);

  const toMenu = useCallback(() => setScreen('menu'), []);

  // Web Audio needs a user gesture to start — unlock on the first interaction, once.
  useEffect(() => {
    const unlock = (): void => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // The menu/results sit on the calm bed; the in-run AudioDriver drives prep/combat.
  useEffect(() => {
    if (screen !== 'playing') audio.setScene('menu');
  }, [screen]);

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
