// The Command Center — the Home screen as a living bio-organic war room (docs/
// COMMAND-CENTER.md). The shell renders ZONES; each zone renders whatever homeModel's
// homeRegistry yields (a future system adds a widget with one register() call + one
// renderer entry in WIDGETS — the shell never changes). Board, top to bottom: the
// clickable command strip → the living World Status centerpiece → mission control with
// the forecast/roadmap rail → the live army → operations → the command feed + system
// dashboard → the tip. Pure presentation over existing read-models; run starts route
// through the same callbacks the Hub always passed.

import { useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import { meta } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
import type { SaveData } from '../save/saveStore';
import { audio } from '../audio/sound';
import { PlayIcon } from './components/Icon';
import { DIFFICULTIES } from '../core/difficulty';
import { DOCTRINES, DOCTRINE_IDS } from '../core/doctrines';
import { difficultyPref } from '../state/prefs';
import { generateStage, recommendedPowerScore } from '../core/campaign';
import { formatPower } from '../core/power';
import { CAMPAIGN_REWARDS } from '../core/config';
import { FEATURES } from '../core/features';
import { CurrencyIcon } from './components/CurrencyIcon';
import { ProgressDashboard } from './ProgressDashboard';
import { pickTip } from './tips';
import { collectionView } from '../core/collection';
import { collectionContextOf, heroSlotsUnlocked } from '../state/meta';
import { highestCampaignStage } from '../save/derive';
import { nextGoals } from '../state/nextGoal';
import { RewardPreview } from './RewardPreview';
import type { PreviewChip } from './RewardPreview';
import { NextGoalBanner } from './NextGoalBanner';
import { PredictionPanel } from './PredictionPanel';
import { WorldStatus } from './WorldStatus';
import { armyView, commandFeed, homeRegistry } from './homeModel';
import type { HomeZone } from './homeModel';
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

/** Everything a widget renderer may need — one context object so renderer signatures never churn. */
interface WidgetCtx {
  save: SaveData;
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
  // Snapshot the last run ONCE at mount so the recap survives onSeenLast clearing it.
  const [recap] = useState(() => recapItems(last));
  const [tip] = useState(pickTip);
  useEffect(() => { if (last) onSeenLast(); }, [last, onSeenLast]);

  const start = (fn: () => void): void => {
    audio.resume();
    audio.cue('ui');
    fn();
  };
  const ctx: WidgetCtx = { save, go, start, onStart, onStartEndless, onStartCampaign, doctrineRef, tip };

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
  'world-status': () => <WorldStatus />,
  'next-goal': (c) => <NextGoalBanner onNavigate={(k) => c.go(k as NavKey)} />,
  'mission-control': MissionControl,
  'forecast': () => (
    <div className="cc-forecast">
      <PredictionPanel mode="campaign" difficultyId={difficultyPref('campaign')} label="Campaign Stage" />
    </div>
  ),
  'roadmap': Roadmap,
  'army': Army,
  'modes': Modes,
  'command-feed': CommandFeed,
  'dashboard': (c) => <ProgressDashboard go={c.go} onStartEndless={c.onStartEndless} />,
  'tip': (c) => <div className="mc-tip" role="note"><span className="mc-tip-k">TIP</span>{c.tip}</div>,
};

/** The command strip — every account vital, every one a door. */
function Vitals({ save, go }: WidgetCtx): ReactNode {
  const codex = collectionView(collectionContextOf(save));
  const goal = nextGoals(save, 1)[0];
  const vaults = save.pendingContainers.length;
  const ach = (save.achievements ?? []).length;
  const power = meta.power().score;
  const vitals: { k: string; v: string; c?: string; nav?: NavKey; title: string }[] = [
    { k: 'Power', v: formatPower(power), c: 'var(--gold)', nav: 'profile', title: 'Power Score — total account strength' },
    { k: 'Campaign', v: `Stage ${highestCampaignStage(save)}`, nav: 'campaign', title: 'Deepest Campaign stage cleared' },
    { k: 'Infinite', v: `Wave ${save.bestWave}`, nav: 'infinite', title: 'Infinite personal best' },
    { k: 'Collection', v: `${Math.round(codex.completion * 100)}%`, nav: 'collection', title: 'Codex completion' },
    { k: 'Champions', v: `${save.heroLoadout.length}/${heroSlotsUnlocked(save)}`, nav: 'heroes', title: 'Fielded champions / unlocked slots' },
    { k: 'Vaults', v: vaults > 0 ? `${vaults} ready` : '—', c: vaults > 0 ? 'var(--r-epic)' : undefined, nav: 'vault', title: 'Unopened Bio-Containers' },
    ...(goal ? [{ k: 'Next unlock', v: `${goal.label} · ${Math.round(goal.progress * 100)}%`, c: goal.color, nav: goal.nav as NavKey, title: `${goal.remaining} to go` }] : []),
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
function MissionControl({ save, go, start, onStartCampaign, doctrineRef }: WidgetCtx): ReactNode {
  const diff = difficultyPref('campaign');
  const cleared = save.campaign.cleared[diff] ?? 0;
  const frontier = cleared + 1;
  const cfg = generateStage(frontier, diff);
  const rec = recommendedPowerScore(frontier, diff);
  const power = meta.power().score;
  const ready = power >= rec;
  const isMilestone = frontier % CAMPAIGN_REWARDS.milestoneEvery === 0;
  const firstClearCore =
    CAMPAIGN_REWARDS.firstClearCore +
    CAMPAIGN_REWARDS.firstClearCorePerStage * frontier +
    (isMilestone ? CAMPAIGN_REWARDS.milestoneCore : 0);
  const objective = isMilestone
    ? 'Milestone stage — clearing it raises your Evolution Cap'
    : `Descend into the ${cfg.biome.name} and clear Stage ${frontier}`;
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
          <span className="mc-stage-n">{frontier}</span>
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
          <span className="mc-fact-k">Highest Stage</span>
          <span className="mc-fact-v">{cleared}</span>
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
        <button className="primary mc-deploy" onClick={() => start(() => onStartCampaign(frontier))}>
          <PlayIcon /> Continue Campaign
        </button>
        <div className="mc-setup">
          <div className="play-field">
            <span className="play-field-k">Difficulty</span>
            <button className="mc-diff-ro" onClick={() => go('campaign')} title="Change difficulty inside Campaign">
              {DIFFICULTIES[diff]?.name ?? 'Standard'} <small>· set in Campaign</small>
            </button>
          </div>
          <label className="play-field">
            <span className="play-field-k">Doctrine</span>
            <select defaultValue={doctrineRef.current} onChange={(e) => (doctrineRef.current = e.target.value)}>
              {DOCTRINE_IDS.map((id) => (
                <option key={id} value={id} title={DOCTRINES[id].blurb}>{DOCTRINES[id].name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}

/** Unlock roadmap — the next few things the account is about to earn, as a visual rail. */
function Roadmap({ save, go }: WidgetCtx): ReactNode {
  const goals = nextGoals(save, 4);
  if (goals.length === 0) return null;
  return (
    <section className="cc-roadmap" aria-label="Upcoming unlocks">
      <span className="cc-panel-h">⬡ UNLOCK ROADMAP</span>
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

/** The live army — every strain (stars · mastery · FORM) and champion, each a door to its lab. */
function Army({ save, go }: WidgetCtx): ReactNode {
  const army = armyView(save);
  return (
    <section className="cc-army" aria-label="Live army">
      <span className="cc-panel-h">❖ LIVE ARMY</span>
      <div className="cc-army-row">
        {army.towers.map((u) => (
          <button className="cc-unit" key={u.kind} style={{ ['--u' as string]: u.color }} onClick={() => go('towers')}
            title={`${u.name} — ◈${u.stars} · Mastery ${u.mastery}${u.form > 0 ? ` · FORM ${u.form}` : ''}`}>
            <span className="cc-unit-orb" aria-hidden>{u.form > 0 && <i className="cc-unit-form" />}</span>
            <span className="cc-unit-n">{u.name}</span>
            <span className="cc-unit-s">◈{u.stars}{u.mastery > 0 ? ` · L${u.mastery}` : ''}</span>
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

/** Operations — the secondary run modes beneath the campaign. */
function Modes({ start, onStart, onStartEndless }: WidgetCtx): ReactNode {
  const infiniteRewards: PreviewChip[] = [
    { label: 'Containers', color: 'var(--r-epic)' },
    { label: 'Mastery', color: 'var(--r-rare)' },
    { label: 'Genome Cores', color: 'var(--gold)' },
  ];
  return (
    <section className="mc-secondary" aria-label="Other modes">
      <button className="mc-sec mc-sec-endless" onClick={() => start(onStartEndless)}>
        <span className="mc-sec-i" aria-hidden>∞</span>
        <span className="mc-sec-body">
          <span className="mc-sec-t">Infinite Mode</span>
          <span className="mc-sec-d">Quick endless run · AI Director, infinite depth</span>
          <RewardPreview chips={infiniteRewards} className="mc-sec-rwp" />
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
