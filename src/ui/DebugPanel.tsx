import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { disableDebug, getActiveGame, subscribeActiveGame } from '../debug/debug';
import { meta } from '../state/meta';
import { CARD_POOL } from '../core/cards';
import { ENEMY_DEFS, HEROES } from '../core/config';
import type { Game } from '../core/game';
import type { Currency, EnemyKind } from '../core/types';

const KINDS = Object.keys(ENEMY_DEFS) as EnemyKind[];
const BOSS_KINDS = KINDS.filter((k) => ENEMY_DEFS[k].isBoss);
const CURRENCIES: Currency[] = ['shards', 'essence', 'components', 'catalyst'];
const DMG_STEPS = [0.5, 1, 2, 5, 10];

// Internal balancing & testing tools. Dev-only (debug.ts gates visibility); never
// shown to players. Live readouts (DPS, enemy stats) poll the active run.
export function DebugPanel(): JSX.Element {
  const game = useSyncExternalStore(subscribeActiveGame, getActiveGame, getActiveGame);
  const save = meta.use();
  const [open, setOpen] = useState(true);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [cardId, setCardId] = useState(CARD_POOL[0].id);
  const [spawnKind, setSpawnKind] = useState<EnemyKind>('runner');
  const [spawnCount, setSpawnCount] = useState(5);
  const [spawnElite, setSpawnElite] = useState(false);
  const [waveNum, setWaveNum] = useState(5);

  const inRun = game !== null;
  const run = (fn: (g: Game) => void): void => {
    const g = getActiveGame();
    if (g) {
      fn(g);
      force();
    }
  };

  // Poll the live run for DPS / enemy stats while the panel is open.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      const g = getActiveGame();
      if (g) {
        g.debugTrackDps = true;
        force();
      }
    }, 200);
    return () => {
      clearInterval(id);
      const g = getActiveGame();
      if (g) g.debugTrackDps = false;
    };
  }, [open]);

  const stats = inRun ? game!.debugEnemyStats() : null;
  const dps = inRun ? Math.round(game!.debugDps()) : 0;

  return (
    <div className="debug-panel">
      <div className="debug-head">
        <span className="t">BALANCE TOOLS</span>
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
          {/* ── Live readouts ── */}
          <div className="debug-sec">
            <div className="h">Live stats {inRun ? '' : '— start a run'}</div>
            <div className="debug-stat">
              <span>DPS (player)</span>
              <b>{dps.toLocaleString()}</b>
            </div>
            <div className="debug-stat">
              <span>Enemies alive</span>
              <b>{stats?.alive ?? 0}{stats && stats.elites > 0 ? ` (${stats.elites}★)` : ''}</b>
            </div>
            <div className="debug-stat">
              <span>Total HP on field</span>
              <b>{(stats?.totalHp ?? 0).toLocaleString()}</b>
            </div>
            {stats && stats.alive > 0 && (
              <div className="debug-bykind">
                {KINDS.filter((k) => stats.byKind[k]).map((k) => (
                  <span key={k} className="debug-chip">{ENEMY_DEFS[k].name.split(' ').pop()}: {stats.byKind[k]}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── Spawn any enemy / boss ── */}
          <div className="debug-sec">
            <div className="h">Spawn</div>
            <div className="debug-row">
              <select value={spawnKind} onChange={(e) => setSpawnKind(e.target.value as EnemyKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>{ENEMY_DEFS[k].name}{ENEMY_DEFS[k].isBoss ? ' ☠' : ''}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={300}
                value={spawnCount}
                onChange={(e) => setSpawnCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
                style={{ width: 52 }}
              />
              <label className="debug-check">
                <input type="checkbox" checked={spawnElite} onChange={(e) => setSpawnElite(e.target.checked)} /> elite
              </label>
            </div>
            <div className="debug-row">
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn(spawnKind, spawnCount, spawnElite))}>
                Spawn {spawnCount}× {spawnElite ? 'elite ' : ''}{ENEMY_DEFS[spawnKind].name}
              </button>
            </div>
            <div className="debug-row">
              {BOSS_KINDS.map((k) => (
                <button key={k} disabled={!inRun} onClick={() => run((g) => g.debugSpawn(k, 1, spawnElite))}>
                  Spawn boss: {ENEMY_DEFS[k].name}
                </button>
              ))}
              <button disabled={!inRun} onClick={() => run((g) => g.debugSpawn('runner', 150))}>Stress +150</button>
            </div>
          </div>

          {/* ── Damage / health / invuln knobs ── */}
          <div className="debug-sec">
            <div className="h">Tuning knobs</div>
            <div className="debug-row">
              <span className="debug-note" style={{ minWidth: 56 }}>Damage</span>
              {DMG_STEPS.map((s) => (
                <button key={s} className={game?.debugDamageMult === s ? 'on' : ''} disabled={!inRun} onClick={() => run((g) => (g.debugDamageMult = s))}>×{s}</button>
              ))}
            </div>
            <div className="debug-row">
              <span className="debug-note" style={{ minWidth: 56 }}>Enemy HP</span>
              {DMG_STEPS.map((s) => (
                <button key={s} className={game?.debugHpMult === s ? 'on' : ''} disabled={!inRun} onClick={() => run((g) => (g.debugHpMult = s))}>×{s}</button>
              ))}
            </div>
            <div className="debug-row">
              <button className={game?.god ? 'on' : ''} disabled={!inRun} onClick={() => run((g) => (g.god = !g.god))}>
                Invulnerable
              </button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugRefillIntegrity())}>Full HP</button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugReviveHero())}>Revive hero</button>
            </div>
          </div>

          {/* ── Wave / run control ── */}
          <div className="debug-sec">
            <div className="h">Run control</div>
            <div className="debug-row">
              {[1, 2, 4].map((s) => (
                <button key={s} className={game?.timeScale === s ? 'on' : ''} disabled={!inRun} onClick={() => run((g) => (g.timeScale = s))}>×{s}</button>
              ))}
              <button disabled={!inRun} onClick={() => run((g) => g.debugSkipWave())}>Skip wave</button>
            </div>
            <div className="debug-row">
              <span className="debug-note" style={{ minWidth: 56 }}>Force wave</span>
              <input type="number" min={1} value={waveNum} onChange={(e) => setWaveNum(Math.max(1, Number(e.target.value) || 1))} style={{ width: 52 }} />
              <button disabled={!inRun} title="Jump to & start this wave (from prep)" onClick={() => run((g) => g.debugForceWave(waveNum))}>Go</button>
            </div>
            <div className="debug-row">
              <button disabled={!inRun} onClick={() => run((g) => g.debugAddBiomass(2000))}>+2000 biomass</button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugOpenDraft())}>Open draft</button>
            </div>
            <div className="debug-row">
              <button disabled={!inRun} onClick={() => run((g) => g.debugWin())}>Win</button>
              <button disabled={!inRun} onClick={() => run((g) => g.debugLose())}>Lose</button>
            </div>
            <div className="debug-row">
              <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                {CARD_POOL.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.rarity})</option>
                ))}
              </select>
              <button disabled={!inRun} onClick={() => run((g) => g.debugApplyCard(cardId))}>Force card</button>
            </div>
          </div>

          {/* ── Meta / progression (persistent) ── */}
          <div className="debug-sec">
            <div className="h">Progression (meta)</div>
            {CURRENCIES.map((c) => (
              <div className="debug-row" key={c}>
                <span className="debug-note" style={{ minWidth: 86, textTransform: 'capitalize' }}>{c}: {save[c]}</span>
                <button onClick={() => meta.debugGrantCurrency(c, 100)}>+100</button>
                <button onClick={() => meta.debugGrantCurrency(c, 1000)}>+1000</button>
              </div>
            ))}
            <div className="debug-row">
              <span className="debug-note" style={{ minWidth: 86 }}>genome ✦: {save.genomeShards}</span>
              <button onClick={() => meta.debugGrantGenome(100)} title="Genome Shards buy Tower Stars">+100</button>
              <button onClick={() => meta.debugGrantGenome(1000)} title="Genome Shards buy Tower Stars">+1000</button>
            </div>
            <div className="debug-row">
              <button onClick={() => meta.debugMaxUpgrades()} title="Maxes every upgrade track (the shipped permanent 'star' progression)">
                Max all upgrades ★
              </button>
            </div>
            <div className="debug-row">
              <span className="debug-note" style={{ minWidth: 86 }}>Gear:</span>
              <button onClick={() => meta.debugGrantGear('common')} title="Roll a Common item into the inventory">+Common</button>
              <button onClick={() => meta.debugGrantGear('rare')} title="Roll a Rare item into the inventory">+Rare</button>
              <button onClick={() => meta.debugGrantGear('epic')} title="Roll an Epic item into the inventory">+Epic</button>
            </div>
            <div className="debug-row">
              <span className="debug-note" style={{ minWidth: 86 }}>Mastery XP:</span>
              <button onClick={() => meta.masteryUnits.forEach((u) => meta.debugGrantMastery(u, 5000))}>+5k all</button>
              <button onClick={() => meta.masteryUnits.forEach((u) => meta.debugGrantMastery(u, 100000))}>+100k all</button>
            </div>
            <div className="debug-row">
              <span className="debug-note" style={{ minWidth: 86 }}>Bio-Container:</span>
              <button onClick={() => meta.debugGrantBox('common', 3)} title="+3 Common Bio-Containers">+Common</button>
              <button onClick={() => meta.debugGrantBox('rare', 2)} title="+2 Rare Bio-Containers">+Rare</button>
              <button onClick={() => meta.debugGrantBox('epic', 1)} title="+1 Epic Bio-Container">+Epic</button>
            </div>
            <div className="debug-row">
              <span className="debug-note">Heroes: {Object.keys(HEROES).length} (roster data-driven; selection/unlocks: future)</span>
            </div>
            <div className="debug-row">
              <button onClick={() => meta.backupNow()}>Backup</button>
              <button onClick={() => { if (confirm('Reset save? (a backup is kept)')) meta.reset(); }}>Reset save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
