// INFINITE — the SURVIVAL EXPERIMENT terminal (docs/ENDLESS-SCALING.md, MODE-IDENTITY §doctrines).
// Not "Campaign without an ending": you CONFIGURE an experiment (difficulty + a doctrine
// PROTOCOL that reshapes the enemy world), read the forecast (scaling curves, biome rotation,
// boss cadence, reward multipliers), and descend. Doctrine cards show their full effect
// readouts — picking one is a strategic commitment, not a dropdown afterthought.

import { useState, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { formatPower } from '../core/power';
import { audio } from '../audio/sound';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../core/difficulty';
import { DOCTRINES, DOCTRINE_IDS } from '../core/doctrines';
import type { DoctrineDef } from '../core/doctrines';
import { BIOMES } from '../core/biomes';
import { DIRECTOR, ENDLESS, MODE_REWARDS } from '../core/config';
import { difficultyPref, setDifficultyPref } from '../state/prefs';
import { PredictionPanel } from './PredictionPanel';

/** Human-readable lines for a doctrine's full impact (effects + world warp). */
function doctrineLines(d: DoctrineDef): string[] {
  const out: string[] = [];
  const w = d.warp ?? {};
  if (w.countMult) out.push(w.countMult > 1 ? `Spawns ×${w.countMult}` : `Spawns ×${w.countMult} (sparse)`);
  if (w.hpMult) out.push(`Enemy HP ×${w.hpMult}`);
  if (w.damageMult) out.push(`Enemy damage ×${w.damageMult}`);
  if (w.speedMult) out.push(`Enemy speed ×${w.speedMult}`);
  if (w.eliteChance) out.push(`${Math.round(w.eliteChance * 100)}% elite spawns`);
  if (w.scalingRateMult) out.push(`Scaling ×${w.scalingRateMult} faster`);
  if (w.bountyMult) out.push(`Bounty ×${w.bountyMult}`);
  if (w.rewardMult) out.push(`Rewards ×${w.rewardMult}`);
  if (w.essencePerWave) out.push(`+${w.essencePerWave} Essence / wave`);
  for (const e of d.effects) {
    if (e.op === 'mul' && e.field === 'biomassMult') out.push(`Biomass ×${e.value}`);
  }
  return out;
}

/** A composite hazard rating for the configured experiment (difficulty × doctrine warp). */
function hazardRating(diffId: string, d: DoctrineDef): number {
  const diff = DIFFICULTIES[diffId];
  const w = d.warp ?? {};
  const load = (diff?.enemyHealthMult ?? 1) * (w.hpMult ?? 1) * (w.damageMult ?? 1) *
    (w.countMult && w.countMult > 1 ? w.countMult : 1) * (w.speedMult ?? 1) * (w.scalingRateMult ?? 1);
  return Math.max(1, Math.min(5, Math.round(1 + (load - 1) * 1.4)));
}

export function InfiniteScreen({
  onStartEndless,
  difficultyRef,
  doctrineRef,
}: {
  onStartEndless: () => void;
  difficultyRef: MutableRefObject<string>;
  doctrineRef: MutableRefObject<string>;
}): JSX.Element {
  const save = meta.use();
  const [diff, setDiff] = useState(() => difficultyPref('infinite'));
  const [doctrine, setDoctrine] = useState(doctrineRef.current || 'none');
  const active = DOCTRINES[doctrine] ?? DOCTRINES.none;
  const hazard = hazardRating(diff, active);
  const lootMult = MODE_REWARDS.loot.endless * (active.warp?.rewardMult ?? 1);

  const start = (): void => {
    audio.resume();
    audio.cue('ui');
    doctrineRef.current = doctrine;
    meta.notePredictionBaseline('infinite', difficultyPref('infinite'));
    onStartEndless();
  };

  return (
    <div className="play-screen inf-screen">
      <div className="play-hero">
        <h1 className="title play-title infinite-title">INFINITE</h1>
        <p className="subtitle">Configure the experiment. The AI Director escalates forever — the only question is how deep the specimen line holds.</p>

        <div className="play-cta">
          <button className="primary play-start infinite-start" onClick={start} title="AI Director-driven, infinite depth">
            ∞ Begin Experiment
          </button>
          <span className="inf-hazard" title="Composite difficulty of this configuration (difficulty × protocol)">
            HAZARD <b className="inf-skulls">{'◆'.repeat(hazard)}{'◇'.repeat(5 - hazard)}</b>
          </span>
        </div>

        <PredictionPanel mode="infinite" difficultyId={diff} label="Infinite Wave" />

        <div className="play-setup">
          <label className="play-field">
            <span className="play-field-k">Difficulty</span>
            <select
              value={diff}
              onChange={(e) => { setDiff(e.target.value); difficultyRef.current = e.target.value; setDifficultyPref('infinite', e.target.value); }}
            >
              {DIFFICULTY_IDS.map((id) => (
                <option key={id} value={id} title={DIFFICULTIES[id].blurb}>{DIFFICULTIES[id].name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* ── PROTOCOL SELECTION — doctrine cards with full readouts (one commitment) ── */}
        <div className="inf-doctrines" role="radiogroup" aria-label="Doctrine protocol">
          {DOCTRINE_IDS.map((id) => {
            const d = DOCTRINES[id];
            const lines = doctrineLines(d);
            const on = id === doctrine;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={on}
                className={`inf-doc${on ? ' on' : ''}${d.warp ? ' is-protocol' : ''}`}
                onClick={() => setDoctrine(id)}
                title={d.blurb}
              >
                <span className="inf-doc-name">{d.name}</span>
                {lines.length > 0
                  ? <span className="inf-doc-fx">{lines.slice(0, 3).map((l) => <i key={l}>{l}</i>)}</span>
                  : <span className="inf-doc-fx"><i className="is-dim">{id === 'none' ? 'No commitment' : 'Build-shaping'}</i></span>}
              </button>
            );
          })}
        </div>
        {active.id !== 'none' && (
          <div className="inf-doc-detail">
            <b>{active.name}</b> — {active.blurb}
          </div>
        )}
      </div>

      <aside className="play-side">
        <div className="power-score">
          Power Score <b>{formatPower(meta.power().score)}</b>
        </div>
        <div className="records play-records">
          <div className="record"><div className="k">Deepest Wave</div><div className="v" style={{ color: 'var(--viral)' }}>{save.bestWave}</div></div>
          <div className="record"><div className="k">Total Runs</div><div className="v">{save.totalRuns}</div></div>
          <div className="record"><div className="k">Loot Rate</div><div className="v" style={{ color: 'var(--gold)' }}>×{lootMult.toFixed(2)}</div></div>
        </div>

        {/* ── The FORECAST — what the descent will throw at you ── */}
        <div className="panel inf-forecast">
          <div className="inf-fc-k">Experiment forecast</div>
          <div className="inf-fc-row"><span>Enemy HP ramp</span><b>×{ENDLESS.hpGrowth.toFixed(2)} / wave{active.warp?.scalingRateMult ? ` ×${active.warp.scalingRateMult} accel` : ''}</b></div>
          <div className="inf-fc-row"><span>Boss cadence</span><b>every {DIRECTOR.bossEvery} waves</b></div>
          <div className="inf-fc-row"><span>Biome rotation</span><b>{BIOMES.slice(0, 4).map((b) => b.name.split(' ')[0]).join(' → ')} …</b></div>
          <div className="inf-fc-row"><span>Speed cap</span><b>×{ENDLESS.speedCap}</b></div>
        </div>

        <div className="panel how-to play-howto">
          <b style={{ color: 'var(--text)' }}>Infinite mode.</b> No win condition — the swarm scales
          without end. Biomes rotate as you descend; assembled bosses anchor the cadence. The home of{' '}
          <b style={{ color: 'var(--viral)' }}>Mastery XP</b> and the{' '}
          <b style={{ color: 'var(--gold)' }}>Loot Box Meter</b>. Future seams: weekly challenges,
          season modifiers, mutators, leaderboards — all parameterize this same terminal.
        </div>
      </aside>
    </div>
  );
}
