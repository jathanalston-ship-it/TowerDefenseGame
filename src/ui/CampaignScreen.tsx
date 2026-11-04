// Campaign — a LIVING WORLD MAP (docs/MODE-IDENTITY.md §3), not a numbered list. A winding path of
// stage nodes plunges DEEPER into the infected planet: biomes occupy colored regions, the frontier
// pulses, cleared depths light up behind you, locked depths fade into the dark ahead. The view is a
// deterministic WINDOW over the unbounded procedural ladder (campaignMapView), so it scales to
// thousands of stages with no authoring. A side panel details the focused stage. Pure presentation.

import { useEffect, useState, type MutableRefObject } from 'react';
import { meta } from '../state/meta';
import { PredictionPanel } from './PredictionPanel';
import { LoopDirective } from './NextGoalBanner';
import { audio } from '../audio/sound';
import { BIOME_REGION, campaignMapView, generateStage, recommendedPowerScore, stageUnlocks, upcomingGates } from '../core/campaign';
import { ENEMY_DEFS } from '../core/config';
import { nextGoals } from '../state/nextGoal';
import { ProgressBar } from './components/ProgressBar';
import { formatPower } from '../core/power';
import { CAMPAIGN_REWARDS, CHESTS, chestForWave } from '../core/config';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../core/difficulty';
import { difficultyPref, setDifficultyPref } from '../state/prefs';
import { deployReadiness } from '../state/progressionLoop';
import { isInfiniteUnlocked } from '../save/derive';
import { CurrencyIcon } from './components/CurrencyIcon';
import { ThreatPicker } from './components/ThreatPicker';

const WINDOW = 8; // nodes shown at once (a window over the infinite ladder)
const ROW = 64, TOP = 44, MIDX = 150, AMP = 98; // serpentine descent layout (SVG units)
const pos = (i: number, stage: number): { x: number; y: number } => ({ x: MIDX + AMP * Math.sin(stage * 0.7), y: TOP + i * ROW });

export function CampaignScreen({
  onStart,
  difficultyRef,
}: {
  onStart: (stage: number, boonId?: string) => void;
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
  // Mutation-event boon choice (docs/CAMPAIGN-EVENTS.md): the picked option id for the focused stage
  // (null = the default first option). Cleared whenever the focus moves to a different stage.
  const [boonPick, setBoonPick] = useState<string | null>(null);
  useEffect(() => { setBoonPick(null); }, [focus]);

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

  const deploy = (n: number): void => { audio.resume(); audio.cue('ui'); difficultyRef.current = diff; meta.notePredictionBaseline('campaign', diff); onStart(n, boonPick ?? undefined); };

  // Focused stage — one full generation (the selected node only).
  const cfg = generateStage(focus, diff);
  const focusState = focus <= cleared ? 'cleared' : focus === frontier ? 'current' : 'locked';
  const rec = recommendedPowerScore(focus, diff);
  const ready = power >= rec;
  const underPowered = deployReadiness(power, rec, focus, diff) === 'under'; // the only band that warns
  const infiniteOpen = isInfiniteUnlocked(save); // remedy copy never points at a sealed mode
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
          <button className="camp-jump" onClick={() => { setViewStart(Math.max(1, frontier - 2)); setFocus(frontier); }} title="Jump the map to your frontier">⌖ Frontier</button>
          <input
            className="camp-search"
            type="search"
            inputMode="numeric"
            placeholder="Stage №"
            aria-label="Jump to stage"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const n = Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value)));
              if (Number.isFinite(n) && n > 0) { setViewStart(Math.max(1, n - 2)); setFocus(n); }
            }}
          />
        </div>
      </header>

      <PredictionPanel mode="campaign" difficultyId={diff} label="Campaign Stage" />

      {/* The macro-loop readiness meter — push when the frontier is open, farm Infinite when
          it isn't (docs/PROGRESSION-LOOP.md). */}
      <LoopDirective difficultyId={diff} />

      {/* ── The ROADMAP rail: what the descent is unlocking next (docs/MODE-IDENTITY.md §campaign).
          Goal chips (closest-first, the shared Next-Goal engine) + gate chips that JUMP the map. */}
      <div className="camp-rail" aria-label="Upcoming unlocks">
        {(() => {
          // The next ◈ milestone (every Nth clear pays a bonus core chunk) — a jumpable chip
          // exactly like the gates, so the reward rhythm reads on the rail itself.
          const ms = Math.ceil(frontier / CAMPAIGN_REWARDS.milestoneEvery) * CAMPAIGN_REWARDS.milestoneEvery;
          return (
            <button className="camp-gate is-milestone" title={`Every ${CAMPAIGN_REWARDS.milestoneEvery}th stage pays +${CAMPAIGN_REWARDS.milestoneCore} bonus Genome Cores on first clear — jump the map to Stage ${ms}`}
                    onClick={() => { setViewStart(Math.max(1, ms - 2)); setFocus(ms); }}>
              <i>Stage {ms}</i>◈ +{CAMPAIGN_REWARDS.milestoneCore} milestone
            </button>
          );
        })()}
        {upcomingGates(cleared).map((g) => (
          <button key={`${g.kind}-${g.stage}`} className={`camp-gate is-${g.kind}`} title={`Jump the map to Stage ${g.stage}`}
                  onClick={() => { setViewStart(Math.max(1, g.stage - 2)); setFocus(g.stage); }}>
            <i>Stage {g.stage}</i>{g.label}
          </button>
        ))}
        {nextGoals(save, 3).map((g) => (
          <span key={g.id} className="camp-goal" style={{ ['--gc' as string]: g.color }} title={`${g.remaining} → ${g.reward}`}>
            <span className="camp-goal-l">{g.label}</span>
            <ProgressBar value={Math.round(g.progress * 100)} max={100} color={g.color} height={4} label={g.label} />
          </span>
        ))}
      </div>

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
                   style={{ ['--biome' as string]: n.biome.accent }} onClick={() => setFocus(n.stage)} role="listitem"
                   tabIndex={0} aria-label={`Stage ${n.stage}, ${n.biome.name}, ${n.state}`}
                   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocus(n.stage); } }}>
                  {n.state === 'current' && <circle cx={p.x} cy={p.y} r={r + 7} className="camp-node-pulse" />}
                  {n.stage === focus && <circle cx={p.x} cy={p.y} r={r + 4} className="camp-node-focus" />}
                  <circle cx={p.x} cy={p.y} r={r} className="camp-node-dot" />
                  {n.milestone && <text x={p.x} y={p.y - r - 5} className="camp-node-ms" textAnchor="middle">◈</text>}
                  {n.event && (
                    <g className="camp-node-evt">
                      <circle cx={p.x + r - 2} cy={p.y - r + 2} r="8" fill={n.event.accent} />
                      <text x={p.x + r - 2} y={p.y - r + 5} textAnchor="middle" className="camp-node-evt-i">{n.event.icon}</text>
                    </g>
                  )}
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
            SECTOR {Math.floor((focus - 1) / BIOME_REGION) + 1} · STAGE {focus}
            {focus === frontier && <span className="camp-here">◂ frontier</span>}
            {focusState === 'cleared' && <span className="camp-here cleared">✓ cleared</span>}
          </div>
          <div className="camp-detail-biome" style={{ color: cfg.biome.accent }}>{cfg.biome.name}</div>
          <div className="camp-detail-mods">
            <span className="camp-mod" title="Biome modifier">{cfg.modifierName}</span>
            <span className="camp-mod hazard" title={cfg.hazardDesc}>⚠ {cfg.hazardName}</span>
          </div>

          {/* Authored campaign event (docs/CAMPAIGN-EVENTS.md): telegraph + the Mutation choice. */}
          {cfg.event && (
            <div className="camp-event" style={{ ['--ev' as string]: cfg.event.accent }}>
              <div className="camp-event-h">
                <span className="camp-event-i">{cfg.event.icon}</span>
                <span className="camp-event-n">{cfg.event.name}</span>
                {cfg.event.rewardMult && <span className="camp-event-r">rewards ×{cfg.event.rewardMult.toFixed(1)}</span>}
              </div>
              <p className="camp-event-d">{cfg.event.desc}</p>
              {cfg.event.kind === 'mutation' && cfg.event.boons && (
                <div className="camp-event-boons">
                  {cfg.event.boons.map((b) => {
                    const on = (boonPick ?? cfg.event!.boons![0].id) === b.id;
                    return (
                      <button key={b.id} className={`camp-boon${on ? ' on' : ''}`} onClick={() => setBoonPick(b.id)} type="button">
                        <b>{b.name}</b>
                        <span>{b.desc}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(() => {
            const threat = Math.min(5, 1 + Math.floor(((cfg.scaling.enemyHealthMult - 1) + (cfg.scaling.enemyDamageMult - 1)) * 1.6));
            return (
              <div className="camp-threat" title={`Enemy HP +${Math.round((cfg.scaling.enemyHealthMult - 1) * 100)}% · damage +${Math.round((cfg.scaling.enemyDamageMult - 1) * 100)}%`}>
                <span className="cd-k">Threat</span>
                <span className="camp-skulls">{'◆'.repeat(threat)}{'◇'.repeat(5 - threat)}</span>
                {cfg.rewardMult > 1 && <span className="camp-rmult">rewards ×{cfg.rewardMult.toFixed(1)}</span>}
              </div>
            );
          })()}
          <div className="camp-enemies" aria-label="Enemy forecast">
            {cfg.enemyPool.slice(0, 5).map((k) => (
              <span className="camp-enemy" key={k} style={{ ['--ec' as string]: ENEMY_DEFS[k].color }}>{ENEMY_DEFS[k].name}</span>
            ))}
            {cfg.eliteFrequency > 0 && <span className="camp-enemy is-elite">Elites {Math.round(cfg.eliteFrequency * 100)}%</span>}
          </div>

          <div className="camp-detail-grid">
            <div className="cd-row"><span className="cd-k">◈ Boss</span><span className="cd-v">{cfg.boss.name}</span></div>
            {cfg.miniBoss && <div className="cd-row"><span className="cd-k">Mini-boss</span><span className="cd-v">{cfg.miniBoss.name}</span></div>}
            <div className="cd-row"><span className="cd-k">Waves</span><span className="cd-v">{cfg.waveCount}</span></div>
            <div className="cd-row"><span className="cd-k">Enemy HP</span><span className="cd-v">+{Math.round((cfg.scaling.enemyHealthMult - 1) * 100)}%</span></div>
            <div className="cd-row"><span className="cd-k">Enemy Damage</span><span className="cd-v">+{Math.round((cfg.scaling.enemyDamageMult - 1) * 100)}%</span></div>
            {cfg.enemySpeedMult > 1 && <div className="cd-row"><span className="cd-k">Enemy Speed</span><span className="cd-v">+{Math.round((cfg.enemySpeedMult - 1) * 100)}%</span></div>}
            {(() => {
              const t = save.campaign.bestTime[diff]?.[String(focus)];
              return t ? <div className="cd-row"><span className="cd-k">Fastest clear</span><span className="cd-v">{Math.floor(t / 60)}:{String(t % 60).padStart(2, '0')}</span></div> : null;
            })()}
          </div>

          {stageUnlocks(focus).length > 0 && (
            <div className="camp-unlocks">
              <span className="cd-k">Clearing unlocks</span>
              {stageUnlocks(focus).map((u) => <span className={`camp-unlock is-${u.kind}`} key={u.label}>◈ {u.label}</span>)}
            </div>
          )}

          <div className={`camp-power ${underPowered ? 'low' : 'ok'}`}>
            <span>Recommended Power</span>
            <b>{formatPower(rec)}</b>
            <span className="camp-power-you">you {formatPower(power)} {ready ? '✓' : underPowered ? '⚠' : ''}</span>
          </div>

          <div className="camp-rewards">
            <span className="cd-k">{focusState === 'cleared' ? 'Replay' : 'First-clear reward'}</span>
            {focusState !== 'cleared'
              ? <span className="cd-reward"><CurrencyIcon id="genomeCores" size={14} title="" /> +{firstClearCore}</span>
              : <span className="cd-reward dim">already claimed — replay for loot &amp; mastery</span>}
          </div>
          {/* The Stage Cache is EARNED, not given (state/meta.ts finishRun): first clear AND zero
              Nucleus damage — regen never redeems a hit, replays never qualify. Say so up front. */}
          {focusState !== 'cleared' && (
            <div className="camp-rewards is-flawless" title="Take zero Nucleus integrity damage on the first clear. Regeneration does not redeem a hit, and replays never qualify.">
              <span className="cd-k">Flawless bonus</span>
              <span className="cd-reward"><span style={{ color: cfg.biome.accent }}>◈</span> {CHESTS[chestForWave(focus)].name}</span>
            </div>
          )}

          {focusState === 'cleared' && <ThreatPicker mode="campaign" />}
          <button className={`camp-deploy ${focusState === 'current' ? 'primary' : ''}`} disabled={focusState === 'locked'} onClick={() => deploy(focus)}>
            {focusState === 'locked' ? `Clear Stage ${frontier} first` : focusState === 'cleared' ? 'Replay ▸' : 'Deploy ▸'}
          </button>
          {/* Frontier field note: a failed push is never wasted (CAMPAIGN_REWARDS.attemptFrac),
              and the under-powered path names its remedy — the Infinite farm (the macro loop). */}
          {focus === frontier && (
            <div className="camp-fieldnote">
              {!underPowered
                ? <>Failed attempts still recover up to {Math.round(CAMPAIGN_REWARDS.attemptFrac * 100)}% of the discovery data.</>
                : <>Recommended Power not met — {infiniteOpen ? <>farm <b>Infinite</b></> : 'replay cleared stages'} to close the gap, or fight anyway: failed attempts recover up to {Math.round(CAMPAIGN_REWARDS.attemptFrac * 100)}% of the discovery data.</>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
