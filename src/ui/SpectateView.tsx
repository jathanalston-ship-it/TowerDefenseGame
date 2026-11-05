// REPLAY THEATER (docs/REPLAY-SHARE.md) — watch any shared replay re-run live.
//
// The record's ctor args rebuild the exact Game and the step-indexed input log drives
// it, incrementally, with the SAME semantics as core/replay.ts replayRun (events fire
// at their recorded step; a frozen phase is unblocked by the next input; the run stops
// EXACTLY at record.end). The viewer only adds pacing: a rAF loop converts wall time ×
// speed into whole SIM_DT steps, renders via the normal renderer, and compares the
// finished outcome against the record's claim — a shared code is self-verifying.

import { useEffect, useRef, useState } from 'react';
import { Game } from '../core/game';
import { SIM_DT } from '../core/config';
import { WIDTH, HEIGHT } from '../core/map';
import type { ReplayRecord } from '../core/replay';
import { drawGame } from '../render/renderer';
import { Announcer, type Shown } from '../render/feel';
import { LastKillMoment } from '../render/lastKill';
import { motionPrefs, resolveMotion, systemReducedMotion } from '../state/prefs';
import { CentreStage, megaFallCard, type StageCard } from './components/CentreStage';
import { LivingGutters } from './components/LivingGutters';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { t, useLocale } from '../i18n';
import './SpectateView.css';

const SPEEDS = [1, 2, 4, 8, 16] as const;
/** Sim steps allowed per animation frame: keeps ×16 honest without freezing the tab;
 *  the "skip to outcome" chunk is bigger because rendering pauses while it runs. */
const MAX_STEPS_PER_FRAME = 40;
const SKIP_STEPS_PER_FRAME = 2_500;

interface SpectateHud {
  wave: number;
  kills: number;
  integrity: number;
  progress: number; // 0..1 of record.end
}

export function SpectateView({ record, onExit }: { record: ReplayRecord; onExit: () => void }): JSX.Element {
  useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  // Someone else's run: a private event bus, so its kills never credit the viewer's save.
  if (!gameRef.current) { gameRef.current = new Game(...record.args); gameRef.current.isolateEvents(); }
  const game = gameRef.current;
  const idxRef = useRef(0); // next input event to apply
  const accRef = useRef(0); // banked sim-seconds awaiting whole steps
  const guardRef = useRef(0); // lifetime step budget (mirrors replayRun's runaway guard)
  const speedRef = useRef<number>(1);
  const pausedRef = useRef(false);
  const skippingRef = useRef(false);
  const [speed, setSpeed] = useState<number>(1);
  const [paused, setPaused] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [hud, setHud] = useState<SpectateHud>({ wave: 0, kills: 0, integrity: 100, progress: 0 });
  const [done, setDone] = useState<{ wave: number; kills: number; verified: boolean } | null>(null);
  speedRef.current = speed;
  pausedRef.current = paused;
  skippingRef.current = skipping;
  // Boss and Mega FALL cards (docs/GAME-FEEL.md §centre-stage): the live run's announcer, fed by
  // the same sim events, so a replayed kill still lands its card. Silent while skipping ahead.
  const announcerRef = useRef<Announcer<StageCard> | null>(null);
  announcerRef.current ??= new Announcer<StageCard>();
  const [stageCard, setStageCard] = useState<Shown<StageCard> | null>(null);
  const lastKillRef = useRef<LastKillMoment | null>(null);
  lastKillRef.current ??= new LastKillMoment();
  const motion = useState(() => resolveMotion(motionPrefs(), systemReducedMotion()).motion)[0]; // the theater honours Settings → Motion too
  useEffect(() => {
    const announce = (card: StageCard): void => {
      const a = announcerRef.current!;
      if (!skippingRef.current && a.push(card, performance.now())) setStageCard(a.current);
    };
    const offBoss = game.events.on('bossKilled', (e) => { if (e.final) announce({ kind: 'bossFall', name: e.name, epithet: e.epithet ?? '' }); });
    const offMega = game.events.on('megaKilled', (e) => announce(megaFallCard(e)));
    // The LAST-KILL beat (render/lastKill.ts) plays here too — silent while skipping ahead.
    const offLast = game.events.on('waveLastKill', (e) => { if (!skippingRef.current) lastKillRef.current!.start(e, game.mode, speedRef.current); });
    return () => { offBoss(); offMega(); offLast(); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    // Hi-DPI backing store — same treatment as the live battlefield (GameView).
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    if (dpr !== 1) {
      canvas.width = Math.round(WIDTH * dpr);
      canvas.height = Math.round(HEIGHT * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    music.play('combat');

    const maxSteps = Math.min(Math.ceil(7_200 / SIM_DT), Math.max(0, record.end) + 60);
    const g = game as unknown as Record<string, (...a: unknown[]) => unknown>;
    const applyNext = (): void => {
      const e = record.log[idxRef.current++];
      try {
        g[e.op](...e.a);
      } catch {
        /* an input the state rejects ⇒ divergence; the outcome banner decides */
      }
    };
    /** One sim step with replayRun's semantics. Returns false when the run is over. */
    const stepOnce = (): boolean => {
      while (idxRef.current < record.log.length && record.log[idxRef.current].s <= game.stepCount) applyNext();
      if (game.stepCount >= record.end || guardRef.current++ > maxSteps) return false;
      const before = game.stepCount;
      game.advance(SIM_DT);
      if (game.stepCount === before) {
        // Frozen phase (a draft waiting for its pick): the next recorded input unblocks it.
        if (idxRef.current < record.log.length) {
          applyNext();
          return true;
        }
        return false; // frozen with no inputs left — the recording is exhausted
      }
      return true;
    };
    const finish = (): void => {
      setDone((prev) => prev ?? {
        wave: game.waveIndex,
        kills: game.kills,
        verified: game.waveIndex === record.claim.wave && game.kills === record.claim.kills,
      });
    };

    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    const loop = (now: number): void => {
      try {
        const dt = Math.min(0.25, (now - last) / 1000);
        last = now;
        let over = false;
        const lastKill = lastKillRef.current!;
        if (!pausedRef.current && lastKill.tick(dt * 1000)) audio.cue('clear');
        if (!pausedRef.current) {
          if (skippingRef.current) {
            for (let i = 0; i < SKIP_STEPS_PER_FRAME && !over; i++) over = !stepOnce();
          } else {
            accRef.current = Math.min(accRef.current + dt * speedRef.current * lastKill.rate(speedRef.current, motion), SIM_DT * MAX_STEPS_PER_FRAME);
            while (accRef.current >= SIM_DT && !over) {
              accRef.current -= SIM_DT;
              over = !stepOnce();
            }
          }
          // The sim's presentation cues still land — the theater has sound.
          const cues = game.drainSfx();
          if (cues.length) {
            const tally: Record<string, number> = {};
            for (const c of cues) tally[c] = (tally[c] ?? 0) + 1;
            audio.cueBatch(tally);
          }
        }
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.save();
        lastKill.applyCamera(ctx, motion);
        drawGame(ctx, game.getRenderState(), null);
        ctx.restore();
        const stage = announcerRef.current!;
        if (stage.tick(now)) setStageCard(stage.current);
        if (now - lastHud > 250 || over) {
          lastHud = now;
          setHud({
            wave: game.waveIndex,
            kills: game.kills,
            integrity: game.maxIntegrity > 0 ? Math.round((100 * game.integrity) / game.maxIntegrity) : 100,
            progress: record.end > 0 ? Math.min(1, game.stepCount / record.end) : 1,
          });
        }
        if (over) finish();
        else raf = requestAnimationFrame(loop);
      } catch {
        finish(); // a crashing replay still resolves to its outcome card
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      music.play('menu');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape leaves the theater (parity with every other full-screen surface).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div className="spectate" role="dialog" aria-modal="true" aria-label={t('spectate.title')}>
      <div className="spectate-bar">
        <span className="spectate-k">{t('spectate.title')}</span>
        <span className="spectate-stats">
          {t('spectate.line', { wave: hud.wave, kills: hud.kills, integrity: hud.integrity })}
        </span>
        <span className="spectate-claim">{t('spectate.claim', { wave: record.claim.wave, kills: record.claim.kills })}</span>
        <button className="spectate-exit" onClick={onExit}>{t('spectate.exit')}</button>
      </div>
      <div className="spectate-stage">
        {/* LIVING GUTTERS (docs/SIGNATURE-MOMENTS.md §4): the periphery continues in the theater too. */}
        <LivingGutters game={game} boardRef={canvasRef} />
        <canvas className="board" width={WIDTH} height={HEIGHT} ref={canvasRef} role="img" aria-label={t('spectate.title')} />
        {stageCard && <CentreStage shown={stageCard} />}
      </div>
      <div className="spectate-controls">
        <button className="spectate-btn" onClick={() => setPaused((p) => !p)} disabled={!!done}>
          {paused ? t('spectate.resume') : t('spectate.pause')}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`spectate-btn spectate-speed ${speed === s && !skipping ? 'on' : ''}`}
            onClick={() => { setSkipping(false); setSpeed(s); }}
            disabled={!!done}
          >
            ×{s}
          </button>
        ))}
        <button className={`spectate-btn ${skipping ? 'on' : ''}`} onClick={() => setSkipping(true)} disabled={!!done}>
          {t('spectate.skip')}
        </button>
        <div className="spectate-progress" aria-hidden>
          <i style={{ width: `${Math.round(hud.progress * 100)}%` }} />
        </div>
      </div>
      {done && (
        <div className="spectate-done">
          <div className="spectate-done-card">
            <div className={`spectate-verdict ${done.verified ? 'ok' : 'bad'}`}>
              {done.verified ? t('spectate.verified') : t('spectate.diverged')}
            </div>
            <div className="spectate-outcome">{t('spectate.outcome', { wave: done.wave, kills: done.kills })}</div>
            <button className="primary spectate-exit-big" onClick={onExit}>{t('spectate.exit')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
