// Headquarters shell — the inter-run hub as a true menu system (replaces the old long
// scrolling page). A persistent left nav rail + a top currency bar frame a single content
// area that swaps one dedicated screen per progression system. Nothing scrolls at the shell
// level; dense screens lay out in columns and the content area is the only scroll region.

import { t, useLocale, setLocale, getLocale, LOCALES } from '../i18n';
import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
import type { SaveData } from '../save/saveStore';
import type { ReplayRecord } from '../core/replay';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { AudioToggles } from './components/AudioToggles';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { WalletChip } from './components/WalletChip';
import { MaterialsChip } from './components/MaterialsChip';
import { AutoClaimToggle } from './components/AutoClaimSummary';
import { CeremonyLayer } from './components/CeremonyLayer';
import { autoGenePref, setAutoGenePref } from '../state/prefs';
import { notifications } from '../state/notifications';
import '../state/notificationSources'; // registers the default menu badges (side-effect import)
import { telemetry } from '../net/telemetry';
import { loopFlow } from '../state/loopFlow';
import { chainNavs, readyChain } from '../state/readyChain';
import { CommandCenter } from './CommandCenter';
const InfiniteScreen = lazyNamed(() => import('./InfiniteScreen'), 'InfiniteScreen');
const BossRushScreen = lazyNamed(() => import('./BossRushScreen'), 'BossRushScreen');
const ArenaScreen = lazyNamed(() => import('./ArenaScreen'), 'ArenaScreen');
import type { ArenaMatchSetup } from '../core/arenaMatch';
import type { ArenaTransport } from '../net/arenaTransport';
const DailyScreen = lazyNamed(() => import('./DailyScreen'), 'DailyScreen');
import { PremiumStore } from './PremiumStore'; // FlashOfferPopup imports its helpers statically
import { featureRevealed, featureView, nextReveals, type FeatureView } from '../state/unlocks';
import { AccountXpBar } from './components/AccountXpBar';
import { navBus } from '../state/navBus';
const CampaignScreen = lazyNamed(() => import('./CampaignScreen'), 'CampaignScreen');
const TowerLab = lazyNamed(() => import('./TowerLab'), 'TowerLab');
const MulliganLab = lazyNamed(() => import('./MulliganLab'), 'MulliganLab');
const HeroLab = lazyNamed(() => import('./HeroLab'), 'HeroLab');
const AdaptationChamber = lazyNamed(() => import('./AdaptationChamber'), 'AdaptationChamber');
const EquipmentPanel = lazyNamed(() => import('./EquipmentPanel'), 'EquipmentPanel');
const GeneticVault = lazyNamed(() => import('./GeneticVault'), 'GeneticVault');
const SpliceMarket = lazyNamed(() => import('./SpliceMarket'), 'SpliceMarket');
const AuctionHouse = lazyNamed(() => import('./AuctionHouse'), 'AuctionHouse');
const EvolutionHQ = lazyNamed(() => import('./EvolutionHQ'), 'EvolutionHQ');
const HelpWiki = lazyNamed(() => import('./HelpWiki'), 'HelpWiki');
const CollectionScreen = lazyNamed(() => import('./CollectionPanel'), 'CollectionScreen');
const PlayerProfile = lazyNamed(() => import('./PlayerProfile'), 'PlayerProfile');
const SaveManager = lazyNamed(() => import('./SaveManager'), 'SaveManager');
const CloudBackup = lazyNamed(() => import('./components/CloudBackup'), 'CloudBackup');
import { AccountPanel } from './components/AccountPanel'; // App/Commissioning import it statically
import { navProgress } from './hubProgress';
const DevTools = lazyNamed(() => import('./DevTools'), 'DevTools');
const MusicDebug = lazyNamed(() => import('./MusicDebug'), 'MusicDebug');
const GeneArchive = lazyNamed(() => import('./GeneArchive'), 'GeneArchive');
const HiveScreen = lazyNamed(() => import('./HiveScreen'), 'HiveScreen');
const HarvestArrival = lazyNamed(() => import('./HarvestScreen'), 'HarvestArrival');
import { FrontScreen } from './FrontScreen'; // also imported statically by CommandCenter — lazy would not split it
const Wardrobe = lazyNamed(() => import('./Wardrobe'), 'Wardrobe');
const BattlePassScreen = lazyNamed(() => import('./BattlePassScreen'), 'BattlePassScreen');
const QuestBoard = lazyNamed(() => import('./QuestBoard'), 'QuestBoard');
import { WardrobeReveal } from './components/WardrobeReveal';
import { FlashOfferPopup } from './components/FlashOfferPopup';
import { flashExpiresAt } from '../state/flashOffers';
import type { PremiumOfferDef } from '../core/premium';
import { useGuestMode } from '../state/guestMode';
import { applyWardrobeDressing } from './wardrobeDressing';
import { LabAtmosphere } from './LabAtmosphere';
import { labState } from './homeBaseTiers';
import { PowerBadge } from './components/PowerScore';
import { navGroups, mobileTabs, tabOf, groupOf, hostOf, foldCounts, foldLines, type NavKey, type NavGroupId, type MobileTabKey } from './navModel';
import { requestHostTab } from './components/HostTabs';
import { ScreenHeader } from './components/ScreenHeader';
import { activeLiveEvents } from '../core/liveEvents';
import { MobileTabBar, MobileTabIndex, MobilePageHead } from './MobileShell';
import { useLayoutProfile } from './layoutProfile';
import { HubLanding, doorBadge, soleOpenScreen } from './HubLanding';
import { lazyNamed } from './lazyNamed';
import { ScreenFallback } from './components/ScreenFallback';
import { ScreenBoundary } from './components/ScreenBoundary';
import { HubScreen } from './components/AdviceLink';
import { backPhase, hasOpenLayer, modalOnScreen, registerHubBack, syncBackGuard } from './browserBack';

/** The lazily-split hub screens by nav key — the idle prefetch warms them through the SAME
 *  lazyNamed thunks the render uses (static/always-booted screens are simply absent). */
const LAZY_SCREENS: Partial<Record<NavKey, { preload(): Promise<void> }>> = {
  campaign: CampaignScreen, infinite: InfiniteScreen, bossrush: BossRushScreen, arena: ArenaScreen, daily: DailyScreen,
  towers: TowerLab, mulligans: MulliganLab, heroes: HeroLab, adaptation: AdaptationChamber, evolution: EvolutionHQ,
  genes: GeneArchive, hive: HiveScreen, vault: GeneticVault, market: SpliceMarket, auction: AuctionHouse,
  equipment: EquipmentPanel, quests: QuestBoard, season: BattlePassScreen, phenotypes: Wardrobe,
  collection: CollectionScreen, profile: PlayerProfile, help: HelpWiki,
  // Settings is inline here, but its panels are split — warm them together.
  settings: { preload: () => Promise.all([SaveManager.preload(), CloudBackup.preload(), MusicDebug.preload(), DevTools.preload()]).then(() => undefined) },
};

/** Once the browser idles (within `deadlineMs`), warm the open screens among `keys` (folded keys
 *  warm their host) — fetched in parallel; screen modules only define components, so evaluating
 *  them is cheap (a one-at-a-time queue measured slower with no smoother frames). PROD-only — the
 *  dev server compiles on demand, like main.tsx's run-path warmup. Returns the cancel. */
function prefetchScreens(save: SaveData, keys: readonly NavKey[], deadlineMs: number): () => void {
  if (!import.meta.env.PROD) return () => undefined;
  return onIdle(() => {
    for (const k of new Set(keys.map(hostOf))) if (featureRevealed(save, k)) void LAZY_SCREENS[k]?.preload();
  }, deadlineMs);
}

/** Run `fn` when the browser idles — within `deadlineMs` even on a board that never idles (the
 *  living lab animates constantly). Returns the cancel. */
function onIdle(fn: () => void, deadlineMs: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: deadlineMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, Math.min(500, deadlineMs));
  return () => clearTimeout(id);
}

/** Escape typed into a text field belongs to the field, never to navigation. */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && /^(text|search|email|password|number|url|tel)$/.test((el as HTMLInputElement).type);
}

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
  // Gameplay analytics opt-out (docs/ANALYTICS.md §privacy): off = the pipe drops everything
  // already queued and sends nothing further. Guests never send regardless of this switch.
  const [telem, setTelem] = useState(telemetry.isEnabled());
  const toggleTelem = (): void => {
    const next = !telem;
    setTelem(next);
    telemetry.setEnabled(next);
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
          <AutoClaimToggle />
          <label className="set-toggle">
            <span>Gameplay Analytics<small>Anonymous usage data (balance &amp; stability). No names, no personal info — ever.</small></span>
            <button className={`set-switch ${telem ? 'on' : ''}`} onClick={toggleTelem} aria-pressed={telem}>
              {telem ? 'On' : 'Off'}
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
  onLaunchArenaMatch,
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
  onLaunchArenaMatch: (setup: ArenaMatchSetup, transport?: ArenaTransport) => void;
  difficultyRef: MutableRefObject<string>;
  doctrineRef: MutableRefObject<string>;
}): JSX.Element {
  const [nav, setNav] = useState<NavKey>('home');
  // Desktop hub landings (docs/NOTIFICATIONS.md §hubs): clicking a group HEADER opens the
  // hub's landing page in the content area; picking any screen (or landing row) clears it.
  const [landing, setLanding] = useState<NavGroupId | null>(null);
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
  // Folded screens (navModel FOLDED_NAVS) light their HOST: a ripe Hive Production tab badges The Hive.
  const badges = useMemo(() => foldCounts(notifications.badges(save)), [save, ackTick]);
  // Ready Chain pulse source (docs/HUB-FLOW.md §surfaces) — LIVE claim/open stops,
  // independent of the seen-watermarks: readiness breathes, novelty badges.
  const chainSet = useMemo(() => new Set([...chainNavs(save)].map((k) => hostOf(k as NavKey))), [save]);
  // Smart-notification REASONS (docs/NOTIFICATIONS.md §reasons) — the WHY behind every badge,
  // rendered as nav tooltips, landing "needs attention" rows, and index-row sublines.
  const reasons = useMemo(() => foldLines(notifications.reasons(save)), [save, ackTick]);
  const progress = useMemo(() => navProgress(save), [save]); // 0..1 completion rings per menu
  // Progression gating (docs/PROGRESSION-GATING.md): the nav lists REVEALED screens plus the
  // next two upcoming reveals as locked TEASERS (anticipation with live progress); everything
  // deeper stays hidden — the game reveals itself one learnable beat at a time.
  // Folded tabs tease inside their host (HostTabs), so they never spend a nav teaser slot.
  const teasers = useMemo(() => nextReveals(save, 8).filter((v) => hostOf(v.def.id as NavKey) === v.def.id).slice(0, 2), [save]);
  const teaserOf = new Map(teasers.map((v) => [v.def.id, v] as const));
  const navVisible = (k: NavKey): boolean => featureRevealed(save, k) || teaserOf.has(k);

  // Keep watermarks clamped to the live save (re-light a dot after claim/open/reset)
  // and latch any newly-satisfied reveals (the write side of the gating framework).
  useEffect(() => {
    notifications.sync(save);
    for (const id of meta.latchNewReveals()) telemetry.emit('unlock', { d: id }); // feature-reveal lane
  }, [save]);

  // Hub scene → menu music (audio/music.ts §scenes): each wing of the Command Center biases the
  // NEXT menu pick toward its scene-tagged themes — rotation (not this) actually switches tracks,
  // so browsing never stutters the score.
  useEffect(() => {
    music.setScene(nav);
    return () => music.setScene(null); // leaving the hub (into a run) clears the bias
  }, [nav]);
  // Wardrobe dressing (docs/COSMETICS.md §wardrobe): re-apply the equipped payloads to the
  // shell/audio/music/render kit whenever an equip changes — or the live-event rotation flips
  // mid-session (the trio key changes at most daily; three Math.floor calls per render).
  const eventKey = activeLiveEvents(Date.now()).map((a) => a.key).join();
  useEffect(() => { applyWardrobeDressing(save); }, [save.wardrobe.equipped, eventKey]);
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

  // ── Nav history (docs/UX-CONSOLIDATION.md §wayfinding): every navigation remembers where
  // it came from, so the ScreenHeader's ‹ and the touch swipe-back walk REAL history instead
  // of guessing a parent. Falls back landing → home when the stack runs dry.
  const histRef = useRef<{ nav: NavKey; landing: NavGroupId | null }[]>([]);
  // Where the shell stands RIGHT NOW (synchronously — state lags a render): the browser-Back
  // guard (ui/browserBack.ts) asks "is goBack at the root?" between a popstate and the commit.
  const posRef = useRef<{ nav: NavKey; landing: NavGroupId | null }>({ nav, landing });
  const atRoot = (): boolean => histRef.current.length === 0 && posRef.current.nav === 'home' && posRef.current.landing === null;
  const pushHist = (): void => {
    const top = histRef.current[histRef.current.length - 1];
    if (top && top.nav === nav && top.landing === landing) return; // no duplicate stops
    histRef.current.push({ nav, landing });
    if (histRef.current.length > 32) histRef.current.shift();
  };

  const go = (to: NavKey): void => {
    // A folded screen (navModel FOLDED_NAVS) opens its HOST on the matching tab — every NavKey
    // still deep-links; the host component owns the tab strip (ui/components/HostTabs.tsx).
    const k = hostOf(to);
    if (k !== to) requestHostTab(to);
    if (k === nav && landing === null && !mIndex) return; // already here — no-op, no history churn
    audio.cue('ui');
    pushHist();
    // Telemetry: the screen-view lane, plus "a lit badge drew this click" (docs/ANALYTICS.md
    // §screens) — read BEFORE markSeen clears it.
    if ((notifications.badges(save)[k] ?? 0) > 0) telemetry.emit('notif', { d: `${k}:act` });
    telemetry.screen(k);
    loopFlow.note(k); // loop rotation (docs/REWARD-ARCHITECTURE.md §chaining): remember the wing touched
    notifications.markSeen(k, save); // viewing a menu clears its badge immediately
    meta.noteNavVisit(k); // exposure ledger (docs/PROGRESSION-GATING.md §director)
    setNav(k);
    setLanding(null); // a concrete destination leaves any hub landing
    setNavOpen(false); // picking a destination closes the narrow-shell drawer
    setMIndex(false); // and leaves any portrait index page
    posRef.current = { nav: k, landing: null };
    syncBackGuard(); // browser/Android Back now walks back here (docs/HUB-FLOW.md §back)
  };

  /** Open a hub's landing page (desktop group headers; landing rows drill in via go). */
  const goLanding = (id: NavGroupId): void => {
    if (landing === id) return;
    // A hub with exactly ONE open screen has no landing — its door IS the screen.
    const sole = soleOpenScreen(save, navGroups().find((g) => g.id === id) ?? navGroups()[0]);
    if (sole) { go(sole); return; }
    audio.cue('ui');
    pushHist();
    setLanding(id);
    setNavOpen(false);
    posRef.current = { nav, landing: id };
    syncBackGuard();
  };

  /** Walk back one real stop; dry stack falls back screen → its hub landing → home. */
  const goBack = (): void => {
    const prev = histRef.current.pop();
    audio.cue('ui');
    if (prev) {
      setNav(prev.nav);
      setLanding(prev.landing);
      setNavOpen(false);
      setMIndex(false);
      if (prev.landing === null) { telemetry.screen(prev.nav); notifications.markSeen(prev.nav, save); }
      posRef.current = prev;
    } else if (landing === null && nav !== 'home' && !soleOpenScreen(save, groupOf(nav))) {
      setLanding(groupOf(nav).id); // a dry stack falls back screen → its hub landing…
      posRef.current = { nav, landing: groupOf(nav).id };
    } else if (landing !== null || nav !== 'home') {
      setLanding(null); // …→ home (a one-screen hub has no landing to fall back to)
      setNav('home');
      posRef.current = { nav: 'home', landing: null };
    }
    syncBackGuard();
  };
  // The latest goBack for listeners registered once (Escape, the browser-Back guard).
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  useEffect(() => registerHubBack({ atRoot, back: () => goBackRef.current() }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // ESCAPE = back in the hub (docs/HUB-FLOW.md §back) — only when nothing modal is up (an open
  // Popup closes itself first via the dismiss stack), never from inside a text field, and never
  // in a run/overlay phase (the run owns its own hotkeys and pause).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.repeat || e.defaultPrevented || isTypingTarget(e.target)) return;
      if (backPhase() !== 'menu' || hasOpenLayer() || modalOnScreen() || atRoot()) return;
      goBackRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Touch swipe-back (the iOS-standard edge gesture): a drag that STARTS on the left edge
  // and travels right without much vertical wander walks history. Edge-start only, so
  // horizontal scrollers and the canvas never fight it; inert without a touch screen.
  const swipeRef = useRef<{ x: number; y: number; edge: boolean } | null>(null);
  const onScreenTouchStart = (e: React.TouchEvent): void => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, edge: t.clientX <= 28 };
  };
  const onScreenTouchEnd = (e: React.TouchEvent): void => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || !s.edge) return;
    const t = e.changedTouches[0];
    if (t.clientX - s.x > 70 && Math.abs(t.clientY - s.y) < 48) goBack();
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

  // NO LOADING FLASH (docs/DEPLOYMENT.md §code-splitting): once the browser idles, warm the
  // current hub's open member screens + the Ready Chain's next stop through the same lazyNamed
  // thunks — the first visit renders the module directly (a hovered door warms its hub too).
  // Idle-gated, so nothing competes with boot (the boot closure is unchanged); a LANDING starts
  // within 100 ms — it exists to pick one of its cards.
  useEffect(() => {
    const s = meta.get();
    const group = navGroups().find((g) => g.id === landing) ?? groupOf(nav);
    const next = readyChain(s)[0]?.nav;
    return prefetchScreens(s, [...(next ? [next] : []), ...group.items.map((i) => i.key)], landing !== null ? 100 : 800);
  }, [nav, landing]);

  // Progressive UI contamination (VISUAL_IDENTITY.md §contamination): the instrument's own
  // chrome is slowly assimilated as the account deepens — SAME ladder as the evolving lab
  // (labEra 0..3). Era 0 (a fresh account) renders a perfectly clean instrument.
  const lab = labState(save);

  return (
    <div className="hub" data-contam={lab.era} style={{ ['--contam' as string]: lab.intensity } as CSSProperties}>
      <LabAtmosphere />
      {lab.era > 0 && <div className="hub-contam" aria-hidden data-era={lab.era} />}
      <WardrobeReveal />
      <CeremonyLayer />
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
      {featureRevealed(save, 'harvest') && <Suspense fallback={null}><HarvestArrival onVisitHarvest={() => go('harvest')} /></Suspense>}
      {!mobileShell && navOpen && <div className="hub-nav-veil" onClick={() => setNavOpen(false)} aria-hidden />}
      {!mobileShell && (
      <nav className={`hub-nav${navOpen ? ' is-open' : ''}`} aria-label="Headquarters">
        <div className="hub-brand">ASSIMILATION</div>
        {/* COMPRESSED RAIL (docs/NOTIFICATIONS.md §hubs): only the front doors render — HOME
            plus ONE button per behavior hub. Screens (and their teasers/rings/reasons) are
            picked from the hub LANDING pages; per-screen rows never render at the rail level,
            so the shell stays visually quiet no matter how many wings the account has open. */}
        <div className="hub-navlist">
          <button
            type="button"
            data-nav="home"
            className={`hub-door${landing === null && nav === 'home' ? ' on' : ''}`}
            onClick={() => go('home')}
            onPointerEnter={() => audio.cue('hover')}
            aria-current={landing === null && nav === 'home' ? 'page' : undefined}
            aria-label={(badges.home ?? 0) > 0 ? `${t('nav.home')} — ${(reasons.home ?? []).join(' · ') || `${badges.home} new`}` : t('nav.home')}
            title={(reasons.home ?? []).join(' · ') || undefined}
          >
            <span className="hub-door-g" aria-hidden>
              ⌂
              {(badges.home ?? 0) > 0 && <span className="nav-badge" aria-hidden />}
            </span>
            <span className="hub-door-l">{t('nav.home')}</span>
          </button>
          {navGroups().map((group) => {
            // Progression gating: a hub with nothing revealed (and nothing teased) stays
            // silent. HOME has its own door above, so it never counts toward the play hub.
            const items = group.items.filter((n) => n.key !== 'home' && navVisible(n.key));
            if (items.length === 0) return null;
            // A door badge counts member SCREENS holding a decision, never their summed items.
            const groupBadge = doorBadge(items.map((it) => it.key), badges, teaserOf);
            const groupWhy = items.flatMap((it) => reasons[it.key] ?? []).join(' · ');
            // A headerless hub IS its single screen (the Store) — its door navigates straight
            // there (a one-card landing would be a pointless hop); the divider + accent keep
            // monetization visibly separate (docs/PREMIUM-STORE.md §philosophy).
            if (group.headerless) {
              const n = items[0];
              const teaser = teaserOf.get(n.key);
              return (
                <div key={group.id} style={{ ['--nav-accent' as string]: group.accent } as CSSProperties}>
                  <div className="hub-door-sep" aria-hidden />
                  <button
                    type="button"
                    data-nav={n.key}
                    className={`hub-door${landing === null && nav === n.key ? ' on' : ''}${teaser ? ' is-locked' : ''}`}
                    onClick={() => go(n.key)}
                    onPointerEnter={() => audio.cue('hover')}
                    aria-current={landing === null && nav === n.key ? 'page' : undefined}
                    aria-label={teaser ? `${n.label} — locked. ${teaser.label}` : n.label}
                    title={teaser ? teaser.label : undefined}
                  >
                    <span className="hub-door-g" aria-hidden>{n.mono}</span>
                    <span className="hub-door-l">{n.label}</span>
                    {teaser && <span className="hub-lock" aria-hidden>🔒</span>}
                  </button>
                </div>
              );
            }
            // The hub door: its badge counts the members needing a decision, its tooltip lists
            // the member REASONS, and clicking it opens the landing page — or, when the hub has
            // exactly ONE open screen, that screen directly (a one-card landing is a dead hop).
            const active = landing === group.id || (landing === null && items.some((it) => it.key === nav));
            const ready = items.some((it) => !teaserOf.has(it.key) && chainSet.has(it.key));
            const sole = soleOpenScreen(save, group);
            return (
              <button
                type="button"
                key={group.id}
                data-hub={group.id}
                data-nav={sole ?? undefined}
                className={`hub-door${active ? ' on' : ''}${ready ? ' is-ready' : ''}`}
                style={{ ['--nav-accent' as string]: group.accent } as CSSProperties}
                onClick={() => (sole ? go(sole) : goLanding(group.id))}
                onPointerEnter={() => { audio.cue('hover'); prefetchScreens(save, items.map((it) => it.key), 100); }}
                aria-current={active ? 'page' : undefined}
                title={groupWhy || group.hub.blurb}
                aria-label={groupWhy ? `${group.title} — ${groupWhy}` : group.title}
              >
                <span className="hub-door-g" aria-hidden>
                  {group.hub.glyph}
                  {groupBadge > 0 && <span className="nav-badge" aria-hidden>{groupBadge > 1 ? (groupBadge > 9 ? '9+' : groupBadge) : ''}</span>}
                </span>
                <span className="hub-door-l">{group.title}</span>
                {!sole && <span className="hub-door-chev" aria-hidden>›</span>}
              </button>
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
          {/* Rolling chips (docs/REWARD-PRESENTATION.md §wallet): values ROLL on change and
              bump when the CeremonyLayer's icon flights arrive (data-cur is the target hook). */}
          <WalletChip cur="genomeCores" value={save.shards} label={ACCOUNT_CURRENCY.name} />
          {featureRevealed(save, 'cur:ichor') && <WalletChip cur="ichor" value={save.ichor} label="Ichor" />}
          {featureRevealed(save, 'cur:cells') && <WalletChip cur="ascendantCells" value={cells} label="Cells" />}
          {/* ONE Materials chip for every secondary crafting wallet (docs/ECONOMY.md §player-facing). */}
          {featureRevealed(save, 'cur:mats') && <MaterialsChip save={save} />}
        </header>

        <section
          className="hub-screen"
          key={mobileShell && mIndex ? `midx-${mTab}` : landing ?? nav}
          data-screen={landing === null && !(mobileShell && mIndex) ? nav : undefined}
          onTouchStart={onScreenTouchStart}
          onTouchEnd={onScreenTouchEnd}
        >
          {!mobileShell && landing !== null ? (
            <HubLanding
              group={navGroups().find((g) => g.id === landing) ?? navGroups()[0]}
              save={save}
              badges={badges}
              reasons={reasons}
              progress={progress}
              teaserOf={teaserOf}
              go={go}
            />
          ) : mobileShell && mIndex ? (
            <MobileTabIndex
              tab={mobileTabs().find((tb) => tb.key === mTab) ?? mobileTabs()[0]}
              save={save}
              badges={badges}
              reasons={reasons}
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
          {/* The wayfinding frame (docs/UX-CONSOLIDATION.md §wayfinding): breadcrumb + back +
              sibling switcher on every screen except the Home root. Portrait keeps its own
              MobilePageHead above. */}
          {!mobileShell && nav !== 'home' && (
            <ScreenHeader nav={nav} save={save} badges={badges} onBack={goBack} go={go} onGroup={() => goLanding(groupOf(nav).id)} />
          )}
          {/* Any screen whose feature hasn't revealed shows its unlock briefing instead —
              one gate for every wing (the old per-mode ModeLocked, generalized). */}
          {!featureRevealed(save, nav) && <FeatureLocked view={featureView(save, nav)} go={go} />}
          {/* One failed screen (a chunk that won't load, a render crash) stays LOCAL: the
              boundary offers Retry + Back while the rail and every other screen keep working. */}
          {featureRevealed(save, nav) && <HubScreen.Provider value={nav}><ScreenBoundary onBack={goBack}><Suspense fallback={<ScreenFallback />}>
          {nav === 'home' && (
            <CommandCenter onStart={onStart} onStartEndless={onStartEndless} onStartCampaign={onStartCampaign} go={go} last={last} onSeenLast={onSeenLast} doctrineRef={doctrineRef} />
          )}
          {nav === 'campaign' && <CampaignScreen onStart={onStartCampaign} difficultyRef={difficultyRef} />}
          {nav === 'infinite' && <InfiniteScreen onStartEndless={onStartEndless} difficultyRef={difficultyRef} doctrineRef={doctrineRef} />}
          {nav === 'bossrush' && <BossRushScreen onStartBossRush={onStartBossRush} difficultyRef={difficultyRef} />}
          {nav === 'arena' && <ArenaScreen onLaunchMatch={onLaunchArenaMatch} />}
          {nav === 'daily' && <DailyScreen onStartDaily={onStartDaily} onSpectate={onSpectate} />}
          {nav === 'towers' && <TowerLab />}
          {nav === 'mulligans' && <MulliganLab />}
          {nav === 'heroes' && <HeroLab />}
          {nav === 'adaptation' && <AdaptationChamber />}
          {nav === 'evolution' && <EvolutionHQ />}
          {nav === 'genes' && <GeneArchive />}
          {nav === 'hive' && <HiveScreen />}
          {nav === 'infestation' && <FrontScreen />}
          {nav === 'vault' && <GeneticVault />}
          {nav === 'market' && <SpliceMarket />}
          {nav === 'auction' && <AuctionHouse />}
          {nav === 'equipment' && <EquipmentPanel />}
          {nav === 'quests' && <QuestBoard />}
          {nav === 'season' && <BattlePassScreen onStore={() => go('store')} />}
          {nav === 'phenotypes' && <Wardrobe />}
          {nav === 'collection' && <CollectionScreen />}
          {nav === 'store' && <PremiumStore />}
          {nav === 'profile' && <PlayerProfile onNavigate={(k) => go(k as NavKey)} />}
          {nav === 'settings' && <SettingsScreen onReplayTutorial={onReplayTutorial} onReplayTour={onReplayTour} onReplayIntro={onReplayIntro} />}
          {nav === 'help' && <HelpWiki onNavigate={(k) => go(k as NavKey)} onReplayTour={onReplayTour} />}
          </Suspense></ScreenBoundary></HubScreen.Provider>}
          </>
          )}
        </section>
      </div>

      {mobileShell && (
        <MobileTabBar
          active={activeTab}
          badges={badges}
          teaserKeys={new Set(teaserOf.keys())}
          readyKeys={chainSet}
          onTab={tapTab}
        />
      )}
    </div>
  );
}
