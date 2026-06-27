import { useCallback, useRef, useState } from 'react';
import { MainMenu } from './MainMenu';
import { GameView } from './GameView';
import { Results } from './Results';
import { DebugPanel } from './DebugPanel';
import { CollectionPanel } from './CollectionPanel';
import { AchievementToaster } from './AchievementToaster';
import { isDebugEnabled } from '../debug/debug';
import { meta, metaModifiers } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
import type { HeroKind, HeroProgress, MetaModifiers, TowerProgress } from '../core/types';
import type { CardEffect } from '../core/cards';
import type { RunMode } from '../core/game';

type Screen = 'menu' | 'playing' | 'results';

export function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('menu');
  const [showCodex, setShowCodex] = useState(false);
  const [last, setLast] = useState<{ result: RunResult; outcome: RunOutcome } | null>(null);
  const seedRef = useRef(0);
  const modsRef = useRef<MetaModifiers>(metaModifiers(meta.get()));
  const progRef = useRef<TowerProgress>(meta.towerProgress());
  const heroRef = useRef<HeroKind>(meta.selectedHero());
  const heroProgRef = useRef<HeroProgress>(meta.heroProgress());
  const effectsRef = useRef<CardEffect[]>([]);
  const modeRef = useRef<RunMode>('stage');

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

  const toMenu = useCallback(() => setScreen('menu'), []);

  const debugOn = isDebugEnabled();

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu onStart={startRun} onStartEndless={startEndless} />}
      {screen === 'menu' && (
        <button
          onClick={() => setShowCodex(true)}
          style={{
            position: 'fixed', bottom: 18, left: 18, zIndex: 20,
            padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(14,22,34,0.85)', color: '#cfe0f2',
            border: '1px solid rgba(120,170,230,0.28)', letterSpacing: '0.08em',
          }}
        >
          ▤ CODEX
        </button>
      )}
      {showCodex && <CollectionPanel onClose={() => setShowCodex(false)} />}
      {screen === 'playing' && (
        <GameView
          seed={seedRef.current}
          mods={modsRef.current}
          progress={progRef.current}
          heroKind={heroRef.current}
          heroProgress={heroProgRef.current}
          runEffects={effectsRef.current}
          mode={modeRef.current}
          onEnd={handleEnd}
        />
      )}
      {screen === 'results' && last && (
        <Results result={last.result} outcome={last.outcome} onContinue={toMenu} />
      )}
      {debugOn && <DebugPanel />}
      <AchievementToaster />
    </div>
  );
}
