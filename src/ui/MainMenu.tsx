import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { MetaShop } from './MetaShop';
import { TowerLab } from './TowerLab';
import { HeroLab } from './HeroLab';
import { Statistics } from './Statistics';
import { AchievementPanel } from './AchievementPanel';
import { SaveManager } from './SaveManager';
import { PlayIcon } from './components/Icon';

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
        <button
          className="primary"
          onClick={() => {
            audio.resume();
            audio.cue('ui');
            onStart();
          }}
        >
          <PlayIcon /> Start Run
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

      <TowerLab />

      <HeroLab />

      <Statistics />

      <AchievementPanel />

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
