// DAILY RUN — the day's terminal (docs/DAILY-RUN.md). The fourth pillar next to Campaign /
// Infinite / Boss Rush: one deterministic seed per UTC day generates the SAME 20-wave gauntlet
// worldwide — a rolled biome, two gameplay modifiers, a seeded 3-boss roster, a 3-tower trial
// Conveyor pool, and the day's champion. This terminal briefs the contract (what today IS),
// shows the ledger (today's best / streak), ticks the reset countdown, and launches.

import { useEffect, useState } from 'react';
import { meta } from '../state/meta';
import type { ReplayRecord } from '../core/replay';
import { decodeReplayCode } from '../net/replayShare';
import { t, useLocale } from '../i18n';
import { ShareReplayButton } from './components/ShareReplay';
import { LeaderboardBlock } from './components/LeaderboardBlock';
import { FieldResearchCard } from './components/FieldResearch';
import { formatPower } from '../core/power';
import { dailyKey, generateDaily, msUntilDailyReset, pickDailyHero } from '../core/daily';
import { dailyModifierById } from '../core/dailyModifiers';
import { megaBossDef } from '../core/megaboss';
import { biomeById } from '../core/biomes';
import { DAILY, HERO_DEFS, HERO_ORDER, TOWER_DEFS } from '../core/config';
import './DailyScreen.css';

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function DailyScreen({ onStartDaily, onSpectate }: { onStartDaily: () => void; onSpectate: (r: ReplayRecord) => void }): JSX.Element {
  useLocale();
  const save = meta.use();
  // Replay Theater (docs/REPLAY-SHARE.md): share today's best / watch any pasted code.
  const [shareCode, setShareCode] = useState('');
  const [badCode, setBadCode] = useState(false);
  // Tick a real-time clock so the reset countdown is live — and REGENERATE the plan when the UTC
  // day flips mid-session (the key is state, so the flip re-renders everything below).
  const [key, setKey] = useState(() => dailyKey());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const k = dailyKey();
      setKey((prev) => (prev === k ? prev : k));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  void now; // consumed via msUntilDailyReset below (re-render driver)

  const plan = generateDaily(key); // pure + deterministic in the key — cheap to re-derive
  const biome = biomeById(plan.biomeId);
  const modifiers = plan.modifierIds.map((id) => dailyModifierById(id)).filter((m) => !!m);
  const hero = HERO_DEFS[pickDailyHero(plan.seed, HERO_ORDER)];
  const power = meta.power().score;
  const ready = power >= plan.recommendedPower;
  const playedToday = save.daily.lastKey === key;
  const clearedToday = save.daily.rewardedKey === key;

  return (
    <div className="menu daily-screen">
      <header className="screen-h">
        <h2>Daily Run</h2>
        <p className="screen-sub">One seed · one world · every player faces the same gauntlet. Resets in <b>{fmtCountdown(msUntilDailyReset())}</b>.</p>
      </header>

      <div className="hub-cols daily-cols">
        {/* ── The day's contract ── */}
        <div className="panel daily-card" style={{ ['--biome' as string]: biome.accent }}>
          <div className="daily-head">
            <span className="daily-date">{key}</span>
            <span className={`daily-diff d-${plan.difficultyEstimate.label.toLowerCase()}`}>{plan.difficultyEstimate.label}</span>
          </div>
          <div className="daily-biome" style={{ color: biome.accent }}>{biome.name}</div>
          {plan.megaBoss ? (
            // The rare MEGA variant (docs/MEGA-BOSS.md §daily): the wave plan is REPLACED by one
            // evolving battlefield-scale organism — say so loudly before the player commits.
            <div className="daily-sub daily-mega" style={{ color: megaBossDef(plan.megaBoss.defId)?.palette.glow }}>
              ▼ MEGA ENCOUNTER — {megaBossDef(plan.megaBoss.defId)?.name ?? plan.megaBoss.defId} has replaced today&apos;s gauntlet.
              It evolves the longer it lives; the battle ends only when one of you falls. Champion: <b style={{ color: hero.color }}>{hero.name}</b>
            </div>
          ) : (
            <div className="daily-sub">{DAILY.waveCount} waves · bosses at {DAILY.bossWaves.join(' / ')} · champion: <b style={{ color: hero.color }}>{hero.name}</b></div>
          )}

          <div className="daily-mods">
            {modifiers.map((m) => (
              <div className="daily-mod" key={m!.id} title={`Severity ${m!.severity}/3`}>
                <span className="daily-mod-name">⚠ {m!.name}</span>
                <span className="daily-mod-blurb">{m!.blurb}</span>
              </div>
            ))}
          </div>

          <div className="daily-pool">
            <span className="daily-pool-k">Trial towers</span>
            {plan.towerPool.map((k, i) => (
              <span className="daily-pool-t" key={`${k}-${i}`} style={{ color: TOWER_DEFS[k].color }}>{TOWER_DEFS[k].name}</span>
            ))}
          </div>

          {/* Mulligan briefing (docs/MULLIGANS.md §daily): today's towers arrive with organisms
              PRE-ASSEMBLED from YOUR discovered modifiers — seeded by the day. A thin dex borrows
              the loaner tutorial trio, so the system teaches itself here. */}
          <div className="daily-grafts" title="Assembled at deploy from your discovered Mulligan modifiers — same seed, same organisms, all day">
            {Object.keys(save.mulliganDex).length === 0 ? (
              <span className="daily-grafts-t">⊛ Loaner organisms today — the tutorial modifier trio rides the trial towers. Sequence your own from Bio-Containers.</span>
            ) : (
              <span className="daily-grafts-t">⊛ Pre-assembled — today&apos;s towers carry Mulligans drawn from your {Object.keys(save.mulliganDex).length} sequenced modifier{Object.keys(save.mulliganDex).length === 1 ? '' : 's'}.</span>
            )}
          </div>

          <div className={`daily-power ${ready ? 'ok' : 'low'}`}>
            Recommended Power <b>{formatPower(plan.recommendedPower)}</b>
            <span className="daily-power-you">you {formatPower(power)} {ready ? '✓' : '⚠'}</span>
          </div>

          <button className="primary daily-deploy" data-guide="daily-deploy" onClick={onStartDaily}>
            {clearedToday ? '↻ Replay Today’s Run' : playedToday ? '↻ Try Again' : '☀ Deploy'}
          </button>
          {clearedToday && <div className="daily-note">Cleared today ✓ — the daily reward is banked; replays are for the record.</div>}
        </div>

        {/* ── The ledger ── */}
        <div className="hub-col-stack">
          <div className="panel">
            <div className="panel-title">Today</div>
            <div className="daily-led"><span>Deepest wave</span><b>{playedToday ? save.daily.lastWave : '—'}</b></div>
            <div className="daily-led"><span>Cleared</span><b>{clearedToday ? '✓' : '—'}</b></div>
            <div className="daily-led"><span>Clear reward</span><b>+{DAILY.reward.clearCores} Cores{save.daily.streak > 1 && !clearedToday ? ' + streak' : ''}</b></div>
          </div>
          <div className="panel">
            <div className="panel-title">Record</div>
            <div className="daily-led"><span>Streak</span><b>{save.daily.streak > 0 ? `${save.daily.streak} day${save.daily.streak > 1 ? 's' : ''}` : '—'}</b></div>
            <div className="daily-led"><span>Best wave</span><b>{save.daily.bestWave > 0 ? save.daily.bestWave : '—'}</b></div>
            <div className="daily-led"><span>Dailies cleared</span><b>{save.daily.completions}</b></div>
          </div>
          <div className="panel">
            <div className="panel-title">The Contract</div>
            <p className="panel-sub">A fixed 20-wave stage under two gameplay modifiers, on a 3-tower Conveyor with the day's champion. No difficulty selector — one shared ruleset, one leaderboard-of-honour: the streak.</p>
          </div>
          <LeaderboardBlock mode="daily" />
          {/* Replay Theater — watch/share today's best, or watch any pasted code. */}
          <div className="panel">
            <div className="panel-title">{t('daily.theater.title')}</div>
            {save.daily.lastReplay ? (
              <div className="theater-row">
                <button
                  className="theater-btn"
                  onClick={() => {
                    try {
                      const r = JSON.parse(save.daily.lastReplay!) as ReplayRecord;
                      if (r?.v === 1) onSpectate(r);
                    } catch { /* corrupt stored replay — nothing to watch */ }
                  }}
                >
                  {t('daily.theater.watch')}
                </button>
                <ShareReplayButton blob={save.daily.lastReplay} />
              </div>
            ) : (
              <p className="panel-sub">{t('daily.theater.empty')}</p>
            )}
            <div className="theater-paste">
              <input
                className="theater-input"
                value={shareCode}
                onChange={(e) => { setShareCode(e.target.value); setBadCode(false); }}
                placeholder={t('daily.theater.paste')}
                aria-label={t('daily.theater.paste')}
              />
              <button
                className="theater-btn"
                disabled={shareCode.trim().length === 0}
                onClick={() => {
                  void decodeReplayCode(shareCode).then((r) => (r ? onSpectate(r) : setBadCode(true)));
                }}
              >
                {t('daily.theater.watchCode')}
              </button>
            </div>
            {badCode && <div className="theater-bad">{t('daily.theater.bad')}</div>}
          </div>
          <FieldResearchCard category="boost" note="Arm an observation boost before today's contract." />
        </div>
      </div>
    </div>
  );
}
