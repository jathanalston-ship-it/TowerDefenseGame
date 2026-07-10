// MULLIGAN LAB (docs/MULLIGANS.md §UI) — the graft wing. A master–detail bench in the Tower Lab's
// visual language: the HOST RAIL (one row per tower, organism status at a glance) selects one
// specimen for the SHOWCASE — a living graft chamber (the actual procedurally-generated organism
// idle-animating on its turret), the organism's identity + resolved package, the three GRAFT SITES
// (equip / upgrade / ascend / clear, every spend Power-previewed), and the sequenced-modifier
// library. All reads flow through mulliganLabView; all writes through the meta pipeline. Menu-only —
// never touches the sim.

import { useEffect, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { TOWER_DEFS } from '../core/config';
import type { TowerKind } from '../core/types';
import { mulliganLabView } from '../state/mulliganLabModel';
import type { OwnedModifier, SlotView } from '../state/mulliganLabModel';
import { MULLIGAN_RARITY, resolveMulligan } from '../core/mulligan';
import type { MulliganReforgeMod } from '../core/mulliganReforge';
import { REFORGE_RARITY } from '../core/mulliganReforge';
import { angleForSegment, drawReforgeWheel } from '../render/reforgeWheel';
import { REFORGE_MODS } from '../core/mulliganReforge';
import { CURRENCIES } from '../core/currencies';
import { CurrencyIcon } from './components/CurrencyIcon';
import { drawTowerForm } from '../render/towerForms';
import { drawMulliganOrganism } from '../render/mulliganOrganism';
import { TowerPortrait } from './TowerPortrait';
import { ProgressBar } from './components/ProgressBar';
import { PowerPreview } from './components/PowerScore';
import { audio } from '../audio/sound';

const SITE = ['A', 'B', 'C'];
type ModCategory = 'offensive' | 'utility' | 'biological';
const CATEGORY_LABEL: Record<ModCategory, string> = { offensive: 'Offensive', utility: 'Utility', biological: 'Biological' };

/** The graft chamber: the actual turret body with the resolved organism grafted on, idle-animated.
 *  DPR-crisp; draws a single static frame under prefers-reduced-motion (the organism is information,
 *  not ambience — it must still be visible); rAF self-pauses while the tab is hidden. */
function OrganismPreview({ kind }: { kind: TowerKind }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const SIZE = 220;
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const draw = (now: number): void => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const cx = SIZE / 2, cy = SIZE / 2, r = 46;
      const st = meta.get().mulligans?.[kind];
      const resolved = resolveMulligan(st);
      // The organism wraps the host: organs behind the body AND reaching over it (battlefield layering).
      if (st) drawMulliganOrganism(ctx, cx, cy, r, resolved, st.visualSeed, st.animSeed, now, 0);
      drawTowerForm(ctx, kind, cx, cy, r, TOWER_DEFS[kind].color, now, 0, 1);
      if (st) drawMulliganOrganism(ctx, cx, cy, r, resolved, st.visualSeed, st.animSeed, now, 0);
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { draw(0); return; }
    let raf = 0;
    const t0 = performance.now();
    const loop = (nowMs: number): void => {
      draw((nowMs - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind]);
  return <canvas ref={ref} className="mgl-canvas" style={{ width: SIZE, height: SIZE }} aria-hidden />;
}

/** The REFORGE WHEEL ceremony (docs/MULLIGANS.md §reforge): the roll is already decided
 *  (meta.reforgeMulligan) — this spins the bio-horror iris TO that result with an eased
 *  deceleration, lights the winning wedge, then presents the mod. Reduced motion skips
 *  straight to the result. */
function ReforgeWheelOverlay({ mod, onClose }: { mod: MulliganReforgeMod; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const [landed, setLanded] = useState(false);
  const SIZE = 300;
  const target = REFORGE_MODS.findIndex((m) => m.id === mod.id);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const finalAngle = angleForSegment(target) - 4 * Math.PI * 2; // four full revolutions in
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      drawReforgeWheel(ctx, SIZE, angleForSegment(target), 0.9, target);
      setLanded(true);
      return;
    }
    const t0 = performance.now();
    const DUR = 2600;
    let raf = 0;
    const loop = (now: number): void => {
      const p = Math.min(1, (now - t0) / DUR);
      const ease = 1 - Math.pow(1 - p, 3); // cubic ease-out — a heavy organ spinning down
      const angle = finalAngle * (1 - ease) + angleForSegment(target) * ease
        + (1 - ease) * 0; // finalAngle already encodes the revolutions
      drawReforgeWheel(ctx, SIZE, angle, now / 1000, p >= 1 ? target : -1);
      if (p >= 1) { setLanded(true); audio.cue('graftCrack'); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const tier = REFORGE_RARITY[mod.rarity];
  return (
    <div className="rfw-overlay" role="dialog" aria-label="Mulligan reforge" onClick={landed ? onClose : undefined}>
      <div className="rfw-card" onClick={(e) => e.stopPropagation()}>
        <div className="rfw-badge">⊛ REFORGE — THE WHEEL DECIDES</div>
        <canvas ref={ref} className="rfw-canvas" style={{ width: SIZE, height: SIZE }} aria-hidden />
        {landed && (
          <div className="rfw-result" style={{ ['--rc' as string]: tier.color }}>
            <span className="rfw-rarity">{tier.label}</span>
            <span className="rfw-name">{mod.name}</span>
            <span className="rfw-desc">{mod.desc}</span>
            <span className="rfw-bound">⚠ This organism is now BOUND to its host — permanently.</span>
            <button className="primary rfw-go" onClick={onClose}>Accept the graft ▸</button>
          </div>
        )}
        {!landed && <div className="rfw-spinning">the iris turns…</div>}
      </div>
    </div>
  );
}

export function MulliganLab(): JSX.Element {
  const save = meta.use();
  const view = mulliganLabView(save);
  const [selected, setSelected] = useState<TowerKind>(view.towers[0].kind);
  const [armed, setArmed] = useState<number | null>(null); // explicitly armed graft site
  const [cat, setCat] = useState<'all' | ModCategory>('all');
  const [wheel, setWheel] = useState<MulliganReforgeMod | null>(null); // §reforge — the spinning ceremony
  const tv = view.towers.find((t) => t.kind === selected) ?? view.towers[0];

  // §gate — the pillar is sealed until three DISTINCT Mega Bosses have fallen (accounts
  // already holding pieces are grandfathered). The briefing sells the goal, not a wall.
  if (!view.unlocked) {
    return (
      <div className="panel mgl-panel">
        <div className="panel-title">Mulligan Lab</div>
        <div className="mgl-gate" role="status">
          <div className="mgl-gate-glyph" aria-hidden>⊛</div>
          <div className="mgl-gate-title">SEALED BEHIND APEX BIOLOGY</div>
          <p className="mgl-gate-copy">
            The graft wing unlocks when the hive has assimilated enough apex genome —
            slay <b>{view.gate.needed} distinct Mega Bosses</b> to open it. Once open,
            epic-or-better Bio-Containers begin dropping <b>Mulligan pieces</b>: graft three
            onto a tower and a living secondary organism awakens on it.
          </p>
          <div className="mgl-gate-bar">
            <ProgressBar value={view.gate.slain} max={view.gate.needed} color="var(--viral)" height={8} label="Mega Bosses slain" />
            <span className="mgl-gate-count">{view.gate.slain} / {view.gate.needed} unique Mega Bosses slain</span>
          </div>
          <p className="mgl-gate-hint">Mega Bosses anchor every 10th Campaign stage, every 20th Infinite wave, and every 5th Boss Rush wave.</p>
        </div>
      </div>
    );
  }

  // The armed site: an explicit pick wins; otherwise the first empty site is live, so a fresh
  // player can simply tap a modifier in the library and watch it take.
  const firstEmpty = tv.slots.find((s) => !s.filled)?.index ?? null;
  const armedSite = armed ?? firstEmpty;

  const selectTower = (k: TowerKind): void => { setSelected(k); setArmed(null); };
  const equip = (id: string): void => {
    if (armedSite == null) return;
    if (meta.equipMulligan(tv.kind, armedSite, id)) { audio.cue('graftSquelch'); setArmed(null); }
  };
  const upgrade = (slot: number): void => { if (meta.upgradeMulligan(tv.kind, slot)) audio.cue('graftCrack'); };
  const ascend = (slot: number): void => { if (meta.ascendMulligan(tv.kind, slot)) audio.cue('splice'); };
  const unequip = (slot: number): void => { if (meta.unequipMulligan(tv.kind, slot)) { audio.cue('select'); setArmed(null); } };
  const spin = (slot: number): void => {
    const res = meta.reforgeMulligan(tv.kind, slot);
    if (res) { audio.cue('splice'); setWheel(res.mod); }
  };

  // Power preview before every spend (docs/DESIGN_LANGUAGE.md §3) — only an AWAKE organism moves
  // Power, so dormant slots skip the (full-model) computation entirely.
  const previewUpgrade = (s: SlotView): number => meta.previewPower((sv) => {
    const st = sv.mulligans[tv.kind];
    const cur = st?.slots[s.index];
    if (!st || !cur) return sv;
    const slots = st.slots.slice();
    slots[s.index] = { ...cur, level: cur.level + 1 };
    return { ...sv, mulligans: { ...sv.mulligans, [tv.kind]: { ...st, slots } } };
  }).score;
  const previewAscend = (s: SlotView): number => meta.previewPower((sv) => {
    const st = sv.mulligans[tv.kind];
    const cur = st?.slots[s.index];
    if (!st || !cur || !s.nextRarity) return sv;
    const slots = st.slots.slice();
    slots[s.index] = { ...cur, rarity: s.nextRarity };
    return { ...sv, mulligans: { ...sv.mulligans, [tv.kind]: { ...st, slots } } };
  }).score;

  const mods = view.owned.filter((m) => cat === 'all' || m.category === cat);
  const curPower = meta.power().score;

  return (
    <div className="panel mgl-panel">
      <div className="mgl-head">
        <div>
          <div className="panel-title">Mulligan Lab</div>
          <div className="panel-sub">
            The graft wing. Assemble a biomechanical organism onto each tower from three genetic
            modifiers — it stays dormant until all three sites are filled, then awakens with its own
            body, behavior, and projectile.
          </div>
        </div>
        <div className="mgl-wallet">
          <span className="mgl-overflow" title={CURRENCIES.geneEssence.blurb}>
            <CurrencyIcon id="geneEssence" size={16} title="" /> {view.essence.toLocaleString()}
            <em>Gene Essence</em>
          </span>
          <span className="mgl-dexcount" title="Modifiers sequenced — epic+ Bio-Containers discover new ones">
            {view.discovered} / {view.total} sequenced
            <ProgressBar value={view.discovered} max={view.total} color="var(--viral)" height={4} label="modifiers sequenced" />
          </span>
        </div>
      </div>

      <div className="mgl-body">
        {/* ── Host rail: one row per tower, organism status at a glance (scales to a 100-tower roster) ── */}
        <div className="mgl-rail" role="tablist" aria-label="Graft hosts">
          {view.towers.map((t) => (
            <button
              key={t.kind}
              role="tab"
              aria-selected={t.kind === selected}
              className={`mgl-item${t.kind === selected ? ' on' : ''}`}
              style={{ ['--tw' as string]: t.color }}
              onClick={() => selectTower(t.kind)}
            >
              <span className="mgl-item-portrait"><TowerPortrait color={t.color} stars={save.towerStars[t.kind] ?? 0} size={44} kind={t.kind} /></span>
              <span className="mgl-item-body">
                <span className="mgl-item-name" style={{ color: t.color }}>{t.name}</span>
                {t.active
                  ? <span className="mgl-item-sub is-awake">● Awake · ×{t.power.toFixed(2)}</span>
                  : <span className="mgl-item-sub">{t.filled > 0 ? `${t.filled}/3 grafted` : 'Dormant'}</span>}
              </span>
              {t.active && <span className="mgl-item-glyph" aria-hidden>⊛</span>}
            </button>
          ))}
        </div>

        {/* ── Showcase: one host's organism ── */}
        <div className="mgl-showcase" style={{ ['--tw' as string]: tv.color }}>
          <div className="mgl-hero">
            <div className={`mgl-chamber${tv.active ? ' is-awake' : ''}`} role="img" aria-label={`${tv.name} graft chamber${tv.active ? ' — organism awake' : ' — dormant'}`}>
              <span className={`mgl-chamber-tag${tv.active ? ' is-awake' : ''}`}>
                {tv.active ? `×${tv.power.toFixed(2)} POWER` : 'DORMANT'}
              </span>
              <OrganismPreview kind={tv.kind} />
            </div>
            <div className="mgl-id">
              <span className="mgl-eyebrow">Graft Host</span>
              <span className="mgl-name" style={{ color: tv.color }}>{tv.name}</span>
              <span className="mgl-identity">
                {tv.active
                  ? <>Awake — <b className="mgl-axis">{tv.dominant}</b> organism</>
                  : <>Graft {3 - tv.filled} more modifier{3 - tv.filled === 1 ? '' : 's'} to awaken the organism</>}
              </span>
              {tv.locked && <span className="mgl-bound" title="Reforged — this organism is permanently bound to this tower">⊛ REFORGED — BOUND</span>}
              <span className="mgl-sites" aria-label={`${tv.filled} of 3 graft sites filled`}>
                {tv.slots.map((s) => (
                  <span key={s.index} className={`mgl-site-pip${s.filled ? ' on' : ''}`} style={s.filled ? { ['--mg' as string]: s.rarityColor } : undefined}>
                    {SITE[s.index]}
                  </span>
                ))}
              </span>
              {tv.packageLines.length > 0 && (
                <span className="mgl-package">
                  {tv.packageLines.map((l) => <span className="mgl-pkg-chip" key={l}>{l}</span>)}
                </span>
              )}
            </div>
          </div>

          {/* ── Graft sites ── */}
          <div className="mgl-block">
            <div className="mgl-block-h">
              <span className="mgl-eyebrow">Graft Sites</span>
              <span className="mgl-block-hint">level with <CurrencyIcon id="geneEssence" size={12} title="Gene Essence" /> Gene Essence · ascend a maxed graft to the next rarity</span>
            </div>
            <div className="mgl-slots">
              {tv.slots.map((s) => s.filled ? (
                <div key={s.index} className="mgl-slot is-filled" style={{ ['--mg' as string]: s.rarityColor }}>
                  <div className="mgl-slot-top">
                    <span className="mgl-slot-site">{SITE[s.index]}</span>
                    <span className="mgl-slot-name">{s.name}</span>
                    <span className="mgl-slot-tier">{MULLIGAN_RARITY[s.rarity!].label} · Lv {s.level}/{s.maxLevel}</span>
                    {!tv.locked && <button className="mgl-clear" title="Clear this graft site (the modifier stays sequenced)" aria-label={`Clear site ${SITE[s.index]}`} onClick={() => unequip(s.index)}>✕</button>}
                  </div>
                  <ProgressBar value={s.level!} max={s.maxLevel!} color={s.rarityColor!} height={4} label={`${s.name} level`} />
                  <span className="mgl-slot-desc">{s.desc}</span>
                  <div className="mgl-slot-actions">
                    {!s.maxed && (
                      <button className="mgl-btn" disabled={!s.canAfford} onClick={() => upgrade(s.index)}
                        title={`${s.upgradeCost!.toLocaleString()} Gene Essence`}>
                        Level up · <CurrencyIcon id="geneEssence" size={12} title="" /> {s.upgradeCost!.toLocaleString()}
                      </button>
                    )}
                    {s.maxed && s.nextRarity && s.ascendCost != null && (
                      <button className="mgl-btn is-ascend" disabled={!s.ascendable} onClick={() => ascend(s.index)}
                        style={{ ['--mg' as string]: MULLIGAN_RARITY[s.nextRarity].color }}
                        title={`${s.ascendCost.toLocaleString()} Gene Essence`}>
                        Ascend → {MULLIGAN_RARITY[s.nextRarity].label} · <CurrencyIcon id="geneEssence" size={12} title="" /> {s.ascendCost.toLocaleString()}
                      </button>
                    )}
                    {s.maxed && !s.nextRarity && <span className="mgl-apex">APEX — fully ascended</span>}
                    {tv.active && !s.maxed && s.canAfford && <PowerPreview current={curPower} next={previewUpgrade(s)} />}
                    {tv.active && s.maxed && s.ascendable && <PowerPreview current={curPower} next={previewAscend(s)} />}
                  </div>
                </div>
              ) : (
                <button
                  key={s.index}
                  className={`mgl-slot is-empty${armedSite === s.index ? ' is-armed' : ''}`}
                  onClick={() => setArmed(armed === s.index ? null : s.index)}
                >
                  <span className="mgl-slot-site">{SITE[s.index]}</span>
                  <span className="mgl-slot-empty">
                    {armedSite === s.index ? 'Armed — choose a modifier from the library below' : 'Empty graft site'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Reforge Bay (§reforge): the ichor wheel — visible once the organism is AWAKE ── */}
          {tv.active && (
            <div className="mgl-block mgl-reforge">
              <div className="mgl-block-h">
                <span className="mgl-eyebrow">Reforge Bay</span>
                <span className="mgl-block-hint">
                  <CurrencyIcon id="ichor" size={12} title="Ichor" /> {view.ichor.toLocaleString()} ichor ·
                  {' '}{tv.reforge.usable} wheel slot{tv.reforge.usable === 1 ? '' : 's'} (combined graft rarity)
                </span>
              </div>
              {!tv.locked && (
                <p className="mgl-reforge-warn" role="note">
                  ⚠ The first spin <b>permanently binds</b> this organism to {tv.name} — its pieces can
                  never be moved or cleared again. Re-spins replace the slot's mod. There is no way back.
                </p>
              )}
              <div className="mgl-rf-slots">
                {tv.reforge.slots.map((r) => (
                  <div key={r.index} className={`mgl-rf-slot${r.mod ? ' is-rolled' : ''}`} style={r.mod ? { ['--rc' as string]: r.mod.color } : undefined}>
                    <span className="mgl-rf-idx">{r.index + 1}</span>
                    {r.mod
                      ? <span className="mgl-rf-mod"><b>{r.mod.name}</b><i>{r.mod.rarity}</i><em>{r.mod.desc}</em></span>
                      : <span className="mgl-rf-empty">Unrolled</span>}
                    <button className="mgl-btn mgl-rf-spin" disabled={!r.affordable} onClick={() => spin(r.index)}
                      title={`Spin the wheel — ${r.cost} Ichor${r.mod ? ' (replaces the current mod)' : ''}`}>
                      {r.mod ? 'Re-spin' : 'Spin'} · <CurrencyIcon id="ichor" size={12} title="" /> {r.cost}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Sequenced-modifier library ── */}
          <div className="mgl-block">
            <div className="mgl-block-h">
              <span className="mgl-eyebrow">Sequenced Modifiers</span>
              <div className="mgl-cats" role="group" aria-label="Filter by category">
                {(['all', 'offensive', 'utility', 'biological'] as const).map((c) => (
                  <button key={c} className={`mgl-chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
                    {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
            {armedSite != null && view.owned.length > 0 && (
              <div className="mgl-arm-note" role="status">Grafting into site <b>{SITE[armedSite]}</b> — choose a modifier.</div>
            )}
            {armedSite == null && <div className="mgl-arm-note is-full">All graft sites full — clear a site to re-graft.</div>}
            {view.owned.length === 0 ? (
              <p className="mgl-empty">
                Nothing sequenced yet. Bio-Containers bleed <CurrencyIcon id="geneEssence" size={12} title="" /> Gene Essence;
                epic-or-better containers sequence a new modifier.
              </p>
            ) : (
              <div className="mgl-mods">
                {mods.map((m: OwnedModifier) => (
                  <button key={m.id} className={`mgl-mod${m.bound ? ' is-bound' : ''}`}
                    disabled={armedSite == null || m.bound || tv.locked}
                    onClick={() => equip(m.id)}
                    style={{ ['--mg' as string]: m.rarityColor }}
                    title={m.bound ? `${m.desc} — BOUND to ${m.hostName} (reforged)` : m.host && m.host !== tv.kind ? `${m.desc} — grafting here moves it off ${m.hostName}` : m.desc}>
                    <span className="mgl-mod-name">{m.name}</span>
                    <span className="mgl-mod-sub">{MULLIGAN_RARITY[m.rarity].label} · {CATEGORY_LABEL[m.category]}</span>
                    {m.host && <span className={`mgl-mod-host${m.bound ? ' is-bound' : ''}`}>{m.bound ? '⊛ bound · ' : '→ '}{m.hostName}</span>}
                  </button>
                ))}
                {mods.length === 0 && <p className="mgl-empty">No {cat} modifiers sequenced yet.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
      {wheel && <ReforgeWheelOverlay mod={wheel} onClose={() => setWheel(null)} />}
    </div>
  );
}
