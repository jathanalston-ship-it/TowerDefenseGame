import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Game } from '../core/game';
import type { RunMode } from '../core/game';
import type { StageConfig } from '../core/campaign';
import { biomeById } from '../core/biomes';
import { drawGame } from '../render/renderer';
import type { Pointer } from '../render/renderer';
import { BRANCH_COLOR } from '../render/towerEvolution';
import { HEIGHT, WIDTH } from '../core/map';
import { HERO_ORDER, TOWER_ORDER } from '../core/config';
import { AUTOSTART_KEY } from '../state/prefs';
import { masteryLevel, meta } from '../state/meta';
import { announcePower } from '../state/powerEvents';
import { music } from '../audio/music';
import { PowerToaster } from './components/PowerToaster';
import { cardRegistry } from '../core/cards';
import { masteryRank } from '../core/mastery';
import { audio } from '../audio/sound';
import { setActiveGame } from '../debug/debug';
import { Hud } from './Hud';
import { HeroSelectPanel } from './HeroSelectPanel';
import { Toolbar } from './Toolbar';
import { BuildControls } from './BuildControls';
import { BuildPanel } from './BuildPanel';
import { HeroEvolutionPanel } from './HeroEvolutionPanel';
import { Inspector } from './Inspector';
import { DraftModal } from './DraftModal';
import type { HeroKind, HeroProgress, HudSnapshot, MetaModifiers, TowerProgress } from '../core/types';
import type { CardEffect } from '../core/cards';
import type { RunResult } from '../state/meta';

// Per-cue camera "trauma" (screen-shake) contribution; shake = trauma² · SHAKE_MAX.
const TRAUMA: Record<string, number> = {
  hit: 0.0036, kill: 0.015, shred: 0.1, breach: 0.45, ability: 0.3, wave: 0.08, place: 0.03, splice: 0.34, dissolve: 0.14,
};
const SHAKE_MAX = 16; // px
const SHAKE_DECAY = 2.0; // trauma/sec

// How long the battlefield outro lingers before the summary takes over (a beat, then auto-advance;
// a tap skips it). Shorter under reduced-motion — still a pause, never a hard cut.
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const OUTRO_HOLD_MS = reducedMotion ? 1200 : 3400;

// A pointer that travels more than this (screen px) between press and release is a DRAG,
// not a tap — we swallow the click so a stray drag never places a tower, casts an ability,
// or moves the rally point by accident.
const CLICK_SLOP = 8;

export function GameView({
  seed,
  mods,
  progress,
  heroKind,
  heroRoster,
  heroProgress,
  runEffects,
  heroEquip,
  mode,
  stage,
  difficulty,
  doctrine,
  onEnd,
  onAbandon,
  tutorial,
  onReady,
}: {
  seed: number;
  mods: MetaModifiers;
  progress: TowerProgress;
  heroKind: HeroKind;
  heroRoster?: HeroKind[];
  heroProgress: HeroProgress;
  runEffects?: CardEffect[];
  heroEquip?: Partial<Record<HeroKind, CardEffect[]>>;
  mode?: RunMode;
  stage?: StageConfig;
  difficulty?: string;
  doctrine?: string;
  onEnd: (r: RunResult) => void;
  onAbandon: () => void;
  tutorial?: boolean; // TUTORIAL mode: don't bank loot + don't auto-hand-off on run end (the tutorial director drives completion)
  onReady?: (g: Game) => void; // fires once with the live game so the tutorial director can script beats
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const game = (gameRef.current ??= new Game(seed, mods, progress, heroKind, heroProgress, {
    runEffects, mode, stage, difficulty, doctrine, heroRoster, heroEquip,
    geneLevels: meta.geneLevels(),
    // Starting Gene Loadout — equipped genes auto-activate at boot (skip in the tutorial's clean sandbox).
    startingGenes: tutorial ? [] : meta.startingGenes(),
  }));
  // The starting-genes CINEMATIC: a brief splash naming the genes that just activated (auto-fades).
  const [geneSplash, setGeneSplash] = useState<string[]>(() => (tutorial ? [] : meta.startingGenes()));
  useEffect(() => {
    if (geneSplash.length === 0) return;
    const t = setTimeout(() => setGeneSplash([]), 3200);
    return () => clearTimeout(t);
  }, [geneSplash.length]);

  const [hud, setHud] = useState<HudSnapshot>(() => game.getSnapshot());
  const [crashed, setCrashed] = useState<string | null>(null);
  // Run soundtrack: combat by default, boss while a boss banner is live, victory/defeat cadence
  // at run end (one-shots). Categories only — the manager owns all playback (audio/music.ts).
  const bossLive = hud.bossBanner !== null;
  useEffect(() => {
    if (hud.phase === 'won') { music.play('victory'); return; }
    if (hud.phase === 'lost') { music.play('defeat'); return; }
    music.play(bossLive ? 'boss' : 'combat');
    music.setIntensity(bossLive ? 1 : 0.5);
  }, [hud.phase, bossLive]);
  // Pause: freezes the sim (the rAF loop skips advance) — both a hotkey (P) and a button drive it.
  // `pausedRef` is read inside the loop (so toggling never restarts the effect); `paused` drives UI.
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false); // 2-step guard on the destructive quit
  const togglePause = useCallback(() => {
    setPaused((p) => { pausedRef.current = !p; return !p; });
    setConfirmAbandon(false); // reset the abandon guard whenever pause toggles
  }, []);
  const [leftOpen, setLeftOpen] = useState(true); // Run Build panel (collapsible)
  const [rightOpen, setRightOpen] = useState(true); // Status/Inspector panel (collapsible)
  const [evoOpen, setEvoOpen] = useState(false); // Hero Evolution menu (non-modal — sim keeps running)
  const pointerRef = useRef<Pointer | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null); // press origin for click-vs-drag
  const traumaRef = useRef(0);
  const biomeRef = useRef(''); // last biome id seen by the loop → re-voices the ambient drone on a change
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const endedRef = useRef(false);
  // Run-end OUTRO: when the run ends we don't cut straight to the summary — we linger on the
  // (already-quieted) battlefield with a Victory/Defeat title + a resolved sting, then hand off.
  const outroRef = useRef<{ won: boolean; startedAt: number } | null>(null);
  const skipRef = useRef(false); // tap during the linger to proceed immediately
  const [outro, setOutro] = useState<{ won: boolean; endless: boolean } | null>(null);

  // Per-kind mastery-rank → cosmetic tier (MASTERY.md visual mutations) for BOTH towers and
  // heroes (their kind ids don't collide). Fixed for the run (mastery banks at run end), so
  // compute once; the renderer draws a veteran halo per tier.
  const cosmeticTiers = useMemo(() => {
    const s = meta.get();
    const m: Record<string, number> = {};
    for (const k of TOWER_ORDER) m[k] = masteryRank(masteryLevel(s.towerMasteryXp[k] ?? 0));
    for (const k of HERO_ORDER) m[k] = masteryRank(masteryLevel(s.heroMasteryXp[k] ?? 0));
    return m;
  }, []);

  // Per-kind permanent STAR count → visual evolution on the battlefield (docs/
  // TOWER-VISUAL-EVOLUTION.md). Fixed for the run (stars are bought in the Lab between runs).
  const starTiers = useMemo(() => {
    const s = meta.get();
    const m: Record<string, number> = {};
    for (const k of TOWER_ORDER) m[k] = s.towerStars[k] ?? 0;
    return m;
  }, []);

  // Live run Power Score = account × this run's temporary buffs (drafted genes + Hero Evolution).
  // Recomputed only when those change (not every frame) — account power is static mid-run.
  const power = useMemo(
    () => meta.powerWith(game.powerEffects()).score,
    [game, hud.cards.length, hud.heroEvo.totalOwned],
  );

  const refresh = (): void => setHud(game.getSnapshot());

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;

    const loop = (now: number): void => {
      try {
        // Paused: keep the loop alive (so resume is instant) but skip the sim + render. Advancing
        // `last` here means resume doesn't fast-forward by the whole pause duration. The canvas
        // keeps its last-drawn frame; the React PAUSED overlay covers the board.
        if (pausedRef.current) { last = now; raf = requestAnimationFrame(loop); return; }
        const dt = (now - last) / 1000;
        last = now;
        // Hitstop: a brief view-loop freeze on a juicy event (a branch-tier purchase). The sim is
        // paused, but cues/shake/render still run below — so the screen shakes + the banner pops
        // against a frozen battlefield. advance() never reads this, so stepping stays deterministic.
        if (game.hitstop > 0) game.hitstop = Math.max(0, game.hitstop - dt);
        else game.advance(dt);

        // Drain presentation cues → audio + screen-shake trauma.
        const cues = game.drainSfx();
        if (cues.length) {
          const tally: Record<string, number> = {};
          for (const c of cues) {
            tally[c] = (tally[c] ?? 0) + 1;
            traumaRef.current = Math.min(1, traumaRef.current + (TRAUMA[c] ?? 0));
          }
          audio.cueBatch(tally);
        }
        traumaRef.current = Math.max(0, traumaRef.current - SHAKE_DECAY * dt);

        // Render with shake (pre-fill covers the shake margin so no gap shows).
        const mag = traumaRef.current * traumaRef.current * SHAKE_MAX;
        const dx = mag ? (Math.random() * 2 - 1) * mag : 0;
        const dy = mag ? (Math.random() * 2 - 1) * mag : 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#070a10';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.save();
        ctx.translate(dx, dy);
        const rs = game.getRenderState();
        drawGame(ctx, rs, pointerRef.current, cosmeticTiers, starTiers);
        ctx.restore();

        // Biome transition → re-voice the ambient drone (the audio half of the ecosystem change;
        // the transition STING rides the sfx queue above). Cheap; only fires when the id changes.
        if (rs.biome.id !== biomeRef.current) {
          biomeRef.current = rs.biome.id;
          audio.setBiome(biomeById(rs.biome.id).ambient);
        }

        // Ambient bed intensifies with pressure (enemies massing + a wounded core).
        const intRatio = game.maxIntegrity > 0 ? game.integrity / game.maxIntegrity : 1;
        const pressure =
          game.phase === 'won' || game.phase === 'lost'
            ? null
            : Math.min(1, (game.enemies.length / 30) * 0.6 + (1 - intRatio) * 0.6);
        audio.music(pressure, dt);

        if (now - lastHud > 80) {
          setHud(game.getSnapshot());
          if (!tutorial) meta.syncRunLoot(game.waveIndex, game.kills); // bank loot LIVE (never in the tutorial)
          lastHud = now;
        }
        // Run ended → begin the outro (once): resolve the music, raise the Victory/Defeat title,
        // and linger on the frozen, quieted battlefield before the summary. The tutorial drives its
        // own completion (via the director), so it never auto-hands-off here.
        const over = !tutorial && (game.phase === 'won' || game.phase === 'lost');
        if (over && !outroRef.current && !endedRef.current) {
          outroRef.current = { won: game.phase === 'won', startedAt: now };
          setHud(game.getSnapshot());
          setOutro({ won: game.phase === 'won', endless: game.mode === 'endless' });
          audio.resolve(game.phase === 'won');
        }
        // After the linger (or a tap), hand off to the End-of-Run Summary.
        if (outroRef.current && !endedRef.current && (skipRef.current || now - outroRef.current.startedAt >= OUTRO_HOLD_MS)) {
          endedRef.current = true;
          onEndRef.current({ wave: game.waveIndex, kills: game.kills, won: game.phase === 'won', mastery: game.getMasteryAccrual(), heroMastery: game.getHeroMasteryAccrual(), stats: game.getRunStats(), endless: game.mode === 'endless' });
        }
        raf = requestAnimationFrame(loop);
      } catch (err) {
        // Surface the failure and stop cleanly — never freeze silently or spam.
        console.error('[GameView] run loop error — stopping:', err);
        setCrashed(err instanceof Error ? err.message : String(err));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      audio.music(null, 0); // fade the bed when leaving the run
    };
  }, [game]);

  // expose the live run to the debug panel
  useEffect(() => {
    setActiveGame(game);
    return () => setActiveGame(null);
  }, [game]);

  // Hand the live game to the tutorial director (once) so it can script beats + read state.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => { onReadyRef.current?.(game); }, [game]);

  // Restore the persisted auto-start preference for this run.
  useEffect(() => {
    try {
      game.setAutoStart(localStorage.getItem(AUTOSTART_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, [game]);

  // ── Desktop keyboard shortcuts (1-N towers · Q ability · Space wave · Esc) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      audio.resume();
      // Board hotkeys only during active play — the draft owns the keyboard while open.
      if (game.phase !== 'prep' && game.phase !== 'wave') return;
      const k = e.key;
      if (k === 'p' || k === 'P') { togglePause(); return; }
      if (k >= '1' && k <= String(TOWER_ORDER.length)) {
        const kind = TOWER_ORDER[Number(k) - 1];
        game.selectTower(game.selectedTower === kind ? null : kind);
        audio.cue('select');
      } else if (k === 'q' || k === 'Q') {
        game.armAbility();
      } else if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        game.startWave();
      } else if (k === 'Escape') {
        game.cancelInteractions(); // close inspect / cancel move / disarm placement
      } else {
        return;
      }
      setHud(game.getSnapshot());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, togglePause]);

  const toCoords = (clientX: number, clientY: number): Pointer => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (WIDTH / rect.width),
      y: (clientY - rect.top) * (HEIGHT / rect.height),
    };
  };

  return (
    <div className="game">
      <Hud hud={hud} power={power} />
      <PowerToaster />
      <div className="stage">
        {leftOpen ? (
          <BuildPanel hud={hud} onCollapse={() => setLeftOpen(false)} onOpenEvolution={() => setEvoOpen(true)} />
        ) : (
          <button className="panel-rail" onClick={() => setLeftOpen(true)} aria-label="Show Run Build">
            <span className="rail-arrow">»</span>
            <span className="rail-label">RUN BUILD</span>
          </button>
        )}
        {evoOpen && <HeroEvolutionPanel game={game} hud={hud} refresh={refresh} onClose={() => setEvoOpen(false)} />}
        <div className={`canvas-wrap ${outro ? 'is-ending' : ''}`}>
        <canvas
          ref={canvasRef}
          className="board"
          width={WIDTH}
          height={HEIGHT}
          onPointerMove={(e) => {
            pointerRef.current = toCoords(e.clientX, e.clientY);
          }}
          onPointerDown={(e) => {
            audio.resume();
            pointerRef.current = toCoords(e.clientX, e.clientY);
            downRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            if (e.button !== 0) return;
            const down = downRef.current;
            downRef.current = null;
            // Ignore the release if the pointer was dragged — only deliberate taps act.
            if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP) return;
            const p = toCoords(e.clientX, e.clientY);
            // Shift keeps the build tool armed for rapid placement (docs/TOWER-MANAGEMENT.md §4).
            game.click(p.x, p.y, { shift: e.shiftKey });
            refresh();
          }}
          onDoubleClick={(e) => {
            const p = toCoords(e.clientX, e.clientY);
            game.inspectAt(p.x, p.y); // double-click a placed tower → open Inspect immediately
            refresh();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') pointerRef.current = null;
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const p = toCoords(e.clientX, e.clientY);
            // Right-click closes any tower interaction; only re-anchors the hero rally when there
            // was nothing to close (so a stray right-click never yanks the hero mid-build).
            if (game.selectedTower || game.selectedPlacedId !== null || game.movingTowerId !== null) {
              game.cancelInteractions();
            } else {
              game.setRally(p.x, p.y);
            }
            refresh();
          }}
        />
        <BuildControls game={game} hud={hud} refresh={refresh} />
        {(hud.phase === 'prep' || hud.phase === 'wave') && (
          <button
            className="pause-btn"
            onClick={togglePause}
            title={paused ? 'Resume (P)' : 'Pause (P)'}
            aria-label={paused ? 'Resume' : 'Pause'}
          >
            {paused ? '▶ Resume' : '❚❚ Pause'}
          </button>
        )}
        {paused && (
          <div
            className="pause-overlay"
            role="button"
            tabIndex={0}
            aria-label="Resume"
            onClick={togglePause}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePause(); } }}
          >
            <div className="pause-card" onClick={(e) => e.stopPropagation()}>
              <div className="pause-title">PAUSED</div>
              {confirmAbandon ? (
                <>
                  <div className="pause-warn">
                    Abandon the run? You <b>forfeit ALL rewards</b> from this run — no Genome Cores,
                    mastery, gear, or bio-containers. This can't be undone.
                  </div>
                  <div className="pause-row">
                    <button className="set-danger" onClick={(e) => { e.stopPropagation(); onAbandon(); }}>Forfeit &amp; Quit</button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmAbandon(false); }}>Keep Playing</button>
                  </div>
                </>
              ) : (
                <>
                  <button className="primary" onClick={(e) => { e.stopPropagation(); togglePause(); }}>▶ Resume</button>
                  <button className="pause-abandon" onClick={(e) => { e.stopPropagation(); setConfirmAbandon(true); }}>Abandon Run</button>
                  <div className="pause-hint">Press P or click outside to resume</div>
                </>
              )}
            </div>
          </div>
        )}
        {hud.bossBanner && (
          <div className="boss-banner">
            <div className="boss-banner-row">
              <span className="boss-name">{hud.bossBanner.name}</span>
              <span className="boss-phase">
                PHASE {hud.bossBanner.phase}/{hud.bossBanner.phases}
              </span>
            </div>
            <div className="boss-hp">
              <div className="boss-hp-fill" style={{ width: `${hud.bossBanner.hpPct * 100}%` }} />
            </div>
            {hud.bossBanner.telegraph && <div className="boss-telegraph">{hud.bossBanner.telegraph}</div>}
          </div>
        )}
        {hud.mutation && (
          // Re-keyed by id so each purchase restarts the pop + flash animations.
          <div key={hud.mutation.id} className="mutation-fx" style={{ ['--mut']: BRANCH_COLOR[hud.mutation.branchId] ?? hud.mutation.color } as CSSProperties}>
            <div className="mutation-flash" aria-hidden />
            <div className="mutation-banner" role="status">
              <span className="mutation-kicker">⬢ MUTATION</span>
              <span className="mutation-title">{hud.mutation.title}</span>
              <span className="mutation-sub">{hud.mutation.sub}</span>
            </div>
          </div>
        )}
        {/* Hero selection readout — non-modal (the sim keeps running); dismiss deselects the hero. */}
        {hud.selectedHero && (
          <HeroSelectPanel hero={hud.selectedHero} onClose={() => { game.selectHero(null); refresh(); }} />
        )}
        {geneSplash.length > 0 && (
          // Starting Gene Loadout cinematic (docs/GENE-EVOLUTION.md §Loadouts): a brief splash naming
          // the permanent genes that just auto-activated, then it fades. Tap to dismiss early.
          <div className="gene-splash" role="status" onClick={() => setGeneSplash([])}>
            <div className="gene-splash-k">⌬ STARTING GENES ACTIVE</div>
            <div className="gene-splash-cards">
              {geneSplash.map((id, i) => {
                const c = cardRegistry.get(id);
                const lvl = meta.geneLevels()[id] ?? 0;
                return (
                  <span className="gene-splash-card" key={id} style={{ animationDelay: `${0.15 + i * 0.18}s` }}>
                    {c?.name ?? id}{lvl > 0 ? <b> L{lvl}</b> : null}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {outro && (
          // The run-end linger: a vignette + Victory/Defeat title over the frozen battlefield.
          // A tap proceeds immediately; otherwise the loop auto-hands-off to the summary.
          <div
            className={`run-outro ${outro.won ? 'win' : 'lose'}`}
            role="button"
            tabIndex={0}
            aria-label="Continue to summary"
            onClick={() => { skipRef.current = true; }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') skipRef.current = true; }}
          >
            <div className="run-outro-title">{outro.endless ? 'RUN ENDED' : outro.won ? 'VICTORY' : 'DEFEAT'}</div>
            <div className="run-outro-sub">{outro.won ? 'The hive holds the line.' : 'The Nucleus is lost.'}</div>
            <div className="run-outro-hint">tap to continue</div>
          </div>
        )}
        {hud.phase === 'draft' && hud.draft && (
          <DraftModal
            options={hud.draft}
            clearedWave={hud.wave}
            onPick={(id) => {
              game.chooseCard(id);
              refresh();
            }}
          />
        )}
        {crashed && (
          <div className="overlay">
            <h2>RUN ERROR</h2>
            <p className="hint">The run hit an error and stopped. Your permanent progress is safe.</p>
            <pre className="crash-msg">{crashed}</pre>
            <button
              className="primary"
              onClick={() => {
                if (endedRef.current) return;
                endedRef.current = true;
                onEndRef.current({ wave: game.waveIndex, kills: game.kills, won: false, mastery: game.getMasteryAccrual(), heroMastery: game.getHeroMasteryAccrual(), stats: game.getRunStats(), endless: game.mode === 'endless' });
              }}
            >
              End Run
            </button>
          </div>
        )}
        </div>
        {rightOpen ? (
          <Inspector
            hud={hud}
            onCollapse={() => setRightOpen(false)}
            onBranchBuy={(towerId, branchId) => {
              audio.resume(); // ensure the splice cue is audible (the click is the unlock gesture)
              const powerBefore = meta.powerWith(game.powerEffects()).score;
              if (game.buyBranchTier(towerId, branchId) === 'ok') {
                announcePower('Tower Branch upgrade', powerBefore, meta.powerWith(game.powerEffects()).score);
              }
              refresh();
            }}
            onDeselect={() => {
              game.selectPlacedTower(null);
              refresh();
            }}
            onSell={(towerId) => {
              audio.resume();
              game.sellTower(towerId); // dissolve FX + refund; closes Inspect (selectedPlacedId cleared)
              refresh();
            }}
            onMove={(towerId) => {
              audio.resume();
              game.beginMove(towerId); // pick up → tap a valid slot on the board to relocate
              refresh();
            }}
            onCancelMove={() => {
              game.cancelMove();
              refresh();
            }}
          />
        ) : (
          <button className="panel-rail right" onClick={() => setRightOpen(true)} aria-label="Show Status">
            <span className="rail-label">STATUS</span>
            <span className="rail-arrow">«</span>
          </button>
        )}
      </div>
      <Toolbar game={game} hud={hud} refresh={refresh} />
    </div>
  );
}
