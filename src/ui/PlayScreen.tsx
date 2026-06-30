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
import { DIFFICULTIES, DIFFICULTY_IDS } from '../core/difficulty';
import { DOCTRINES, DOCTRINE_IDS } from '../core/doctrines';
import { generateStage, recommendedPower } from '../core/campaign';
import { CAMPAIGN_REWARDS } from '../core/config';
import { CurrencyIcon } from './components/CurrencyIcon';
import { ProgressDashboard } from './ProgressDashboard';
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
  difficultyRef,
  doctrineRef,
}: {
  onStart: () => void;
  onStartEndless: () => void;
  onStartCampaign: (stage: number) => void;
  go: (k: NavKey) => void;
  last: RunRecap;
  onSeenLast: () => void;
  difficultyRef: MutableRefObject<string>;
  doctrineRef: MutableRefObject<string>;
}): JSX.Element {
  const save = meta.use();
  // Snapshot the last run ONCE at mount so the recap survives onSeenLast clearing it (and
  // doesn't re-appear when you tab back to Play later in the same session).
  const [recap] = useState(() => recapItems(last));
  useEffect(() => { if (last) onSeenLast(); }, [last, onSeenLast]);
  // Difficulty drives WHICH campaign track's frontier we show, so it must re-render the
  // panel — mirror it into local state (the ref stays the source of truth for run start).
  const [diff, setDiff] = useState(difficultyRef.current);
  const setDifficulty = (id: string): void => {
    setDiff(id);
    difficultyRef.current = id;
  };

  const cleared = save.campaign.cleared[diff] ?? 0;
  const frontier = cleared + 1; // the next stage to attempt on this track
  const cfg = generateStage(frontier, diff);
  const rec = recommendedPower(frontier, diff);
  const power = meta.powerScore().score;
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
              ×{rec.toFixed(1)} <small>you ×{power.toFixed(1)} {ready ? '✓' : '⚠'}</small>
            </span>
          </div>
          <div className="mc-fact">
            <span className="mc-fact-k">Highest Stage</span>
            <span className="mc-fact-v">{cleared}</span>
          </div>
          <div className="mc-fact">
            <span className="mc-fact-k">Reward Preview</span>
            <span className="mc-fact-v">
              <CurrencyIcon id="genomeCores" size={13} title="" /> +{firstClearCore} · Stage Cache
            </span>
          </div>
        </div>

        <div className="mc-cta">
          <button className="primary mc-deploy" onClick={() => start(() => onStartCampaign(frontier))}>
            <PlayIcon /> Continue Campaign
          </button>
          <div className="mc-setup">
            <label className="play-field">
              <span className="play-field-k">Difficulty</span>
              <select value={diff} onChange={(e) => setDifficulty(e.target.value)}>
                {DIFFICULTY_IDS.map((id) => (
                  <option key={id} value={id} title={DIFFICULTIES[id].blurb}>{DIFFICULTIES[id].name}</option>
                ))}
              </select>
            </label>
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
          </span>
        </button>
        <button className="mc-sec" onClick={() => start(onStart)}>
          <span className="mc-sec-i" aria-hidden>▷</span>
          <span className="mc-sec-body">
            <span className="mc-sec-t">Quick Skirmish</span>
            <span className="mc-sec-d">The authored 12-wave defense</span>
          </span>
        </button>
        <button className="mc-sec is-soon" disabled>
          <span className="mc-sec-i" aria-hidden>✦</span>
          <span className="mc-sec-body">
            <span className="mc-sec-t">Custom Challenge</span>
            <span className="mc-sec-d">Soon</span>
          </span>
        </button>
        <button className="mc-sec is-soon" disabled>
          <span className="mc-sec-i" aria-hidden>◎</span>
          <span className="mc-sec-body">
            <span className="mc-sec-t">Training</span>
            <span className="mc-sec-d">Soon</span>
          </span>
        </button>
      </section>

      {/* ── Living Progress dashboard — momentum across every system ── */}
      <ProgressDashboard go={go} onStartEndless={onStartEndless} />
    </div>
  );
}
