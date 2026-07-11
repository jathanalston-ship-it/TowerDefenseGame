// The Command Center — the Home screen as a living bio-organic war room (docs/
// COMMAND-CENTER.md). The shell renders ZONES; each zone renders whatever homeModel's
// homeRegistry yields (a future system adds a widget with one register() call + one
// renderer entry in WIDGETS — the shell never changes). Board, top to bottom: the
// clickable command strip → the living World Status centerpiece → mission control with
// the forecast/roadmap rail → the live army → operations → the command feed + system
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
import { NextGoalBanner } from './NextGoalBanner';
import { PredictionPanel } from './PredictionPanel';
import { WorldStatus } from './WorldStatus';
import { LiveEventsStrip } from './components/LiveEventsStrip';
import { BioCacheCard } from './BioCache';
import { DirectivesCard } from './components/DirectivesCard';
import { ContractsCard } from './components/ContractsCard';
import { InfestationBoard } from './components/InfestationBoard';
import { armyView, buildHomeView, commandFeed, homeRegistry } from './homeModel';
import type { HomeView, HomeZone } from './homeModel';
import type { NavKey } from './Hub';

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
      return render ? <div className="cc-widget" data-widget={d.id} key={d.id}>{render(ctx)}</div> : null;
    });

  return (
    <div className="cchome">
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
      <div className="cc-zone cc-zone-world">{zone('world')}</div>
      <div className="cc-zone-row">
        <div className="cc-zone cc-zone-main">{zone('main')}</div>
        <div className="cc-zone cc-zone-side">{zone('side')}</div>
      </div>
      <div className="cc-zone cc-zone-army">{zone('army')}</div>
      <div className="cc-zone cc-zone-ops">{zone('ops')}</div>
      <div className="cc-zone cc-zone-feed">{zone('feed')}</div>
      <div className="cc-zone cc-zone-foot">{zone('foot')}</div>
    </div>
  );
}

// ── Widget renderers — the registry's ids resolve HERE (one entry per widget) ────────────

const WIDGETS: Record<string, (ctx: WidgetCtx) => ReactNode> = {
  'vitals': Vitals,
  'world-status': (c) => <WorldStatus ws={c.view.world} />,
  // The banner owns ONLY the nearest goal; the side roadmap owns the queue behind it —
  // one goal, one surface (the pre-overhaul board showed the same goal three times).
  'next-goal': (c) => <NextGoalBanner onNavigate={(k) => c.go(k as NavKey)} goals={c.view.goals.slice(0, 1)} />,
  'bio-cache': () => <BioCacheCard />,
  'live-events': () => <LiveEventsStrip />,
  'directives': () => <DirectivesCard />,
  'contracts': () => <ContractsCard />,
  'infestation': () => <InfestationBoard />,
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
  const vitals: { k: string; v: string; c?: string; nav?: NavKey; title: string }[] = [
    { k: 'Level', v: `LV ${acct.level}`, c: 'var(--viral)', nav: 'profile', title: `Account Level — ${acct.into}/${acct.need} XP toward L${acct.level + 1}` },
    { k: 'Power', v: formatPower(view.power), c: 'var(--gold)', nav: 'profile', title: 'Power Score — total account strength' },
    { k: 'Campaign', v: `Stage ${view.world.stage}`, nav: 'campaign', title: 'Deepest Campaign stage cleared' },
    { k: 'Infinite', v: `Wave ${save.bestWave}`, nav: 'infinite', title: 'Infinite personal best' },
    { k: 'Collection', v: `${Math.round(view.collectionPct * 100)}%`, nav: 'collection', title: `Codex discovery — ${view.collectionDiscovered}/${view.collectionTotal}` },
    { k: 'Champions', v: `${save.heroLoadout.length}/${heroSlotsUnlocked(save)}`, nav: 'heroes', title: 'Fielded champions / unlocked slots' },
    { k: 'Vaults', v: vaults > 0 ? `${vaults} ready` : '—', c: vaults > 0 ? 'var(--r-epic)' : undefined, nav: 'vault', title: 'Unopened Bio-Containers' },
    ...(ach > 0 ? [{ k: 'Achievements', v: `${ach}`, nav: 'profile' as NavKey, title: 'Achievements earned' }] : []),
  ];
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
function MissionControl({ view, go, start, onStartCampaign, doctrineRef }: WidgetCtx): ReactNode {
  const { diff, stage, cleared, cfg, rec, ready, isMilestone, firstClearCore } = view.frontier;
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
        <div className={`mc-fact ${ready ? 'ok' : 'low'}`}>
          <span className="mc-fact-k">Recommended Power</span>
          <span className="mc-fact-v">
            {formatPower(rec)} <small>you {formatPower(power)} {ready ? '✓' : '⚠'}</small>
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
      <div className="mc-cta">
        <button
          className={`primary mc-deploy${ready ? '' : ' is-underready'}`}
          onClick={() => start(() => onStartCampaign(stage))}
          title={ready ? undefined : `Below recommended Power (${formatPower(rec)}) — expect a wall. Failed frontier attempts still recover partial field data.`}
        >
          <PlayIcon /> {ready ? 'Continue Campaign' : `Deploy Under-Powered ⚠ ${formatPower(power)} / ${formatPower(rec)}`}
        </button>
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
    </section>
  );
}

/** Unlock roadmap — the queue BEHIND the NEXT banner's goal (goals[1..]), as a visual rail. */
function Roadmap({ view, go }: WidgetCtx): ReactNode {
  const goals = view.goals.slice(1, 5);
  if (goals.length === 0) return null;
  return (
    <section className="cc-roadmap" aria-label="Upcoming unlocks">
      <span className="cc-panel-h">⬡ COMING UP</span>
      <div className="cc-road">
        {goals.map((g) => (
          <button className="cc-road-stop" key={g.id} style={{ ['--g' as string]: g.color }} onClick={() => go(g.nav as NavKey)} title={g.reward}>
            <span className="cc-road-ring" style={{ ['--p' as string]: g.progress }} aria-hidden>
              <b>{Math.round(g.progress * 100)}%</b>
            </span>
            <span className="cc-road-body">
              <span className="cc-road-l">{g.label}</span>
              <span className="cc-road-r">{g.remaining} to go</span>
            </span>
          </button>
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
    { label: 'Ichor / records', color: 'var(--viral)' },
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
function CommandFeed({ save }: WidgetCtx): ReactNode {
  const feed = commandFeed(save, Date.now());
  return (
    <section className="cc-feed" aria-label="Command feed">
      <span className="cc-panel-h">▤ COMMAND FEED</span>
      <ul className="cc-feed-list">
        {feed.map((e, i) => (
          <li className="cc-feed-item" key={`${e.at}-${i}`}>
            <span className="cc-feed-i" aria-hidden>{e.icon}</span>
            <span className="cc-feed-l">{e.label}</span>
            <span className="cc-feed-t">{e.ago}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
