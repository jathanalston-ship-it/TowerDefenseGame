// The PLAY landing — the headquarters' front door. Everything here drives the player toward
// starting the next run: a dominant Start Run / Endless CTA, the run setup (Difficulty +
// Doctrine), and a side rail of account records + a how-to. No scrolling; fits 1080p.

import type { MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { PlayIcon } from './components/Icon';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../core/difficulty';
import { DOCTRINES, DOCTRINE_IDS } from '../core/doctrines';

export function PlayScreen({
  onStart,
  onStartEndless,
  difficultyRef,
  doctrineRef,
}: {
  onStart: () => void;
  onStartEndless: () => void;
  difficultyRef: MutableRefObject<string>;
  doctrineRef: MutableRefObject<string>;
}): JSX.Element {
  const save = meta.use();
  const start = (fn: () => void): void => {
    audio.resume();
    audio.cue('ui');
    fn();
  };

  return (
    <div className="play-screen">
      <div className="play-hero">
        <h1 className="title play-title">ASSIMILATE</h1>
        <p className="subtitle">Cyberpunk bio-horror tower defense. Grow, mutate, assimilate.</p>

        <div className="play-cta">
          <button className="primary play-start" onClick={() => start(onStart)}>
            <PlayIcon /> Start Run
          </button>
          <button className="endless-btn play-endless" onClick={() => start(onStartEndless)} title="AI Director-driven, infinite depth">
            ∞ Endless
          </button>
        </div>

        <div className="play-setup">
          <label className="play-field">
            <span className="play-field-k">Difficulty</span>
            <select
              defaultValue={difficultyRef.current}
              onChange={(e) => (difficultyRef.current = e.target.value)}
            >
              {DIFFICULTY_IDS.map((id) => (
                <option key={id} value={id} title={DIFFICULTIES[id].blurb}>{DIFFICULTIES[id].name}</option>
              ))}
            </select>
          </label>
          <label className="play-field">
            <span className="play-field-k">Doctrine</span>
            <select
              defaultValue={doctrineRef.current}
              onChange={(e) => (doctrineRef.current = e.target.value)}
            >
              {DOCTRINE_IDS.map((id) => (
                <option key={id} value={id} title={DOCTRINES[id].blurb}>{DOCTRINES[id].name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <aside className="play-side">
        <div className="power-score">
          Power Score <b>×{meta.powerScore().score.toFixed(1)}</b>
        </div>
        <div className="records play-records">
          <div className="record"><div className="k">Shards</div><div className="v" style={{ color: 'var(--gold)' }}>{save.shards}</div></div>
          <div className="record"><div className="k">Best Wave</div><div className="v">{save.bestWave}</div></div>
          <div className="record"><div className="k">Runs</div><div className="v">{save.totalRuns}</div></div>
          <div className="record"><div className="k">Lifetime Shards</div><div className="v">{save.lifetimeShards}</div></div>
        </div>

        <div className="panel how-to play-howto">
          <b style={{ color: 'var(--text)' }}>How to play.</b> Grow towers on the lit slots in your
          defensive zone (spend biomass). Press <b>Start Wave</b>: enemies swarm from the top — hold
          the line at the bottom. Survive 12 waves to extract. Between waves, draft a Gene Card.
          Combine <span style={{ color: 'var(--kinetic)' }}>Fracture</span> with{' '}
          <span style={{ color: 'var(--caustic)' }}>Corrosion</span> to trigger{' '}
          <b style={{ color: '#fff066' }}>SHRED</b>. Grow a{' '}
          <span style={{ color: 'var(--vital)' }}>Flesh Reactor</span> beside towers to overcharge them.
        </div>
      </aside>
    </div>
  );
}
