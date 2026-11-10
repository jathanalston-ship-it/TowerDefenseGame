// NUCLEUS CHAMBERS (docs/NUCLEUS.md §UI) — the Hive Nucleus's own graft console, mounted at the
// top of the Mulligan Lab (the pillar's hive twin). Three chamber cards (organ triples with the
// no-partial-activation rule), a live mutation PREVIEW of the organism the run will render, the
// organ conservatory (grow with Gene Essence → slot → level), and the sealed chambers' trial
// checklists — every requirement ALWAYS shown with live progress (the anticipation rule).
// All reads via meta selectors; all writes via the guarded meta pipeline. Menu-only.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { motionPrefs, onMotionPrefs, resolveMotion } from '../state/prefs';
import {
  NUCLEUS_CATEGORY_LABEL, NUCLEUS_CHAMBERS, NUCLEUS_MARK,
  chamberAdaptation, isChamberActive, nucleusRegistry, organChamber, organGrowCost,
  organLevelCap, organUpgradeCost,
} from '../core/nucleus';
import type { NucleusCategory, NucleusOrgan } from '../core/nucleus';
import { MULLIGAN_RARITY } from '../core/mulligan';
import { COMBAT_CLASSES } from '../core/combatClass';
import { drawKit } from '../render/nucleusDress';
import { CurrencyIcon } from './components/CurrencyIcon';
import { audio } from '../audio/sound';

/** The living preview — the exact mutation kit the in-run renderer will draw, idle-animating on
 *  a small heart. Static single frame under prefers-reduced-motion. */
function NucleusPreview({ mutations }: { mutations: string[] }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = 180 * dpr;
    cv.height = 150 * dpr;
    const draw = (t: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, 180, 150);
      const x = 90, y = 78;
      const beat = 1 + 0.06 * Math.sin(t * 3);
      const R = 26 * beat;
      const glow = ctx.createRadialGradient(x, y, 2, x, y, R * 2.2);
      glow.addColorStop(0, 'rgba(255, 154, 122, 0.35)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 180, 150);
      const body = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, R * 0.62);
      body.addColorStop(0, '#ff8ba0');
      body.addColorStop(1, '#a5303f');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, R * 0.58, 0, Math.PI * 2);
      ctx.fill();
      drawKit(ctx, { mutations: mutations as never, crowns: 0 }, x, y, R, beat, t);
    };
    let raf = 0;
    let visible = true;
    let elapsed = 0;
    let previous: number | null = null;
    let prefs = motionPrefs();
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const loop = (now: number): void => {
      if (previous !== null) elapsed += (now - previous) / 1000;
      previous = now;
      draw(elapsed);
      raf = requestAnimationFrame(loop);
    };
    const sync = (): void => {
      cancelAnimationFrame(raf);
      previous = null;
      if (!visible || document.hidden) return;
      if (resolveMotion(prefs, media?.matches ?? false).motion === 0) draw(0);
      else raf = requestAnimationFrame(loop);
    };
    draw(0);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer?.observe(cv);
    const offPrefs = onMotionPrefs((next) => { prefs = next; sync(); });
    media?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      offPrefs();
      media?.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [mutations.join(',')]);
  return <canvas ref={ref} className="ncl-preview" style={{ width: 180, height: 150 }} aria-label="Nucleus mutation preview" />;
}

const CATEGORIES: (NucleusCategory | 'all')[] = ['all', 'metabolic', 'membrane', 'dominion'];

export function NucleusChambers(): JSX.Element {
  const save = meta.use();
  const nucleus = save.nucleus;
  const resolved = meta.nucleusResolved();
  const [armed, setArmed] = useState<{ chamber: number; slot: number } | null>(null);
  const [cat, setCat] = useState<NucleusCategory | 'all'>('all');
  const rootRef = useRef<HTMLDivElement>(null);
  const returnSocket = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (returnSocket.current === null) return;
    rootRef.current?.querySelector<HTMLElement>(`[data-nucleus-socket="${returnSocket.current}"]`)?.focus();
    returnSocket.current = null;
  }, [nucleus, armed]);
  const [confirmUnlock, setConfirmUnlock] = useState<number | null>(null); // 2-step on the Ichor spend

  const grow = (o: NucleusOrgan): void => { if (meta.growNucleusOrgan(o.id)) audio.cue('splice'); };
  const level = (o: NucleusOrgan): void => { if (meta.upgradeNucleusOrgan(o.id)) audio.cue('graftCrack'); };
  const slotIn = (o: NucleusOrgan): void => {
    if (!armed) return;
    const before = chamberAdaptation(meta.nucleus(), armed.chamber)?.tier;
    if (meta.setNucleusSlot(armed.chamber, armed.slot, o.id)) {
      returnSocket.current = `${armed.chamber}:${armed.slot}`;
      setArmed(null);
      const after = chamberAdaptation(meta.nucleus(), armed.chamber)?.tier;
      audio.cue(after === 'full' && before !== 'full' ? 'adapt' : 'graftSquelch');
    }
  };
  const clear = (chamber: number, slot: number): void => {
    if (meta.setNucleusSlot(chamber, slot, null)) {
      returnSocket.current = `${chamber}:${slot}`;
      audio.cue('select'); setArmed(null);
    }
  };
  const unlock = (chamber: number): void => {
    if (meta.unlockNucleusChamber(chamber)) { audio.cue('jackpot'); setConfirmUnlock(null); }
  };

  const organs = nucleusRegistry.all().filter((o) => cat === 'all' || o.category === cat);

  return (
    <div className="ncl" ref={rootRef}>
      <div className="ncl-head">
        <div>
          <div className="ncl-title">{NUCLEUS_MARK} Hive Nucleus</div>
          <div className="ncl-sub">
            The Nucleus grows its OWN organism — up to three chambers of three modifier organs each.
            A chamber does nothing until all three organs are grafted; matching classes awaken a
            Complete Adaptation. Every active organ visibly mutates the Hive in combat.
          </div>
        </div>
        <div className="ncl-vitals">
          <NucleusPreview mutations={resolved.mutations} />
          <span className="ncl-pow" title="The Nucleus's contribution to the Mulligan Power bucket">
            Nucleus Power <b>×{resolved.power.toFixed(2)}</b>
          </span>
        </div>
      </div>

      <div className="ncl-chambers">
        {Array.from({ length: NUCLEUS_CHAMBERS }, (_, c) => {
          if (c < nucleus.unlocked) {
            const active = isChamberActive(nucleus, c);
            const adapt = chamberAdaptation(nucleus, c);
            return (
              <div className={`ncl-chamber${active ? ' is-active' : ''}${adapt?.tier === 'full' ? ' is-adapted' : ''}`} key={c}>
                <div className="ncl-chamber-h">
                  <span className="ncl-chamber-name">Chamber {c + 1}</span>
                  {active
                    ? <span className="ncl-chamber-state on">AWAKE</span>
                    : <span className="ncl-chamber-state">DORMANT — fill all three organs</span>}
                </div>
                <div className="ncl-sockets">
                  {nucleus.chambers[c].map((id, s) => {
                    const def = id ? nucleusRegistry.get(id) : undefined;
                    const isArmed = armed?.chamber === c && armed?.slot === s;
                    if (def) {
                      const lvl = nucleus.grown[def.id]?.level ?? 1;
                      return (
                        <div className={`ncl-socket is-filled${isArmed ? ' is-arming' : ''}`} key={s} style={{ ['--rc' as string]: MULLIGAN_RARITY[def.rarity].color, ['--cc' as string]: COMBAT_CLASSES[def.cls].hex }}>
                          <button className="ncl-socket-body" data-nucleus-socket={`${c}:${s}`} aria-pressed={isArmed} aria-label={`Chamber ${c + 1}, socket ${s + 1}: ${def.name}, level ${lvl}. Select to replace`} onClick={() => setArmed(isArmed ? null : { chamber: c, slot: s })} title={`${def.name} — ${def.desc}`}>
                            <span className="ncl-socket-glyph">{COMBAT_CLASSES[def.cls].glyph}</span>
                            <span className="ncl-socket-name">{def.name}</span>
                            <span className="ncl-socket-lvl">L{lvl}</span>
                          </button>
                          <button className="ncl-socket-x" title="Extract organ" aria-label={`Extract ${def.name} from Chamber ${c + 1}, socket ${s + 1}`} onClick={() => clear(c, s)}>✕</button>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={s}
                        data-nucleus-socket={`${c}:${s}`}
                        aria-pressed={isArmed}
                        aria-label={`Chamber ${c + 1}, socket ${s + 1}: empty. Select to graft`}
                        className={`ncl-socket is-empty${isArmed ? ' is-arming' : ''}`}
                        onClick={() => setArmed(isArmed ? null : { chamber: c, slot: s })}
                        title="Graft an organ — click, then pick one from the conservatory below"
                      >
                        {isArmed ? 'pick an organ below…' : '+ Graft'}
                      </button>
                    );
                  })}
                </div>
                {adapt ? (
                  <div className={`ncl-adapt is-${adapt.tier}`} style={{ ['--cc' as string]: COMBAT_CLASSES[adapt.cls].hex }}>
                    {COMBAT_CLASSES[adapt.cls].glyph} <b>{adapt.adaptation.title}</b>
                    <span>{adapt.tier === 'full' ? adapt.adaptation.fullDesc : adapt.adaptation.minorDesc}</span>
                  </div>
                ) : (
                  <div className="ncl-adapt-hint">Match organ classes: 2 of a kind = minor adaptation · 3 = COMPLETE (and the Hive crests a crown).</div>
                )}
              </div>
            );
          }
          // ── Sealed chamber: the trial checklist, always visible, live progress ──
          const gate = meta.nucleusGate(c + 1);
          if (!gate) return null;
          const next = c === nucleus.unlocked; // only the NEXT chamber can be opened (sequential)
          return (
            <div className="ncl-chamber is-locked" key={c}>
              <div className="ncl-chamber-h">
                <span className="ncl-chamber-name">Chamber {c + 1}</span>
                <span className="ncl-chamber-state">🔒 SEALED</span>
              </div>
              <div className="ncl-gate-title">{gate.gate.title}</div>
              <p className="ncl-gate-blurb">{gate.gate.blurb}</p>
              <ul className="ncl-gate-reqs">
                {gate.rows.map((r) => (
                  <li key={r.req.id} className={r.met ? 'is-met' : ''}>
                    {r.met ? '✓' : '✗'} {r.req.label} <span>({r.text})</span>
                  </li>
                ))}
                {gate.gate.ichorCost > 0 && (
                  <li className={gate.ichorMet ? 'is-met' : ''}>
                    {gate.ichorMet ? '✓' : '✗'} Pay {gate.gate.ichorCost} <CurrencyIcon id="ichor" size={12} title="Ichor" /> Ichor
                    <span>(have {save.ichor.toLocaleString()})</span>
                  </li>
                )}
              </ul>
              {next && (confirmUnlock === c + 1 ? (
                <div className="ncl-gate-confirm">
                  <span>
                    {gate.gate.ichorCost > 0
                      ? <>Open Chamber {c + 1} for <b>{gate.gate.ichorCost}</b> <CurrencyIcon id="ichor" size={12} title="Ichor" /> Ichor? The trial is met — this is the Hive's crown.</>
                      : <>Open Chamber {c + 1}? The trial is met.</>}
                  </span>
                  <div className="ncl-gate-confirm-row">
                    <button onClick={() => setConfirmUnlock(null)}>Not yet</button>
                    <button className="primary ncl-gate-go" disabled={!gate.ready} onClick={() => unlock(c + 1)}>Open the chamber</button>
                  </div>
                </div>
              ) : (
                <button
                  className={`ncl-gate-btn${gate.ready ? ' is-ready' : ''}`}
                  disabled={!gate.ready}
                  onClick={() => setConfirmUnlock(c + 1)}
                  title={gate.ready ? 'Every requirement is met' : 'Meet every requirement above first'}
                >
                  {gate.ready ? '❖ Undertake the opening' : 'Requirements not yet met'}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── The organ conservatory: grow (Gene Essence) → slot into the armed socket → level ── */}
      <div className="ncl-shelf-h">
        <span className="ncl-shelf-title">Organ Conservatory</span>
        <div className="ncl-cats">
          {CATEGORIES.map((k) => (
            <button key={k} aria-pressed={cat === k} className={`ncl-cat${cat === k ? ' on' : ''}`} onClick={() => setCat(k)}>
              {k === 'all' ? 'All' : NUCLEUS_CATEGORY_LABEL[k]}
            </button>
          ))}
        </div>
        <span className="ncl-wallet" title="Gene Essence"><CurrencyIcon id="geneEssence" size={13} title="" /> {save.geneEssence.toLocaleString()}</span>
      </div>
      <div className="ncl-adapt-hint" role="status">
        {armed ? `Choose an organ below for Chamber ${armed.chamber + 1}, socket ${armed.slot + 1}.` : 'Select a socket above, then graft a grown organ below.'}
      </div>
      <div className={`ncl-shelf${armed ? ' is-arming' : ''}`}>
        {organs.map((o) => {
          const grown = nucleus.grown[o.id];
          const hostedIn = grown ? organChamber(nucleus, o.id) : null;
          const cap = organLevelCap(o);
          const upCost = grown ? organUpgradeCost(o, grown.level) : 0;
          return (
            <div
              className={`ncl-organ${grown ? ' is-grown' : ''}${hostedIn !== null ? ' is-hosted' : ''}`}
              key={o.id}
              style={{ ['--rc' as string]: MULLIGAN_RARITY[o.rarity].color, ['--cc' as string]: COMBAT_CLASSES[o.cls].hex }}
            >
              <div className="ncl-organ-h">
                <span className="ncl-organ-glyph" title={`${o.cls} — ${COMBAT_CLASSES[o.cls].role}`}>{COMBAT_CLASSES[o.cls].glyph}</span>
                <span className="ncl-organ-name">{o.name}</span>
                <span className="ncl-organ-rarity">{MULLIGAN_RARITY[o.rarity].label}</span>
              </div>
              <div className="ncl-organ-desc">{o.desc}</div>
              <div className="ncl-organ-meta">
                <span>{NUCLEUS_CATEGORY_LABEL[o.category]}</span>
                {grown && <span>L{grown.level}/{cap}</span>}
                {hostedIn !== null && <span className="ncl-organ-host">Chamber {hostedIn + 1}</span>}
              </div>
              <div className="ncl-organ-actions">
                {!grown ? (
                  <button
                    className="ncl-grow"
                    disabled={save.geneEssence < organGrowCost(o)}
                    onClick={() => grow(o)}
                    title={`Grow this organ permanently for ${organGrowCost(o).toLocaleString()} Gene Essence`}
                  >
                    Grow · <CurrencyIcon id="geneEssence" size={11} title="" /> {organGrowCost(o).toLocaleString()}
                  </button>
                ) : (
                  <>
                    {armed && <button className="primary ncl-slotin" aria-label={`Graft into Chamber ${armed.chamber + 1}, socket ${armed.slot + 1}: ${o.name}`} onClick={() => slotIn(o)}>Graft into Chamber {armed.chamber + 1}</button>}
                    {grown.level < cap && (
                      <button className="ncl-levelup" disabled={save.geneEssence < upCost} onClick={() => level(o)} title="Level this organ">
                        L{grown.level + 1} · <CurrencyIcon id="geneEssence" size={11} title="" /> {upCost.toLocaleString()}
                      </button>
                    )}
                    {grown.level >= cap && !armed && <span className="ncl-maxed">MAX</span>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
