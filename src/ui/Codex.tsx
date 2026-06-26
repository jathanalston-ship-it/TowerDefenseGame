// Codex — the long-term *motivation* surface (collection completion + achievement
// chains + titles). Reads only meta read-models; grants no power. Lives on the main
// menu beside the upgrade shop.

import { meta } from '../state/meta';
import { ProgressBar } from './components/ProgressBar';

function CollectionStat({ label, have, total }: { label: string; have: number; total: number }): JSX.Element {
  const done = have >= total;
  return (
    <div className="codex-stat">
      <div className="codex-stat-head">
        <span className="codex-stat-label">{label}</span>
        <span className={`codex-stat-count ${done ? 'is-complete' : ''}`}>
          {have}/{total}{done ? ' ✓' : ''}
        </span>
      </div>
      <ProgressBar value={have} max={total} color={done ? 'var(--success)' : 'var(--gold)'} height={6} label={`${label} discovered`} />
    </div>
  );
}

export function Codex(): JSX.Element {
  const save = meta.use();
  const totals = meta.codexTotals;
  const unlocked = new Set(save.achievements);
  const totalAch = meta.achievementDefs.length;

  return (
    <div className="panel codex">
      <div className="panel-title">
        Codex
        <span className="track-bal">{unlocked.size}/{totalAch} unlocked</span>
      </div>
      <div className="panel-sub">
        Discover every strain, biome, and mutation — and earn a title for the deepest feats.
        {save.title ? <> Current title: <b style={{ color: 'var(--gold)' }}>“{save.title}”</b>.</> : null}
      </div>

      <div className="codex-collection">
        <CollectionStat label="Enemy Strains" have={save.codex.enemies.length} total={totals.enemies} />
        <CollectionStat label="Biomes" have={save.codex.biomes.length} total={totals.biomes} />
        <CollectionStat label="Gene Cards" have={save.codex.cards.length} total={totals.cards} />
      </div>

      <div className="codex-achievements">
        {meta.achievementGroups.map((group) => (
          <div className="codex-group" key={group}>
            <div className="codex-group-title">{group}</div>
            {meta.achievementDefs
              .filter((a) => a.group === group)
              .map((a) => {
                const got = unlocked.has(a.id);
                return (
                  <div className={`codex-ach ${got ? 'is-unlocked' : 'is-locked'}`} key={a.id}>
                    <span className="codex-ach-mark">{got ? '✦' : '·'}</span>
                    <span className="codex-ach-body">
                      <span className="codex-ach-name">
                        {a.name}
                        {a.title && got ? <span className="codex-ach-title"> · “{a.title}”</span> : null}
                      </span>
                      <span className="codex-ach-desc">{a.description}</span>
                    </span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
