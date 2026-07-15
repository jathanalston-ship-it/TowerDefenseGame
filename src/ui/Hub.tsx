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
import { featureRevealed, featureView, nextReveals, type FeatureView } from '../state/unlocks';
import { AccountXpBar } from './components/AccountXpBar';
import { navBus } from '../state/navBus';
import { CampaignScreen } from './CampaignScreen';
import { TowerLab } from './TowerLab';
import { MulliganLab } from './MulliganLab';
import { EquipmentCollection } from './EquipmentCollection';
import { HeroLab } from './HeroLab';
import { ExpeditionScreen } from './ExpeditionScreen';
import { AdaptationChamber } from './AdaptationChamber';
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
import { HiveScreen } from './HiveScreen';
import { HarvestArrival, HarvestScreen } from './HarvestScreen';
import { Wardrobe } from './Wardrobe';
import { BattlePassScreen } from './BattlePassScreen';
import { QuestBoard } from './QuestBoard';
import { WardrobeReveal } from './components/WardrobeReveal';
import { FlashOfferPopup } from './components/FlashOfferPopup';
import { flashExpiresAt } from '../state/flashOffers';
import type { PremiumOfferDef } from '../core/premium';
import { useGuestMode } from '../state/guestMode';
import { applyWardrobeDressing } from './wardrobeDressing';
import { LabAtmosphere } from './LabAtmosphere';
import { PowerBadge } from './components/PowerScore';
import { navGroups, mobileTabs, tabOf, type NavKey, type MobileTabKey } from './navModel';
import { MobileTabBar, MobileTabIndex, MobilePageHead } from './MobileShell';
import { useLayoutProfile } from './layoutProfile';

// The nav IA (groups + portrait tabs) lives in navModel.ts — the single source of truth this
// shell, the portrait shell, and the validation layer (navModel.test / mobilecheck) all share.
export type { NavKey } from './navModel';

// Accent tint per group rides the group row itself (localization-safe — titles translate).

/** A sealed feature's unlock briefing (docs/PROGRESSION-GATING.md) — a TEASED surface stays
 * visible for anticipation; the briefing names the gate, shows live progress, and routes toward
 * the progress instead of dead-ending. Generalizes the old per-mode ModeLocked to EVERY gated
 * screen, fed by the unlock registry (same CSS). */
function FeatureLocked({ view, go }: { view: FeatureView; go: (k: NavKey) => void }): JSX.Element {
  const pct = Math.min(100, Math.round(view.progress * 100));
  const viaCampaign = view.label.includes('Stage'); // stage-gated ⇒ the Campaign is the path
  return (
    <div className="menu mode-locked">
      <h1 className="title">{view.def.name.toUpperCase()}</h1>
      <p className="subtitle">{view.def.blurb}</p>
      <div className="panel mode-locked-panel">
        <div className="mode-locked-glyph" aria-hidden>{view.def.glyph}</div>
        <div className="mode-locked-k">SEALED BY PROGRESSION</div>
        <p className="mode-locked-body"><b>{view.label || 'Keep playing'}</b> to open this wing.</p>
        <div className="rush-mile-bar mode-locked-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
        <div className="mode-locked-pct">{pct}% there</div>
        <button className="primary" onClick={() => go(viaCampaign ? 'campaign' : 'home')}>
          {viaCampaign ? '⬡ Continue the Campaign' : '⌂ Keep playing'}
        </button>
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
  // Portrait shell (docs/RESPONSIVE-DESIGN.md §mobile-shell): bottom tabs + index pages replace
  // the rail/drawer. `mTab`+`mIndex` mean "browsing a tab's index"; a drilled-in screen derives
  // its tab from `nav` so deep links (What's New, Command Center CTAs) light the right tab.
  const { profile } = useLayoutProfile();
  const mobileShell = profile === 'portrait';
  const [mTab, setMTab] = useState<MobileTabKey>('home');
  const [mIndex, setMIndex] = useState(false);
  const save = meta.use();
  const guest = useGuestMode(); // flash popups never fire for guests (purchases are disabled)
  const ackTick = notifications.use(); // re-render when a badge is acknowledged
  const cells = meta.prestigeView().cells;
  // Derived rail state — recomputed only when the save snapshot (or an ack) changes, not on
  // every shell render; navProgress walks every tower/hero/upgrade/card.
  const badges = useMemo(() => notifications.badges(save), [save, ackTick]);
  const progress = useMemo(() => navProgress(save), [save]); // 0..1 completion rings per menu
  // Progression gating (docs/PROGRESSION-GATING.md): the nav lists REVEALED screens plus the
  // next two upcoming reveals as locked TEASERS (anticipation with live progress); everything
  // deeper stays hidden — the game reveals itself one learnable beat at a time.
  const teasers = useMemo(() => nextReveals(save, 2), [save]);
  const teaserOf = new Map(teasers.map((v) => [v.def.id, v] as const));
  const navVisible = (k: NavKey): boolean => featureRevealed(save, k) || teaserOf.has(k);

  // Keep watermarks clamped to the live save (re-light a dot after claim/open/reset)
  // and latch any newly-satisfied reveals (the write side of the gating framework).
  useEffect(() => { notifications.sync(save); meta.latchNewReveals(); }, [save]);

  // Hub scene → menu music (audio/music.ts §scenes): each wing of the Command Center biases the
  // NEXT menu pick toward its scene-tagged themes — rotation (not this) actually switches tracks,
  // so browsing never stutters the score.
  useEffect(() => {
    music.setScene(nav);
    return () => music.setScene(null); // leaving the hub (into a run) clears the bias
  }, [nav]);
  // Wardrobe dressing (docs/COSMETICS.md §wardrobe): re-apply the equipped payloads to the
  // shell/audio/music/render kit whenever an equip changes. Idempotent + cheap.
  useEffect(() => { applyWardrobeDressing(save); }, [save.wardrobe.equipped]);
  // Season heartbeat: advance the pass + weekly-quest windows while the hub is open
  // (rollovers auto-claim earned rewards — mail, never loss).
  useEffect(() => {
    meta.pollBattlePass(Date.now());
    meta.pollWeeklyQuest(Date.now());
    const t = window.setInterval(() => { meta.pollBattlePass(Date.now()); meta.pollWeeklyQuest(Date.now()); }, 60_000);
    return () => window.clearInterval(t);
  }, []);
  // Flash-sale popup (docs/PREMIUM-STORE.md §flash): at most one modal per cadence window,
  // fired only from the hub (never in-run), never for guests (purchases are disabled). The
  // shown-stamp lands BEFORE the modal renders, so a refresh can't re-pop it.
  const [flashOffer, setFlashOffer] = useState<PremiumOfferDef | null>(null);
  useEffect(() => {
    if (guest) return;
    const check = (): void => {
      const o = meta.flashPopup(Date.now());
      if (o) {
        meta.markFlashShown(o.id);
        setFlashOffer((cur) => cur ?? o);
      }
    };
    check();
    const t = window.setInterval(check, 60_000);
    return () => window.clearInterval(t);
  }, [guest]);

  const go = (k: NavKey): void => {
    audio.cue('ui');
    notifications.markSeen(k, save); // viewing a menu clears its badge immediately
    meta.noteNavVisit(k); // exposure ledger (docs/PROGRESSION-GATING.md §director)
    setNav(k);
    setNavOpen(false); // picking a destination closes the narrow-shell drawer
    setMIndex(false); // and leaves any portrait index page
  };

  // Portrait tab bar: HOME jumps straight to the Command Center; the rest open their index page.
  const activeTab: MobileTabKey = mIndex ? mTab : tabOf(nav);
  const tapTab = (k: MobileTabKey): void => {
    if (k === 'home') { go('home'); return; }
    audio.cue('ui');
    setMTab(k);
    setMIndex(true);
  };

  // What's New "Open ▸" CTA (and any future out-of-hub caller) navigates through the bus.
  useEffect(() => navBus.onGo((k) => go(k as NavKey)), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="hub">
      <LabAtmosphere />
      <WardrobeReveal />
      {flashOffer && (
        <FlashOfferPopup
          offer={flashOffer}
          expiresAt={flashExpiresAt(flashOffer, meta.get().premium.flash[flashOffer.id])}
          onStore={() => { setFlashOffer(null); go('store'); }}
          onClose={() => { meta.dismissFlashPopup(flashOffer.id); setFlashOffer(null); }}
        />
      )}
      {/* Idle Harvest return ceremony (docs/IDLE-HARVEST.md §presentation) — once the screen
          itself has revealed, a ripe hopper greets the returning player (never a bare popup). */}
      {featureRevealed(save, 'harvest') && <HarvestArrival onVisitHarvest={() => go('harvest')} />}
      {!mobileShell && navOpen && <div className="hub-nav-veil" onClick={() => setNavOpen(false)} aria-hidden />}
      {!mobileShell && (
      <nav className={`hub-nav${navOpen ? ' is-open' : ''}`} aria-label="Headquarters">
        <div className="hub-brand">ASSIMILATION</div>
        <div className="hub-navlist">
          {navGroups().map((group) => {
            // Progression gating: only REVEALED entries + the next-two teasers render; a group
            // with nothing revealed stays silent.
            const items = group.items.filter((n) => navVisible(n.key));
            if (items.length === 0) return null;
            return (
            <div
              className={`hub-navgroup${group.compact ? ' is-compact' : ''}`}
              key={group.title}
              style={{ ['--nav-accent' as string]: group.accent } as CSSProperties}
            >
              {!group.headerless && <div className="hub-navgroup-h" aria-hidden>{group.title}</div>}
              {group.compact && <div className="hub-navrow">{items.map((n) => {
                const teaser = teaserOf.get(n.key);
                const badge = teaser ? 0 : (badges[n.key] ?? 0);
                return (
                  <button
                    key={n.key}
                    data-nav={n.key}
                    className={`hub-navsquare ${nav === n.key ? 'on' : ''}${teaser ? ' is-locked' : ''}`}
                    onClick={() => go(n.key)}
                    onPointerEnter={() => audio.cue('hover')}
                    aria-current={nav === n.key ? 'page' : undefined}
                    aria-label={teaser ? `${n.label} — locked. ${teaser.label}` : badge > 0 ? `${n.label} — ${badge} new` : n.label}
                    title={teaser ? teaser.label : n.label}
                  >
                    <span className="hub-mono" aria-hidden>
                      {n.mono}
                      {badge > 0 && <span className="nav-badge" aria-hidden>{badge > 1 ? (badge > 9 ? '9+' : badge) : ''}</span>}
                    </span>
                    <span className="hub-navsquare-l">{n.label}</span>
                  </button>
                );
              })}</div>}
              {!group.compact && items.map((n) => {
                const teaser = teaserOf.get(n.key);
                const badge = teaser ? 0 : (badges[n.key] ?? 0);
                // A teaser's ring shows progress TOWARD the unlock; a revealed entry keeps
                // its completion ring.
                const ring = teaser ? (teaser.progress > 0 ? teaser.progress : null) : progress[n.key];
                return (
                  <button
                    key={n.key}
                    data-nav={n.key}
                    className={`hub-navitem ${nav === n.key ? 'on' : ''}${teaser ? ' is-locked' : ''}`}
                    onClick={() => go(n.key)}
                    onPointerEnter={() => audio.cue('hover')}
                    aria-current={nav === n.key ? 'page' : undefined}
                    aria-label={teaser ? `${n.label} — locked. ${teaser.label}` : badge > 0 ? `${n.label} — ${badge} new` : undefined}
                    title={teaser ? teaser.label : undefined}
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
                    {teaser && <span className="hub-lock" aria-hidden>🔒</span>}
                    {ring != null && (teaser || ring >= 0.005) && <span className="hub-ringpct" aria-hidden>{Math.round(ring * 100)}%</span>}
                  </button>
                );
              })}
            </div>
            );
          })}
        </div>
        <div className="hub-power" data-tour="power">
          <PowerBadge />
        </div>
      </nav>
      )}

      <div className="hub-main">
        <header className="hub-topbar" data-tour="topbar">
          {!mobileShell && (
          <button className="hub-burger" onClick={() => setNavOpen((v) => !v)} aria-label="Open navigation" aria-expanded={navOpen}>
            ☰ <span className="hub-burger-l">Menu</span>
          </button>
          )}
          {/* The wallet (+ the account level chip) — standings live on the Home board, not up
              here. Chips reveal with their currency (docs/PROGRESSION-GATING.md §economy): a chip
              never precedes its purpose, so the first-session top bar reads calm. */}
          <AccountXpBar compact />
          <span className="hub-cur"><CurrencyIcon id="genomeCores" size={15} /> {save.shards} <span className="hub-cur-l">{ACCOUNT_CURRENCY.name}</span></span>
          {featureRevealed(save, 'cur:ichor') && <span className="hub-cur"><CurrencyIcon id="ichor" size={15} /> {save.ichor} <span className="hub-cur-l">Ichor</span></span>}
          {featureRevealed(save, 'cur:cells') && <span className="hub-cur"><CurrencyIcon id="ascendantCells" size={15} /> {cells} <span className="hub-cur-l">Cells</span></span>}
          {featureRevealed(save, 'cur:mats') && (
            <span className="hub-cur" title="Materials — Mutagen · Scrap · Catalyst (Armory crafting)">
              ⊕ {save.mats.mutagen} · ◳ {save.mats.scrap} · ✷ {save.mats.catalyst} <span className="hub-cur-l">Materials</span>
            </span>
          )}
        </header>

        <section className="hub-screen" key={mobileShell && mIndex ? `midx-${mTab}` : nav}>
          {mobileShell && mIndex ? (
            <MobileTabIndex
              tab={mobileTabs().find((tb) => tb.key === mTab) ?? mobileTabs()[0]}
              save={save}
              badges={badges}
              progress={progress}
              teaserOf={teaserOf}
              go={go}
            />
          ) : (
          <>
          {/* Drilled-in portrait screens carry a sticky back header (Home IS its tab's root). */}
          {mobileShell && nav !== 'home' && (
            <MobilePageHead
              title={featureView(save, nav).def.name}
              backLabel={mobileTabs().find((tb) => tb.key === tabOf(nav))?.label ?? t('mnav.home')}
              onBack={() => { setMTab(tabOf(nav)); setMIndex(true); }}
            />
          )}
          {/* Any screen whose feature hasn't revealed shows its unlock briefing instead —
              one gate for every wing (the old per-mode ModeLocked, generalized). */}
          {!featureRevealed(save, nav) && <FeatureLocked view={featureView(save, nav)} go={go} />}
          {featureRevealed(save, nav) && <>
          {nav === 'home' && (
            <CommandCenter onStart={onStart} onStartEndless={onStartEndless} onStartCampaign={onStartCampaign} go={go} last={last} onSeenLast={onSeenLast} doctrineRef={doctrineRef} />
          )}
          {nav === 'campaign' && <CampaignScreen onStart={onStartCampaign} difficultyRef={difficultyRef} />}
          {nav === 'infinite' && <InfiniteScreen onStartEndless={onStartEndless} difficultyRef={difficultyRef} doctrineRef={doctrineRef} />}
          {nav === 'bossrush' && <BossRushScreen onStartBossRush={onStartBossRush} difficultyRef={difficultyRef} />}
          {nav === 'daily' && <DailyScreen onStartDaily={onStartDaily} onSpectate={onSpectate} />}
          {nav === 'towers' && <TowerLab />}
          {nav === 'mulligans' && <MulliganLab />}
          {nav === 'gearcodex' && <EquipmentCollection />}
          {nav === 'heroes' && <HeroLab />}
          {nav === 'expeditions' && <ExpeditionScreen />}
          {nav === 'adaptation' && <AdaptationChamber />}
          {nav === 'evolution' && <EvolutionHQ />}
          {nav === 'genes' && <GeneArchive />}
          {nav === 'hive' && <HiveScreen />}
          {nav === 'harvest' && <HarvestScreen />}
          {nav === 'vault' && <GeneticVault />}
          {nav === 'market' && <SpliceMarket />}
          {nav === 'equipment' && <EquipmentPanel />}
          {nav === 'quests' && <QuestBoard />}
          {nav === 'season' && <BattlePassScreen onStore={() => go('store')} />}
          {nav === 'phenotypes' && <Wardrobe />}
          {nav === 'collection' && <CollectionScreen />}
          {nav === 'store' && <PremiumStore />}
          {nav === 'profile' && <PlayerProfile onNavigate={(k) => go(k as NavKey)} />}
          {nav === 'settings' && <SettingsScreen onReplayTutorial={onReplayTutorial} onReplayTour={onReplayTour} onReplayIntro={onReplayIntro} />}
          {nav === 'help' && <HelpWiki onNavigate={(k) => go(k as NavKey)} onReplayTour={onReplayTour} />}
          </>}
          </>
          )}
        </section>
      </div>

      {mobileShell && (
        <MobileTabBar
          active={activeTab}
          badges={badges}
          teaserKeys={new Set(teaserOf.keys())}
          onTab={tapTab}
        />
      )}
    </div>
  );
}
