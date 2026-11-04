// THE MOLT CHAMBER (docs/PROGRESSION-REDESIGN.md §molt-chamber) — prestige as a place, not a
// list. A LIVE canvas chamber (the cutscene library's molt tableau, rethemed — never forked)
// fronts the "should I ascend?" decision: the mint headline with the ×now → ×after multiplier
// move, progress to the next Cell, the campaign gate, and an explicit KEEP / RESET manifest.
// The browser confirm() is gone — an in-app Popup confirms, and the Molt itself plays a short
// fullscreen CEREMONY (shed → mint count-up → seal) before returning to the tree.
//
// The Ascendant Tree renders as three THEMED WINGS (Dominion / Economy Engine / Income Axes),
// each node a card with level pips and a "now → next" preview — grouped by the node's STAT, so
// future nodes join the right wing automatically. Reads the reactive save store; all actions
// go through meta (molt / buyAscendantNode).

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { ACCOUNT_CURRENCY } from '../core/currencies';
import { PRESTIGE } from '../core/prestige';
import { formatPower } from '../core/power';
import type { DoctrineWarp } from '../core/doctrines';
import { ASCENDANT_NODES } from '../core/ascendant';
import type { AscendantStat } from '../core/ascendant';
import { CurrencyIcon } from './components/CurrencyIcon';
import { ProgressBar } from './components/ProgressBar';
import { Popup } from './components/Popup';
import { drawCutsceneFrame } from '../render/cutsceneScenes';

const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The chamber's palette — the prestige system's viral identity, fed to the molt tableau. */
const CHAMBER_THEME = { body: '#3f2a3a', glow: '#e6a2ff', accent: '#ffd24d' };

/** Which WING a node belongs to, derived from its STAT — new nodes auto-join the right wing. */
const WING_OF: Record<AscendantStat, 'dominion' | 'economy' | 'axes'> = {
  damageMult: 'dominion', integrityMult: 'dominion',
  shardGainMult: 'economy', coreGainMult: 'economy', biomassMult: 'economy',
  lootGainMult: 'economy', lootQualityMult: 'economy', cellGainMult: 'economy',
  masteryXpMult: 'axes', endlessBonusMult: 'axes', essenceGainMult: 'axes', matGainMult: 'axes',
  antigenGainMult: 'axes', heroMasteryXpMult: 'axes', dailyBonusMult: 'axes', rushBonusMult: 'axes',
};
const WINGS: { id: 'dominion' | 'economy' | 'axes'; title: string; icon: string; blurb: string }[] = [
  { id: 'dominion', title: 'Dominion', icon: '⚔', blurb: 'Permanent combat strength — damage and the Nucleus itself.' },
  { id: 'economy', title: 'Economy Engine', icon: '◆', blurb: 'The re-climb accelerators — cores, biomass, loot, and the mint.' },
  { id: 'axes', title: 'Income Axes', icon: '⌬', blurb: 'One lever per late-game currency — every system pays more.' },
];

/** The live chamber canvas — the molt tableau breathing behind the decision. Pauses when the
 *  tab hides; a single still under prefers-reduced-motion (the WorldStatus hygiene rules). */
function ChamberCanvas(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let raf = 0;
    const t0 = performance.now();
    const size = (): void => {
      cv.width = Math.max(1, Math.round(cv.clientWidth * dpr));
      cv.height = Math.max(1, Math.round(cv.clientHeight * dpr));
    };
    const paint = (t: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCutsceneFrame(ctx, cv.width / dpr, cv.height / dpr, { painter: 'molt', t, theme: CHAMBER_THEME, prev: null, fade: 1 });
    };
    size();
    const ro = new ResizeObserver(() => { size(); if (reducedMotion) paint(5.8); });
    ro.observe(cv);
    if (reducedMotion) {
      paint(5.8); // the painter's beauty frame
      return () => ro.disconnect();
    }
    const loop = (now: number): void => {
      if (!document.hidden) paint(((now - t0) / 1000) % 18); // the shed loops — the chamber never finishes molting
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} className="molt-canvas" aria-hidden />;
}

/** The MOLT CEREMONY — shed, mint the cells (count-up on the heartbeat), seal the new
 *  multiplier. Fullscreen via Popup; click or Continue dismisses; auto-seals after its hold. */
function MoltCeremony({ gain, multBefore, multAfter, moltNo, onDone }: {
  gain: number; multBefore: number; multAfter: number; moltNo: number; onDone: () => void;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [minted, setMinted] = useState(0);
  const [sealed, setSealed] = useState(false);
  const doneRef = useRef(false);
  const finish = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // The mint count-up: cells tick in on a heartbeat cadence after the shed breath.
  useEffect(() => {
    audio.cue('cin_rumble');
    const start = window.setTimeout(() => {
      let n = 0;
      const step = Math.max(1, Math.round(gain / 14)); // ≤ ~14 ticks regardless of size
      const tick = window.setInterval(() => {
        n = Math.min(gain, n + step);
        setMinted(n);
        audio.cue('cin_heart');
        if (n >= gain) {
          window.clearInterval(tick);
          window.setTimeout(() => { setSealed(true); audio.cue('cin_bloom'); }, 700);
        }
      }, 190);
    }, reducedMotion ? 100 : 1400);
    return () => window.clearTimeout(start);
  }, [gain]);

  // Auto-seal exit — the ceremony never traps the player.
  useEffect(() => {
    if (!sealed) return undefined;
    const t = window.setTimeout(finish, 5200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish is a stable ref-guarded closure
  }, [sealed]);

  // The chamber projector, running the shed from t=0 (the actual molt, this time for real).
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const size = (): void => {
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
    };
    size();
    window.addEventListener('resize', size);
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCutsceneFrame(ctx, cv.width / dpr, cv.height / dpr, {
        painter: 'molt', t: reducedMotion ? 5.8 : (now - t0) / 1000, theme: CHAMBER_THEME, prev: null, fade: 1,
      });
      if (!reducedMotion) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, []);

  return (
    <Popup>
      <div className="molt-ceremony" role="dialog" aria-label={`Molt ${moltNo} complete`} onClick={() => sealed && finish()}>
        <canvas ref={canvasRef} className="molt-ceremony-canvas" aria-hidden />
        <div className="molt-ceremony-copy">
          <div className="intro-eyebrow">◬ MOLT {moltNo}</div>
          <div className={`molt-ceremony-cells${minted > 0 ? ' is-live' : ''}`}>
            +{minted} <CurrencyIcon id="ascendantCells" size={26} title="" />
          </div>
          <div className="molt-ceremony-k">ASCENDANT CELLS MINTED</div>
          {sealed && (
            <>
              <div className="molt-ceremony-mult">
                ×{multBefore.toFixed(2)} <span className="molt-arrow" aria-hidden>→</span> <b>×{multAfter.toFixed(2)}</b> global damage
              </div>
              <div className="molt-ceremony-hint">The engine resets. Everything you ARE — stars, mastery, gear, the Tree — walks into the next cycle with you.</div>
              <button className="primary molt-ceremony-continue" onClick={finish}>Begin the next cycle ▸</button>
            </>
          )}
        </div>
      </div>
    </Popup>
  );
}

/** One vow's risk, humanized from its warp (the ledger never shows raw multipliers). */
function warpRisk(warp: DoctrineWarp): string {
  const parts: string[] = [];
  const pct = (v: number): string => `${v >= 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`;
  if (warp.hpMult) parts.push(`${pct(warp.hpMult)} enemy HP`);
  if (warp.speedMult) parts.push(`${pct(warp.speedMult)} enemy speed`);
  if (warp.damageMult) parts.push(`${pct(warp.damageMult)} enemy damage`);
  if (warp.countMult) parts.push(`${pct(warp.countMult)} spawns`);
  if (warp.bountyMult) parts.push(`${pct(warp.bountyMult)} biomass`);
  if (warp.eliteChance) parts.push(`+${Math.round(warp.eliteChance * 100)}% elites`);
  if (warp.scalingRateMult) parts.push(`${pct(warp.scalingRateMult)} ramp`);
  return parts.join(' · ');
}

export function PrestigePanel(): JSX.Element {
  meta.use(); // re-render when the save changes
  const p = meta.prestigeView();
  const tree = meta.ascendantNodes();
  const vv = meta.vowsView();
  const banked = meta.get().shards;
  const [confirming, setConfirming] = useState(false);
  const [breaking, setBreaking] = useState<string | null>(null); // vow id pending its no-refund confirm
  const [ceremony, setCeremony] = useState<{ gain: number; multBefore: number; multAfter: number; moltNo: number } | null>(null);

  const beginMolt = (): void => {
    if (!p.canMolt) return;
    audio.cue('ui');
    setConfirming(true);
  };
  const confirmMolt = (): void => {
    const snapshot = { gain: p.gain, multBefore: p.mult, multAfter: p.multAfter, moltNo: p.molts + 1 };
    setConfirming(false);
    if (meta.molt()) {
      music.stinger('prestige'); // ascension owns its musical moment (audio/music.ts STINGERS)
      setCeremony(snapshot);
    }
  };

  // Power now → right after the Molt (the Imprint's kept levels + the new cells) — computed only
  // while the confirm is open; the same builder as the mint, so the preview IS the outcome.
  const powerPreview = confirming ? meta.moltPowerPreview() : null;
  const imprintTip = `Molt Imprint: every Molt you complete lets the next one keep +${+(PRESTIGE.molt.imprintPerMolt * 100).toFixed(2)}% of each Genome upgrade's levels (rounded), up to ${Math.round(PRESTIGE.molt.imprintMax * 100)}%. The cheap bottom of each ladder survives; the dear top sheds.`;

  const keeps: string[] = ['Tower & Hero Stars', 'Mastery levels, titles & lore', 'Equipment + materials', 'Tower / Hero Shards', 'Gene Archive levels', 'Loot queue & Vault', 'Collections & achievements', 'THE ASCENDANT TREE'];

  return (
    <div className="molt-hq">
      {/* ── The chamber — the organism mid-shed, wearing the numbers that matter ── */}
      <div className="molt-chamber" data-tour="molt-chamber">
        <ChamberCanvas />
        <div className="molt-chamber-grade" aria-hidden />
        <div className="molt-chamber-head">
          <span className="molt-eyebrow">◬ ASCENSION · THE MOLT</span>
          <span className="molt-chips">
            <span className="molt-chip" title="Spendable Ascendant Cells"><CurrencyIcon id="ascendantCells" size={13} title="" /> {p.cells}</span>
            <span className="molt-chip" title="Lifetime cells minted (drives the multiplier)">{p.lifetimeCells} lifetime</span>
            <span className="molt-chip" title="Molts completed">MOLT {p.molts}</span>
          </span>
        </div>
        <div className="molt-chamber-mult">
          <span className="molt-mult-now">×{p.mult.toFixed(2)}</span>
          {p.gain > 0 && (
            <>
              <span className="molt-arrow" aria-hidden>→</span>
              <span className="molt-mult-after">×{p.multAfter.toFixed(2)}</span>
            </>
          )}
          <span className="molt-mult-k">permanent global damage</span>
        </div>
      </div>

      {/* ── The decision rail — mint, gate, manifest, the button ── */}
      <div className="molt-decision">
        <div className="molt-mint">
          <div className="molt-mint-head">
            <span className="molt-mint-gain">+{p.gain} <CurrencyIcon id="ascendantCells" size={16} title="" /></span>
            <span className="molt-mint-k">minted if you Molt now</span>
          </div>
          <div className="molt-mint-cycle">This cycle: <b>{Math.floor(p.cycleShards).toLocaleString()}</b> {ACCOUNT_CURRENCY.name} earned</div>
          {p.shardsReady ? (
            <div className="molt-next">
              <div className="molt-next-row">
                <span>Next cell at {p.nextCellNeed.toLocaleString()}</span>
                <span>{Math.round(p.nextCellProgress * 100)}%</span>
              </div>
              <ProgressBar value={p.nextCellProgress} max={1} height={6} color="var(--viral)" label="progress to the next Ascendant Cell" />
              <div className="molt-next-hint">Diminishing √ mint — each extra cell costs more of the cycle. Molting sooner cycles faster; holding mints bigger.</div>
            </div>
          ) : (
            <div className="molt-next">
              <div className="molt-next-row">
                <span>Mint opens at +{PRESTIGE.molt.minCells} cells</span>
                <span>{Math.round(p.mintProgress * 100)}%</span>
              </div>
              <ProgressBar value={p.mintProgress} max={1} height={6} color="var(--viral)" label="progress toward an offerable Molt" />
            </div>
          )}
        </div>

        {/* Campaign gate — depth earns prestige; never a surprise. */}
        <div className={`molt-gate ${p.campaignMet ? 'is-met' : 'is-locked'}`}
          title={`Prestige is gated on Campaign depth: the first Molt at Stage 10, each Molt after +3 stages (linear). Current requirement: clear Stage ${p.campaignReq}.`}>
          <div className="molt-gate-h">
            <span>🗺 Campaign Gate</span>
            <span className="molt-gate-v">
              {p.campaignMet
                ? <><b>✓</b> Stage {p.campaignReq} cleared</>
                : <>Stage <b>{p.campaignStage}</b> / {p.campaignReq}</>}
            </span>
          </div>
          <ProgressBar value={p.campaignProgress} max={1} height={6} color="var(--viral)" label="campaign gate progress" />
          {!p.campaignMet && (
            <div className="molt-gate-hint">Clear Campaign Stage <b>{p.campaignReq}</b> to unlock your {p.molts === 0 ? 'first' : 'next'} Molt.</div>
          )}
        </div>

        {/* ── MOLT VOWS (docs/VOWS.md) — the wager rail: handicap the whole next cycle, multiply
            the next mint. Arm costs sink banked Cores NOW and never refund (not even by molting). ── */}
        <div className="molt-vows" data-tour="molt-vows">
          <div className="molt-vows-h">
            <span className="molt-vows-t">⛧ MOLT VOWS <i>· the wager</i></span>
            <span className="molt-vows-sum">
              {vv.armed.length}/{vv.slots} sworn{vv.yieldProduct > 1 && <> · <b>×{vv.yieldProduct.toFixed(2)}</b> next mint</>}
            </span>
          </div>
          {vv.vows.map(({ def, armed }) => {
            const cost = vv.nextCost;
            const canArm = !armed && cost !== null && banked >= cost;
            return (
              <div className={`molt-vow${armed ? ' is-armed' : ''}`} key={def.id}>
                <span className="molt-vow-icon" aria-hidden>{def.icon}</span>
                <span className="molt-vow-body">
                  <span className="molt-vow-name">{def.name}</span>
                  <span className="molt-vow-risk">{warpRisk(def.warp)} <i>every run this cycle</i></span>
                </span>
                <span className="molt-vow-side">
                  <span className="molt-vow-yield">×{def.cellYieldMult.toFixed(2)} cells</span>
                  {armed
                    ? <button className="molt-vow-break" onClick={() => { audio.cue('ui'); setBreaking(def.id); }}>Break…</button>
                    : cost === null
                      ? <span className="molt-vow-full">board full</span>
                      : <button className="molt-vow-arm" disabled={!canArm} title={canArm ? `Swear this vow for ${cost.toLocaleString()} ${ACCOUNT_CURRENCY.name} (never refunded)` : `Needs ${cost.toLocaleString()} banked ${ACCOUNT_CURRENCY.name}`}
                          onClick={() => { if (meta.armVow(def.id)) audio.cue('power'); }}>
                          Swear — {cost.toLocaleString()} <CurrencyIcon id="genomeCores" size={11} title="" />
                        </button>}
                </span>
              </div>
            );
          })}
          <div className="molt-vows-note">
            Sworn vows warp <b>every run of this cycle</b> (dailies stay fair) and multiply the Ascendant Cell
            mint at your NEXT Molt. Costs are consumed on the oath — breaking a vow refunds nothing.
          </div>
        </div>

        {/* The manifest — what a Molt costs, what it can never touch. */}
        <div className="molt-manifest">
          <div className="molt-mf molt-mf-reset">
            <div className="molt-mf-h">▼ THE MOLT SHEDS</div>
            <ul>
              <li><b>{banked.toLocaleString()}</b> banked {ACCOUNT_CURRENCY.name}</li>
              <li><b>{p.upgradeLevels}</b> Genome upgrade levels</li>
            </ul>
          </div>
          <div className="molt-mf molt-mf-keep">
            <div className="molt-mf-h">◆ THE MOLT KEEPS</div>
            <ul>
              {p.upgradeLevelsKept > 0 && (
                <li title={imprintTip}><b>{p.upgradeLevelsKept}</b> Genome upgrade levels — the Molt Imprint ({Math.round(p.imprint * 100)}%)</li>
              )}
              {keeps.map((k) => <li key={k}>{k}</li>)}
            </ul>
          </div>
        </div>

        <button className="primary molt-cta" disabled={!p.canMolt} onClick={beginMolt}>
          {p.canMolt
            ? <>◬ Molt — mint +{p.gain} Cells</>
            : !p.campaignMet
              ? `Molt — reach Campaign Stage ${p.campaignReq}`
              : `Molt — earn more ${ACCOUNT_CURRENCY.name} first`}
        </button>
      </div>

      {/* ── The Ascendant Tree — three wings of permanent levers ── */}
      <div className="asc-tree">
        <div className="asc-tree-head">
          <span className="asc-tree-title">✸ THE ASCENDANT TREE</span>
          <span className="asc-tree-bal"><CurrencyIcon id="ascendantCells" size={14} title="" /> {tree.cells} to spend · {p.spentCells} invested</span>
        </div>
        {WINGS.map((wing) => {
          const nodes = tree.nodes.filter((n) => WING_OF[ASCENDANT_NODES.find((d) => d.id === n.id)!.effect.stat] === wing.id);
          if (nodes.length === 0) return null;
          return (
            <div className={`asc-wing is-${wing.id}`} key={wing.id}>
              <div className="asc-wing-h">
                <span className="asc-wing-t"><i aria-hidden>{wing.icon}</i> {wing.title}</span>
                <span className="asc-wing-b">{wing.blurb}</span>
              </div>
              <div className="asc-grid">
                {nodes.map((n) => {
                  const def = ASCENDANT_NODES.find((d) => d.id === n.id)!;
                  const nowPct = Math.round(def.effect.perLevel * n.level * 100);
                  const nextPct = Math.round(def.effect.perLevel * (n.level + 1) * 100);
                  const maxed = n.cost === null;
                  return (
                    <div className={`asc-node${n.affordable ? ' is-afford' : ''}${maxed ? ' is-maxed' : ''}`} key={n.id}>
                      <div className="asc-node-top">
                        <span className="asc-node-name">{def.name.replace(/^Ascendant /, '')}</span>
                        <span className="asc-pips" aria-label={`Level ${n.level} of ${n.maxLevel}`}>
                          {Array.from({ length: n.maxLevel }, (_, i) => <i key={i} className={i < n.level ? 'on' : ''} />)}
                        </span>
                      </div>
                      <div className="asc-node-desc">{n.desc}</div>
                      <div className="asc-node-foot">
                        <span className="asc-node-now">
                          {maxed
                            ? <b>+{nowPct}% · MAX</b>
                            : n.level > 0
                              ? <>+{nowPct}% <span className="molt-arrow" aria-hidden>→</span> <b>+{nextPct}%</b></>
                              : <>next <b>+{nextPct}%</b></>}
                        </span>
                        <button
                          className={`asc-buy${n.affordable ? ' is-afford' : ''}`}
                          disabled={maxed || !n.affordable}
                          onClick={() => { if (meta.buyAscendantNode(n.id)) audio.cue('power'); }}
                        >
                          {maxed ? 'MAX' : <>{n.cost} <CurrencyIcon id="ascendantCells" size={12} title="" /></>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── The confirm — an in-app promise, not a browser dialog ── */}
      {confirming && (
        <Popup>
          <div className="molt-confirm-veil" onClick={() => setConfirming(false)}>
            <div className="molt-confirm" role="dialog" aria-label="Confirm Molt" onClick={(e) => e.stopPropagation()}>
              <div className="intro-eyebrow">◬ CONFIRM THE MOLT</div>
              <div className="molt-confirm-line">
                Mint <b>+{p.gain}</b> <CurrencyIcon id="ascendantCells" size={14} title="" /> and rise to <b>×{p.multAfter.toFixed(2)}</b> global damage.
              </div>
              {vv.armed.length > 0 && (
                <div className="molt-confirm-vows">
                  ⛧ Honours <b>{vv.armed.length}</b> sworn vow{vv.armed.length > 1 ? 's' : ''} — this mint already carries the
                  {' '}<b>×{vv.yieldProduct.toFixed(2)}</b> wager ({vv.armed.map((v) => v.name).join(' · ')}). The oaths clear with the Molt.
                </div>
              )}
              <div className="molt-confirm-cost">
                Sheds <b>{banked.toLocaleString()} {ACCOUNT_CURRENCY.name}</b> and <b>{p.upgradeLevels} Genome upgrade levels</b>{p.upgradeLevelsKept > 0 && <> (the Molt Imprint keeps <b>{p.upgradeLevelsKept}</b>)</>}. Everything else is kept — including the Ascendant Tree.
                {powerPreview && <> Power <b>{formatPower(powerPreview.before)}</b> → <b>{formatPower(powerPreview.after)}</b> — the re-climb starts there.</>}
              </div>
              <div className="molt-confirm-row">
                <button className="molt-cancel" onClick={() => setConfirming(false)}>Not yet</button>
                <button className="primary" onClick={confirmMolt}>◬ Molt now</button>
              </div>
            </div>
          </div>
        </Popup>
      )}

      {/* Break-vow confirm — the cost is already burnt; make the forfeit unmistakable. */}
      {breaking && (() => {
        const def = vv.armed.find((v) => v.id === breaking);
        return def ? (
          <Popup>
            <div className="molt-confirm-veil" onClick={() => setBreaking(null)}>
              <div className="molt-confirm" role="dialog" aria-label="Break vow" onClick={(e) => e.stopPropagation()}>
                <div className="intro-eyebrow">⛧ BREAK THE {def.name.toUpperCase()}?</div>
                <div className="molt-confirm-line">The handicap lifts from your next run — and the wager drops to
                  {' '}<b>×{(vv.yieldProduct / def.cellYieldMult).toFixed(2)}</b>.</div>
                <div className="molt-confirm-cost">The {ACCOUNT_CURRENCY.name} paid to swear it are <b>forfeit</b> — breaking refunds nothing.</div>
                <div className="molt-confirm-row">
                  <button className="molt-cancel" onClick={() => setBreaking(null)}>Keep the vow</button>
                  <button className="primary" onClick={() => { meta.disarmVow(breaking); setBreaking(null); }}>Break it</button>
                </div>
              </div>
            </div>
          </Popup>
        ) : null;
      })()}

      {ceremony && <MoltCeremony {...ceremony} onDone={() => setCeremony(null)} />}
    </div>
  );
}
