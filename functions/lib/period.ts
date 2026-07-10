// UTC period keys for the account-XP boards (docs/ACCOUNT-LEVEL.md §leaderboards).
// Mirrors src/core/accountLevel.ts (weekKey/monthKey) — duplicated on purpose: functions/
// stays import-isolated from the game bundle, and these are two tiny pure formulas. The
// SERVER derives the bucket key itself, so a client can never submit into a past period.

/** ISO week key (UTC, Thursday-anchored): "2026-W28". */
export function utcWeekKey(now = Date.now()): string {
  const d = new Date(now);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Month key (UTC): "2026-07". */
export function utcMonthKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
