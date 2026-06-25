import { meta } from '../state/meta';
import { MetaShop } from './MetaShop';

export function MainMenu({ onStart }: { onStart: () => void }): JSX.Element {
  const save = meta.use();
  return (
    <div className="menu">
      <div>
        <h1 className="title">ASSIMILATE</h1>
        <p className="subtitle">
          Cyberpunk bio-horror tower defense — vertical slice. Grow, mutate, assimilate.
        </p>
      </div>

      <div className="panel">
        <div className="records">
          <div className="record">
            <div className="k">Shards</div>
            <div className="v" style={{ color: 'var(--gold)' }}>
              {save.shards}
            </div>
          </div>
          <div className="record">
            <div className="k">Best Wave</div>
            <div className="v">{save.bestWave}</div>
          </div>
          <div className="record">
            <div className="k">Runs</div>
            <div className="v">{save.totalRuns}</div>
          </div>
          <div className="record">
            <div className="k">Lifetime Shards</div>
            <div className="v">{save.lifetimeShards}</div>
          </div>
        </div>
      </div>

      <div className="row">
        <button className="primary" onClick={onStart}>
          ▶ Start Run
        </button>
        <div className="spacer" />
        <button
          onClick={() => {
            if (confirm('Erase all permanent progress?')) meta.reset();
          }}
        >
          Reset Save
        </button>
      </div>

      <MetaShop />

      <div className="panel" style={{ color: 'var(--muted)', fontSize: 13 }}>
        <b style={{ color: 'var(--text)' }}>How to play.</b> Place towers on the lit cells beside
        the path (spend biomass). Press <b>Start Wave</b>. Survive 12 waves to extract. Between
        waves, draft a Gene Card. Combine <span style={{ color: 'var(--kinetic)' }}>Fracture</span>{' '}
        (Needle/Hero) with <span style={{ color: 'var(--caustic)' }}>Corrosion</span> (Mortar) to
        trigger <b style={{ color: '#fff066' }}>SHRED</b>. Place a{' '}
        <span style={{ color: 'var(--vital)' }}>Flesh Reactor</span> next to towers to overcharge
        them. Earn Shards to buy permanent upgrades.
      </div>
    </div>
  );
}
