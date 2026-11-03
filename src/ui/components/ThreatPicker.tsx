// THE THREAT LADDER UI (docs/THREAT.md) — three small read-models over the pure ladder
// (core/threat.ts) + the save-aware gates (save/derive.ts), mounted by one-line insertions:
//   • ThreatPicker  — the pre-run stepper (Campaign replay panel, Infinite + Boss Rush terminals);
//   • ThreatResult  — the Results line (level, reward ×, cleared/next rung, titles earned);
//   • ThreatRecord  — the Profile record (best cleared level per mode).
// The chosen level is a DEVICE pref (like difficulty) clamped to what the save has earned, and
// App reads it once at launch through chosenThreat() — the run is deterministic from there.

import { useEffect, useState } from 'react';
import { meta } from '../../state/meta';
import type { SaveData } from '../../save/saveStore';
import { setThreatPref, threatPref } from '../../state/prefs';
import { threatBaselineMet, threatCleared, threatMaxFor } from '../../save/derive';
import {
  THREAT_BENCHMARK, THREAT_LEVELS, THREAT_MAX, THREAT_MODES, THREAT_MODE_LABEL,
  clampThreat, threatRewardMult, threatRungs, threatTitleName,
} from '../../core/threat';
import type { ThreatMode, ThreatOutcome } from '../../core/threat';
import { audio } from '../../audio/sound';

/** The level a run launched NOW in `mode` carries: the device pref clamped to the earned ceiling. */
export function chosenThreat(mode: ThreatMode, save: SaveData = meta.get()): number {
  return clampThreat(threatPref(mode), threatMaxFor(save, mode));
}

/** Pre-run Threat stepper: pick 0..(best cleared + 1); shows the stacked rungs, the reward bonus,
 *  what unlocks the next rung, and the frontier note (automation stays off above your best). */
export function ThreatPicker({ mode }: { mode: ThreatMode }): JSX.Element {
  const save = meta.use();
  const max = threatMaxFor(save, mode);
  const best = threatCleared(save, mode);
  const [picked, setPicked] = useState(() => chosenThreat(mode, save));
  const level = clampThreat(picked, max); // re-clamps if the save's ceiling ever shrinks (import)
  const set = (n: number): void => {
    const v = clampThreat(n, max);
    setPicked(v);
    setThreatPref(mode, v);
    audio.cue('ui');
  };
  const rungs = threatRungs(level);
  const locked = max < THREAT_MAX ? THREAT_LEVELS[max] : null; // the first sealed rung
  const bench = THREAT_BENCHMARK[mode].label;
  return (
    <section className={`threat-pick${level > 0 ? ' is-on' : ''}`} aria-label="Threat level">
      <div className="threat-head">
        <span className="threat-k">☣ Threat</span>
        <span className="threat-step" role="group" aria-label="Threat level">
          <button type="button" onClick={() => set(level - 1)} disabled={level <= 0} aria-label="Lower Threat">−</button>
          <b className="threat-lv" aria-live="polite">{level}</b>
          <button type="button" onClick={() => set(level + 1)} disabled={level >= max} aria-label="Raise Threat">+</button>
        </span>
        <span className="threat-reward">{level > 0 ? `Rewards ×${threatRewardMult(level).toFixed(2)}` : 'Baseline run'}</span>
        <span className="threat-best">Best cleared <b>{best > 0 ? best : '—'}</b> / {THREAT_MAX}</span>
      </div>
      {rungs.length > 0 && (
        <ol className="threat-rungs">
          {rungs.map((r) => (
            <li key={r.level} className={r.level === level ? 'is-new' : ''}>
              <i aria-hidden>{r.icon}</i>
              <b>{r.name}</b>
              <span>{r.blurb}</span>
            </li>
          ))}
        </ol>
      )}
      {locked && (
        <p className="threat-note">
          🔒 Threat {locked.level} · {locked.name} — {max === 0 && !threatBaselineMet(save, mode) ? `${bench} to open the ladder.` : `${bench} at Threat ${max}.`}
        </p>
      )}
      {level > best && (
        <p className="threat-note is-frontier">Frontier Threat — Hive Intelligence and Auto Gene stay off until you clear it.</p>
      )}
    </section>
  );
}

/** Results line for a Threat run (renders nothing at Threat 0). A newly cleared rung plays the
 *  level-up cue — the reward has its sound (Constitution #6). */
export function ThreatResult({ outcome }: { outcome?: ThreatOutcome }): JSX.Element | null {
  useEffect(() => {
    if (outcome?.newRecord) audio.cue('levelup');
  }, [outcome?.newRecord]);
  if (!outcome) return null;
  const rung = THREAT_LEVELS[outcome.level - 1];
  return (
    <div className={`threat-result${outcome.newRecord ? ' is-up' : ''}`} role="status">
      <span className="wm-chip wm-threat">☣ THREAT {outcome.level}</span>
      <span className="threat-result-name">{rung?.name} · {THREAT_MODE_LABEL[outcome.mode]} · rewards ×{outcome.rewardMult.toFixed(2)}</span>
      {outcome.newRecord
        ? <b className="threat-result-up">CLEARED — {outcome.nextUnlocked ? `Threat ${outcome.nextUnlocked} unlocked` : 'the top of the ladder'}</b>
        : <span className="threat-result-miss">{outcome.cleared ? 'Cleared — your record is already higher' : `Not cleared — ${THREAT_BENCHMARK[outcome.mode].label}`}</span>}
      {outcome.titles.map((id) => <span key={id} className="threat-result-title">Title earned: {threatTitleName(id)}</span>)}
    </div>
  );
}

/** Profile record: the best cleared Threat per ladder mode. */
export function ThreatRecord(): JSX.Element {
  const save = meta.use();
  return (
    <section className="pf-block" aria-label="Threat ladder record">
      <div className="pf-h">Threat Ladder</div>
      <div className="threat-record">
        {THREAT_MODES.map((m) => {
          const lv = threatCleared(save, m);
          return (
            <div key={m} className={`threat-rec${lv > 0 ? ' is-on' : ''}`}>
              <span className="threat-rec-k">{THREAT_MODE_LABEL[m]}</span>
              <b>{lv > 0 ? `Threat ${lv}` : '—'}</b>
              <span className="threat-rec-n">{lv > 0 ? THREAT_LEVELS[lv - 1].name : `max ${THREAT_MAX}`}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
