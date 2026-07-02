// Headquarters shell — the inter-run hub as a true menu system (replaces the old long
// scrolling page). A persistent left nav rail + a top currency bar frame a single content
// area that swaps one dedicated screen per progression system. Nothing scrolls at the shell
// level; dense screens lay out in columns and the content area is the only scroll region.

import { useEffect, useState, type CSSProperties, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
import { audio } from '../audio/sound';
import { AudioToggles } from './components/AudioToggles';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { CurrencyIcon } from './components/CurrencyIcon';
import { autoGenePref, setAutoGenePref } from '../state/prefs';
import { notifications } from '../state/notifications';
import '../state/notificationSources'; // registers the default menu badges (side-effect import)
import { PlayScreen } from './PlayScreen';
import { InfiniteScreen } from './InfiniteScreen';
import { CampaignScreen } from './CampaignScreen';
import { TowerLab } from './TowerLab';
import { HeroLab } from './HeroLab';
import { EquipmentPanel } from './EquipmentPanel';
import { GeneticVault } from './GeneticVault';
import { EvolutionHQ } from './EvolutionHQ';
import { HelpWiki } from './HelpWiki';
import { CollectionScreen } from './CollectionPanel';
import { Statistics } from './Statistics';
import { MasteryProfile } from './MasteryProfile';
import { AchievementPanel } from './AchievementPanel';
import { SaveManager } from './SaveManager';
import { navProgress } from './hubProgress';
import { DevTools } from './DevTools';
import { GeneArchive } from './GeneArchive';
import { LabAtmosphere } from './LabAtmosphere';
import { PowerBadge } from './components/PowerScore';

export type NavKey =
  | 'home' | 'campaign' | 'infinite'
  | 'towers' | 'heroes' | 'evolution' | 'genes'
  | 'vault' | 'equipment' | 'collection'
  | 'profile' | 'settings' | 'help';

interface NavItem { key: NavKey; label: string; mono: string }
interface NavGroup { title: string; items: NavItem[] }

// The nav is GROUPED by intent (the user-facing IA): Play / Progression / Collection / Account.
// Adding a screen is one row in the right group — the renderer, badges, and rings are generic.
const NAV_GROUPS: NavGroup[] = [
  { title: 'Play', items: [
    { key: 'home', label: 'Home', mono: '⌂' },
    { key: 'campaign', label: 'Campaign', mono: '⬡' },
    { key: 'infinite', label: 'Infinite', mono: '∞' },
  ] },
  { title: 'Progression', items: [
    { key: 'towers', label: 'Towers', mono: 'T' },
    { key: 'heroes', label: 'Heroes', mono: 'H' },
    { key: 'evolution', label: 'Evolution', mono: '✷' },
    { key: 'genes', label: 'Gene Archive', mono: '⌬' },
  ] },
  { title: 'Collection', items: [
    { key: 'vault', label: 'Genetic Vault', mono: '◈' },
    { key: 'equipment', label: 'Equipment', mono: '⛨' },
    { key: 'collection', label: 'Collection', mono: '▤' },
  ] },
  { title: 'Account', items: [
    { key: 'profile', label: 'Profile', mono: '◑' },
    { key: 'help', label: 'Help', mono: '?' },
    { key: 'settings', label: 'Settings', mono: '⚙' },
  ] },
];

// Accent tint per group — the rail reads as zones, and each group's selected item / ring glows
// in its own hue (CSS consumes `--nav-accent`).
const GROUP_ACCENT: Record<string, string> = {
  Play: 'var(--vital)', Progression: 'var(--kinetic)', Collection: 'var(--gold)', Account: 'var(--muted)',
};

/** Settings screen — save data management, the destructive reset, and audio preferences. */
function SettingsScreen({ onReplayTutorial }: { onReplayTutorial: () => void }): JSX.Element {
  const [autoGene, setAutoGene] = useState(autoGenePref());
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
          <AudioToggles />
          <label className="set-toggle">
            <span>Auto Gene Selection<small>Auto-draft the ◆ PICK card after a 10s countdown.</small></span>
            <button className={`set-switch ${autoGene ? 'on' : ''}`} onClick={toggleAutoGene} aria-pressed={autoGene}>
              {autoGene ? 'On' : 'Off'}
            </button>
          </label>
        </div>
        <div className="panel">
          <div className="panel-title">Help</div>
          <div className="panel-sub">Re-learn the basics any time.</div>
          <button className="set-switch" onClick={onReplayTutorial}>▶ Replay Combat Tutorial</button>
        </div>
        <div className="panel">
          <div className="panel-title">Danger Zone</div>
          <div className="panel-sub">Permanently erase all progress on this device.</div>
          <button
            className="set-danger"
            onClick={() => { if (confirm('Erase all permanent progress?')) { meta.reset(); onReplayTutorial(); } }}
          >
            Reset Save
          </button>
        </div>
        <DevTools />
      </div>
    </div>
  );
}

export function Hub({
  onStart,
  onStartEndless,
  onStartCampaign,
  last,
  onSeenLast,
  onReplayTutorial,
  difficultyRef,
  doctrineRef,
}: {
  onStart: () => void;
  onStartEndless: () => void;
  onStartCampaign: (stage: number) => void;
  last: { result: RunResult; outcome: RunOutcome } | null;
  onSeenLast: () => void;
  onReplayTutorial: () => void;
  difficultyRef: MutableRefObject<string>;
  doctrineRef: MutableRefObject<string>;
}): JSX.Element {
  const [nav, setNav] = useState<NavKey>('home');
  const [navOpen, setNavOpen] = useState(false); // narrow-shell drawer (docs/RESPONSIVE-DESIGN.md)
  const save = meta.use();
  notifications.use(); // re-render when a badge is acknowledged
  const cells = meta.prestigeView().cells;
  const badges = notifications.badges(save);
  const progress = navProgress(save); // 0..1 completion rings per menu

  // Keep watermarks clamped to the live save (re-light a dot after claim/open/reset).
  useEffect(() => { notifications.sync(save); }, [save]);

  const go = (k: NavKey): void => {
    audio.cue('ui');
    notifications.markSeen(k, save); // viewing a menu clears its badge immediately
    setNav(k);
    setNavOpen(false); // picking a destination closes the narrow-shell drawer
  };

  return (
    <div className="hub">
      <LabAtmosphere />
      {navOpen && <div className="hub-nav-veil" onClick={() => setNavOpen(false)} aria-hidden />}
      <nav className={`hub-nav${navOpen ? ' is-open' : ''}`} aria-label="Headquarters">
        <div className="hub-brand">ASSIMILATE</div>
        <div className="hub-navlist">
          {NAV_GROUPS.map((group) => (
            <div
              className="hub-navgroup"
              key={group.title}
              style={{ ['--nav-accent' as string]: GROUP_ACCENT[group.title] } as CSSProperties}
            >
              <div className="hub-navgroup-h" aria-hidden>{group.title}</div>
              {group.items.map((n) => {
                const badge = badges[n.key] ?? 0;
                const ring = progress[n.key];
                return (
                  <button
                    key={n.key}
                    className={`hub-navitem ${nav === n.key ? 'on' : ''}`}
                    onClick={() => go(n.key)}
                    onPointerEnter={() => audio.cue('hover')}
                    aria-current={nav === n.key ? 'page' : undefined}
                    aria-label={badge > 0 ? `${n.label} — ${badge} new` : undefined}
                  >
                    <span
                      className={`hub-mono ${ring != null ? 'has-ring' : ''}`}
                      aria-hidden
                      style={ring != null ? ({ ['--p' as string]: ring } as CSSProperties) : undefined}
                    >
                      {n.mono}
                    </span>
                    <span className="hub-navlabel">{n.label}</span>
                    {ring != null && <span className="hub-ringpct" aria-hidden>{Math.round(ring * 100)}%</span>}
                    {badge > 0 && (
                      <span className="nav-badge" aria-hidden>
                        {badge > 1 ? (badge > 9 ? '9+' : badge) : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="hub-power">
          <PowerBadge />
        </div>
      </nav>

      <div className="hub-main">
        <header className="hub-topbar">
          <button className="hub-burger" onClick={() => setNavOpen((v) => !v)} aria-label="Open navigation" aria-expanded={navOpen}>
            ☰ <span className="hub-burger-l">Menu</span>
          </button>
          <span className="hub-cur"><CurrencyIcon id="genomeCores" size={15} /> {save.shards} <span className="hub-cur-l">{ACCOUNT_CURRENCY.name}</span></span>
          <span className="hub-cur"><CurrencyIcon id="ascendantCells" size={15} /> {cells} <span className="hub-cur-l">Cells</span></span>
          <span className="hub-cur" title="Mutagen · Scrap · Catalyst">⊕ {save.mats.mutagen} · ◳ {save.mats.scrap} · ✷ {save.mats.catalyst}</span>
          <span className="hub-cur hub-cur-r">Best Wave <b>{save.bestWave}</b> · Runs <b>{save.totalRuns}</b></span>
        </header>

        <section className="hub-screen" key={nav}>
          {nav === 'home' && (
            <PlayScreen onStart={onStart} onStartEndless={onStartEndless} onStartCampaign={onStartCampaign} go={go} last={last} onSeenLast={onSeenLast} doctrineRef={doctrineRef} />
          )}
          {nav === 'campaign' && <CampaignScreen onStart={onStartCampaign} difficultyRef={difficultyRef} />}
          {nav === 'infinite' && (
            <InfiniteScreen onStartEndless={onStartEndless} difficultyRef={difficultyRef} doctrineRef={doctrineRef} />
          )}
          {nav === 'towers' && <TowerLab />}
          {nav === 'heroes' && <HeroLab />}
          {nav === 'evolution' && <EvolutionHQ />}
          {nav === 'genes' && <GeneArchive />}
          {nav === 'vault' && <GeneticVault />}
          {nav === 'equipment' && <EquipmentPanel />}
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
          {nav === 'settings' && <SettingsScreen onReplayTutorial={onReplayTutorial} />}
          {nav === 'help' && <HelpWiki onNavigate={(k) => go(k as NavKey)} />}
        </section>
      </div>
    </div>
  );
}
