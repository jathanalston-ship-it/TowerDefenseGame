// Tower Stars — per-unit permanent progression. Spend Genome Shards (earned from loot
// boxes + runs) to star up each tower: most steps add power, ★3 / ★5 unlock a new
// ability. The first per-unit progression surface; reuses the meta-shop styles.

import { meta } from '../state/meta';
import { TOWER_ORDER, TOWER_DEFS, STAR_TRACKS, STAR_MAX } from '../core/config';
import type { TowerKind } from '../core/types';
import { audio } from '../audio/audio';
import { ProgressBar } from './components/ProgressBar';

function StarRow({ kind, shards }: { kind: TowerKind; shards: number }): JSX.Element {
  const def = TOWER_DEFS[kind];
  const level = meta.starLevel(kind);
  const cost = meta.nextStarCost(kind);
  const maxed = cost === null;
  const next = !maxed ? STAR_TRACKS[kind][level] : null;
  const afford = cost !== null && shards >= cost;
  return (
    <div className={`shop-item ${maxed ? 'is-maxed' : ''}`}>
      <div className="info">
        <div className="name">
          {def.name}{' '}
          <span className="lvl" style={{ color: 'var(--gold)', letterSpacing: '1px' }}>
            {'★'.repeat(level)}
            <span style={{ color: 'var(--muted)' }}>{'☆'.repeat(STAR_MAX - level)}</span>
          </span>
        </div>
        <div className="desc">
          {next ? (
            <>
              {next.unlock ? <b style={{ color: 'var(--gold)' }}>{next.unlock}: </b> : <span style={{ color: 'var(--muted)' }}>Next ★{level + 1}: </span>}
              {next.desc}
            </>
          ) : (
            'Fully starred.'
          )}
        </div>
        <ProgressBar value={level} max={STAR_MAX} color="var(--gold)" height={6} segments={STAR_MAX} label={`${def.name} stars`} />
      </div>
      <button
        className={`shop-buy ${afford ? 'is-afford' : ''} ${maxed ? '' : 'btn-ico'}`}
        disabled={maxed || !afford}
        onClick={() => { if (meta.buyStar(kind)) audio.play('purchase'); }}
      >
        {maxed ? 'MAX' : <>{cost} ✦</>}
      </button>
    </div>
  );
}

export function StarPanel(): JSX.Element {
  const save = meta.use();
  return (
    <div className="panel">
      <div className="panel-title">
        Tower Stars
        <span className="track-bal">{save.genomeShards} ✦ Genome Shards</span>
      </div>
      <div className="panel-sub">
        Star up each tower — power steps plus a new ability at ★3 and ★5. Bought with Genome Shards (Bio-Containers + every run).
      </div>
      <div className="shop-list">
        {TOWER_ORDER.map((k) => (
          <StarRow key={k} kind={k} shards={save.genomeShards} />
        ))}
      </div>
    </div>
  );
}
