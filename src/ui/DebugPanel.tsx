import { useReducer, useState, useSyncExternalStore } from 'react';
import { disableDebug, getActiveGame, subscribeActiveGame } from '../debug/debug';
import { meta } from '../state/meta';
import { CARD_POOL } from '../core/cards';
import type { Game } from '../core/game';

export function DebugPanel(): JSX.Element {
  const game = useSyncExternalStore(subscribeActiveGame, getActiveGame, getActiveGame);
  const save = meta.use();
  const [open, setOpen] = useState(true);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [cardId, setCardId] = useState(CARD_POOL[0].id);

  const inRun = game !== null;
  const run = (fn: (g: Game) => void): void => {
    const g = getActiveGame();
    if (g) {
      fn(g);
      force();
    }
  };

  return (
    <div className="debug-panel">
      <div className="debug-head">
        <span className="t">🐛 DEBUG</span>
        <button onClick={() => setOpen((o) => !o)}>{open ? '–' : '+'}</button>
        <button
          title="Disable debug and reload"
          onClick={() => {
            disableDebug();
            location.reload();
          }}
        >
          ✕
        </button>
      </div>

      {open && (
        <div className="debug-body">
          <div className="debug-sec">
            <div className="h">Meta / Save · {save.shards} ◆</div>
            <div className="debug-row">
              <button onClick={() => meta.debugAddShards(100)}>+100 ◆</button>
              <button onClick={() => meta.debugAddShards(1000)}>+1000 ◆</button>
              <button onClick={() => meta.debugMaxUpgrades()}>Max upgrades</button>
            </div>
            <div className="debug-row">
              <button onClick={() => meta.backupNow()}>Backup</button>
              <button
                onClick={() => {
                  if (confirm('Reset save? (a backup is kept)')) meta.reset();
                }}
              >
                Reset save
              </button>
            </div>
            <div className="debug-row">
              <button onClick={() => meta.debugAddLootPoints(150)}>+150 Loot</button>
              <button onClick={() => meta.debugAddLootPoints(800)}>+800 Loot</button>
              <span className="debug-note">
                Filling {save.lootQueue.queue[0]} → next {save.lootQueue.queue[1]}
              </span>
            </div>
          </div>

          <div className="debug-sec">
            <div className="h">Tower progression (meta)</div>
            <div className="debug-row">
              <button onClick={() => meta.debugAddTowerShards(20)}>+20 ✦ each</button>
              <button onClick={() => meta.debugAddMasteryXp(500)}>+500 Mastery XP</button>
              <button onClick={() => meta.debugOpenChest()}>Open chest</button>
              <button onClick={() => meta.debugGrantGear(4)}>Grant gear</button>
              <button onClick={() => meta.debugMaxEvolution()}>Evolve all ★max</button>
            </div>
          </div>

          <div className="debug-sec">
            <div className="h">Mulligans (meta)</div>
            <div className="debug-row">
              <button onClick={() => meta.debugGrantOverflow(50000)}>+50k Gene Overflow</button>
              <button onClick={() => meta.debugDiscoverAllMulligans()}>Discover all modifiers</button>
              <button onClick={() => meta.debugAutoAssembleMulligans()}>Auto-assemble every tower</button>
            </div>
          </div>

          <div className="debug-sec">
            <div className="h">Hero progression (meta)</div>
            <div className="debug-row">
              <button onClick={() => meta.debugAddHeroShards(20)}>+20 ✦ each hero</button>
              <button onClick={() => meta.debugAddHeroMasteryXp(500)}>+500 Hero Mastery</button>
              <button onClick={() => meta.debugUnlockHeroes()}>Unlock heroes</button>
            </div>
          </div>

          <div className="debug-sec">
            <div className="h">Run control {inRun ? '' : '— start a run'}</div>
            <div className="debug-row">
              <button
                className={game?.god ? 'on' : ''}
                disabled={!inRun}
                onClick={() => run((g) => (g.god = !g.god))}
              >
                God
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugRefillIntegrity())}>
                Full HP
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugReviveHero())}>
                Revive hero
              </button>
            </div>
            <div className="debug-row">
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  className={game?.timeScale === s ? 'on' : ''}
                  disabled={!inRun}
                  onClick={() => run((g) => (g.timeScale = s))}
                >
                  ×{s}
                </button>
              ))}
              <button disabled={!inRun} onClick={() => run((g) => g.debugSkipWave())}>
                Skip wave
              </button>
            </div>
            <div className="debug-row">
              <button disabled={!inRun} onClick={() => run((g) => g.debugWin())}>
                Win
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugLose())}>
                Lose
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugOpenDraft())}>
                Open draft
              </button>
            </div>
          </div>

          <div className="debug-sec">
            <div className="h">Economy & spawning (run)</div>
            <div className="debug-row">
              <button disabled={!inRun} onClick={() => run((g) => g.debugAddBiomass(500))}>
                +500 biomass
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugAddBiomass(2000))}>
                +2000
              </button>
            </div>
            <div className="debug-row">
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('runner', 5))}>
                5 Runners
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('brute', 3))}>
                3 Brutes
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('tyrant', 1))}>
                Boss
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawnBoss())}>
                FW Boss
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.spawnProceduralBoss(20))}>
                Proc Boss
              </button>
            </div>
            <div className="debug-row">
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('rusher', 6))}>
                6 Rushers
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('tank', 2))}>
                2 Tanks
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('flyer', 4))}>
                4 Flyers
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('burrower', 4))}>
                4 Burrowers
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('runner', 150))}>
                Stress +150
              </button>
            </div>
          </div>

          <div className="debug-sec">
            <div className="h">Force card</div>
            <div className="debug-row">
              <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                {CARD_POOL.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.rarity})
                  </option>
                ))}
              </select>
              <button disabled={!inRun} onClick={() => run((g) => g.debugApplyCard(cardId))}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
