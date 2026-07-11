// SYMBIOTE CHAMBER (docs/HERO-SYMBIOTES.md §UI) — one champion's graft console, mounted inside the
// Hero Lab's detail view. Three slot cards (organ triples with the no-partial-activation rule and
// per-slot Complete Hero Adaptations), the sealed slots' identity-trial checklists (every
// requirement ALWAYS shown with live progress — the anticipation rule), the resonance crown, a
// next-step recommendation line, and the organ conservatory (graft with Gene Essence → seat →
// level). Reuses the Nucleus console's ncl-* primitives wholesale (same interaction model: arm a
// seat, pick from the shelf). All reads via meta selectors; all writes via the guarded pipeline.

import { useState } from 'react';
import { meta } from '../state/meta';
import {
  SYMBIOTE_CATEGORY_LABEL, SYMBIOTE_MARK, SYMBIOTE_SEATS, SYMBIOTE_SLOTS,
  isSlotActive, slotAdaptation, symbioteGraftCost, symbioteLevelCap, symbioteRegistry,
  symbioteSeat, symbioteUpgradeCost,
} from '../core/heroSymbiote';
import type { HeroSymbioteState, SymbioteCategory, SymbioteOrgan } from '../core/heroSymbiote';
import { MULLIGAN_RARITY } from '../core/mulligan';
import { COMBAT_CLASSES } from '../core/combatClass';
import { HERO_DEFS } from '../core/config';
import type { HeroKind } from '../core/types';
import { CurrencyIcon } from './components/CurrencyIcon';
import { audio } from '../audio/sound';

const CATEGORIES: (SymbioteCategory | 'all')[] = ['all', 'offensive', 'utility', 'biological'];

/** The one next step that grows this hero's symbiosis — never an illegal move. */
function recommend(state: HeroSymbioteState, resonant: boolean): string {
  for (let s = 0; s < state.unlocked; s++) {
    const row = state.slots[s];
    const filled = row.filter((id) => id !== null).length;
    if (filled < SYMBIOTE_SEATS) {
      if (Object.keys(state.grown).length <= filled) return 'Graft a new organ in the conservatory below, then seat it.';
      const classes = row.filter((id): id is string => id !== null).map((id) => symbioteRegistry.get(id)?.cls);
      if (filled === 2 && classes[0] && classes[0] === classes[1]) {
        return `Seat a third ${classes[0]} organ in Slot ${s + 1} to awaken its COMPLETE HERO ADAPTATION.`;
      }
      return `Slot ${s + 1} is dormant — seat ${SYMBIOTE_SEATS - filled} more organ${SYMBIOTE_SEATS - filled > 1 ? 's' : ''}.`;
    }
  }
  if (state.unlocked < SYMBIOTE_SLOTS) return `Slot ${state.unlocked + 1} is sealed — meet its trial below to keep evolving.`;
  if (resonant) return 'Fully evolved — re-seat organ categories to tune WHICH resonance the organism sings.';
  return 'Level your seated organs — every level deepens the grafts and the Power they carry.';
}

export function SymbioteChamber({ kind }: { kind: HeroKind }): JSX.Element {
  const save = meta.use();
  const state = meta.heroSymbiote(kind);
  const resolved = meta.heroSymbioteResolved(kind);
  const def = HERO_DEFS[kind];
  const [armed, setArmed] = useState<{ slot: number; seat: number } | null>(null);
  const [cat, setCat] = useState<SymbioteCategory | 'all'>('all');
  const [confirmUnlock, setConfirmUnlock] = useState<number | null>(null); // 2-step on the Ichor spend

  const graft = (o: SymbioteOrgan): void => { if (meta.graftHeroSymbiote(kind, o.id)) audio.cue('splice'); };
  const level = (o: SymbioteOrgan): void => { if (meta.upgradeHeroSymbiote(kind, o.id)) audio.cue('graftCrack'); };
  const seatIn = (o: SymbioteOrgan): void => {
    if (!armed) return;
    const before = slotAdaptation(meta.heroSymbiote(kind), armed.slot)?.tier;
    if (meta.setHeroSymbioteSeat(kind, armed.slot, armed.seat, o.id)) {
      setArmed(null);
      const after = slotAdaptation(meta.heroSymbiote(kind), armed.slot)?.tier;
      audio.cue(after === 'full' && before !== 'full' ? 'adapt' : 'graftSquelch');
    }
  };
  const clear = (slot: number, seat: number): void => {
    if (meta.setHeroSymbioteSeat(kind, slot, seat, null)) { audio.cue('select'); setArmed(null); }
  };
  const unlock = (slot: number): void => {
    if (meta.unlockHeroSymbioteSlot(kind, slot)) { audio.cue('jackpot'); setConfirmUnlock(null); }
  };

  const organs = symbioteRegistry.all().filter((o) => cat === 'all' || o.category === cat);

  return (
    <div className="ncl syl" style={{ ['--hc' as string]: def.color }}>
      <div className="ncl-head">
        <div>
          <div className="ncl-title">{SYMBIOTE_MARK} {def.name}&rsquo;s Symbiotes</div>
          <div className="ncl-sub">
            Permanently grafted living organs that change HOW {def.name} fights — never gear stats.
            Each slot seats three organs and does nothing until full; matching classes awaken a
            Complete Hero Adaptation, and all three slots together RESONATE.
          </div>
        </div>
        <div className="ncl-vitals">
          {resolved.resonance ? (
            <span className="ncl-pow syl-res" title={resolved.resonance.desc}>
              ❖ <b>{resolved.resonance.name}</b>
            </span>
          ) : (
            <span className="ncl-pow" title="Active slots — the host's visible mutation stage">
              Symbiosis <b>{resolved.slotsActive}/{SYMBIOTE_SLOTS}</b>
            </span>
          )}
          <span className="ncl-pow" title="This champion's contribution to the Mulligan Power bucket">
            Graft Power <b>×{resolved.power.toFixed(2)}</b>
          </span>
        </div>
      </div>

      <div className="ncl-adapt-hint">▸ {recommend(state, resolved.resonance !== null)}</div>

      <div className="ncl-chambers">
        {Array.from({ length: SYMBIOTE_SLOTS }, (_, s) => {
          if (s < state.unlocked) {
            const active = isSlotActive(state, s);
            const adapt = slotAdaptation(state, s);
            return (
              <div className={`ncl-chamber${active ? ' is-active' : ''}${adapt?.tier === 'full' ? ' is-adapted' : ''}`} key={s}>
                <div className="ncl-chamber-h">
                  <span className="ncl-chamber-name">Slot {s + 1}</span>
                  {active
                    ? <span className="ncl-chamber-state on">GRAFTED</span>
                    : <span className="ncl-chamber-state">DORMANT — seat all three organs</span>}
                </div>
                <div className="ncl-sockets">
                  {state.slots[s].map((id, seat) => {
                    const organ = id ? symbioteRegistry.get(id) : undefined;
                    const isArmed = armed?.slot === s && armed?.seat === seat;
                    if (organ) {
                      const lvl = state.grown[organ.id]?.level ?? 1;
                      return (
                        <div className="ncl-socket is-filled" key={seat} style={{ ['--rc' as string]: MULLIGAN_RARITY[organ.rarity].color, ['--cc' as string]: COMBAT_CLASSES[organ.cls].hex }}>
                          <button className="ncl-socket-body" onClick={() => setArmed(isArmed ? null : { slot: s, seat })} title={`${organ.name} — ${organ.desc}`}>
                            <span className="ncl-socket-glyph">{COMBAT_CLASSES[organ.cls].glyph}</span>
                            <span className="ncl-socket-name">{organ.name}</span>
                            <span className="ncl-socket-lvl">L{lvl}</span>
                          </button>
                          <button className="ncl-socket-x" title="Extract organ" onClick={() => clear(s, seat)}>✕</button>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={seat}
                        className={`ncl-socket is-empty${isArmed ? ' is-arming' : ''}`}
                        onClick={() => setArmed(isArmed ? null : { slot: s, seat })}
                        title="Seat an organ — click, then pick one from the conservatory below"
                      >
                        {isArmed ? 'pick an organ below…' : '+ Seat'}
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
                  <div className="ncl-adapt-hint">Match organ classes: 2 of a kind = minor adaptation · 3 = COMPLETE (a new combat capability).</div>
                )}
              </div>
            );
          }
          // ── Sealed slot: the identity trial, always visible, live progress ──
          const gate = meta.heroSymbioteGate(kind, s + 1);
          if (!gate) return null;
          const next = s === state.unlocked; // only the NEXT slot can open (sequential)
          return (
            <div className="ncl-chamber is-locked" key={s}>
              <div className="ncl-chamber-h">
                <span className="ncl-chamber-name">Slot {s + 1}</span>
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
                <li className={gate.ichorMet ? 'is-met' : ''}>
                  {gate.ichorMet ? '✓' : '✗'} Pay {gate.gate.ichorCost} <CurrencyIcon id="ichor" size={12} title="Ichor" /> Ichor
                  <span>(have {save.ichor.toLocaleString()})</span>
                </li>
              </ul>
              {next && (confirmUnlock === s + 1 ? (
                <div className="ncl-gate-confirm">
                  <span>
                    Open Slot {s + 1} for <b>{gate.gate.ichorCost}</b> <CurrencyIcon id="ichor" size={12} title="Ichor" /> Ichor?
                    The trial is met — the graft is permanent.
                  </span>
                  <div className="ncl-gate-confirm-row">
                    <button onClick={() => setConfirmUnlock(null)}>Not yet</button>
                    <button className="primary ncl-gate-go" disabled={!gate.ready} onClick={() => unlock(s + 1)}>Take the graft</button>
                  </div>
                </div>
              ) : (
                <button
                  className={`ncl-gate-btn${gate.ready ? ' is-ready' : ''}`}
                  disabled={!gate.ready}
                  onClick={() => setConfirmUnlock(s + 1)}
                  title={gate.ready ? 'Every requirement is met' : 'Meet every requirement above first'}
                >
                  {gate.ready ? '❖ Undertake the trial' : 'Requirements not yet met'}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── The organ conservatory: graft (Gene Essence, per host) → seat into the armed socket → level ── */}
      <div className="ncl-shelf-h">
        <span className="ncl-shelf-title">Organ Conservatory</span>
        <div className="ncl-cats">
          {CATEGORIES.map((k) => (
            <button key={k} className={`ncl-cat${cat === k ? ' on' : ''}`} onClick={() => setCat(k)}>
              {k === 'all' ? 'All' : SYMBIOTE_CATEGORY_LABEL[k]}
            </button>
          ))}
        </div>
        <span className="ncl-wallet" title="Gene Essence"><CurrencyIcon id="geneEssence" size={13} title="" /> {save.geneEssence.toLocaleString()}</span>
      </div>
      <div className={`ncl-shelf${armed ? ' is-arming' : ''}`}>
        {organs.map((o) => {
          const grown = state.grown[o.id];
          const seatAt = grown ? symbioteSeat(state, o.id) : null;
          const cap = symbioteLevelCap(o);
          const upCost = grown ? symbioteUpgradeCost(o, grown.level) : 0;
          return (
            <div
              className={`ncl-organ${grown ? ' is-grown' : ''}${seatAt !== null ? ' is-hosted' : ''}`}
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
                <span>{SYMBIOTE_CATEGORY_LABEL[o.category]}</span>
                {grown && <span>L{grown.level}/{cap}</span>}
                {seatAt !== null && <span className="ncl-organ-host">Slot {seatAt.slot + 1}</span>}
              </div>
              <div className="ncl-organ-actions">
                {!grown ? (
                  <button
                    className="ncl-grow"
                    disabled={save.geneEssence < symbioteGraftCost(o)}
                    onClick={() => graft(o)}
                    title={`Graft this organ into ${def.name} permanently for ${symbioteGraftCost(o).toLocaleString()} Gene Essence`}
                  >
                    Graft · <CurrencyIcon id="geneEssence" size={11} title="" /> {symbioteGraftCost(o).toLocaleString()}
                  </button>
                ) : (
                  <>
                    {armed && <button className="primary ncl-slotin" onClick={() => seatIn(o)}>Seat into Slot {armed.slot + 1}</button>}
                    {grown.level < cap && (
                      <button className="ncl-levelup" disabled={save.geneEssence < upCost} onClick={() => level(o)} title="Level this graft">
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
