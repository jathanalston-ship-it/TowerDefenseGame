// INFINITE — the SURVIVAL EXPERIMENT terminal (docs/ENDLESS-SCALING.md, MODE-IDENTITY §doctrines).
// Not "Campaign without an ending": you CONFIGURE an experiment (difficulty + a doctrine
// PROTOCOL that reshapes the enemy world), read the DESCENT FORECAST (the real director curves
// evaluated at depth checkpoints, live under your exact configuration), and descend. Doctrine
// cards show their full effect readouts — picking one is a strategic commitment, not a
// dropdown afterthought.

import { Fragment, useMemo, useState, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { formatPower } from '../core/power';
import { audio } from '../audio/sound';
import { DIFFICULTIES, DIFFICULTY_IDS, resolveDifficulty } from '../core/difficulty';
import { DOCTRINES } from '../core/doctrines';
import { DoctrinePicker } from './components/DoctrinePicker';
import { BIOMES } from '../core/biomes';
import { DIRECTOR, ENDLESS, ENDLESS_TAPER, endlessTaper } from '../core/config';
import { createDirector, doctrineEconomy, hazardRating, modeLootMult } from '../core/difficultyDirector';
import { difficultyPref, setDifficultyPref } from '../state/prefs';
import { PredictionPanel } from './PredictionPanel';
import { LoopDirective } from './NextGoalBanner';
import { ThreatPicker } from './components/ThreatPicker';

/** Compact ×-multiplier for the forecast ladder (deep HP walls reach ×10⁷ under fast protocols). */
function fmtMult(v: number): string {
  if (v >= 1e9) return `×${Number((v / 1e9).toPrecision(3))}B`;
  if (v >= 1e6) return `×${Number((v / 1e6).toPrecision(3))}M`;
  if (v >= 1e4) return `×${Number((v / 1e3).toPrecision(3))}k`;
  if (v >= 100) return `×${Math.round(v)}`;
  return `×${v.toFixed(v >= 10 ? 1 : 2)}`;
}

/** Forecast checkpoint depths; the account's own record is spliced in as its own rung. */
const LADDER_DEPTHS = [5, 10, 20, 30, 40, 50, 75, 100];

// Hazard rating + reward composition + every ladder number are Difficulty Director policy
// (core/difficultyDirector.ts) — this terminal renders the same curves the sim will run.

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
  const lootMult = modeLootMult({ endless: true, campaign: false }) * doctrineEconomy(active.id).rewardMult;
  const dsel = DIFFICULTIES[diff] ?? resolveDifficulty(diff);

  // The descent forecast: ONE director configured exactly like the run (difficulty × protocol),
  // queried at checkpoint depths — switching either input re-prices the whole ladder live.
  const director = useMemo(
    () => createDirector({ difficulty: resolveDifficulty(diff), warp: active.warp }),
    [diff, active],
  );
  const depths = useMemo(() => {
    const out = [...LADDER_DEPTHS];
    if (save.bestWave > LADDER_DEPTHS[0] && !out.includes(save.bestWave)) {
      out.push(save.bestWave);
      out.sort((a, b) => a - b);
    }
    return out;
  }, [save.bestWave]);

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

        <div className="play-cta" data-guide="inf-start">
          <button className="primary play-start infinite-start" onClick={start} title="AI Director-driven, infinite depth">
            ∞ Begin Experiment
          </button>
          <span className="inf-hazard" title="Composite difficulty of this configuration (difficulty × protocol)">
            HAZARD <b className="inf-skulls">{'◆'.repeat(hazard)}{'◇'.repeat(5 - hazard)}</b>
          </span>
        </div>

        <PredictionPanel mode="infinite" difficultyId={diff} label="Infinite Wave" />

        {/* Why you're farming — the macro-loop directive (docs/PROGRESSION-LOOP.md): this
            experiment feeds the Campaign frontier's power bar. */}
        <LoopDirective difficultyId={difficultyPref('campaign')} />

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
          {/* The selected difficulty as a BRIEFING, not a bare dropdown: its blurb + the axes it moves. */}
          <div className="inf-diff-brief">
            <span className="inf-diff-blurb">{dsel.blurb}</span>
            <span className="inf-diff-fx">
              <i>Enemy HP ×{dsel.enemyHealthMult}</i>
              <i>Damage ×{dsel.enemyDamageMult}</i>
              <i className="is-gold">Rewards ×{dsel.rewardMult}</i>
              <i className="is-gold">XP ×{dsel.xpMult}</i>
            </span>
          </div>
        </div>

        {/* ── DOCTRINE SELECTION — the shared commitment picker (components/DoctrinePicker):
            family groups, lock seals, mastery rank pips, hazard priced at THIS difficulty ── */}
        <ThreatPicker mode="endless" />
        <DoctrinePicker value={doctrine} onChange={setDoctrine} difficultyId={diff} />
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

        {/* ── The DESCENT FORECAST — the run's actual scaling curves priced at depth checkpoints.
            Every number comes from the same RunDirector the sim will construct; the taper column
            is the anti-grind curve (docs/ENDLESS-SCALING.md §taper). ◈ marks the account record. ── */}
        <div className="panel inf-forecast">
          <div className="inf-fc-head">
            <span className="inf-fc-k">Descent forecast</span>
            <span className="inf-fc-live" title="Re-priced live from your difficulty × protocol selection">live</span>
          </div>
          <div className="inf-lad-grid">
            <span className="inf-lad-h is-w">Wave</span>
            <span className="inf-lad-h">Enemy HP</span>
            <span className="inf-lad-h">Speed</span>
            <span className="inf-lad-h" title="Assembled-boss durability (capped ×6)">Boss</span>
            <span className="inf-lad-h" title="Loot & Mastery value per wave — full through the taper start, then decaying to the floor">Value</span>
            {depths.map((w) => {
              const isBest = w === save.bestWave && !LADDER_DEPTHS.includes(w);
              const speed = director.endlessSpeedMult(w);
              const speedCapped = speed >= ENDLESS.speedCap - 1e-9;
              const boss = director.endlessBossStrength(w);
              const bossCapped = boss >= ENDLESS.bossStrengthCap - 1e-9;
              const value = endlessTaper(w);
              return (
                <Fragment key={w}>
                  <span className={`inf-lad-w${isBest ? ' is-best' : ''}`} title={isBest ? 'Your deepest wave' : undefined}>{isBest ? '◈' : ''}{w}</span>
                  <span className="inf-lad-v">{fmtMult(director.endlessHpMult(w))}</span>
                  <span className={`inf-lad-v${speedCapped ? ' is-cap' : ''}`} title={speedCapped ? 'Speed cap reached' : undefined}>×{speed.toFixed(2)}</span>
                  <span className={`inf-lad-v${bossCapped ? ' is-cap' : ''}`} title={bossCapped ? 'Boss durability cap' : undefined}>×{boss.toFixed(1)}</span>
                  <span className={`inf-lad-v${value < 1 ? ' is-taper' : ''}`}>{Math.round(value * 100)}%</span>
                </Fragment>
              );
            })}
          </div>
          <div className="inf-lad-notes">
            <span>◆ Assembled boss every {DIRECTOR.bossEvery} waves; durability caps ×{ENDLESS.bossStrengthCap}.</span>
            <span>Value tapers past wave {ENDLESS_TAPER.startWave} toward a {Math.round(ENDLESS_TAPER.floor * 100)}% floor — deep camping stops out-earning a fresh run.</span>
            <span>Past depth {DIRECTOR.heavyCapMinDepth} the Director tilts composition toward swarms.</span>
            <span>Biomes rotate: {BIOMES.slice(0, 4).map((b) => b.name.split(' ')[0]).join(' → ')} …</span>
          </div>
        </div>

        <div className="panel how-to play-howto">
          <b style={{ color: 'var(--text)' }}>Infinite mode.</b> No win condition — the swarm scales
          without end. Biomes rotate as you descend; assembled bosses anchor the cadence. The home of{' '}
          <b style={{ color: 'var(--viral)' }}>Mastery XP</b> and the{' '}
          <b style={{ color: 'var(--gold)' }}>Loot Box Meter</b>. When the deep waves stop paying,
          bank the run and spend the power on the Campaign frontier.
        </div>
      </aside>
    </div>
  );
}
