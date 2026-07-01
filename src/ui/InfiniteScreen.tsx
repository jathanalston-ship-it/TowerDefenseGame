// The INFINITE launch — endless, AI Director-driven depth (docs/ENDLESS-SCALING.md). The home of
// high-score / endurance play: a dominant ∞ CTA, the run setup (Difficulty + Doctrine), and a
// rail of endurance records. Mirrors HomeScreen's layout so the menu reads consistently.

import type { MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../core/difficulty';
import { DOCTRINES, DOCTRINE_IDS } from '../core/doctrines';
import { difficultyPref, setDifficultyPref } from '../state/prefs';

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
  const start = (): void => {
    audio.resume();
    audio.cue('ui');
    onStartEndless();
  };

  return (
    <div className="play-screen">
      <div className="play-hero">
        <h1 className="title play-title infinite-title">INFINITE</h1>
        <p className="subtitle">Endless depth. The AI Director escalates forever — push for a personal best.</p>

        <div className="play-cta">
          <button className="primary play-start infinite-start" onClick={start} title="AI Director-driven, infinite depth">
            ∞ Descend
          </button>
        </div>

        <div className="play-setup">
          <label className="play-field">
            <span className="play-field-k">Difficulty</span>
            <select
              defaultValue={difficultyPref('infinite')}
              onChange={(e) => { difficultyRef.current = e.target.value; setDifficultyPref('infinite', e.target.value); }}
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
          <div className="record"><div className="k">Deepest Wave</div><div className="v" style={{ color: 'var(--viral)' }}>{save.bestWave}</div></div>
          <div className="record"><div className="k">Total Runs</div><div className="v">{save.totalRuns}</div></div>
        </div>

        <div className="panel how-to play-howto">
          <b style={{ color: 'var(--text)' }}>Infinite mode.</b> No win condition — the swarm scales
          without end (HP climbs first, then speed, damage, and abilities once the battlefield is
          saturated). Biomes rotate as you descend, reshaping the bestiary. Endless is the home of{' '}
          <b style={{ color: 'var(--viral)' }}>Mastery XP</b> and the{' '}
          <b style={{ color: 'var(--gold)' }}>Loot Box Meter</b> — optimize a build and see how deep it holds.
        </div>
      </aside>
    </div>
  );
}
