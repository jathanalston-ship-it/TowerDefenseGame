import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Game } from '../core/game';
import { DIRECTOR, ENEMY_DEFS } from '../core/config';
import type { EnemyDef } from '../core/config';
import { ENEMY_TIER } from '../render/theme';
import { audio } from '../audio/sound';
import { AUTOSTART_KEY } from '../state/prefs';
import { autoGenePref, setAutoGenePref } from '../state/prefs';
import type { HudSnapshot } from '../core/types';

// The WAVE BRIEFING console (Build Phase) — Incoming threat intel · Start Wave · the two
// semi-idle automations. Rendered as an absolutely-positioned overlay INSIDE .canvas-wrap:
// always mounted, never in layout — visibility is a CSS class toggle (opacity + slide), so
// entering/leaving prep can never shift the HUD, toolbar, or battlefield. Anchored
// top-center: the bottom holds the tower slots + core, while the top is empty until the
// wave spawns there — so the console obstructs nothing it shouldn't.
//
// The threat list is INTEL, not decoration: every incoming kind shows its name, count,
// threat tier (elite/boss ranked) and battlefield ROLE tag — the same role vocabulary the
// enemies now wear on the field (docs/ENEMIES.md §8), so the briefing teaches the tells.

/** The chip's role tag — derived from the def's mechanical traits (one, most-defining). */
function roleTag(def: EnemyDef): string | null {
  if (def.siege) return 'ARTILLERY';
  if (def.explodeDamage) return 'SUICIDE';
  if (def.summon) return 'SUMMONER';
  if (def.auraRegenPerSec || def.auraShield) return 'SUPPORT';
  if (def.shieldHp) return 'SHIELDED';
  if (def.regenPerSec) return 'REGEN';
  if (def.behavior.flying) return 'AIRBORNE';
  if (def.behavior.burrowing) return 'BURROWER';
  return null;
}

export function BuildControls({
  game,
  hud,
  refresh,
  tutorialLock = false,
  autoGeneLock = null,
}: {
  game: Game;
  hud: HudSnapshot;
  refresh: () => void;
  /** Tutorial: the director scripts every wave start — the console shows intel only, with the
   * launch controls held so the game can never outrun the lesson. */
  tutorialLock?: boolean;
  /** THE AUTOMATION GATE (docs/HIVE-MIND.md §solved-content): non-null ⇒ Auto Gene is off for this
   *  run (frontier content) and this is the reason shown. Auto Wave is never gated. */
  autoGeneLock?: string | null;
}): JSX.Element {
  const visible = hud.phase === 'prep' && (hud.endless || hud.bossRush || hud.wave < hud.totalWaves);
  // The preview only changes per wave — memo it so the ~10 Hz HUD refresh never re-aggregates.
  const preview = useMemo(
    () => (visible ? game.getNextWavePreview() : null),
    // liveThreat + tower count: the §6a v3 live composition (probe role, elite share) moves with the
    // board in prep — the count catches a kind change while the multiplier sits at its cap.
    [game, visible, hud.wave, hud.liveThreat, game.towers.length],
  );
  const hostiles = useMemo(() => (preview ? preview.reduce((n, e) => n + e.count, 0) : 0), [preview]);
  // Auto Gene Selection lives in the same console as Auto Wave, so the two semi-idle
  // automations are toggled together (and in-run, not only from the Hub's Settings). Both
  // persist to localStorage; the DraftModal reads the pref when the next draft opens.
  const [autoGene, setAutoGene] = useState(autoGenePref());
  const nextWave = hud.endless || hud.bossRush ? hud.wave + 1 : Math.min(hud.totalWaves, hud.wave + 1);
  // Launch sweep: a one-shot full-board energy band when the wave fires (keyed per launch).
  const [sweepAt, setSweepAt] = useState(0);
  // Encounter forecast — base biomass (Σ unmodified bounty) + the heaviest tier present, from the
  // SAME memoized preview (no extra per-render aggregation).
  const forecast = useMemo(() => {
    if (!preview) return null;
    let biomass = 0;
    let heavy: 'boss' | 'elite' | null = null;
    for (const e of preview) {
      biomass += (ENEMY_DEFS[e.kind]?.bounty ?? 0) * e.count;
      const tier = ENEMY_TIER[e.kind];
      if (tier === 'boss') heavy = 'boss';
      else if ((tier === 'elite' || (e.elite ?? 0) > 0) && heavy !== 'boss') heavy = 'elite';
    }
    return { biomass, heavy };
  }, [preview]);

  // Hide-from-AT via `inert`, not aria-hidden: the Start button keeps focus at the moment the bar
  // hides (the press launches the wave), and aria-hiding a focused subtree trips the browser's
  // accessibility violation ("Blocked aria-hidden…"). `inert` blocks focus AND hides from AT; we
  // also release any focus still inside before the subtree goes inert.
  const rootRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<{ id: string; title: string; text: string } | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const detailOpener = useRef<HTMLButtonElement | null>(null);
  const showDetail = (event: MouseEvent<HTMLButtonElement>, id: string, title: string, text: string): void => {
    detailOpener.current = event.currentTarget;
    setDetail((current) => current?.id === id ? null : { id, title, text });
  };
  const closeDetail = (): void => {
    if (detailRef.current?.contains(document.activeElement)) detailOpener.current?.focus({ preventScroll: true });
    setDetail(null);
  };
  useEffect(() => {
    if (visible && detailRef.current?.contains(document.activeElement)) detailOpener.current?.focus({ preventScroll: true });
    setDetail(null);
  }, [visible, preview]);
  useEffect(() => { if (detail) detailRef.current?.focus({ preventScroll: true }); }, [detail]);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!visible && el.contains(document.activeElement)) (document.activeElement as HTMLElement | null)?.blur?.();
    el.inert = !visible;
  }, [visible]);

  return (
    <div ref={rootRef} className={`build-controls ${visible ? 'is-visible' : ''}`}>
      <div className="build-bar">
        <div className="wb-brief">
          <div className="wb-head">
            <span className="wb-eyebrow">◉ INCOMING</span>
            <span className="wb-wave">{hud.endless ? `DEPTH ${nextWave}` : hud.bossRush ? `WAVE ${nextWave} — ${nextWave} ${nextWave === 1 ? 'BOSS' : 'BOSSES'}` : `WAVE ${nextWave}`}</span>
            {!hud.endless && !hud.bossRush && <span className="wb-of">/ {hud.totalWaves}</span>}
            {hostiles > 0 && <span className="wb-count">{hostiles} hostiles</span>}
            {forecast && forecast.biomass > 0 && (
              <button type="button" className="wb-forecast wb-info" tabIndex={visible ? 0 : -1}
                aria-expanded={detail?.id === 'biomass'} aria-label={`Explain ${forecast.biomass} base Biomass`}
                onClick={(event) => showDetail(event, 'biomass', 'Base Biomass', 'Base Biomass from the listed enemies, before bounty modifiers. Actual earnings depend on kills and run modifiers; other rewards are not included.')}>
                ⬢ {forecast.biomass} base
              </button>
            )}
            {forecast?.heavy && (
              <span className={`wb-heavy is-${forecast.heavy}`} role="alert">
                {forecast.heavy === 'boss' ? '◆ BOSS INBOUND' : '▲ ELITES'}
              </span>
            )}
            {/* The Hive adapts (docs/DIFFICULTY_DIRECTOR.md §6a) / the Infinite squeeze (ENDLESS_SQUEEZE):
                the enemy-HP multiplier this wave launches with — shown only when it is above ×1. */}
            {(hud.endless ? hud.squeezePressure : hud.liveThreat) > 1.005 && (
              <button type="button" className="wb-adapt wb-info" tabIndex={visible ? 0 : -1}
                aria-expanded={detail?.id === 'adaptation'}
                onClick={(event) => showDetail(event, 'adaptation', hud.endless ? 'Squeezed' : 'Adapted', hud.endless
                  ? 'Your board has held flawless waves — the Hive squeezes harder (enemy HP). A wave that bleeds the Core eases it back.'
                  : 'Your run’s live board (towers fielded + Biomass invested — never your drafted cards) has outgrown this stage — from wave 4 (and on every boss) the Hive answers with tougher, faster enemies and swaps in the role your board covers least — the PROBE names it and the coverage it tests.')}>
                ▲ {hud.endless ? 'SQUEEZED' : 'ADAPTED'} ×{(hud.endless ? hud.squeezePressure : hud.liveThreat).toFixed(1)}
              </button>
            )}
          </div>
          {preview && (
            <div className="wb-threats" aria-label="incoming enemies">
              {preview.map((e) => {
                const def = ENEMY_DEFS[e.kind];
                const tier = ENEMY_TIER[e.kind];
                const role = roleTag(def);
                const explanation = `${def.name} — ${def.hp} base HP${def.armor > 0 ? ` · ${def.armor} base armor` : ''}${role ? ` · ${role.toLowerCase()}` : ''}. Wave and run modifiers can change these stats.${(e.elite ?? 0) > 0 ? ` ${e.elite} of ${e.count} are ELITE (×${DIRECTOR.eliteHpMult} HP, ×${DIRECTOR.eliteDmgMult} damage before other modifiers).` : ''}${e.probe ? ` The Hive’s PROBE (${e.probe.label.toLowerCase()}): your board lacks ${e.probe.lacks}.` : ''}`;
                return (
                  <button type="button" className={`wb-chip is-${tier}`} key={e.kind} tabIndex={visible ? 0 : -1} style={{ ['--ec' as string]: def.color }}
                    aria-expanded={detail?.id === e.kind} aria-label={`${def.name}: ${e.count} incoming${(e.elite ?? 0) > 0 ? `, including ${e.elite} elites` : ''}. Show details`}
                    onClick={(event) => showDetail(event, e.kind, def.name, explanation)}>
                    <span className="wb-dot" aria-hidden />
                    <span className="wb-name">{def.name}</span>
                    <span className="wb-n">×{e.count}</span>
                    {(e.elite ?? 0) > 0 && <span className="wb-elite">★{e.elite}</span>}
                    {e.probe ? (
                      <span className="wb-probe">⌖ {e.probe.label.toUpperCase()}<span className="wb-probe-why"> · lacks {e.probe.lacks}</span></span>
                    ) : role && <span className="wb-role">{role}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="wb-actions">
          {tutorialLock ? (
            <div className="wb-tutlock" role="status">◈ Follow the lesson — deployment is scripted</div>
          ) : (
          <button
            className="primary start-btn"
            tabIndex={visible ? 0 : -1}
            onClick={() => {
              audio.resume();
              setSweepAt(Date.now());
              game.startWave();
              refresh();
            }}
          >
            <span className="start-btn-core">▶ Start Wave {nextWave}</span>
            <span className="hotkey">␣</span>
            <span className="start-btn-ring" aria-hidden />
          </button>
          )}
          {!tutorialLock && <div className="wb-autos">
            <button
              type="button"
              className={`auto-btn ${hud.autoStart ? (hud.autoStartWaiting ? 'is-waiting' : 'is-on') : ''}${hud.hiveActive ? ' is-managed' : ''}`}
              disabled={hud.hiveActive}
              aria-pressed={hud.autoStart}
              tabIndex={visible ? 0 : -1}
              title={
                hud.hiveActive ? 'Managed by Hive Intelligence — turn Hive off to change Auto Wave.' : hud.autoStartWaiting
                  ? 'Auto Wave is armed but waiting — it starts once you place your first tower or start Wave 1'
                  : 'Auto-start the next wave after a short countdown'
              }
              onClick={() => {
                game.setAutoStart(!game.autoStart);
                try { localStorage.setItem(AUTOSTART_KEY, game.autoStart ? '1' : '0'); } catch { /* storage unavailable */ }
                refresh();
              }}
            >
              <i className="wb-led" aria-hidden />
              ⟳ Auto Wave
              <b>{hud.hiveActive ? 'HIVE' : hud.autoStart ? (hud.autoStartWaiting ? 'WAIT' : hud.autoStartIn > 0 ? `${Math.ceil(hud.autoStartIn)}s` : 'ON') : 'OFF'}</b>
            </button>
            <button
              type="button"
              className={`auto-btn ${(autoGene || hud.hiveActive) && !autoGeneLock ? 'is-on' : ''}${hud.hiveActive ? ' is-managed' : ''}`}
              aria-pressed={(autoGene || hud.hiveActive) && !autoGeneLock}
              tabIndex={visible ? 0 : -1}
              disabled={!!autoGeneLock || hud.hiveActive}
              title={autoGeneLock ? `Auto Gene — ${autoGeneLock}` : hud.hiveActive ? 'Managed by Hive Intelligence — turn Hive off to change Auto Gene.' : 'Auto-draft the recommended ◆ PICK gene card after a countdown (pick any card to override)'}
              onClick={() => {
                const next = !autoGene;
                setAutoGene(next);
                setAutoGenePref(next);
              }}
            >
              <i className="wb-led" aria-hidden />
              ◆ Auto Gene
              <b>{autoGeneLock ? 'LOCKED' : hud.hiveActive ? 'HIVE' : autoGene ? 'ON' : 'OFF'}</b>
            </button>
          </div>}
        </div>
      </div>
      {visible && detail && (
        <div ref={detailRef} className="wb-detail panel" role="region" aria-label={`${detail.title} details`} tabIndex={-1}
          onKeyDown={(event) => {
            // Reading/scrolling intel must not dispatch board shortcuts (Space launches a wave).
            event.stopPropagation();
            if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
          }}>
          <div className="wb-detail-head"><strong>{detail.title}</strong><button type="button" onClick={closeDetail} aria-label="Close wave details">✕</button></div>
          <p>{detail.text}</p>
        </div>
      )}
      {hud.autoStartWaiting && (
        <div className="auto-wait-note" role="status">
          Waiting for first placement…
        </div>
      )}
      {sweepAt > 0 && <div className="wave-sweep" key={sweepAt} aria-hidden />}
    </div>
  );
}
