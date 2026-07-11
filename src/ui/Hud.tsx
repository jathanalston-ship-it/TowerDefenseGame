// Combat HUD (docs/HUD.md) — three aligned ZONES with a phase-reactive skin. LEFT: survival
// (Hive integrity + loot progress). CENTER: the wave module — THE focal read (wave number,
// pips, phase state, biome/boss/modifier chips). RIGHT: power · biomass · threat · hero.
// The whole bar re-skins per phase (data-hphase): BUILD is calm green with Biomass primary;
// COMBAT heats the accents, emphasizes Wave + Threat and softens Biomass; DANGER rides the
// committed emergency state (docs/CAMERA.md). Power gains celebrate in place: +Δ fly-up,
// scale pulse, light sweep, particle burst, and a throttled cue — the progression number
// should feel like the one that matters.

import { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../core/types';
import { HERO_DEFS } from '../core/config';
import { HERO_EVO, HERO_EVO_CATEGORIES, heroEvoCost } from '../core/heroEvolution';
import { formatPower } from '../core/power';
import { ProgressBar } from './components/ProgressBar';
import { LootMeter } from './LootMeter';
import { audio } from '../audio/sound';

const PHASE_TITLE: Record<HudSnapshot['phase'], string> = {
  prep: 'BUILD PHASE',
  wave: 'WAVE',
  draft: 'GENE DRAFT',
  won: 'VICTORY',
  lost: 'DEFEAT',
};

function integrityColor(pct: number): string {
  return pct > 0.5 ? 'var(--success)' : pct > 0.25 ? 'var(--warn)' : 'var(--danger)';
}
function threatColor(pct: number): string {
  return pct < 33 ? 'var(--success)' : pct < 66 ? 'var(--warn)' : 'var(--danger)';
}
/** Power magnitude tier — drives the cell's accent hue (K → M → B → T reads as ascension). */
function powerTier(p: number): number {
  return p >= 1e12 ? 4 : p >= 1e9 ? 3 : p >= 1e6 ? 2 : 1;
}

export function Hud({ hud, power, onOpenConsole, tutorial = false, doctrine = null, vows = [] }: { hud: HudSnapshot; power: number; onOpenConsole?: () => void; tutorial?: boolean; doctrine?: { icon: string; name: string } | null; vows?: { icon: string; name: string }[] }): JSX.Element {
  const displayWave =
    hud.phase === 'prep' ? Math.min(hud.totalWaves, hud.wave + 1) : Math.max(1, hud.wave);
  const intPct = hud.maxIntegrity > 0 ? hud.integrity / hud.maxIntegrity : 0;
  const heroDef = HERO_DEFS[hud.hero.kind];
  const hphase = hud.emergency ? 'danger' : hud.phase === 'wave' ? 'combat' : 'prep';
  // Hero Summary signals (docs/HERO-EVOLUTION.md §console): total evo levels + "an upgrade is
  // affordable" — the cheapest unowned-tier cost vs banked biomass (same math the console uses).
  const buffCount = hud.heroEvo.totalOwned;
  const consoleReady = HERO_EVO_CATEGORIES.some((c) => {
    const lvl = hud.heroEvo.levels[c.id] ?? 0;
    return lvl < HERO_EVO.maxLevel && hud.biomass >= heroEvoCost(c, lvl, hud.heroEvo.totalOwned);
  });
  // Threat = a readable pressure %, derived from the live swarm size (presentation only).
  const threatPct = Math.min(100, Math.round((hud.enemiesAlive / 40) * 100));
  // Hive Siege pressure (docs/HIVE-SIEGE.md §UI): who's chewing, how fast, how long we last.
  const underAttack = hud.hiveAttackers > 0 && hud.phase === 'wave';
  const survivalS = hud.hiveDps > 0.5 ? Math.max(0, Math.round(hud.integrity / hud.hiveDps)) : 999;

  // pulse the biomass readout whenever it ticks up (resource-gain feedback)
  const prevBiomass = useRef(hud.biomass);
  const [biomassPop, setBiomassPop] = useState(false);
  // smoothed income rate (/s), measured from the throttled snapshot deltas
  const rateRef = useRef({ biomass: hud.biomass, t: performance.now(), ema: 0 });
  const [income, setIncome] = useState(0);
  useEffect(() => {
    const now = performance.now();
    const r = rateRef.current;
    const dt = (now - r.t) / 1000;
    if (dt > 0.02) {
      const inst = Math.max(0, (hud.biomass - r.biomass) / dt); // income only (spends ignored)
      r.ema = r.ema * 0.6 + inst * 0.4;
      r.biomass = hud.biomass;
      r.t = now;
      setIncome(Math.round(r.ema));
    }
    if (hud.biomass > prevBiomass.current) {
      setBiomassPop(true);
      const id = setTimeout(() => setBiomassPop(false), 220);
      prevBiomass.current = hud.biomass;
      return () => clearTimeout(id);
    }
    prevBiomass.current = hud.biomass;
    return undefined;
  }, [hud.biomass]);

  // POWER GAIN CELEBRATION (docs/GAME-FEEL.md): any live increase (a draft, an evolution buy,
  // a mastery perk) fires the fly-up + pulse + burst, with a throttled chime. Render-only.
  const prevPower = useRef(power);
  const lastPowerCue = useRef(0);
  const [powerFx, setPowerFx] = useState<{ delta: number; at: number } | null>(null);
  useEffect(() => {
    const delta = power - prevPower.current;
    prevPower.current = power;
    if (delta <= 0) return undefined;
    setPowerFx({ delta, at: Date.now() });
    const now = performance.now();
    if (now - lastPowerCue.current > 1200) {
      lastPowerCue.current = now;
      audio.cue('power');
    }
    const id = setTimeout(() => setPowerFx(null), 1100);
    return () => clearTimeout(id);
  }, [power]);

  // Biome transition banner (docs/BIOMES.md): briefly flash "Entering · <name>" when the
  // ecosystem changes (Infinite mode rotation). Suppressed for the NEUTRAL biome (Stage mode).
  const [biomeBanner, setBiomeBanner] = useState<string | null>(null);
  const prevBiome = useRef(hud.biome.id);
  useEffect(() => {
    if (hud.biome.id === prevBiome.current) return undefined;
    prevBiome.current = hud.biome.id;
    if (hud.biome.id === 'neutral') return undefined;
    setBiomeBanner(hud.biome.name);
    const id = setTimeout(() => setBiomeBanner(null), 2600);
    return () => clearTimeout(id);
  }, [hud.biome.id, hud.biome.name]);

  // Run Identity (docs/RUN-IDENTITY.md): flash the current wave's telegraphed BEAT ("⚠ Corrupted
  // Wave") when it fires. Fires once per distinct event (guarded by name). Campaign/Endless only.
  const [runBanner, setRunBanner] = useState<{ name: string; desc: string } | null>(null);
  const prevRunEvent = useRef<string | null>(null);
  useEffect(() => {
    const ev = hud.runEvent;
    const key = ev ? ev.name : null;
    if (key === prevRunEvent.current) return undefined;
    prevRunEvent.current = key;
    if (!ev) return undefined;
    setRunBanner({ name: ev.name, desc: ev.desc });
    const id = setTimeout(() => setRunBanner(null), 3400);
    return () => clearTimeout(id);
  }, [hud.runEvent]);

  return (
    <div className="hud" data-hphase={hphase}>
      {/* ── LEFT zone: survival — the run's life, with loot progress riding beneath ── */}
      <div className="hz hz-l">
        <div
          className={`hud-cell hud-vital tt${underAttack ? ' is-siege' : ''}${intPct <= 0.25 ? ' is-critical' : ''}`}
          tabIndex={0}
          data-tut="hive-core"
          style={{ ['--hud-acc' as string]: integrityColor(intPct) }}
        >
          <div className="hud-k">
            Hive Core
            {underAttack && (
              <span className="hud-siege-flag" role="status" aria-label={`${hud.hiveAttackers} enemies attacking the Hive`}>
                UNDER ATTACK
              </span>
            )}
          </div>
          <div className="hud-vital-row">
            <div className="hud-vital-bar">
              <ProgressBar
                value={hud.integrity}
                max={hud.maxIntegrity}
                color={integrityColor(intPct)}
                height={12}
                segments={Math.max(1, Math.min(20, Math.round(hud.maxIntegrity / 25)))}
                className="bar-strong"
                label="Hive Core integrity"
              />
              {/* recent-damage GHOST: the chunk just chewed off, draining behind the live bar */}
              {hud.hiveRecentDamage > 0.5 && (
                <span
                  className="hud-vital-ghost"
                  style={{
                    left: `${Math.max(0, intPct) * 100}%`,
                    width: `${Math.min(1 - intPct, hud.hiveRecentDamage / Math.max(1, hud.maxIntegrity)) * 100}%`,
                  }}
                  aria-hidden
                />
              )}
            </div>
            <span className={`hud-v ${intPct < 0.34 ? 'is-danger' : ''}`}>
              {Math.min(Math.round(hud.integrity), Math.round(hud.maxIntegrity))}
              <span className="hud-sub">/{Math.round(hud.maxIntegrity)}</span>
            </span>
          </div>
          {underAttack && (
            <div className="hud-siege-row">
              <span className="hud-siege-stat">⚔ {hud.hiveAttackers}</span>
              <span className="hud-siege-stat">−{Math.round(hud.hiveDps)}/s</span>
              {hud.hiveDps > 0.5 && (
                <span className={`hud-siege-stat${survivalS <= 10 ? ' is-danger' : ''}`}>~{survivalS}s</span>
              )}
            </div>
          )}
          <span className="tt-bubble">
            Hive Core integrity — the run ends if it reaches 0.
            {underAttack
              ? ` ${hud.hiveAttackers} enemies are attacking it right now (−${Math.round(hud.hiveDps)}/s; ~${survivalS}s of integrity at this rate).`
              : ' Enemies that reach it ATTACK it until killed — clear them off.'}
          </span>
        </div>
        <LootMeter />
      </div>

      {/* ── CENTER zone: the WAVE module — the one place the eye returns to ── */}
      <div className={`hz hz-c hud-wave-mod phase-${hud.phase}`}>
        <div className="wm-eyebrow">
          {PHASE_TITLE[hud.phase]}
          {hud.endless && <span className="wm-endless">∞</span>}
          {hud.bossRush && <span className="wm-endless">☠</span>}
        </div>
        <div className="wm-main" data-tut="wave">
          {hud.endless || hud.bossRush ? (
            <span className="wm-num" style={{ color: hud.bossRush ? 'var(--danger)' : 'var(--viral)' }}>{Math.max(1, hud.phase === 'prep' ? hud.wave + 1 : hud.wave)}</span>
          ) : (
            <>
              <span className="wm-num">{displayWave}</span>
              <span className="wm-of">/{hud.totalWaves}</span>
            </>
          )}
        </div>
        {!hud.endless && !hud.bossRush && (
          <div className="wave-pips" aria-hidden>
            {Array.from({ length: hud.totalWaves }, (_, i) => {
              const n = i + 1;
              const state = n < displayWave ? 'done' : n === displayWave ? 'active' : '';
              return <span key={n} className={`pip ${state}`} />;
            })}
          </div>
        )}
        <div className="phase-hint">
          {hud.phase === 'prep'
            ? tutorial
              ? 'Build & upgrade — the lesson launches each wave'
              : 'Build & upgrade — press SPACE to start the wave'
            : hud.phase === 'wave'
              ? `${hud.enemiesAlive} hostiles in the field`
              : hud.phase === 'draft'
                ? 'Choose a Gene Card'
                : ' '}
        </div>
        {(hud.biome.id !== 'neutral' || hud.anticipation.length > 0 || hud.runHeadline || doctrine || vows.length > 0) && (
          <div className="wm-chips">
            {doctrine && (
              <span className="wm-chip wm-doc" title="This run's doctrine commitment (docs/DOCTRINES.md)">
                {doctrine.icon} {doctrine.name}
              </span>
            )}
            {vows.length > 0 && (
              <span className="wm-chip wm-vow" title={`Molt Vows sworn (docs/VOWS.md) — the world is warped this whole cycle: ${vows.map((v) => v.name).join(' · ')}`}>
                ⛧ {vows.map((v) => v.icon).join(' ')}
              </span>
            )}
            {hud.biome.id !== 'neutral' && (
              <span className="wm-chip wm-biome" style={{ ['--biome' as string]: hud.biome.accent }}>
                {hud.biome.name}
                {hud.biome.modifier && <i className="wm-chip-sub">{hud.biome.modifier}</i>}
              </span>
            )}
            {hud.biome.hazardActive && (
              <span className="wm-chip wm-haz" role="alert">⚠ {hud.biome.hazardName}</span>
            )}
            {hud.anticipation.length > 0 && hud.phase !== 'won' && hud.phase !== 'lost' && (
              <span className="wm-chip wm-next">▶ {hud.anticipation[0]}</span>
            )}
            {hud.runHeadline && <span className="wm-chip wm-run" title="This run's identity">✦ {hud.runHeadline}</span>}
          </div>
        )}
        {hud.emergency && (
          <div className="phase-emergency" role="alert">⚠ EMERGENCY DEFENSE</div>
        )}
        {biomeBanner && <div className="biome-enter" role="status">Entering · {biomeBanner}</div>}
        {runBanner && (
          <div className="run-event-banner" role="status">
            <span className="reb-name">⚠ {runBanner.name}</span>
            <span className="reb-desc">{runBanner.desc}</span>
          </div>
        )}
      </div>

      {/* ── RIGHT zone: power · biomass · threat · hero — aligned, equal rhythm ── */}
      <div className="hz hz-r">
        <div className={`hud-cell hud-power tt is-t${powerTier(power)}${powerFx ? ' is-gain' : ''}`} tabIndex={0} data-tut="power">
          <div className="hud-k">Power</div>
          <div className="hud-v hud-power-v">{formatPower(power)}</div>
          {powerFx && (
            <span className="power-fly" key={powerFx.at} aria-hidden>
              +{formatPower(powerFx.delta)}
            </span>
          )}
          {powerFx && (
            <span className="power-burst" key={`b${powerFx.at}`} aria-hidden>
              {Array.from({ length: 6 }, (_, i) => <i key={i} style={{ ['--pa' as string]: `${i * 60}deg` }} />)}
            </span>
          )}
          <span className="tt-bubble">Total run strength — your account × this run's genes & Hero Evolution. Rises as you draft cards and evolve.</span>
        </div>

        <div className={`hud-cell hud-biomass tt${hphase === 'prep' ? ' is-primary' : ''}`} tabIndex={0} data-tut="biomass" style={{ ['--hud-acc' as string]: 'var(--caustic)' }}>
          <div className="hud-k">Biomass</div>
          <div className={`hud-v ${biomassPop ? 'pop' : ''}`} style={{ color: 'var(--caustic)' }}>
            {hud.biomass}
          </div>
          <div className="hud-rate">{income > 0 ? `+${income}/s` : ' '}</div>
          <span className="tt-bubble">In-run currency. Spend it to grow towers.</span>
        </div>

        <div className={`hud-cell hud-mini hud-threat tt${hphase !== 'prep' && threatPct >= 60 ? ' is-hot' : ''}`} tabIndex={0}>
          <div className="hud-k">Threat</div>
          <div className="hud-v hud-v-sm" style={{ color: threatColor(threatPct) }}>{threatPct}%</div>
          <span className="tt-bubble">Battlefield pressure · {hud.enemiesAlive} alive · {hud.kills} killed.</span>
        </div>

        <div
          className={`hud-cell hud-hero tt${consoleReady ? ' has-upgrade' : ''}`}
          tabIndex={0}
          role="button"
          data-tut="hero"
          style={{ ['--hud-acc' as string]: heroDef.color }}
          onClick={onOpenConsole}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenConsole?.(); } }}
          aria-label={`${heroDef.name} — open the Hero Combat Console (E)`}
        >
          <div className="hud-k">
            {heroDef.name}
            <span className="hud-hero-meta">
              {buffCount > 0 && <i className="hud-hero-buffs" title={`${buffCount} evolution levels active`}>▲{buffCount}</i>}
              {!hud.hero.abilityReady && !hud.hero.down && <i className="hud-hero-cd">↻{Math.ceil(hud.hero.abilityCd)}s</i>}
              {consoleReady && <i className="hud-hero-up" title="Evolution affordable — open the Console (E)">◈</i>}
            </span>
          </div>
          {hud.hero.down ? (
            <div className="hud-v is-danger">DOWN {Math.ceil(hud.hero.respawn)}s</div>
          ) : (
            <div className="hud-hero-row">
              <ProgressBar
                value={hud.hero.hp}
                max={hud.hero.maxHp}
                color={heroDef.color}
                height={8}
                className="bar-hero"
                label="Hero HP"
              />
              <span className="hud-v hud-v-sm">
                {Math.round(hud.hero.hp)}
                <span className="hud-sub">/{Math.round(hud.hero.maxHp)}</span>
              </span>
            </div>
          )}
          <span className="tt-bubble">
            {hud.hero.abilityReady ? `${heroDef.ability.name} ready.` : `${heroDef.ability.name} on cooldown.`} Tap to open the Combat Console (E) · ⬢ {hud.biomass} banked.
          </span>
        </div>
      </div>
    </div>
  );
}
