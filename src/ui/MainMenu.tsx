import { meta } from '../state/meta';
import { MetaShop } from './MetaShop';
import { StarPanel } from './StarPanel';
import { LoadoutPanel } from './LoadoutPanel';
import { MasteryPanel } from './MasteryPanel';
import { Codex } from './Codex';
import { LootMeter } from './LootMeter';
import { LootBoxOpener } from './LootBoxOpener';
import { SaveManager } from './SaveManager';
import { ModePanel } from './ModePanel';
import { CountUp } from './components/CountUp';
import type { GameConfig } from '../core/game';

export function MainMenu({ onStart }: { onStart: (config: GameConfig) => void }): JSX.Element {
  const save = meta.use();
  return (
    <div className="menu">
      <div>
        <h1 className="title">ASSIMILATE</h1>
        <p className="subtitle">
          Cyberpunk bio-horror tower defense — vertical slice. Grow, mutate, assimilate.
        </p>
        {save.title ? <p className="player-title">⟡ {save.title}</p> : null}
      </div>

      <div className="panel">
        <div className="records">
          <div className="record">
            <div className="k">Shards</div>
            <CountUp className="v" style={{ color: 'var(--gold)' }} value={save.shards} />
          </div>
          <div className="record">
            <div className="k">Best Wave</div>
            <CountUp className="v" value={save.bestWave} />
          </div>
          <div className="record">
            <div className="k">Runs</div>
            <CountUp className="v" value={save.totalRuns} />
          </div>
          <div className="record">
            <div className="k">Lifetime Shards</div>
            <CountUp className="v" value={save.lifetimeShards} />
          </div>
        </div>
        <LootMeter />
        <LootBoxOpener />
      </div>

      <ModePanel onStart={onStart} />

      <div className="row">
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

      <StarPanel />

      <LoadoutPanel />

      <MasteryPanel />

      <Codex />

      <SaveManager />

      <div className="panel how-to">
        <b style={{ color: 'var(--text)' }}>How to play.</b> Grow towers on the lit slots in your
        defensive zone (spend biomass). Press <b>Start Wave</b>: enemies swarm from the top — hold
        the line at the bottom. Survive 12 waves to extract. Between waves, draft a Gene Card.
        Combine <span style={{ color: 'var(--kinetic)' }}>Fracture</span> (Needle/Hero) with{' '}
        <span style={{ color: 'var(--caustic)' }}>Corrosion</span> (Mortar) to trigger{' '}
        <b style={{ color: '#fff066' }}>SHRED</b>. Grow a{' '}
        <span style={{ color: 'var(--vital)' }}>Flesh Reactor</span> beside towers to overcharge
        them. Earn Shards to buy permanent upgrades.
      </div>
    </div>
  );
}
