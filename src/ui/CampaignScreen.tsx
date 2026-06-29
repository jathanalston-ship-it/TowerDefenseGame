// Campaign — the procedural progression ladder (CAMPAIGN.md). A stage-select rail of
// deterministically GENERATED stages: each shows its biome, wave count, boss, biome modifier +
// hazard, the smooth scaling, and the reward multiplier. Clearing a stage unlocks the next;
// cleared stages replay. Per-difficulty track (switch the variant to see its own progress).
// Pure presentation over the generator + the save's campaign record.

import { useState, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { generateStage } from '../core/campaign';
import type { StageConfig } from '../core/campaign';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../core/difficulty';

function StageCard({ s, state, onPlay }: { s: StageConfig; state: 'cleared' | 'next' | 'locked'; onPlay: () => void }): JSX.Element {
  const hpPct = Math.round((s.scaling.enemyHealthMult - 1) * 100);
  const dmgPct = Math.round((s.scaling.enemyDamageMult - 1) * 100);
  const locked = state === 'locked';
  return (
    <div className={`camp-card is-${state}`} style={{ ['--biome' as string]: s.biome.accent }}>
      <div className="camp-card-head">
        <span className="camp-stage-n">STAGE {s.stage}</span>
        {state === 'cleared' && <span className="camp-tag cleared">✓ CLEARED</span>}
        {state === 'next' && <span className="camp-tag next">NEXT</span>}
        {locked && <span className="camp-tag locked" aria-hidden>🔒</span>}
      </div>
      <div className="camp-biome" style={{ color: s.biome.accent }}>{s.biome.name}</div>
      <div className="camp-facts">
        <span className="camp-fact"><b>{s.waveCount}</b> waves</span>
        <span className="camp-fact">+{hpPct}% HP</span>
        {dmgPct > 0 && <span className="camp-fact">+{dmgPct}% dmg</span>}
        <span className="camp-fact" style={{ color: 'var(--gold)' }}>×{s.rewardMult.toFixed(2)} rewards</span>
      </div>
      <div className="camp-boss">◈ Boss · <b>{s.boss.name}</b>{s.miniBoss ? ` · mini: ${s.miniBoss.name}` : ''}</div>
      <div className="camp-mods">
        <span className="camp-mod" title="Biome modifier">{s.modifierName}</span>
        <span className="camp-mod hazard" title={s.hazardDesc}>⚠ {s.hazardName}</span>
      </div>
      <button className={`camp-play${state === 'next' ? ' primary' : ''}`} disabled={locked} onClick={onPlay}>
        {locked ? `Clear Stage ${s.stage - 1}` : state === 'cleared' ? 'Replay' : 'Deploy'}
      </button>
    </div>
  );
}

export function CampaignScreen({
  onStart,
  difficultyRef,
}: {
  onStart: (stage: number) => void;
  difficultyRef: MutableRefObject<string>;
}): JSX.Element {
  const save = meta.use();
  const [diff, setDiff] = useState(difficultyRef.current);

  const cleared = save.campaign.cleared[diff] ?? 0;
  const maxUnlocked = cleared + 1; // the next stage is always unlocked
  const lo = Math.max(1, maxUnlocked - 7); // a window of recent stages …
  const hi = maxUnlocked + 3; // … plus a few locked teasers ahead

  const stages: { cfg: StageConfig; state: 'cleared' | 'next' | 'locked' }[] = [];
  for (let n = lo; n <= hi; n++) {
    const state = n <= cleared ? 'cleared' : n === maxUnlocked ? 'next' : 'locked';
    stages.push({ cfg: generateStage(n, diff), state });
  }

  const play = (n: number): void => { audio.resume(); audio.cue('ui'); difficultyRef.current = diff; onStart(n); };

  return (
    <div className="panel camp-panel">
      <div className="panel-title">Campaign</div>
      <div className="panel-sub">
        A procedurally generated ladder — every stage is built from its number, difficulty, and biome.
        Clear a stage to unlock the next; replay any you've beaten.
      </div>

      <div className="camp-bar">
        <label className="play-field">
          <span className="play-field-k">Difficulty</span>
          <select value={diff} onChange={(e) => { setDiff(e.target.value); difficultyRef.current = e.target.value; }}>
            {DIFFICULTY_IDS.map((id) => (
              <option key={id} value={id} title={DIFFICULTIES[id].blurb}>{DIFFICULTIES[id].name}</option>
            ))}
          </select>
        </label>
        <span className="camp-record">Highest cleared <b style={{ color: 'var(--gold)' }}>{cleared}</b></span>
      </div>

      <div className="camp-grid">
        {stages.map(({ cfg, state }) => (
          <StageCard key={cfg.stage} s={cfg} state={state} onPlay={() => play(cfg.stage)} />
        ))}
      </div>
    </div>
  );
}
