// POWER HISTORY (docs/POWER-SCORE.md §history) — the account's Power Score, remembered.
// One save entry per UTC day (the LAST score observed that day), bounded to POWER_LOG_CAP.
// Pure folds + queries over SaveData; the meta layer owns the write (meta.notePowerSnapshot,
// called on boot and after power gains), so this module never touches the store — no cycles.

import type { SaveData } from '../save/saveStore';
import { POWER_LOG_CAP } from '../save/saveStore';

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Fold today's score into the log — last write per day wins; identical writes return the SAME
 *  save object so callers can skip a pointless persist. */
export function withPowerLogged(save: SaveData, score: number, now = Date.now()): SaveData {
  if (!Number.isFinite(score) || score <= 0) return save;
  const day = utcDay(now);
  const log = save.powerLog ?? [];
  const last = log[log.length - 1];
  if (last?.day === day && last.score === score) return save;
  const next = last?.day === day
    ? [...log.slice(0, -1), { day, score }]
    : [...log, { day, score }].slice(-POWER_LOG_CAP);
  return { ...save, powerLog: next };
}

/** Power gained over the trailing week: current score minus the newest entry ≥ 7 days old.
 *  Falls back to the OLDEST entry when history is shorter (an honest "since we started
 *  counting"); null only when there is no prior day at all. */
export function weeklyPowerDelta(save: SaveData, currentScore: number, now = Date.now()): number | null {
  const log = save.powerLog ?? [];
  if (log.length === 0) return null;
  const cutoff = utcDay(now - 7 * 86_400_000);
  let baseline = log[0];
  for (const e of log) if (e.day <= cutoff) baseline = e; // entries are day-ascending
  if (baseline.day === utcDay(now)) return null; // only today's snapshot exists — no trend yet
  return currentScore - baseline.score;
}

/** The sparkline series: the newest `days` entries (day-ascending). Sparse by design —
 *  skipped days simply have no point; renderers connect what exists. */
export function powerSeries(save: SaveData, days = 30): { day: string; score: number }[] {
  return (save.powerLog ?? []).slice(-days);
}
