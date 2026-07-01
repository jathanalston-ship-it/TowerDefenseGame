import { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../core/types';
import { HERO_DEFS } from '../core/config';
import { ProgressBar } from './components/ProgressBar';
import { LootMeter } from './LootMeter';

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

export function Hud({ hud }: { hud: HudSnapshot }): JSX.Element {
  const displayWave =
    hud.phase === 'prep' ? Math.min(hud.totalWaves, hud.wave + 1) : Math.max(1, hud.wave);
  const intPct = hud.maxIntegrity > 0 ? hud.integrity / hud.maxIntegrity : 0;
  const heroDef = HERO_DEFS[hud.hero.kind];
  // Threat = a readable pressure %, derived from the live swarm size (presentation only).
  const threatPct = Math.min(100, Math.round((hud.enemiesAlive / 40) * 100));

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

  return (
    <div className="hud">
      {/* ── LEFT cluster: survival + progress ── */}
      <div className="hud-cell hud-vital tt" tabIndex={0} data-tut="hive-core">
        <div className="hud-k">Hive Core</div>
        <div className="hud-vital-row">
          <ProgressBar
            value={hud.integrity}
            max={hud.maxIntegrity}
            color={integrityColor(intPct)}
            height={12}
            segments={Math.max(1, Math.min(20, Math.round(hud.maxIntegrity / 25)))}
            className="bar-strong"
            label="Hive Core integrity"
          />
          <span className={`hud-v ${intPct < 0.34 ? 'is-danger' : ''}`}>
            {hud.integrity}
            <span className="hud-sub">/{hud.maxIntegrity}</span>
          </span>
        </div>
        <span className="tt-bubble">Hive Core integrity — the run ends if it reaches 0.</span>
      </div>

      <div className="hud-cell tt" tabIndex={0}>
        {hud.endless ? (
          <>
            <div className="hud-k">Depth</div>
            <div className="hud-v" style={{ color: 'var(--viral)' }}>{Math.max(0, hud.wave)}</div>
            <span className="tt-bubble">Endless — the AI Director escalates forever. Hold the line as deep as you can.</span>
          </>
        ) : (
          <>
            <div className="hud-k">Wave</div>
            <div className="hud-v">
              {displayWave}
              <span className="hud-sub">/{hud.totalWaves}</span>
            </div>
            <div className="wave-pips" aria-hidden>
              {Array.from({ length: hud.totalWaves }, (_, i) => {
                const n = i + 1;
                const state = n < displayWave ? 'done' : n === displayWave ? 'active' : '';
                return <span key={n} className={`pip ${state}`} />;
              })}
            </div>
            <span className="tt-bubble">Survive all {hud.totalWaves} waves to extract.</span>
          </>
        )}
      </div>

      {/* ── CENTER: the current phase, prominent (RTS-style) ── */}
      <div className={`hud-phase-center phase-${hud.phase}`}>
        <div className="phase-big">
          {PHASE_TITLE[hud.phase]}
          {hud.phase === 'wave' && !hud.endless && <span className="phase-num"> {displayWave}</span>}
        </div>
        <div className="phase-hint">
          {hud.phase === 'prep'
            ? 'Build & upgrade — press SPACE to start the wave'
            : hud.phase === 'wave'
              ? `${hud.enemiesAlive} hostiles in the field`
              : hud.phase === 'draft'
                ? 'Choose a Gene Card'
                : ' '}
        </div>
        {hud.emergency && (
          <div className="phase-emergency" role="alert">⚠ EMERGENCY DEFENSE</div>
        )}
        {hud.anticipation.length > 0 && hud.phase !== 'won' && hud.phase !== 'lost' && (
          <div className="phase-hint" style={{ opacity: 0.8, fontVariant: 'small-caps', letterSpacing: '0.04em' }}>
            {'▶'} next: {hud.anticipation[0]}
          </div>
        )}
        {hud.biome.id !== 'neutral' && (
          <div className="phase-biome" style={{ ['--biome' as string]: hud.biome.accent }}>
            <span className="phase-biome-name">{hud.biome.name}</span>
            {hud.biome.modifier && <span className="phase-biome-mod">{hud.biome.modifier}</span>}
            {hud.biome.hazardActive && <span className="phase-biome-haz" role="alert">⚠ {hud.biome.hazardName}</span>}
          </div>
        )}
        {biomeBanner && <div className="biome-enter" role="status">Entering · {biomeBanner}</div>}
      </div>

      {/* ── RIGHT cluster: economy, threat, loot, hero ── */}
      <div className="hud-cell tt" tabIndex={0} data-tut="biomass">
        <div className="hud-k">Biomass</div>
        <div className={`hud-v ${biomassPop ? 'pop' : ''}`} style={{ color: 'var(--caustic)' }}>
          {hud.biomass}
        </div>
        <div className="hud-rate">{income > 0 ? `+${income}/s` : ' '}</div>
        <span className="tt-bubble">In-run currency. Spend it to grow towers.</span>
      </div>

      <div className="hud-cell hud-mini tt" tabIndex={0}>
        <div className="hud-k">Threat</div>
        <div className="hud-v hud-v-sm" style={{ color: threatColor(threatPct) }}>{threatPct}%</div>
        <span className="tt-bubble">Battlefield pressure · {hud.enemiesAlive} alive · {hud.kills} killed.</span>
      </div>

      <LootMeter />

      <div className="hud-cell hud-hero tt" tabIndex={0} data-tut="hero">
        <div className="hud-k">{heroDef.name}</div>
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
              {hud.hero.hp}
              <span className="hud-sub">/{hud.hero.maxHp}</span>
            </span>
          </div>
        )}
        <span className="tt-bubble">
          {hud.hero.abilityReady ? `${heroDef.ability.name} ready.` : `${heroDef.ability.name} on cooldown.`}
        </span>
      </div>
    </div>
  );
}
