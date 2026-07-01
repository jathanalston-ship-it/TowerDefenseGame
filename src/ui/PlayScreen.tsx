// The PLAY landing — the headquarters' Mission Control. It answers, at a glance: what to
// do next (CONTINUE CAMPAIGN, the dominant action), how hard it is (recommended vs your
// power), and what's waiting (reward preview). Secondary modes sit visually beneath it.
// Built entirely on the existing campaign + meta systems — no new gameplay. No scrolling;
// fits 1080p inside the Hub's content area.

import { useEffect, useState, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import type { RunOutcome, RunResult } from '../state/meta';
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
import { formatPower as fmtP } from '../core/power';
import { RewardPreview } from './RewardPreview';
import type { PreviewChip } from './RewardPreview';
import { NextGoalBanner } from './NextGoalBanner';
import type { NavKey } from './Hub';

type RunRecap = { result: RunResult; outcome: RunOutcome } | null;

/** The "since your last run" highlights — the dopamine recap shown on returning to the Home
 * screen. Derived from the finished run's outcome (already applied to the save). */
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

export function PlayScreen({
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
  // Snapshot the last run ONCE at mount so the recap survives onSeenLast clearing it (and
  // doesn't re-appear when you tab back to Play later in the same session).
  const [recap] = useState(() => recapItems(last));
  const [tip] = useState(pickTip); // one loading tip per visit (ui/tips.ts)
  useEffect(() => { if (last) onSeenLast(); }, [last, onSeenLast]);
  // Difficulty drives WHICH campaign track's frontier we show, so it must re-render the
  // panel — mirror it into local state (the ref stays the source of truth for run start).
  const diff = difficultyPref('campaign'); // Continue Campaign uses Campaign's own difficulty (chosen there)

  const cleared = save.campaign.cleared[diff] ?? 0;
  const frontier = cleared + 1; // the next stage to attempt on this track
  const cfg = generateStage(frontier, diff);
  const rec = recommendedPowerScore(frontier, diff);
  const power = meta.power().score;
  const ready = power >= rec;
  const accent = cfg.biome.accent;

  const isMilestone = frontier % CAMPAIGN_REWARDS.milestoneEvery === 0;
  const firstClearCore =
    CAMPAIGN_REWARDS.firstClearCore +
    CAMPAIGN_REWARDS.firstClearCorePerStage * frontier +
    (isMilestone ? CAMPAIGN_REWARDS.milestoneCore : 0);
  const objective = isMilestone
    ? 'Milestone stage — clearing it raises your Evolution Cap'
    : `Descend into the ${cfg.biome.name} and clear Stage ${frontier}`;

  // Possible Rewards (anticipation): the variety a run can drop. Campaign adds an
  // Evolution Unlock chip on milestone stages so the payoff is obvious before deploying.
  const campaignRewards: PreviewChip[] = [
    { label: 'Strain Samples', color: 'var(--kinetic)', icon: <CurrencyIcon id="towerShards" size={12} title="" /> },
    { label: 'Apex Genome', color: 'var(--vital)', icon: <CurrencyIcon id="heroShards" size={12} title="" /> },
    { label: 'Equipment', color: 'var(--r-epic)' },
    { label: 'Genome Cores', color: 'var(--gold)', icon: <CurrencyIcon id="genomeCores" size={12} title="" /> },
  ];
  if (isMilestone) campaignRewards.push({ label: 'Evolution Unlock', color: 'var(--r-legendary)' });
  const infiniteRewards: PreviewChip[] = [
    { label: 'Containers', color: 'var(--r-epic)' },
    { label: 'Mastery', color: 'var(--r-rare)' },
    { label: 'Genome Cores', color: 'var(--gold)' },
  ];

  const start = (fn: () => void): void => {
    audio.resume();
    audio.cue('ui');
    fn();
  };

  return (
    <div className="play-screen">
      {/* ── Returning from a run: advertise what you just earned ── */}
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

      {/* ── Command Center vitals — the account as a LIVING dashboard (existing read-models). ── */}
      {(() => {
        const codex = collectionView(collectionContextOf(save));
        const goal = nextGoals(save, 1)[0];
        const vaults = save.pendingContainers.length;
        const ach = (save.achievements ?? []).length;
        const vitals: { k: string; v: string; c?: string; nav?: NavKey; title: string }[] = [
          { k: 'Power', v: fmtP(power), c: 'var(--gold)', nav: 'profile', title: 'Power Score — total account strength' },
          { k: 'Campaign', v: `Stage ${highestCampaignStage(save)}`, nav: 'campaign', title: 'Deepest Campaign stage cleared' },
          { k: 'Infinite', v: `Wave ${save.bestWave}`, nav: 'infinite', title: 'Infinite personal best' },
          { k: 'Collection', v: `${Math.round(codex.completion * 100)}%`, nav: 'collection', title: 'Codex completion' },
          { k: 'Champions', v: `${save.heroLoadout.length}/${heroSlotsUnlocked(save)}`, nav: 'heroes', title: 'Fielded champions / unlocked slots' },
          { k: 'Vaults', v: vaults > 0 ? `${vaults} ready` : '—', c: vaults > 0 ? 'var(--r-epic)' : undefined, nav: 'vault', title: 'Unopened Bio-Containers' },
          ...(goal ? [{ k: 'Next unlock', v: `${goal.label} · ${Math.round(goal.progress * 100)}%`, c: goal.color, nav: goal.nav as NavKey, title: `${goal.remaining} to go` }] : []),
          ...(ach > 0 ? [{ k: 'Achievements', v: `${ach}`, nav: 'profile' as NavKey, title: 'Achievements earned' }] : []),
        ];
        return (
          <section className="cc-vitals" aria-label="Command Center vitals">
            <span className="cc-vitals-h">◉ COMMAND CENTER</span>
            {vitals.map((x) => (
              <button className="cc-vital" key={x.k} onClick={() => x.nav && go(x.nav)} title={x.title}>
                <span className="cc-vital-k">{x.k}</span>
                <span className="cc-vital-v" style={x.c ? { color: x.c } : undefined}>{x.v}</span>
              </button>
            ))}
          </section>
        );
      })()}

      {/* ── The anticipation spine: the nearest reward, always in view (docs/ONE-MORE-RUN.md) ── */}
      <NextGoalBanner onNavigate={(k) => go(k as NavKey)} />

      {/* ── Mission Control: CONTINUE CAMPAIGN dominates ── */}
      <section className="mc-campaign" style={{ ['--mc-accent' as string]: accent }}>
        <div className="mc-eyebrow">Continue Campaign · The Descent</div>

        <div className="mc-head">
          <div className="mc-stage">
            <span className="mc-stage-k">Stage</span>
            <span className="mc-stage-n">{frontier}</span>
          </div>
          <div className="mc-biome">
            <div className="mc-biome-name" style={{ color: accent }}>{cfg.biome.name}</div>
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
              <span className="mc-diff-ro" title="Change difficulty inside Campaign">
                {DIFFICULTIES[diff]?.name ?? 'Standard'} <small>· set in Campaign</small>
              </span>
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

      {/* ── Secondary modes — visually subordinate to the campaign ── */}
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
        {/* Unbuilt modes are hidden behind FEATURES (docs/EA-DESIGN-AUDIT P1 #15) — no dead "Soon"
            entrances. Flip the flag in the commit that ships the mode. */}
        {FEATURES.customChallenge && (
          <button className="mc-sec is-soon" disabled>
            <span className="mc-sec-i" aria-hidden>✦</span>
            <span className="mc-sec-body">
              <span className="mc-sec-t">Custom Challenge</span>
              <span className="mc-sec-d">Soon</span>
            </span>
          </button>
        )}
        {FEATURES.trainingMode && (
          <button className="mc-sec is-soon" disabled>
            <span className="mc-sec-i" aria-hidden>◎</span>
            <span className="mc-sec-body">
              <span className="mc-sec-t">Training</span>
              <span className="mc-sec-d">Soon</span>
            </span>
          </button>
        )}
      </section>

      {/* ── Living Progress dashboard — momentum across every system ── */}
      <ProgressDashboard go={go} onStartEndless={onStartEndless} />

      {/* ── Loading tip — a one-line teacher, rotated per visit (ui/tips.ts) ── */}
      <div className="mc-tip" role="note"><span className="mc-tip-k">TIP</span>{tip}</div>
    </div>
  );
}
