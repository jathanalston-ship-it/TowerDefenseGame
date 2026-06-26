import type { HudSnapshot } from '../core/types';
import { ProgressBar } from './components/ProgressBar';
import { CountUp } from './components/CountUp';

const PHASE_LABEL: Record<HudSnapshot['phase'], string> = {
  prep: 'PREP',
  wave: 'WAVE',
  draft: 'DRAFT',
  won: 'VICTORY',
  lost: 'DEFEAT',
};

function integrityColor(pct: number): string {
  return pct > 0.5 ? 'var(--success)' : pct > 0.25 ? 'var(--warn)' : 'var(--danger)';
}

export function Hud({ hud }: { hud: HudSnapshot }): JSX.Element {
  const displayWave =
    hud.phase === 'prep' ? Math.min(hud.totalWaves, hud.wave + 1) : Math.max(1, hud.wave);
  const intPct = hud.maxIntegrity > 0 ? hud.integrity / hud.maxIntegrity : 0;
  const heroPct = hud.hero.maxHp > 0 ? hud.hero.hp / hud.hero.maxHp : 0;

  return (
    <div className="hud">
      {/* VITAL — Hive Core integrity (largest weight) */}
      <div className="hud-cell hud-vital tt" tabIndex={0}>
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
          <span className={`hud-v ${intPct <= 0.25 ? 'is-danger' : intPct <= 0.5 ? 'is-warn' : ''}`}>
            {hud.integrity}
            <span className="hud-sub">/{hud.maxIntegrity}</span>
          </span>
        </div>
        <span className="tt-bubble">Hive Core integrity — the run ends if it reaches 0.</span>
      </div>

      {/* WAVE progress (or endless score) */}
      <div className="hud-cell tt" tabIndex={0}>
        <div className="hud-k">{hud.mode === 'endless' ? 'Wave · Score' : 'Wave'}</div>
        {hud.mode === 'endless' ? (
          <>
            <div className="hud-v">
              {Math.max(1, hud.wave)}
              <span className="hud-sub"> · {hud.score}</span>
            </div>
            <span className="tt-bubble">Endless survival — outlast the swarm. Score {hud.score}.</span>
          </>
        ) : (
          <>
            <div className="hud-v">
              {displayWave}
              <span className="hud-sub">/{hud.totalWaves}</span>
            </div>
            <div className="wave-pips" aria-hidden>
              {Array.from({ length: Math.min(20, hud.totalWaves) }, (_, i) => {
                const n = i + 1;
                const state = n < displayWave ? 'done' : n === displayWave ? 'active' : '';
                return <span key={n} className={`pip ${state}`} />;
              })}
            </div>
            <span className="tt-bubble">
              {hud.biomeName ? `${hud.biomeName} — ` : ''}survive all {hud.totalWaves} waves to extract.
            </span>
          </>
        )}
      </div>

      <div className="spacer" />

      {/* ECONOMY + threat */}
      <div className="hud-cell tt" tabIndex={0}>
        <div className="hud-k">Biomass</div>
        <CountUp className="hud-v" style={{ color: 'var(--caustic)' }} value={hud.biomass} />

        <span className="tt-bubble">In-run currency. Spend it to grow towers.</span>
      </div>

      <div className="hud-cell hud-mini tt" tabIndex={0}>
        <div className="hud-k">Threat</div>
        <div className="hud-v hud-v-sm">
          {hud.enemiesAlive}
          <span className="hud-sub"> alive</span>
        </div>
        <span className="tt-bubble">Enemies currently on the battlefield · {hud.kills} killed.</span>
      </div>

      {/* HERO */}
      <div className="hud-cell hud-hero tt" tabIndex={0}>
        <div className="hud-k">Hero</div>
        {hud.hero.down ? (
          <div className="hud-v is-danger">DOWN {Math.ceil(hud.hero.respawn)}s</div>
        ) : (
          <div className="hud-hero-row">
            <ProgressBar
              value={hud.hero.hp}
              max={hud.hero.maxHp}
              color="var(--gold)"
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
          {hud.hero.abilityReady ? 'Apex Leap ready.' : 'Apex Leap on cooldown.'}
        </span>
      </div>

      {/* OBJECTIVE chip (stage mode) */}
      {hud.objective && (
        <div
          className={`obj-chip tt ${hud.objective.done ? 'is-done' : ''}`}
          tabIndex={0}
        >
          {hud.objective.done ? '✓ ' : '◇ '}
          {hud.objective.name}
          <span className="tt-bubble">{hud.objective.description}</span>
        </div>
      )}

      {/* PHASE chip — keyed by phase so it pops on each transition (wave start/end) */}
      <div key={hud.phase} className={`phase-chip phase-${hud.phase}`}>{PHASE_LABEL[hud.phase]}</div>
    </div>
  );
}
