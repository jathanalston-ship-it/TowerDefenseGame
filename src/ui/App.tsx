import { useCallback, useEffect, useRef, useState } from 'react';
import { MainMenu } from './MainMenu';
import { audio } from '../audio/audio';
import { GameView } from './GameView';
import { Results } from './Results';
import { LootScreen } from './LootScreen';
import { DebugPanel } from './DebugPanel';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import { heroSelect } from '../state/heroStore';
import type { RunResult, RunReward } from '../state/meta';
import type { GameConfig } from '../core/game';
import type { MetaModifiers } from '../core/types';

type Screen = 'menu' | 'playing' | 'results' | 'loot';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  const [last, setLast] = useState<{ result: RunResult; reward: RunReward; lootEarned: Record<string, number> } | null>(null);
  const seedRef = useRef(0);
  const modsRef = useRef<MetaModifiers>(metaModifiers(meta.get()));
  const configRef = useRef<GameConfig>({ mode: 'classic' });
  // Snapshot lifetime earned-per-type at run start so the Results screen can show the
  // Bio-Containers EARNED this run (they bank live during the run; never auto-opened).
  const lootBaselineRef = useRef<Record<string, number>>({});

  const startRun = useCallback((config: GameConfig = { mode: 'classic' }) => {
    // A stage replays identically from its own seed; other modes get a fresh seed.
    seedRef.current = config.stage
      ? config.stage.seed
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    modsRef.current = metaModifiers(meta.get());
    configRef.current = { ...config, heroId: heroSelect.get() }; // fold in the chosen hero
    lootBaselineRef.current = { ...meta.get().boxesEarned };
    audio.unlock();
    audio.play('confirm');
    setScreen('playing');
  }, []);

  const handleEnd = useCallback((result: RunResult) => {
    const reward = meta.recordRun(result);
    // Diff lifetime earned-per-type vs the run-start baseline → earned THIS run.
    const base = lootBaselineRef.current;
    const now = meta.get().boxesEarned;
    const lootEarned: Record<string, number> = {};
    for (const id of Object.keys(now)) {
      const d = (now[id] ?? 0) - (base[id] ?? 0);
      if (d > 0) lootEarned[id] = d;
    }
    setLast({ result, reward, lootEarned });
    setScreen('results');
  }, []);

  const toMenu = useCallback(() => setScreen('menu'), []);
  const toLoot = useCallback(() => setScreen('loot'), []);

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
      {screen === 'menu' && <MainMenu onStart={startRun} onOpenLoot={toLoot} />}
      {screen === 'playing' && (
        <GameView seed={seedRef.current} mods={modsRef.current} config={configRef.current} onEnd={handleEnd} />
      )}
      {screen === 'results' && last && (
        <Results result={last.result} reward={last.reward} lootEarned={last.lootEarned} onContinue={toMenu} onOpenLoot={toLoot} />
      )}
      {screen === 'loot' && <LootScreen onBack={toMenu} />}
      {debugOn && <DebugPanel />}
    </div>
  );
}
