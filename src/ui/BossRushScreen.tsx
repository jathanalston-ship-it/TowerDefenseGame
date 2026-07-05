// BOSS RUSH — the GAUNTLET terminal (docs/BOSS-RUSH.md). The third pillar next to Campaign and
// Infinite: wave N deploys N assembled bosses in a staggered siege column with a thinned escort.
// Rewards pay per boss DEFEATED, a Gene Card drafts every 2nd wave, and the run only ends when
// the Nucleus falls. This terminal explains the contract, forecasts the escalation, and launches.

import { useState, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { formatPower } from '../core/power';
import { audio } from '../audio/sound';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../core/difficulty';
import { DOCTRINES } from '../core/doctrines';
import { RUSH } from '../core/config';
import { hazardRating, modeLootMult } from '../core/difficultyDirector';
import { difficultyPref, setDifficultyPref } from '../state/prefs';
import { ACHIEVEMENTS } from '../state/achievements';
import { PredictionPanel } from './PredictionPanel';

// The signature visual: the escalation ladder itself — wave N is N skulls. Reads as artwork
// AND as the rules explanation in one glance (self-contained, no assets).
function RushLadder({ upTo }: { upTo: number }): JSX.Element {
  return (
    <div className="rush-ladder" aria-hidden>
      {Array.from({ length: upTo }, (_, i) => i + 1).map((w) => (
        <div key={w} className="rush-rung">
          <span className="rush-rung-w">W{w}</span>
          <span className="rush-rung-skulls">
            {Array.from({ length: w }, (_, j) => (
              <i key={j} className="rush-skull" style={{ animationDelay: `${(w * 0.35 + j * 0.12).toFixed(2)}s` }}>☠</i>
            ))}
          </span>
        </div>
      ))}
      <div className="rush-rung rush-rung-more"><span className="rush-rung-w">W…</span><span className="rush-rung-skulls"><i className="rush-skull">∞</i></span></div>
    </div>
  );
}

export function BossRushScreen({
  onStartBossRush,
  difficultyRef,
}: {
  onStartBossRush: () => void;
  difficultyRef: MutableRefObject<string>;
}): JSX.Element {
  const save = meta.use();
  const [diff, setDiff] = useState(() => difficultyPref('bossrush'));
  const hazard = hazardRating(diff, DOCTRINES.none);
  const lootMult = modeLootMult({ endless: false, campaign: false, bossRush: true });
  const milestones = ACHIEVEMENTS.filter((a) => a.id.startsWith('rush_'));
  const unlocked = new Set(save.achievements);

  const start = (): void => {
    audio.resume();
    audio.cue('ui');
    meta.notePredictionBaseline('bossRush', difficultyPref('bossrush'));
    onStartBossRush();
  };

  return (
    <div className="play-screen rush-screen">
      <div className="play-hero">
        <h1 className="title play-title rush-title">BOSS RUSH</h1>
        <p className="subtitle">The gauntlet. Wave 1 is one apex organism. Wave 2 is two. Every wave, the siege column grows — and every boss you fell pays.</p>

        <div className="play-cta">
          <button className="primary play-start rush-start" onClick={start} title="Wave N = N assembled bosses, forever">
            ☠ Enter the Gauntlet
          </button>
          <span className="inf-hazard" title="Composite difficulty of this configuration">
            HAZARD <b className="inf-skulls">{'◆'.repeat(hazard)}{'◇'.repeat(5 - hazard)}</b>
          </span>
        </div>

        <PredictionPanel mode="bossRush" difficultyId={diff} label="Boss Rush Wave" />

        <div className="play-setup">
          <label className="play-field">
            <span className="play-field-k">Difficulty</span>
            <select
              value={diff}
              onChange={(e) => { setDiff(e.target.value); difficultyRef.current = e.target.value; setDifficultyPref('bossrush', e.target.value); }}
            >
              {DIFFICULTY_IDS.map((id) => (
                <option key={id} value={id} title={DIFFICULTIES[id].blurb}>{DIFFICULTIES[id].name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* ── The contract, visualized: the escalation ladder ── */}
        <RushLadder upTo={5} />
        <div className="rush-rules">
          <div className="rush-rule"><b>☠ Wave N = N bosses</b><span>Assembled from the Boss Registry — stronger chassis, more siege organs and phases as you go deep. A thinned swarm escorts them.</span></div>
          <div className="rush-rule"><b>⌬ Gene Card every 2 waves</b><span>A fixed draft cadence — steady power injections against a linearly growing siege line.</span></div>
          <div className="rush-rule"><b>◈ Paid per boss felled</b><span>+{RUSH.corePerBoss} Genome Cores and +{RUSH.lootPerBoss} loot points per boss — slaying is the payout, not surviving.</span></div>
        </div>
      </div>

      <aside className="play-side">
        <div className="power-score">
          Power Score <b>{formatPower(meta.power().score)}</b>
        </div>
        <div className="records play-records">
          <div className="record"><div className="k">Deepest Wave</div><div className="v" style={{ color: 'var(--danger, #ff5d73)' }}>{save.rushBestWave}</div></div>
          <div className="record"><div className="k">Best Single Run</div><div className="v">{save.rushBestBoss} bosses</div></div>
          <div className="record"><div className="k">Lifetime Bosses</div><div className="v" style={{ color: 'var(--gold)' }}>{save.stats.rushBossKills}</div></div>
          <div className="record"><div className="k">Gauntlet Runs</div><div className="v">{save.stats.rushRuns}</div></div>
        </div>

        {/* ── The FORECAST — how the gauntlet escalates ── */}
        <div className="panel inf-forecast">
          <div className="inf-fc-k">Gauntlet forecast</div>
          <div className="inf-fc-row"><span>Bosses per wave</span><b>= wave number</b></div>
          <div className="inf-fc-row"><span>Boss threat level</span><b>+{RUSH.bossTlPerWave} / wave</b></div>
          <div className="inf-fc-row"><span>Deploy stagger</span><b>{RUSH.bossStagger}s apart</b></div>
          <div className="inf-fc-row"><span>Loot rate</span><b>×{lootMult.toFixed(2)} + per-boss bonus</b></div>
        </div>

        {/* ── Gauntlet milestones — the mode's own achievement ladder ── */}
        <div className="panel rush-miles">
          <div className="inf-fc-k">Gauntlet milestones</div>
          {milestones.map((a) => {
            const done = unlocked.has(a.id);
            const prog = a.progress?.({ save });
            const pct = prog ? Math.min(100, Math.round((prog.cur / prog.max) * 100)) : done ? 100 : 0;
            return (
              <div key={a.id} className={`rush-mile${done ? ' done' : ''}`} title={a.desc}>
                <div className="rush-mile-head"><span>{done ? '✔' : '☠'} {a.name}</span>{prog && <b>{Math.min(prog.cur, prog.max)}/{prog.max}</b>}</div>
                <div className="rush-mile-bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>

        <div className="panel how-to play-howto">
          <b style={{ color: 'var(--text)' }}>Boss Rush.</b> No win condition — the column grows until
          the Nucleus falls. Rewards key off <b style={{ color: 'var(--gold)' }}>bosses defeated</b>,
          so a deep push pays quadratically. Reach at least half your record wave or the run banks
          no containers.
        </div>
      </aside>
    </div>
  );
}
