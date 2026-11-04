// The Command Center — the Home screen as a living bio-organic war room (docs/
// COMMAND-CENTER.md). The shell renders ZONES; each zone renders whatever homeModel's
// homeRegistry yields (a future system adds a widget with one register() call + one
// renderer entry in WIDGETS — the shell never changes). Board, top to bottom: the
// clickable command strip → mission control with the forecast/roadmap rail → the living
// World Status centerpiece → the live army → operations → the command feed + system
// dashboard → the tip. Pure presentation over existing read-models; run starts route
// through the same callbacks the Hub always passed.

import { useEffect, useMemo, useState, type MutableRefObject, type ReactNode } from 'react';
import { meta } from '../state/meta';
import { isBossRushUnlocked, isDailyUnlocked, isInfiniteUnlocked } from '../save/derive';
import { MODE_UNLOCKS } from '../core/config';
import type { RunOutcome, RunResult } from '../state/meta';
import type { SaveData } from '../save/saveStore';
import { audio } from '../audio/sound';
import { PlayIcon } from './components/Icon';
import { DIFFICULTIES } from '../core/difficulty';
import { DOCTRINES } from '../core/doctrines';
import { DoctrinePicker } from './components/DoctrinePicker';
import { formatPower } from '../core/power';
import { FEATURES } from '../core/features';
import { CurrencyIcon } from './components/CurrencyIcon';
import { ProgressDashboard } from './ProgressDashboard';
import { pickTip } from './tips';
import { heroSlotsUnlocked } from '../state/meta';
import { highestCampaignStage } from '../save/derive';
import { RewardPreview } from './RewardPreview';
import type { PreviewChip } from './RewardPreview';
import { missionControl } from '../state/missionControl';
import { PredictionPanel } from './PredictionPanel';
import { WorldStatus } from './WorldStatus';
import { LiveEventsStrip } from './components/LiveEventsStrip';
import { BioCacheCard } from './BioCache';
import { DirectivesCard } from './components/DirectivesCard';
import { ContractsCard } from './components/ContractsCard';
import { FrontStrip } from './FrontScreen';
import { GrowthPanel } from './components/GrowthPanel';
import { armyView, buildHomeView, homeRegistry } from './homeModel';
import { recommendationsFor } from '../state/recommendations';
import { readyChain } from '../state/readyChain';
import { featureView, isOpenNav } from '../state/unlocks';
import { rewardVisible } from '../state/rewardVisibility';
import { loopFlow } from '../state/loopFlow';
import { loopState } from '../state/progressionLoop';
import { INCOME, etaLabel, incomePerRun, runsToStage } from '../state/income';
import { RecommendStrip } from './HubLanding';
import { t } from '../i18n';
import { hiveIntel } from '../state/hiveIntel';
import { evolutionRoadmap } from '../state/evolutionRoadmap';
import type { HomeView, HomeZone } from './homeModel';
import type { NavKey } from './Hub';
import { LiveEventsPanel } from './components/LiveEventsPanel';

type RunRecap = { result: RunResult; outcome: RunOutcome } | null;

/** "Since your last run" highlights — the dopamine recap on returning to the board. */
function recapItems(last: RunRecap): { icon: string; label: string }[] {
  if (!last) return [];
  const { result, outcome } = last;
  const out: { icon: string; label: string }[] = [];
  const depth = result.campaignStage ? `Stage ${result.campaignStage}` : `Wave ${result.wave}`;
  if (outcome.reward.newBest) out.push({ icon: '★', label: `New Personal Best · ${depth}` });
  if (outcome.evolutionUnlock) out.push({ icon: '⬡', label: 'New Mutation Tier unlocked' });
  const banked = outcome.loot?.banked?.length ?? 0;
  if (banked > 0) out.push({ icon: '◈', label: `${banked} New Container${banked > 1 ? 's' : ''}` });
  if (outcome.masteryUnlocks?.titles?.length) out.push({ icon: '◑', label: 'New Mastery Title' });
  const ach = outcome.achievements?.length ?? 0;
  if (ach > 0) out.push({ icon: '✦', label: `${ach} Achievement${ach > 1 ? 's' : ''}` });
  return out;
}

/** Everything a widget renderer may need — one context object so renderer signatures never churn.
 * `view` is THE home view-model (built once per save change); widgets read it instead of
 * re-deriving models so every number on the board agrees with every other. */
interface WidgetCtx {
  save: SaveData;
  view: HomeView;
  go: (k: NavKey) => void;
  start: (fn: () => void) => void;
  onStart: () => void;
  onStartEndless: () => void;
  onStartCampaign: (stage: number) => void;
  doctrineRef: MutableRefObject<string>;
  tip: string;
}

export function CommandCenter({
  onStart,
  onStartEndless,
  onStartCampaign,
  go,
  last,
  onSeenLast,
  doctrineRef,
}: {
  onStart: () => void;
  onStartEndless: () => void;
  onStartCampaign: (stage: number) => void;
  go: (k: NavKey) => void;
  last: RunRecap;
  onSeenLast: () => void;
  doctrineRef: MutableRefObject<string>;
}): JSX.Element {
  const save = meta.use();
  // The board's single source of numbers — recomputed only when the save snapshot changes.
  const view = useMemo(() => buildHomeView(save), [save]);
  // Snapshot the last run ONCE at mount so the recap survives onSeenLast clearing it.
  const [recap] = useState(() => recapItems(last));
  const [tip] = useState(pickTip);
  useEffect(() => { if (last) onSeenLast(); }, [last, onSeenLast]);

  const start = (fn: () => void): void => {
    audio.resume();
    audio.cue('ui');
    fn();
  };
  const ctx: WidgetCtx = { save, view, go, start, onStart, onStartEndless, onStartCampaign, doctrineRef, tip };

  const zone = (z: HomeZone): ReactNode =>
    homeRegistry.zone(save, z).map((d) => {
      const render = WIDGETS[d.id];
      // Render through CCWidget (a real component) so each widget's hooks live on ITS OWN fiber.
      // Calling render(ctx) inline would flatten every widget's hooks into CommandCenter's list,
      // and a `when` gate flipping a widget in/out between renders would trip React's
      // "rendered more hooks than during the previous render" (docs/UX-CONSOLIDATION.md).
      return render ? <CCWidget key={d.id} id={d.id} render={render} ctx={ctx} /> : null;
    });

  return (
    <div className="cchome">
      {/* LIVE EVENTS — loud and proud, the first read on home (LIVE-EVENTS.md §4): the
          theme owner headlines, the other two horizons ride as chips, and the banner
          unfolds into the claim console (challenges → tokens → track → shop). */}
      <LiveEventsPanel />
      {recap.length > 0 && (
        <section className="mc-recap" aria-label="Since your last run">
          <span className="mc-recap-h">Since your last run</span>
          {recap.map((r, i) => (
            <span className="mc-recap-chip" key={i}>
              <span className="mc-recap-i" aria-hidden>{r.icon}</span>
              {r.label}
            </span>
          ))}
        </section>
      )}
      <div className="cc-zone cc-zone-strip">{zone('strip')}</div>
      {/* The deploy row LEADS the World Status visual: the primary CTA sits above the fold on
          every viewport (mobilecheck asserts it — docs/COMMAND-CENTER.md §zones). */}
      <div className="cc-zone-row">
        <div className="cc-zone cc-zone-main">{zone('main')}</div>
        <div className="cc-zone cc-zone-side">{zone('side')}</div>
      </div>
      <div className="cc-zone cc-zone-world">{zone('world')}</div>
      <div className="cc-zone cc-zone-army">{zone('army')}</div>
      <div className="cc-zone cc-zone-ops">{zone('ops')}</div>
      <div className="cc-zone cc-zone-feed">{zone('feed')}</div>
      <div className="cc-zone cc-zone-foot">{zone('foot')}</div>
    </div>
  );
}

// ── Widget renderers — the registry's ids resolve HERE (one entry per widget) ────────────

/** One home widget on its own component fiber (see the zone renderer): keeps each widget's hooks
 *  isolated so widget membership can change between renders without a hook-count mismatch. */
function CCWidget({ id, render, ctx }: { id: string; render: (c: WidgetCtx) => ReactNode; ctx: WidgetCtx }): JSX.Element {
  return <div className="cc-widget" data-widget={id}>{render(ctx)}</div>;
}

const WIDGETS: Record<string, (ctx: WidgetCtx) => ReactNode> = {
  'vitals': Vitals,
  'world-status': (c) => <WorldStatus ws={c.view.world} />,
  // The READY CHAIN centerpiece (docs/HUB-FLOW.md §surfaces) leads: every live claim/open
  // stop, watermark-independent — the board's answer to "what did I forget I earned?".
  // The rotated Recommended-Now strip follows for spends/unlocks/play — it never repeats a
  // chain stop (one fact, one owner: the chain owns every claim/open line). A quiet account
  // renders no chain block at all (silence is meaningful).
  'recommend': (c) => {
    const chain = readyChain(c.save);
    const onChain = new Set<string>(chain.map((n) => n.nav));
    return (
    <section className="cc-recommend" aria-label={t('hub.landing.recommended')}>
      {chain.length > 0 && (
        <>
          <span className="cc-panel-h cc-chain-h">◈ READY CHAIN — {chain.length} STOP{chain.length === 1 ? '' : 'S'}</span>
          <div className="cc-chain" role="list">
            {chain.slice(0, 4).map((n) => (
              <button key={n.nav} type="button" role="listitem" className="cc-chain-row" data-reckind={n.kind} onClick={() => c.go(n.nav)}>
                <span className="cc-chain-name">{featureView(c.save, n.nav).def.name}</span>
                <span className="cc-chain-l">{n.label}</span>
                <span className="cc-chain-go" aria-hidden>→</span>
              </button>
            ))}
            {chain.length > 4 && <span className="cc-chain-more">+{chain.length - 4} more on the chain</span>}
          </div>
        </>
      )}
      <span className="cc-panel-h">✦ {t('hub.landing.recommended').toUpperCase()}</span>
      <RecommendStrip recs={recommendationsFor(c.save, { limit: 3, rotateFrom: loopFlow.last(), skip: (r) => onChain.has(r.nav) })} go={(k) => c.go(k)} />
    </section>
    );
  },
  // (UX consolidation, docs/MISSION-CONTROL.md: the old next-goal banner is ABSORBED into
  // Mission Control's objective ledger — one main-zone panel answers "what should I do".)
  'bio-cache': () => <BioCacheCard />,
  'live-events': () => <LiveEventsStrip />,
  'growth': (c) => <GrowthPanel save={c.save} go={(k) => c.go(k as NavKey)} />,
  'directives': () => <DirectivesCard />,
  'contracts': () => <ContractsCard />,
  // THE FRONT (docs/INFESTATION.md §front): the old full-size home board collapsed into a
  // one-line strip — fractions + today's beats; the full map lives on its own screen now.
  'infestation': () => <FrontStrip />,
  'mission-control': MissionControl,
  'forecast': (c) => (
    <div className="cc-forecast">
      <PredictionPanel mode="campaign" difficultyId={c.view.frontier.diff} label="Campaign Stage" />
    </div>
  ),
  'roadmap': Roadmap,
  'army': Army,
  'modes': Modes,
  'command-feed': CommandFeed,
  'dashboard': (c) => <ProgressDashboard go={c.go} />,
  'tip': (c) => <div className="mc-tip" role="note"><span className="mc-tip-k">TIP</span>{c.tip}</div>,
};

/** The command strip — every account vital, every one a door. (The NEXT banner owns the
 * nearest goal; it is deliberately absent here — one goal, one surface.) */
function Vitals({ save, view, go }: WidgetCtx): ReactNode {
  const vaults = view.vaultReady;
  const ach = (save.achievements ?? []).length;
  const acct = meta.accountLevel();
  const cells: { k: string; v: string; c?: string; nav?: NavKey; title: string }[] = [
    { k: 'Level', v: `LV ${acct.level}`, c: 'var(--viral)', nav: 'profile', title: `Account Level — ${acct.into}/${acct.need} XP toward L${acct.level + 1}` },
    { k: 'Power', v: formatPower(view.power), c: 'var(--gold)', nav: 'profile', title: 'Power Score — total account strength' },
    { k: 'Campaign', v: `Stage ${view.world.stage}`, nav: 'campaign', title: 'Deepest Campaign stage cleared' },
    { k: 'Infinite', v: `Wave ${save.bestWave}`, nav: 'infinite', title: 'Infinite personal best' },
    { k: 'Collection', v: `${Math.round(view.collectionPct * 100)}%`, nav: 'collection', title: `Codex discovery — ${view.collectionDiscovered}/${view.collectionTotal}` },
    { k: 'Champions', v: `${save.heroLoadout.length}/${heroSlotsUnlocked(save)}`, nav: 'heroes', title: 'Fielded champions / unlocked slots' },
    { k: 'Vaults', v: vaults > 0 ? `${vaults} ready` : '—', c: vaults > 0 ? 'var(--r-epic)' : undefined, nav: 'vault', title: 'Unopened Bio-Containers' },
    ...(ach > 0 ? [{ k: 'Achievements', v: `${ach}`, nav: 'profile' as NavKey, title: 'Achievements earned' }] : []),
  ];
  const vitals = cells.filter((x) => !x.nav || isOpenNav(save, x.nav)); // a stat for a sealed screen is a tease with no door
  return (
    <section className="cc-vitals" aria-label="Command strip">
      <span className="cc-vitals-h">◉ COMMAND</span>
      {vitals.map((x) => (
        <button className="cc-vital" key={x.k} onClick={() => x.nav && go(x.nav)} title={x.title}>
          <span className="cc-vital-k">{x.k}</span>
          <span className="cc-vital-v" style={x.c ? { color: x.c } : undefined}>{x.v}</span>
        </button>
      ))}
    </section>
  );
}

/** Mission control — CONTINUE CAMPAIGN dominates; the primary decision of every visit. */
function MissionControl({ save, view, go, start, onStartCampaign, onStartEndless, doctrineRef }: WidgetCtx): ReactNode {
  const { diff, stage, cleared, cfg, rec, ready, band, isMilestone, firstClearCore } = view.frontier;
  const underPowered = band === 'under'; // the only band that warns (docs/PROGRESSION-LOOP.md §readiness)
  // Foundation #1 (docs/MISSION-CONTROL.md): the objective ledger under the deploy card — the
  // one model that answers "what else should I do, and where is this going". Absorbs the old
  // standalone next-goal banner (one main-zone panel instead of two).
  const mc = useMemo(() => missionControl(save), [save]);
  // THE LOOP ON THE BUTTON (docs/COMMAND-CENTER.md §cta · PROGRESSION-LOOP.md): genuinely
  // under-powered with Infinite open ⇒ the PRIMARY action is the farm the directive prescribes —
  // with the readiness a run is gaining at the live income — and the frontier fight steps down to
  // a secondary button. (A 'close' band is a push, never a farm: the deploy stays primary.)
  const farm = useMemo(() => {
    if (!underPowered || !isInfiniteUnlocked(save)) return null;
    const ls = loopState(save, diff);
    const g = incomePerRun(save, 'lnPower'); // per-run Power growth (log) — the same rate the goal ETAs use
    // The per-run gain + ETA speak only once the ledger has OBSERVED a few runs — a migrated
    // veteran's lifetime-average prior over-states depth growth (early stages were fast).
    const observed = (save.income?.runs ?? 0) >= INCOME.priorRuns;
    return {
      depth: ls.farmDepth,
      readinessPct: Math.round(ls.readiness * 100),
      gainPts: observed ? Math.round(ls.readiness * (Math.exp(g) - 1) * 1000) / 10 : 0,
      eta: observed ? etaLabel(runsToStage(save, stage, ls.power)) : null,
    };
  }, [save, underPowered, diff, stage]);
  // Doctrine commitment (docs/DOCTRINES.md): the field shows the pick; tapping it unfolds the
  // shared picker (lock seals + rank pips) — no more blind dropdown on the campaign path.
  const [doctrine, setDoctrine] = useState(doctrineRef.current || 'none');
  const [docOpen, setDocOpen] = useState(false);
  const docDef = DOCTRINES[doctrine] ?? DOCTRINES.none;
  const power = view.power;
  const objective = isMilestone
    ? 'Milestone stage — clearing it raises your Evolution Cap'
    : `Descend into the ${cfg.biome.name} and clear Stage ${stage}`;
  const campaignRewards: PreviewChip[] = [
    { label: 'Strain Samples', color: 'var(--kinetic)', icon: <CurrencyIcon id="towerShards" size={12} title="" /> },
    { label: 'Apex Genome', color: 'var(--vital)', icon: <CurrencyIcon id="heroShards" size={12} title="" /> },
    { label: 'Equipment', color: 'var(--r-epic)' },
    { label: 'Genome Cores', color: 'var(--gold)', icon: <CurrencyIcon id="genomeCores" size={12} title="" /> },
  ];
  if (isMilestone) campaignRewards.push({ label: 'Evolution Unlock', color: 'var(--r-legendary)' });

  return (
    <section className="mc-campaign" style={{ ['--mc-accent' as string]: cfg.biome.accent }}>
      <div className="mc-eyebrow">Continue Campaign · The Descent</div>
      <div className="mc-head">
        <div className="mc-stage">
          <span className="mc-stage-k">Stage</span>
          <span className="mc-stage-n">{stage}</span>
        </div>
        <div className="mc-biome">
          <div className="mc-biome-name" style={{ color: cfg.biome.accent }}>{cfg.biome.name}</div>
          <div className="mc-mods">
            <span className="mc-mod" title="Biome modifier">{cfg.modifierName}</span>
            <span className="mc-mod hazard" title={cfg.hazardDesc}>⚠ {cfg.hazardName}</span>
          </div>
          <div className="mc-objective">{objective}</div>
        </div>
      </div>
      <div className="mc-facts">
        <div className="mc-fact">
          <span className="mc-fact-k">◈ Next Boss</span>
          <span className="mc-fact-v">{cfg.boss.name}</span>
        </div>
        <div className={`mc-fact ${underPowered ? 'low' : 'ok'}`}>
          <span className="mc-fact-k">Recommended Power</span>
          <span className="mc-fact-v">
            {formatPower(rec)} <small>you {formatPower(power)} {ready ? '✓' : underPowered ? '⚠' : ''}</small>
          </span>
        </div>
        <div className="mc-fact">
          <span className="mc-fact-k">{DIFFICULTIES[diff]?.name ?? 'Standard'} Track</span>
          <span className="mc-fact-v">{cleared} cleared</span>
        </div>
        <div className="mc-fact">
          <span className="mc-fact-k">First Clear</span>
          <span className="mc-fact-v">
            <CurrencyIcon id="genomeCores" size={13} title="" /> +{firstClearCore} · Stage Cache
          </span>
        </div>
      </div>
      <RewardPreview heading="Possible Rewards" chips={campaignRewards} className="mc-rewards" />
      <div className={`mc-cta${farm ? ' is-farm' : ''}`}>
        {farm ? (
          <div className="mc-farm">
            <button
              className="primary mc-deploy is-farm"
              onClick={() => start(onStartEndless)}
              title={`Stage ${stage} asks for ${formatPower(rec)} Power — you have ${formatPower(power)}. Infinite banks loot, Mastery and genes permanently.`}
            >
              <PlayIcon /> Farm Infinite <small>~Depth {farm.depth}</small>
            </button>
            <span className="mc-farm-gain">
              Stage {stage} readiness <b>{farm.readinessPct}%</b>
              {farm.gainPts > 0 && <> · +{farm.gainPts}% per run</>}
              {farm.eta && <> · ready in {farm.eta}</>}
            </span>
            <button
              className="mc-fight-anyway"
              onClick={() => start(() => onStartCampaign(stage))}
              title={`Recommended Power ${formatPower(rec)} — you have ${formatPower(power)}. Failed frontier attempts still recover partial field data.`}
            >
              Fight Stage {stage} anyway ▸
            </button>
          </div>
        ) : (
          <button
            className={`primary mc-deploy${underPowered ? ' is-underready' : ''}`}
            onClick={() => start(() => onStartCampaign(stage))}
            title={underPowered ? `Recommended Power ${formatPower(rec)} — you have ${formatPower(power)}. Failed frontier attempts still recover partial field data.` : undefined}
          >
            <PlayIcon /> {underPowered ? 'Fight anyway — recommended Power not met' : 'Continue Campaign'}
          </button>
        )}
        <div className="mc-setup">
          <div className="play-field">
            <span className="play-field-k">Difficulty</span>
            <button className="mc-diff-ro" onClick={() => go('campaign')} title="Change difficulty inside Campaign">
              {DIFFICULTIES[diff]?.name ?? 'Standard'} <small>· set in Campaign</small>
            </button>
          </div>
          <div className="play-field">
            <span className="play-field-k">Doctrine</span>
            <button
              className={`mc-doc-ro${doctrine !== 'none' ? ' has-doc' : ''}`}
              onClick={() => setDocOpen((o) => !o)}
              aria-expanded={docOpen}
              title={docDef.blurb}
            >
              {docDef.icon} {docDef.name} <small>{docOpen ? '▴' : '▾'}</small>
            </button>
          </div>
        </div>
        {docOpen && (
          <DoctrinePicker
            value={doctrine}
            onChange={(id) => { setDoctrine(id); doctrineRef.current = id; setDocOpen(false); }}
            difficultyId={diff}
            compact
          />
        )}
      </div>
      {/* ── The objective ledger (Foundation #1) — SECONDARY moves + where it's all going. ── */}
      {(mc.secondary.length > 0 || mc.longterm.length > 0) && (
        <div className="mc-ledger" aria-label="Mission objectives">
          {mc.secondary.map((o) => (
            <button key={o.id} className="mc-obj" onClick={() => go(o.nav as NavKey)} title={o.why}>
              <span className="mc-obj-ring" style={{ ['--p' as string]: o.progress }} aria-hidden>
                <b>{Math.round(o.progress * 100)}%</b>
              </span>
              <span className="mc-obj-body">
                <span className="mc-obj-t">{o.title}</span>
                <span className="mc-obj-r">{o.remaining}{o.reward ? ` · ${o.reward}` : ''}</span>
              </span>
              {o.powerGain !== undefined && <span className="mc-obj-gain">+{o.powerGain}⚡</span>}
            </button>
          ))}
          {mc.longterm.length > 0 && (
            <div className="mc-horizon" title="The next wings of the hive — unlocked by playing">
              <span className="mc-horizon-k">AHEAD</span>
              {mc.longterm.map((o) => (
                <span key={o.id} className="mc-horizon-stop" title={`${o.why} — ${o.remaining}`}>
                  <i aria-hidden>{o.glyph}</i> {o.title}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** EVOLUTION ROADMAP (docs/EVOLUTION-ROADMAP.md — Foundation #4): the whole learning curve on one rail.
 *  The headline is the NEXT wing (live requirement + the Power its frontier will ask for); the
 *  queue behind it shows what's coming, and the conquered count says how far you've come.
 *  (Coalescing: resource goals — evolutions, releases — live in Mission Control's ledger now;
 *  this rail owns the SYSTEM curve, so no goal ever renders on two home surfaces.) */
function Roadmap({ save, go }: WidgetCtx): ReactNode {
  const rm = useMemo(() => evolutionRoadmap(save), [save]);
  if (!rm.next) return null; // everything revealed — the veteran board stays calm
  const upcoming = rm.nodes.filter((n) => !n.revealed).slice(1, 4);
  return (
    <section className="cc-roadmap" aria-label="Evolution Roadmap">
      <span className="cc-panel-h">⬡ EVOLUTION ROADMAP <small className="cc-road-count">{rm.conquered}/{rm.nodes.length} wings</small></span>
      <div className="cc-road">
        <button className="cc-road-stop is-next" key={rm.next.id} onClick={() => go('campaign')} title={rm.next.hook}>
          <span className="cc-road-ring" style={{ ['--p' as string]: rm.next.progress }} aria-hidden>
            <b>{Math.round(rm.next.progress * 100)}%</b>
          </span>
          <span className="cc-road-body">
            <span className="cc-road-l">{rm.next.glyph} {rm.next.name}</span>
            <span className="cc-road-r">{rm.next.requirement || 'Almost there'}</span>
            {rm.next.stagesAhead > 0 && (
              <span className="cc-road-r">≈{rm.next.stagesAhead} stage{rm.next.stagesAhead === 1 ? '' : 's'} · ready ≈ {formatPower(rm.next.powerAtUnlock)} Power</span>
            )}
          </span>
        </button>
        {upcoming.map((n) => (
          <div className="cc-road-stop is-far" key={n.id} title={`${n.hook} — ${n.requirement}`}>
            <span className="cc-road-glyph" aria-hidden>{n.glyph}</span>
            <span className="cc-road-body">
              <span className="cc-road-l">{n.name}</span>
              <span className="cc-road-r">{n.stagesAhead > 0 ? `≈${n.stagesAhead} stages ahead` : n.requirement}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The live army — every strain (stars · mastery · FORM; dormant strains show LOCKED) and
 *  champion, each a door to its lab. */
function Army({ save, go }: WidgetCtx): ReactNode {
  const army = armyView(save);
  return (
    <section className="cc-army" aria-label="Live army">
      <span className="cc-panel-h">❖ LIVE ARMY</span>
      <div className="cc-army-row">
        {army.towers.map((u) => (
          <button className={`cc-unit${u.unlocked ? '' : ' is-locked'}`} key={u.kind} style={{ ['--u' as string]: u.color }} onClick={() => go('towers')}
            title={u.unlocked ? `${u.name} — ◈${u.stars} · Mastery ${u.mastery}${u.form > 0 ? ` · FORM ${u.form}` : ''}` : `${u.name} — dormant strain (synthesize in the Tower Lab)`}>
            <span className="cc-unit-orb" aria-hidden>{u.form > 0 && <i className="cc-unit-form" />}</span>
            <span className="cc-unit-n">{u.name}</span>
            <span className="cc-unit-s">{u.unlocked ? `◈${u.stars}${u.mastery > 0 ? ` · L${u.mastery}` : ''}` : '🔒'}</span>
          </button>
        ))}
        <span className="cc-army-div" aria-hidden />
        {army.heroes.map((u) => (
          <button className={`cc-unit is-hero${u.unlocked ? '' : ' is-locked'}${u.fielded ? ' is-fielded' : ''}`} key={u.kind}
            style={{ ['--u' as string]: u.color }} onClick={() => go('heroes')}
            title={u.unlocked ? `${u.name} — ◈${u.stars}${u.fielded ? ' · FIELDED' : ' · reserve'}` : `${u.name} — locked`}>
            <span className="cc-unit-orb is-diamond" aria-hidden />
            <span className="cc-unit-n">{u.name}</span>
            <span className="cc-unit-s">{u.unlocked ? (u.fielded ? 'FIELDED' : 'reserve') : '🔒'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Operations — the secondary run modes beneath the campaign (mirrors the nav's Play group). */
function Modes({ start, onStart, onStartEndless, go, save }: WidgetCtx): ReactNode {
  const infUnlocked = isInfiniteUnlocked(save);
  const rushUnlocked = isBossRushUnlocked(save);
  const dailyUnlocked = isDailyUnlocked(save);
  const stage = highestCampaignStage(save);
  const infiniteRewards: PreviewChip[] = [
    { label: 'Containers', color: 'var(--r-epic)' },
    { label: 'Mastery', color: 'var(--r-rare)' },
    { label: 'Genome Cores', color: 'var(--gold)' },
  ];
  const rushRewards: PreviewChip[] = [
    { label: 'Cores / boss', color: 'var(--gold)' },
    { label: 'Loot / boss', color: 'var(--r-epic)' },
    // Never preview a currency the player hasn't met yet (state/rewardVisibility.ts).
    ...(rewardVisible(save, 'ichor') ? [{ label: 'Ichor / records', color: 'var(--viral)' }] : []),
  ];
  const dailyRewards: PreviewChip[] = [
    { label: 'Genome Cores', color: 'var(--gold)' },
    { label: 'Global board', color: 'var(--kinetic)' },
  ];
  return (
    <section className="mc-secondary" aria-label="Other modes">
      <button
        className={`mc-sec mc-sec-endless${infUnlocked ? '' : ' is-locked'}`}
        onClick={() => (infUnlocked ? start(onStartEndless) : go('campaign'))}
      >
        <span className="mc-sec-i" aria-hidden>∞</span>
        <span className="mc-sec-body">
          <span className="mc-sec-t">Infinite Mode</span>
          <span className="mc-sec-d">
            {infUnlocked
              ? 'Quick endless run · AI Director, infinite depth'
              : `🔒 Unlocks at Campaign Stage ${MODE_UNLOCKS.infinite} — you're at ${stage}`}
          </span>
          <RewardPreview chips={infiniteRewards} className="mc-sec-rwp" />
        </span>
      </button>
      <button
        className={`mc-sec mc-sec-rush${rushUnlocked ? '' : ' is-locked'}`}
        onClick={() => go(rushUnlocked ? 'bossrush' : 'campaign')}
      >
        <span className="mc-sec-i" aria-hidden>☠</span>
        <span className="mc-sec-body">
          <span className="mc-sec-t">Boss Rush</span>
          <span className="mc-sec-d">
            {rushUnlocked
              ? 'The gauntlet · wave N = N bosses, paid per kill'
              : `🔒 Unlocks at Campaign Stage ${MODE_UNLOCKS.bossRush} — you're at ${stage}`}
          </span>
          <RewardPreview chips={rushRewards} className="mc-sec-rwp" />
        </span>
      </button>
      <button
        className={`mc-sec mc-sec-daily${dailyUnlocked ? '' : ' is-locked'}`}
        onClick={() => go(dailyUnlocked ? 'daily' : 'campaign')}
      >
        <span className="mc-sec-i" aria-hidden>☀</span>
        <span className="mc-sec-body">
          <span className="mc-sec-t">Daily Run</span>
          <span className="mc-sec-d">
            {dailyUnlocked
              ? 'One seed per day · the same gauntlet worldwide'
              : `🔒 Unlocks at Campaign Stage ${MODE_UNLOCKS.daily} — you're at ${stage}`}
          </span>
          <RewardPreview chips={dailyRewards} className="mc-sec-rwp" />
        </span>
      </button>
      <button className="mc-sec" onClick={() => start(onStart)}>
        <span className="mc-sec-i" aria-hidden>▷</span>
        <span className="mc-sec-body">
          <span className="mc-sec-t">Quick Skirmish</span>
          <span className="mc-sec-d">The authored 12-wave defense</span>
        </span>
      </button>
      {FEATURES.customChallenge && (
        <button className="mc-sec is-soon" disabled>
          <span className="mc-sec-i" aria-hidden>✦</span>
          <span className="mc-sec-body"><span className="mc-sec-t">Custom Challenge</span><span className="mc-sec-d">Soon</span></span>
        </button>
      )}
      {FEATURES.trainingMode && (
        <button className="mc-sec is-soon" disabled>
          <span className="mc-sec-i" aria-hidden>◎</span>
          <span className="mc-sec-body"><span className="mc-sec-t">Training</span><span className="mc-sec-d">Soon</span></span>
        </button>
      )}
    </section>
  );
}

/** Command feed — the account's recent milestones from the save timeline (newest first). */
function CommandFeed({ save, go }: WidgetCtx): ReactNode {
  // HIVE INTELLIGENCE (docs/HIVE-INTEL.md — Foundation #2): the derived intel layer replaces
  // the raw timeline list. ACT rows (banked value / exact Power moves) lead with one-tap jumps;
  // the old command-feed milestones ride as the low-priority NOTE tail (absorbed, not lost).
  const feed = useMemo(() => hiveIntel(save, Date.now()), [save]);
  if (feed.length === 0) return null;
  return (
    <section className="cc-feed" aria-label="Hive Intelligence">
      <span className="cc-panel-h">▤ HIVE INTELLIGENCE</span>
      <ul className="cc-feed-list">
        {feed.map((e) => (
          <li className={`cc-feed-item is-${e.priority}`} key={e.id}>
            <span className="cc-feed-i" aria-hidden>{e.icon}</span>
            <span className="cc-feed-body" title={e.why}>
              <span className="cc-feed-l">{e.what}</span>
              {e.priority !== 'note' && <span className="cc-feed-why">{e.why}</span>}
            </span>
            {e.powerGain !== undefined && <span className="cc-feed-gain">+{e.powerGain}⚡</span>}
            {e.ago ? (
              <span className="cc-feed-t">{e.ago}</span>
            ) : (
              <button className="cc-feed-act" onClick={() => go(e.nav as NavKey)}>{e.action} ▸</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
