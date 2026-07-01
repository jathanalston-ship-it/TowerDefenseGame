// Campaign — a LIVING WORLD MAP (docs/MODE-IDENTITY.md §3), not a numbered list. A winding path of
// stage nodes plunges DEEPER into the infected planet: biomes occupy colored regions, the frontier
// pulses, cleared depths light up behind you, locked depths fade into the dark ahead. The view is a
// deterministic WINDOW over the unbounded procedural ladder (campaignMapView), so it scales to
// thousands of stages with no authoring. A side panel details the focused stage. Pure presentation.

import { useEffect, useState, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { PredictionPanel } from './PredictionPanel';
import { audio } from '../audio/sound';
import { campaignMapView, generateStage, recommendedPowerScore } from '../core/campaign';
import { formatPower } from '../core/power';
import { CAMPAIGN_REWARDS } from '../core/config';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../core/difficulty';
import { difficultyPref, setDifficultyPref } from '../state/prefs';
import { CurrencyIcon } from './components/CurrencyIcon';

const WINDOW = 8; // nodes shown at once (a window over the infinite ladder)
const ROW = 64, TOP = 44, MIDX = 150, AMP = 98; // serpentine descent layout (SVG units)
const pos = (i: number, stage: number): { x: number; y: number } => ({ x: MIDX + AMP * Math.sin(stage * 0.7), y: TOP + i * ROW });

export function CampaignScreen({
  onStart,
  difficultyRef,
}: {
  onStart: (stage: number) => void;
  difficultyRef: MutableRefObject<string>;
}): JSX.Element {
  const save = meta.use();
  const [diff, setDiff] = useState(() => difficultyPref('campaign')); // Campaign's OWN persisted difficulty
  const cleared = save.campaign.cleared[diff] ?? 0;
  const frontier = cleared + 1;
  const power = meta.power().score;

  // Window + focus track the frontier; recenter when you clear a stage or switch the difficulty track.
  const [viewStart, setViewStart] = useState(() => Math.max(1, frontier - 2));
  const [focus, setFocus] = useState(frontier);
  useEffect(() => { setViewStart(Math.max(1, cleared + 1 - 2)); setFocus(cleared + 1); }, [cleared, diff]);

  const nodes = campaignMapView(cleared, diff, viewStart, WINDOW);
  const svgH = TOP * 2 + (WINDOW - 1) * ROW;

  // Biome REGIONS: maximal runs of one biome become a colored band the path crosses.
  const bands: { id: string; name: string; accent: string; y0: number; y1: number }[] = [];
  nodes.forEach((n, i) => {
    const y = TOP + i * ROW;
    const last = bands[bands.length - 1];
    if (last && last.id === n.biome.id) last.y1 = y + ROW / 2;
    else bands.push({ id: n.biome.id, name: n.biome.name, accent: n.biome.accent, y0: y - ROW / 2 + 8, y1: y + ROW / 2 });
  });

  const deploy = (n: number): void => { audio.resume(); audio.cue('ui'); difficultyRef.current = diff; meta.notePredictionBaseline('campaign', diff); onStart(n); };

  // Focused stage — one full generation (the selected node only).
  const cfg = generateStage(focus, diff);
  const focusState = focus <= cleared ? 'cleared' : focus === frontier ? 'current' : 'locked';
  const rec = recommendedPowerScore(focus, diff);
  const ready = power >= rec;
  const firstClearCore = CAMPAIGN_REWARDS.firstClearCore + CAMPAIGN_REWARDS.firstClearCorePerStage * focus +
    (focus % CAMPAIGN_REWARDS.milestoneEvery === 0 ? CAMPAIGN_REWARDS.milestoneCore : 0);

  return (
    <div className="panel camp-map-panel">
      <header className="camp-map-head">
        <div>
          <div className="panel-title">Campaign · The Descent</div>
          <div className="panel-sub">Push deeper into the infected planet — each stage cleared opens the next.</div>
        </div>
        <div className="camp-map-meta">
          <label className="play-field">
            <span className="play-field-k">Difficulty</span>
            <select value={diff} onChange={(e) => { setDiff(e.target.value); difficultyRef.current = e.target.value; setDifficultyPref('campaign', e.target.value); }}>
              {DIFFICULTY_IDS.map((id) => <option key={id} value={id} title={DIFFICULTIES[id].blurb}>{DIFFICULTIES[id].name}</option>)}
            </select>
          </label>
          <span className="camp-record">Deepest cleared <b>{cleared}</b></span>
          <span className="camp-record">Power <b>{formatPower(power)}</b></span>
        </div>
      </header>

      <PredictionPanel mode="campaign" difficultyId={diff} label="Campaign Stage" />

      <div className="camp-map-body">
        {/* ── The living map ── */}
        <div className="camp-map-wrap">
          <button className="camp-scroll" disabled={viewStart <= 1} onClick={() => setViewStart((v) => Math.max(1, v - 3))}>▲ Toward the surface</button>
          <svg className="camp-map-svg" viewBox={`0 0 300 ${svgH}`} preserveAspectRatio="xMidYMin meet" role="list" aria-label="Campaign descent">
            {bands.map((b, i) => (
              <g key={`${b.id}-${i}`}>
                <rect x="0" y={b.y0} width="300" height={Math.max(0, b.y1 - b.y0)} fill={b.accent} opacity="0.08" />
                <text x="9" y={b.y0 + 17} className="camp-band-label" fill={b.accent}>{b.name.toUpperCase()}</text>
              </g>
            ))}
            <path className="camp-vein" d={nodes.map((n, i) => { const p = pos(i, n.stage); return `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y}`; }).join(' ')} />
            {nodes.map((n, i) => {
              const p = pos(i, n.stage);
              const r = n.milestone ? 19 : 14;
              return (
                <g key={n.stage} className={`camp-node is-${n.state}${n.stage === focus ? ' is-focus' : ''}`}
                   style={{ ['--biome' as string]: n.biome.accent }} onClick={() => setFocus(n.stage)} role="listitem">
                  {n.state === 'current' && <circle cx={p.x} cy={p.y} r={r + 7} className="camp-node-pulse" />}
                  {n.stage === focus && <circle cx={p.x} cy={p.y} r={r + 4} className="camp-node-focus" />}
                  <circle cx={p.x} cy={p.y} r={r} className="camp-node-dot" />
                  {n.milestone && <text x={p.x} y={p.y - r - 5} className="camp-node-ms" textAnchor="middle">◈</text>}
                  <text x={p.x} y={p.y + 5} className="camp-node-n" textAnchor="middle">{n.stage}</text>
                </g>
              );
            })}
          </svg>
          <button className="camp-scroll" onClick={() => setViewStart((v) => v + 3)}>▼ Descend deeper</button>
        </div>

        {/* ── Focused stage ── */}
        <aside className="camp-detail" style={{ ['--biome' as string]: cfg.biome.accent }}>
          <div className="camp-detail-stage">
            STAGE {focus}
            {focus === frontier && <span className="camp-here">◂ frontier</span>}
            {focusState === 'cleared' && <span className="camp-here cleared">✓ cleared</span>}
          </div>
          <div className="camp-detail-biome" style={{ color: cfg.biome.accent }}>{cfg.biome.name}</div>
          <div className="camp-detail-mods">
            <span className="camp-mod" title="Biome modifier">{cfg.modifierName}</span>
            <span className="camp-mod hazard" title={cfg.hazardDesc}>⚠ {cfg.hazardName}</span>
          </div>

          <div className="camp-detail-grid">
            <div className="cd-row"><span className="cd-k">◈ Boss</span><span className="cd-v">{cfg.boss.name}</span></div>
            {cfg.miniBoss && <div className="cd-row"><span className="cd-k">Mini-boss</span><span className="cd-v">{cfg.miniBoss.name}</span></div>}
            <div className="cd-row"><span className="cd-k">Waves</span><span className="cd-v">{cfg.waveCount}</span></div>
            <div className="cd-row"><span className="cd-k">Enemy HP</span><span className="cd-v">+{Math.round((cfg.scaling.enemyHealthMult - 1) * 100)}%</span></div>
            <div className="cd-row"><span className="cd-k">Enemy Damage</span><span className="cd-v">+{Math.round((cfg.scaling.enemyDamageMult - 1) * 100)}%</span></div>
          </div>

          <div className={`camp-power ${ready ? 'ok' : 'low'}`}>
            <span>Recommended Power</span>
            <b>{formatPower(rec)}</b>
            <span className="camp-power-you">you {formatPower(power)} {ready ? '✓' : '⚠'}</span>
          </div>

          <div className="camp-rewards">
            <span className="cd-k">{focusState === 'cleared' ? 'Replay' : 'First-clear reward'}</span>
            {focusState !== 'cleared'
              ? <span className="cd-reward"><CurrencyIcon id="genomeCores" size={14} title="" /> +{firstClearCore} · Stage Cache <span style={{ color: cfg.biome.accent }}>◈</span></span>
              : <span className="cd-reward dim">already claimed — replay for loot &amp; mastery</span>}
          </div>

          <button className={`camp-deploy ${focusState === 'current' ? 'primary' : ''}`} disabled={focusState === 'locked'} onClick={() => deploy(focus)}>
            {focusState === 'locked' ? `Clear Stage ${frontier} first` : focusState === 'cleared' ? 'Replay ▸' : 'Deploy ▸'}
          </button>
        </aside>
      </div>
    </div>
  );
}
