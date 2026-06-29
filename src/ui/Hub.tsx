// Headquarters shell — the inter-run hub as a true menu system (replaces the old long
// scrolling page). A persistent left nav rail + a top currency bar frame a single content
// area that swaps one dedicated screen per progression system. Nothing scrolls at the shell
// level; dense screens lay out in columns and the content area is the only scroll region.

import { useEffect, useState, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { CurrencyIcon } from './components/CurrencyIcon';
import { autoGenePref, setAutoGenePref } from '../state/prefs';
import { notifications } from '../state/notifications';
import '../state/notificationSources'; // registers the default menu badges (side-effect import)
import { PlayScreen } from './PlayScreen';
import { TowerLab } from './TowerLab';
import { HeroLab } from './HeroLab';
import { EquipmentPanel } from './EquipmentPanel';
import { GeneticVault } from './GeneticVault';
import { MetaShop } from './MetaShop';
import { PrestigePanel } from './PrestigePanel';
import { CollectionScreen } from './CollectionPanel';
import { Statistics } from './Statistics';
import { MasteryProfile } from './MasteryProfile';
import { AchievementPanel } from './AchievementPanel';
import { SaveManager } from './SaveManager';

type NavKey = 'play' | 'towers' | 'heroes' | 'vault' | 'upgrades' | 'collection' | 'profile' | 'settings';

const NAV: { key: NavKey; label: string; mono: string }[] = [
  { key: 'play', label: 'Play', mono: '▶' },
  { key: 'towers', label: 'Towers', mono: 'T' },
  { key: 'heroes', label: 'Heroes', mono: 'H' },
  { key: 'vault', label: 'Genetic Vault', mono: '◈' },
  { key: 'upgrades', label: 'Upgrades', mono: '↑' },
  { key: 'collection', label: 'Collection', mono: '▤' },
  { key: 'profile', label: 'Profile', mono: '◑' },
  { key: 'settings', label: 'Settings', mono: '⚙' },
];

function audioPref(): boolean {
  try { return localStorage.getItem('audioOn') !== 'false'; } catch { return true; }
}

/** Settings screen — save data management, the destructive reset, and an audio toggle. */
function SettingsScreen(): JSX.Element {
  const [sound, setSound] = useState(audioPref());
  const [autoGene, setAutoGene] = useState(autoGenePref());
  const toggleSound = (): void => {
    const next = !sound;
    setSound(next);
    audio.setEnabled(next);
    try { localStorage.setItem('audioOn', String(next)); } catch { /* private mode */ }
  };
  const toggleAutoGene = (): void => {
    const next = !autoGene;
    setAutoGene(next);
    setAutoGenePref(next);
  };
  return (
    <div className="hub-cols">
      <div>
        <SaveManager />
      </div>
      <div className="hub-col-stack">
        <div className="panel">
          <div className="panel-title">Preferences</div>
          <div className="panel-sub">Stored in this browser.</div>
          <label className="set-toggle">
            <span>Sound effects</span>
            <button className={`set-switch ${sound ? 'on' : ''}`} onClick={toggleSound} aria-pressed={sound}>
              {sound ? 'On' : 'Off'}
            </button>
          </label>
          <label className="set-toggle">
            <span>Auto Gene Selection<small>Auto-draft the ◆ PICK card after a 10s countdown.</small></span>
            <button className={`set-switch ${autoGene ? 'on' : ''}`} onClick={toggleAutoGene} aria-pressed={autoGene}>
              {autoGene ? 'On' : 'Off'}
            </button>
          </label>
        </div>
        <div className="panel">
          <div className="panel-title">Danger Zone</div>
          <div className="panel-sub">Permanently erase all progress on this device.</div>
          <button
            className="set-danger"
            onClick={() => { if (confirm('Erase all permanent progress?')) meta.reset(); }}
          >
            Reset Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function Hub({
  onStart,
  onStartEndless,
  difficultyRef,
  doctrineRef,
}: {
  onStart: () => void;
  onStartEndless: () => void;
  difficultyRef: MutableRefObject<string>;
  doctrineRef: MutableRefObject<string>;
}): JSX.Element {
  const [nav, setNav] = useState<NavKey>('play');
  const save = meta.use();
  notifications.use(); // re-render when a badge is acknowledged
  const cells = meta.prestigeView().cells;
  const power = meta.powerScore().score;
  const badges = notifications.badges(save);

  // Keep watermarks clamped to the live save (re-light a dot after claim/open/reset).
  useEffect(() => { notifications.sync(save); }, [save]);

  const go = (k: NavKey): void => {
    audio.cue('ui');
    notifications.markSeen(k, save); // viewing a menu clears its badge immediately
    setNav(k);
  };

  return (
    <div className="hub">
      <nav className="hub-nav" aria-label="Headquarters">
        <div className="hub-brand">ASSIMILATE</div>
        <div className="hub-navlist">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`hub-navitem ${nav === n.key ? 'on' : ''} ${n.key === 'play' ? 'is-play' : ''}`}
              onClick={() => go(n.key)}
              aria-label={badges[n.key] > 0 ? `${n.label} — ${badges[n.key]} new` : undefined}
            >
              <span className="hub-mono" aria-hidden>{n.mono}</span>
              <span className="hub-navlabel">{n.label}</span>
              {badges[n.key] > 0 && (
                <span className="nav-badge" aria-hidden>
                  {badges[n.key] > 1 ? (badges[n.key] > 9 ? '9+' : badges[n.key]) : ''}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="hub-power" title="Account power index">
          Power <b>×{power.toFixed(1)}</b>
        </div>
      </nav>

      <div className="hub-main">
        <header className="hub-topbar">
          <span className="hub-cur"><CurrencyIcon id="genomeCores" size={15} /> {save.shards} <span className="hub-cur-l">{ACCOUNT_CURRENCY.name}</span></span>
          <span className="hub-cur"><CurrencyIcon id="ascendantCells" size={15} /> {cells} <span className="hub-cur-l">Cells</span></span>
          <span className="hub-cur" title="Mutagen · Scrap · Catalyst">⊕ {save.mats.mutagen} · ◳ {save.mats.scrap} · ✷ {save.mats.catalyst}</span>
          <span className="hub-cur hub-cur-r">Best Wave <b>{save.bestWave}</b> · Runs <b>{save.totalRuns}</b></span>
        </header>

        <section className="hub-screen" key={nav}>
          {nav === 'play' && (
            <PlayScreen onStart={onStart} onStartEndless={onStartEndless} difficultyRef={difficultyRef} doctrineRef={doctrineRef} />
          )}
          {nav === 'towers' && <TowerLab />}
          {nav === 'heroes' && (
            <div className="heroes-screen">
              <HeroLab />
              <EquipmentPanel />
            </div>
          )}
          {nav === 'vault' && <GeneticVault />}
          {nav === 'upgrades' && (
            <div className="hub-cols">
              <MetaShop />
              <PrestigePanel />
            </div>
          )}
          {nav === 'collection' && <CollectionScreen />}
          {nav === 'profile' && (
            <div className="hub-cols">
              <Statistics />
              <div className="hub-col-stack">
                <MasteryProfile />
                <AchievementPanel />
              </div>
            </div>
          )}
          {nav === 'settings' && <SettingsScreen />}
        </section>
      </div>
    </div>
  );
}
