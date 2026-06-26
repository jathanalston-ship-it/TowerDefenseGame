// Mode picker shown on the main menu. Stage Mode previews the next procedurally
// generated stage (biome, modifiers, objective, reward) with a re-roll; Endless and
// Classic launch directly. Each hands a GameConfig back to the App.

import { useMemo, useState } from 'react';
import { meta } from '../state/meta';
import { generateStage, envModifier } from '../core/stage';
import { BIOMES } from '../core/biomes';
import type { GameConfig } from '../core/game';
import { Icon } from './components/Icon';

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export function ModePanel({ onStart }: { onStart: (c: GameConfig) => void }): JSX.Element {
  const save = meta.use();
  const stageNumber = save.bestStage + 1; // next stage on the progression path
  const [seed, setSeed] = useState(randomSeed);
  const stage = useMemo(() => generateStage(seed, stageNumber), [seed, stageNumber]);
  const biome = BIOMES[stage.biome];

  return (
    <div className="panel">
      <div className="panel-title">Deploy</div>
      <div className="panel-sub">Choose how you descend into the hive.</div>
      <div className="mode-grid">
        {/* ── Stage Mode (with a live preview of the next stage) ── */}
        <div className="mode-card mode-stage">
          <div className="mode-head">
            <span className="mode-name">Stage {stageNumber}</span>
            <span className="mode-tag">STAGE MODE</span>
          </div>
          <div className="mode-biome">{biome.name}</div>
          <div className="mode-blurb">{biome.blurb}</div>
          <div className="mode-meta">
            <span className="reward-chip">
              <Icon name="diamond" size={11} /> ×{stage.rewardMultiplier.toFixed(2)} reward
            </span>
            {stage.mods.map((id) => (
              <span className="mod-chip" key={id}>{envModifier(id)?.name ?? id}</span>
            ))}
          </div>
          {stage.objective && (
            <div className="mode-objective">
              <b>{stage.objective.name}:</b> {stage.objective.description}{' '}
              <span className="obj-bonus">+{Math.round(stage.objective.rewardBonus * 100)}%</span>
            </div>
          )}
          <div className="mode-actions">
            <button className="primary" onClick={() => onStart({ mode: 'stage', stage })}>
              <Icon name="play" size={14} /> Deploy
            </button>
            <button className="btn-ico" onClick={() => setSeed(randomSeed())} title="Generate a different stage">
              ⟳ Re-roll
            </button>
          </div>
        </div>

        {/* ── Endless Mode ── */}
        <div className="mode-card mode-endless">
          <div className="mode-head">
            <span className="mode-name">Endless</span>
            <span className="mode-tag">SURVIVAL</span>
          </div>
          <div className="mode-blurb">Infinite, escalating waves. Last as long as you can.</div>
          <div className="mode-meta">
            <span className="mod-chip">Best score {save.bestEndlessScore}</span>
            <span className="mod-chip">Reached wave {save.bestEndlessWave}</span>
          </div>
          <div className="mode-actions">
            <button className="primary" onClick={() => onStart({ mode: 'endless' })}>
              <Icon name="play" size={14} /> Begin
            </button>
          </div>
        </div>

        {/* ── Classic ── */}
        <div className="mode-card mode-classic">
          <div className="mode-head">
            <span className="mode-name">Classic</span>
            <span className="mode-tag">SLICE</span>
          </div>
          <div className="mode-blurb">The original hand-built 12-wave defense.</div>
          <div className="mode-meta">
            <span className="mod-chip">Best wave {save.bestWave}</span>
          </div>
          <div className="mode-actions">
            <button className="primary" onClick={() => onStart({ mode: 'classic' })}>
              <Icon name="play" size={14} /> Play
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
