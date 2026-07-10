// Headquarters shell — the inter-run hub as a true menu system (replaces the old long
// scrolling page). A persistent left nav rail + a top currency bar frame a single content
// area that swaps one dedicated screen per progression system. Nothing scrolls at the shell
// level; dense screens lay out in columns and the content area is the only scroll region.

import { t, useLocale, setLocale, getLocale, LOCALES } from '../i18n';
import { useEffect, useMemo, useState, type CSSProperties, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
import type { ReplayRecord } from '../core/replay';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { AudioToggles } from './components/AudioToggles';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { CurrencyIcon } from './components/CurrencyIcon';
import { autoGenePref, setAutoGenePref } from '../state/prefs';
import { notifications } from '../state/notifications';
import '../state/notificationSources'; // registers the default menu badges (side-effect import)
import { CommandCenter } from './CommandCenter';
import { InfiniteScreen } from './InfiniteScreen';
import { BossRushScreen } from './BossRushScreen';
import { DailyScreen } from './DailyScreen';
import { PremiumStore } from './PremiumStore';
import { highestCampaignStage, isBossRushUnlocked, isDailyUnlocked, isInfiniteUnlocked } from '../save/derive';
import { MODE_UNLOCKS } from '../core/config';
import { CampaignScreen } from './CampaignScreen';
import { TowerLab } from './TowerLab';
import { MulliganLab } from './MulliganLab';
import { EquipmentCollection } from './EquipmentCollection';
import { HeroLab } from './HeroLab';
import { EquipmentPanel } from './EquipmentPanel';
import { GeneticVault } from './GeneticVault';
import { SpliceMarket } from './SpliceMarket';
import { EvolutionHQ } from './EvolutionHQ';
import { HelpWiki } from './HelpWiki';
import { CollectionScreen } from './CollectionPanel';
import { PlayerProfile } from './PlayerProfile';
import { SaveManager } from './SaveManager';
import { CloudBackup } from './components/CloudBackup';
import { AccountPanel } from './components/AccountPanel';
import { navProgress } from './hubProgress';
import { DevTools } from './DevTools';
import { MusicDebug } from './MusicDebug';
import { GeneArchive } from './GeneArchive';
import { PhenotypeLab } from './PhenotypeLab';
import { LabAtmosphere } from './LabAtmosphere';
import { PowerBadge } from './components/PowerScore';

export type NavKey =
  | 'home' | 'campaign' | 'infinite' | 'bossrush' | 'daily'
  | 'towers' | 'heroes' | 'evolution' | 'genes' | 'mulligans'
  | 'vault' | 'market' | 'equipment' | 'gearcodex' | 'phenotypes' | 'collection'
  | 'store'
  | 'profile' | 'settings' | 'help';

interface NavItem { key: NavKey; label: string; mono: string }
/** `compact` renders the group as a row of labelled icon squares (the Account trio) so every
 * destination — Settings included — stays visible without scrolling the rail. `headerless`
 * drops the group title when it would merely repeat its only item's label (the Store). */
interface NavGroup { title: string; accent: string; items: NavItem[]; compact?: boolean; headerless?: boolean }

// The nav is GROUPED by intent (the user-facing IA): Play / Progression / Collection / Account.
// Adding a screen is one row in the right group — the renderer, badges, and rings are generic.
const navGroups = (): NavGroup[] => [
  { title: t('nav.group.play'), accent: 'var(--vital)', items: [
    { key: 'home', label: t('nav.home'), mono: '⌂' },
    { key: 'campaign', label: t('nav.campaign'), mono: '⬡' },
    { key: 'infinite', label: t('nav.infinite'), mono: '∞' },
    { key: 'bossrush', label: t('nav.bossrush'), mono: '☠' },
    { key: 'daily', label: t('nav.daily'), mono: '☀' },
  ] },
  { title: t('nav.group.progression'), accent: 'var(--kinetic)', items: [
    { key: 'towers', label: t('nav.towers'), mono: 'T' },
    { key: 'heroes', label: t('nav.heroes'), mono: 'H' },
    { key: 'evolution', label: t('nav.evolution'), mono: '✷' },
    { key: 'genes', label: t('nav.genes'), mono: '⌬' },
    { key: 'mulligans', label: t('nav.mulligans'), mono: '⊛' },
  ] },
  { title: t('nav.group.collection'), accent: 'var(--gold)', items: [
    { key: 'vault', label: t('nav.vault'), mono: '◈' },
    { key: 'market', label: t('nav.market'), mono: '◆' },
    { key: 'equipment', label: t('nav.equipment'), mono: '⛨' },
    { key: 'gearcodex', label: t('nav.gearcodex'), mono: '❑' },
    { key: 'phenotypes', label: t('nav.phenotypes'), mono: '❖' },
    { key: 'collection', label: t('nav.collection'), mono: '▤' },
  ] },
  // The Premium Store sits in its OWN group — monetization stays visibly separate from
  // gameplay progression (docs/PREMIUM-STORE.md §philosophy). Headerless: the divider +
  // viral accent carry the separation; a "STORE" title over a "STORE" row said it twice.
  { title: t('nav.group.store'), accent: 'var(--viral)', headerless: true, items: [
    { key: 'store', label: t('nav.store'), mono: '✷' },
  ] },
  { title: t('nav.group.account'), accent: 'var(--muted)', compact: true, items: [
    { key: 'profile', label: t('nav.profile'), mono: '◑' },
    { key: 'help', label: t('nav.help'), mono: '?' },
    { key: 'settings', label: t('nav.settings'), mono: '⚙' },
  ] },
];

// Accent tint per group rides the group row itself (localization-safe — titles translate).

/** A campaign-sealed mode's unlock briefing (docs/MODE-IDENTITY.md §gates) — the mode stays
 * VISIBLE for anticipation; the briefing names the gate, shows live progress, and routes to
 * the Campaign instead of dead-ending. */
function ModeLocked({ title, glyph, blurb, stage, current, go }: {
  title: string;
  glyph: string;
  blurb: string;
  stage: number; // the campaign stage that opens this mode
  current: number; // the account's highest cleared stage
  go: (k: NavKey) => void;
}): JSX.Element {
  const pct = Math.min(100, Math.round((current / stage) * 100));
  return (
    <div className="menu mode-locked">
      <h1 className="title">{title}</h1>
      <p className="subtitle">{blurb}</p>
      <div className="panel mode-locked-panel">
        <div className="mode-locked-glyph" aria-hidden>{glyph}</div>
        <div className="mode-locked-k">SEALED BY THE CAMPAIGN</div>
        <p className="mode-locked-body">
          Clear <b>Campaign Stage {stage}</b> to open this front — you are at <b>Stage {current}</b>.
        </p>
        <div className="rush-mile-bar mode-locked-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
        <div className="mode-locked-pct">{current}/{stage} stages</div>
        <button className="primary" onClick={() => go('campaign')}>⬡ Continue the Campaign</button>
      </div>
    </div>
  );
}

/** Settings screen — save data management, the destructive reset, and audio preferences. */
function SettingsScreen({ onReplayTutorial, onReplayTour, onReplayIntro }: { onReplayTutorial: () => void; onReplayTour: () => void; onReplayIntro: () => void }): JSX.Element {
  useLocale(); // language switch re-renders this panel live
  const [autoGene, setAutoGene] = useState(autoGenePref());
  const toggleAutoGene = (): void => {
    const next = !autoGene;
    setAutoGene(next);
    setAutoGenePref(next);
  };
  return (
    <div className="hub-cols">
      {/* Column split by concern — DATA (save, account, cloud) | BEHAVIOR (prefs, help,
          danger) — so both columns carry real weight instead of one panel vs. six. */}
      <div className="hub-col-stack">
        <SaveManager />
        <div className="panel">
          <div className="panel-title">Account</div>
          <div className="panel-sub">One account, every platform — guest today, permanent whenever you choose. Everything transfers.</div>
          <AccountPanel />
        </div>
        <div className="panel">
          <div className="panel-title">{t('settings.cloud.title')}</div>
          <div className="panel-sub">One manual slot per sync code. Your code works like a password — it restores this account on any device.</div>
          <CloudBackup />
        </div>
      </div>
      <div className="hub-col-stack">
        <div className="panel">
          <div className="panel-title">{t('settings.title')}</div>
          <div className="panel-sub">{t('settings.sub')}</div>
          <label className="set-toggle">
            <span>{t('settings.language')}<small>{t('settings.language.sub')}</small></span>
            <select
              className="set-select"
              value={getLocale()}
              onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}
              aria-label={t('settings.language')}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>{l === 'en' ? 'English' : l === 'es' ? 'Español' : 'Português'}</option>
              ))}
            </select>
          </label>
          <AudioToggles />
          <label className="set-toggle">
            <span>Auto Gene Selection<small>Auto-draft the ◆ PICK card after a 10s countdown.</small></span>
            <button className={`set-switch ${autoGene ? 'on' : ''}`} onClick={toggleAutoGene} aria-pressed={autoGene}>
              {autoGene ? 'On' : 'Off'}
            </button>
          </label>
        </div>
        <div className="panel">
          <div className="panel-title">{t('settings.help.title')}</div>
          <div className="panel-sub">{t('settings.help.sub')}</div>
          <button className="set-switch" onClick={onReplayTutorial}>{t('settings.replayTutorial')}</button>
          <button className="set-switch" onClick={onReplayTour}>{t('settings.replayTour')}</button>
          <button className="set-switch" onClick={onReplayIntro}>{t('settings.replayIntro')}</button>
        </div>
        <div className="panel">
          <div className="panel-title">{t('settings.danger.title')}</div>
          <div className="panel-sub">{t('settings.danger.sub')}</div>
          <button
            className="set-danger"
            onClick={() => { if (confirm('Erase all permanent progress?')) { meta.reset(); onReplayTutorial(); } }}
          >
            {t('settings.reset')}
          </button>
        </div>
        <MusicDebug />
        <DevTools />
      </div>
    </div>
  );
}

export function Hub({
  onStart,
  onStartEndless,
  onStartBossRush,
  onStartCampaign,
  onStartDaily,
  last,
  onSeenLast,
  onReplayTutorial,
  onReplayTour,
  onReplayIntro,
  onSpectate,
  difficultyRef,
  doctrineRef,
}: {
  onStart: () => void;
  onStartEndless: () => void;
  onStartBossRush: () => void;
  onStartCampaign: (stage: number) => void;
  onStartDaily: () => void;
  last: { result: RunResult; outcome: RunOutcome } | null;
  onSeenLast: () => void;
  onReplayTutorial: () => void;
  onReplayTour: () => void;
  onReplayIntro: () => void;
  onSpectate: (r: ReplayRecord) => void;
  difficultyRef: MutableRefObject<string>;
  doctrineRef: MutableRefObject<string>;
}): JSX.Element {
  const [nav, setNav] = useState<NavKey>('home');
  useLocale(); // nav labels re-resolve on language switch
  const [navOpen, setNavOpen] = useState(false); // narrow-shell drawer (docs/RESPONSIVE-DESIGN.md)
  const save = meta.use();
  const ackTick = notifications.use(); // re-render when a badge is acknowledged
  const cells = meta.prestigeView().cells;
  // Derived rail state — recomputed only when the save snapshot (or an ack) changes, not on
  // every shell render; navProgress walks every tower/hero/upgrade/card.
  const badges = useMemo(() => notifications.badges(save), [save, ackTick]);
  const progress = useMemo(() => navProgress(save), [save]); // 0..1 completion rings per menu
  // Campaign gates (docs/MODE-IDENTITY.md §gates): locked modes stay VISIBLE (anticipation) —
  // the nav shows a seal and the screen becomes the unlock briefing instead of the terminal.
  const modeLocked: Partial<Record<NavKey, boolean>> = {
    infinite: !isInfiniteUnlocked(save),
    bossrush: !isBossRushUnlocked(save),
    daily: !isDailyUnlocked(save),
  };

  // Keep watermarks clamped to the live save (re-light a dot after claim/open/reset).
  useEffect(() => { notifications.sync(save); }, [save]);

  // Hub scene → menu music (audio/music.ts §scenes): each wing of the Command Center biases the
  // NEXT menu pick toward its scene-tagged themes — rotation (not this) actually switches tracks,
  // so browsing never stutters the score.
  useEffect(() => {
    music.setScene(nav);
    return () => music.setScene(null); // leaving the hub (into a run) clears the bias
  }, [nav]);

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
          {navGroups().map((group) => (
            <div
              className={`hub-navgroup${group.compact ? ' is-compact' : ''}`}
              key={group.title}
              style={{ ['--nav-accent' as string]: group.accent } as CSSProperties}
            >
              {!group.headerless && <div className="hub-navgroup-h" aria-hidden>{group.title}</div>}
              {group.compact && <div className="hub-navrow">{group.items.map((n) => {
                const badge = badges[n.key] ?? 0;
                return (
                  <button
                    key={n.key}
                    data-nav={n.key}
                    className={`hub-navsquare ${nav === n.key ? 'on' : ''}`}
                    onClick={() => go(n.key)}
                    onPointerEnter={() => audio.cue('hover')}
                    aria-current={nav === n.key ? 'page' : undefined}
                    aria-label={badge > 0 ? `${n.label} — ${badge} new` : n.label}
                    title={n.label}
                  >
                    <span className="hub-mono" aria-hidden>
                      {n.mono}
                      {badge > 0 && <span className="nav-badge" aria-hidden>{badge > 1 ? (badge > 9 ? '9+' : badge) : ''}</span>}
                    </span>
                    <span className="hub-navsquare-l">{n.label}</span>
                  </button>
                );
              })}</div>}
              {!group.compact && group.items.map((n) => {
                const badge = badges[n.key] ?? 0;
                const ring = progress[n.key];
                const locked = modeLocked[n.key] === true;
                return (
                  <button
                    key={n.key}
                    data-nav={n.key}
                    className={`hub-navitem ${nav === n.key ? 'on' : ''}${locked ? ' is-locked' : ''}`}
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
                      {/* The badge anchors to the glyph corner so it never collides with the
                          ring % at the row's right edge (the pre-overhaul overlap). */}
                      {badge > 0 && <span className="nav-badge" aria-hidden>{badge > 1 ? (badge > 9 ? '9+' : badge) : ''}</span>}
                    </span>
                    <span className="hub-navlabel">{n.label}</span>
                    {locked && <span className="hub-lock" aria-hidden>🔒</span>}
                    {ring != null && ring >= 0.005 && <span className="hub-ringpct" aria-hidden>{Math.round(ring * 100)}%</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="hub-power" data-tour="power">
          <PowerBadge />
        </div>
      </nav>

      <div className="hub-main">
        <header className="hub-topbar" data-tour="topbar">
          <button className="hub-burger" onClick={() => setNavOpen((v) => !v)} aria-label="Open navigation" aria-expanded={navOpen}>
            ☰ <span className="hub-burger-l">Menu</span>
          </button>
          {/* The wallet, and only the wallet — standings live on the Home board, not up here.
              Cells hide until Ascension has ever mattered (a fresh account sees no dead zero). */}
          <span className="hub-cur"><CurrencyIcon id="genomeCores" size={15} /> {save.shards} <span className="hub-cur-l">{ACCOUNT_CURRENCY.name}</span></span>
          <span className="hub-cur"><CurrencyIcon id="ichor" size={15} /> {save.ichor} <span className="hub-cur-l">Ichor</span></span>
          {(cells > 0 || (save.prestige?.molts ?? 0) > 0) && (
            <span className="hub-cur"><CurrencyIcon id="ascendantCells" size={15} /> {cells} <span className="hub-cur-l">Cells</span></span>
          )}
          <span className="hub-cur" title="Materials — Mutagen · Scrap · Catalyst (Armory crafting)">
            ⊕ {save.mats.mutagen} · ◳ {save.mats.scrap} · ✷ {save.mats.catalyst} <span className="hub-cur-l">Materials</span>
          </span>
        </header>

        <section className="hub-screen" key={nav}>
          {nav === 'home' && (
            <CommandCenter onStart={onStart} onStartEndless={onStartEndless} onStartCampaign={onStartCampaign} go={go} last={last} onSeenLast={onSeenLast} doctrineRef={doctrineRef} />
          )}
          {nav === 'campaign' && <CampaignScreen onStart={onStartCampaign} difficultyRef={difficultyRef} />}
          {nav === 'infinite' && (
            modeLocked.infinite
              ? <ModeLocked title="INFINITE" glyph="∞" stage={MODE_UNLOCKS.infinite} current={highestCampaignStage(save)}
                  blurb="Endless, escalating waves under the AI Director — the account's endurance chase." go={go} />
              : <InfiniteScreen onStartEndless={onStartEndless} difficultyRef={difficultyRef} doctrineRef={doctrineRef} />
          )}
          {nav === 'bossrush' && (
            modeLocked.bossrush
              ? <ModeLocked title="BOSS RUSH" glyph="☠" stage={MODE_UNLOCKS.bossRush} current={highestCampaignStage(save)}
                  blurb="The gauntlet: wave N deploys N assembled bosses, and every kill pays. Prove the hive first." go={go} />
              : <BossRushScreen onStartBossRush={onStartBossRush} difficultyRef={difficultyRef} />
          )}
          {nav === 'daily' && (
            modeLocked.daily
              ? <ModeLocked title="DAILY RUN" glyph="☀" stage={MODE_UNLOCKS.daily} current={highestCampaignStage(save)}
                  blurb="One seed per day — the same 20-wave gauntlet worldwide, under the day's modifiers." go={go} />
              : <DailyScreen onStartDaily={onStartDaily} onSpectate={onSpectate} />
          )}
          {nav === 'towers' && <TowerLab />}
          {nav === 'mulligans' && <MulliganLab />}
          {nav === 'gearcodex' && <EquipmentCollection />}
          {nav === 'heroes' && <HeroLab />}
          {nav === 'evolution' && <EvolutionHQ />}
          {nav === 'genes' && <GeneArchive />}
          {nav === 'vault' && <GeneticVault />}
          {nav === 'market' && <SpliceMarket />}
          {nav === 'equipment' && <EquipmentPanel />}
          {nav === 'phenotypes' && <PhenotypeLab />}
          {nav === 'collection' && <CollectionScreen />}
          {nav === 'store' && <PremiumStore />}
          {nav === 'profile' && <PlayerProfile onNavigate={(k) => go(k as NavKey)} />}
          {nav === 'settings' && <SettingsScreen onReplayTutorial={onReplayTutorial} onReplayTour={onReplayTour} onReplayIntro={onReplayIntro} />}
          {nav === 'help' && <HelpWiki onNavigate={(k) => go(k as NavKey)} onReplayTour={onReplayTour} />}
        </section>
      </div>
    </div>
  );
}
