// Infinite Mastery — uncapped per-unit progression. Every tower kind and the hero
// gain Mastery XP just by being fielded; levels never stop, so a veteran always has a
// number going up. The bonus per level is logarithmic (small, ever-growing), with a
// fire/attack-rate milestone every 10 levels. Read-only menu surface; reuses shop styles.

import { meta } from '../state/meta';
import { TOWER_DEFS } from '../core/config';
import type { MasteryUnit } from '../core/config';
import { ProgressBar } from './components/ProgressBar';

const UNIT_LABEL: Record<MasteryUnit, string> = {
  needle: TOWER_DEFS.needle.name,
  mortar: TOWER_DEFS.mortar.name,
  reactor: TOWER_DEFS.reactor.name,
  hero: 'Hero',
};

function MasteryRow({ unit }: { unit: MasteryUnit }): JSX.Element {
  const p = meta.masteryProgress(unit);
  const toNext = p.nextMilestone - p.level;
  return (
    <div className="shop-item">
      <div className="info">
        <div className="name">
          {UNIT_LABEL[unit]}{' '}
          <span className="lvl" style={{ color: 'var(--gold)' }}>Lv {p.level}</span>
        </div>
        <div className="desc">
          +{p.dmgPct}% damage · milestone in {toNext} (Lv {p.nextMilestone} → +rate)
        </div>
        <ProgressBar value={p.into} max={p.span} color="var(--gold)" height={6} label={`${UNIT_LABEL[unit]} mastery`} />
      </div>
      <div className="mastery-xp">{Math.round(p.into)}<span>/{Math.round(p.span)}</span></div>
    </div>
  );
}

export function MasteryPanel(): JSX.Element | null {
  const save = meta.use();
  // Only appears once a unit has earned XP (i.e. after the first run) — keeps the
  // fresh-start menu clean, then becomes the ever-growing number for veterans.
  const any = meta.masteryUnits.some((u) => (save.mastery[u] ?? 0) > 0);
  if (!any) return null;
  return (
    <div className="panel">
      <div className="panel-title">
        Mastery
        <span className="track-bal">uncapped</span>
      </div>
      <div className="panel-sub">
        Every tower and the hero level up forever just by being fielded — a small, ever-growing damage bonus with no ceiling, plus a rate milestone every 10 levels.
      </div>
      <div className="shop-list">
        {meta.masteryUnits.map((u) => <MasteryRow key={u} unit={u} />)}
      </div>
    </div>
  );
}
