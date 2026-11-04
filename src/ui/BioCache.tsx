// DAILY BIO-CACHE (docs/DAILY-LOGIN.md §ui) — the login-streak surface. Two faces:
//   • BioCacheCard — the home-board widget: a living pod while today's cache is sealed
//     (claim = the day's first beat), the streak presentation once opened (streak, lifetime,
//     best, multiplier, today's haul, tomorrow's tease, reset countdown).
//   • The claim ceremony — NOT a popup: an organic pod GROWS over the veil, pulses until
//     tapped, RUPTURES, and the rewards erupt outward before the summary settles. Biological
//     cues throughout (squelch → heartbeat → crack → unlock stinger; jackpot gets the bell).
// The grant itself lands in meta.claimLogin BEFORE the theater starts — the ceremony is pure
// presentation over the receipt (the hive-ceremony contract: the save is already true).

import { useEffect, useState } from 'react';
import { meta } from '../state/meta';
import type { LoginReceipt } from '../state/meta';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { LOGIN } from '../core/loginStreak';
import { Popup } from './components/Popup';
import { CurrencyIcon } from './components/CurrencyIcon';

const LOGIN_MINUTES = LOGIN.incomeMinutes;

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Hour-granular "resets in" text (liveops windows are minute-blind by convention). */
const resetText = (ms: number): string => {
  const h = Math.floor(ms / 3_600_000);
  return h < 1 ? 'under an hour' : `${h}h`;
};

export function BioCacheCard(): JSX.Element {
  meta.use();
  // A slow tick so the card crosses UTC midnight (and the countdown breathes) on its own.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const v = meta.loginView();
  const [ceremony, setCeremony] = useState<LoginReceipt | null>(null);

  const open = (): void => {
    const receipt = meta.claimLogin();
    if (!receipt) return;
    audio.cue('graftSquelch'); // the pod breaches the veil
    setCeremony(receipt);
  };

  return (
    <section className={`bc-card${v.claimable ? ' is-ready' : ''}`} aria-label="Daily Bio-Cache">
      <span className="cc-panel-h">◈ DAILY BIO-CACHE</span>
      {v.claimable ? (
        <div className="bc-ready">
          <button className="bc-pod-mini" onClick={open} aria-label="Open today's Bio-Cache">
            <i className="bc-pm-vein" aria-hidden />
            <i className="bc-pm-core" aria-hidden />
          </button>
          <div className="bc-ready-body">
            <div className="bc-ready-line">
              DAY {v.lifetime + 1} · STREAK {v.nextStreak} · <b>×{v.mult.toFixed(2)}</b>
            </div>
            <div className="bc-ready-sub" title="Whole cache in Genome-Core terms — the streak curve sizes the lanes, your live income sizes the Core line">
              sealed — worth ≈ {v.valueCores.toLocaleString('en-US')} <CurrencyIcon id="genomeCores" size={12} title="Genome Cores (equivalent)" />
              {v.incomeCores > 0 && <span className="bc-income"> · incl. {v.incomeCores.toLocaleString('en-US')} Cores ({LOGIN_MINUTES} min of your income)</span>}
              {v.todayMilestone && <span className="bc-mile"> · {v.todayMilestone.toUpperCase()} CONTAINER guaranteed</span>}
            </div>
            {v.nextStreak === 1 && v.lifetime > 0 && (
              <div className="bc-ready-warn">streak lapsed — the multiplier restarts at ×1.00 (lifetime {v.lifetime} kept)</div>
            )}
          </div>
          <button className="primary bc-open" onClick={open}>OPEN THE CACHE</button>
        </div>
      ) : (
        <div className="bc-claimed">
          <div className="bc-stats">
            <span className="bc-stat"><span className="bc-stat-k">STREAK</span><span className="bc-stat-v">⛓ {v.streak}</span></span>
            <span className="bc-stat"><span className="bc-stat-k">BEST</span><span className="bc-stat-v">{v.best}</span></span>
            <span className="bc-stat"><span className="bc-stat-k">LIFETIME</span><span className="bc-stat-v">{v.lifetime}</span></span>
            <span className="bc-stat"><span className="bc-stat-k">MULTIPLIER</span><span className="bc-stat-v">×{v.mult.toFixed(2)}</span></span>
          </div>
          <div className="bc-today">
            {v.todayLines.map((l, i) => (
              <span className="bc-chip" key={i}><span aria-hidden>{l.icon}</span> {l.label}</span>
            ))}
          </div>
          <div className="bc-tomorrow" title="Hold the streak — tomorrow's cache compounds it">
            TOMORROW ×{v.tomorrow.mult.toFixed(2)} · ≈{v.tomorrow.valueCores.toLocaleString('en-US')} <CurrencyIcon id="genomeCores" size={11} title="Genome Cores (equivalent)" />
            {v.tomorrow.milestone && <b> · {v.tomorrow.milestone.toUpperCase()} CONTAINER</b>}
            <span className="bc-reset"> — new cache in {resetText(v.msToReset)}</span>
          </div>
        </div>
      )}

      {ceremony && <CacheCeremony receipt={ceremony} onClose={() => setCeremony(null)} />}
    </section>
  );
}

// ── The living ceremony ─────────────────────────────────────────────────────────
type Stage = 'grow' | 'pulse' | 'burst' | 'done';

function CacheCeremony({ receipt, onClose }: { receipt: LoginReceipt; onClose: () => void }): JSX.Element {
  const [stage, setStage] = useState<Stage>(() => (reducedMotion() ? 'done' : 'grow'));

  // grow → pulse on its own; pulse → burst on the player's tap (agency IS the excitement).
  useEffect(() => {
    if (stage === 'grow') {
      const t = window.setTimeout(() => { setStage('pulse'); audio.cue('heartbeat'); }, 950);
      return () => window.clearTimeout(t);
    }
    if (stage === 'burst') {
      audio.cue('graftCrack');
      audio.cue('power');
      const t = window.setTimeout(() => {
        setStage('done');
        if (receipt.jackpot) audio.cue('jackpot');
        music.stinger('unlock');
      }, 620);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [stage, receipt.jackpot]);

  return (
    <Popup>
      <div className={`bc-veil is-${stage}`} onClick={stage === 'done' ? onClose : undefined}>
        {stage !== 'done' && (
          <button
            className="bc-pod"
            onClick={() => stage === 'pulse' && setStage('burst')}
            aria-label="Rupture the Bio-Cache"
          >
            <i className="bc-pod-veins" aria-hidden />
            <i className="bc-pod-body" aria-hidden />
            <i className="bc-pod-core" aria-hidden />
            {stage === 'pulse' && <span className="bc-pod-hint">TAP TO RUPTURE</span>}
          </button>
        )}
        {stage === 'done' && (
          <div className="bc-summary" role="dialog" aria-label="Daily Bio-Cache opened" onClick={(e) => e.stopPropagation()}>
            <div className="intro-eyebrow">◈ THE TITHE IS PAID</div>
            <div className="bc-sum-day">DAY {receipt.lifetime} — STREAK {receipt.streak} <b>×{receipt.mult.toFixed(2)}</b></div>
            {receipt.milestone && <div className="bc-sum-mile">STREAK MILESTONE — a {receipt.milestone} Bio-Container rode along</div>}
            <div className="bc-sum-lines">
              {receipt.lines.map((l, i) => (
                <div className="bc-sum-line" style={{ animationDelay: `${i * 90}ms` }} key={i}>
                  <span className="bc-sum-i" aria-hidden>{l.icon}</span>
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
            {receipt.jackpot && <div className="bc-sum-jackpot">✦ RARITY BLEED — the cache carried something it should not have</div>}
            <div className="bc-sum-foot">
              best streak {receipt.best} · lifetime {receipt.lifetime} · come back tomorrow — the organism compounds
            </div>
            <button className="primary" onClick={onClose}>Return ▸</button>
          </div>
        )}
      </div>
    </Popup>
  );
}
