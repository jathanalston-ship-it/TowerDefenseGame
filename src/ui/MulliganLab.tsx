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
import { GENE_OVERFLOW, MULLIGAN_RARITY, resolveMulligan } from '../core/mulligan';
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

export function MulliganLab(): JSX.Element {
  const save = meta.use();
  const view = mulliganLabView(save);
  const [selected, setSelected] = useState<TowerKind>(view.towers[0].kind);
  const [armed, setArmed] = useState<number | null>(null); // explicitly armed graft site
  const [cat, setCat] = useState<'all' | ModCategory>('all');
  const tv = view.towers.find((t) => t.kind === selected) ?? view.towers[0];

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
          <span className="mgl-overflow" title={GENE_OVERFLOW.blurb}>
            <i aria-hidden>{GENE_OVERFLOW.glyph}</i> {view.overflow.toLocaleString()}
            <em>Gene Overflow</em>
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
              <span className="mgl-block-hint">level with {GENE_OVERFLOW.glyph} · ascend a maxed graft to the next rarity</span>
            </div>
            <div className="mgl-slots">
              {tv.slots.map((s) => s.filled ? (
                <div key={s.index} className="mgl-slot is-filled" style={{ ['--mg' as string]: s.rarityColor }}>
                  <div className="mgl-slot-top">
                    <span className="mgl-slot-site">{SITE[s.index]}</span>
                    <span className="mgl-slot-name">{s.name}</span>
                    <span className="mgl-slot-tier">{MULLIGAN_RARITY[s.rarity!].label} · Lv {s.level}/{s.maxLevel}</span>
                    <button className="mgl-clear" title="Clear this graft site (the modifier stays sequenced)" aria-label={`Clear site ${SITE[s.index]}`} onClick={() => unequip(s.index)}>✕</button>
                  </div>
                  <ProgressBar value={s.level!} max={s.maxLevel!} color={s.rarityColor!} height={4} label={`${s.name} level`} />
                  <span className="mgl-slot-desc">{s.desc}</span>
                  <div className="mgl-slot-actions">
                    {!s.maxed && (
                      <button className="mgl-btn" disabled={!s.canAfford} onClick={() => upgrade(s.index)}
                        title={`${s.upgradeCost!.toLocaleString()} ${GENE_OVERFLOW.name}`}>
                        Level up · {GENE_OVERFLOW.glyph} {s.upgradeCost!.toLocaleString()}
                      </button>
                    )}
                    {s.maxed && s.nextRarity && s.ascendCost != null && (
                      <button className="mgl-btn is-ascend" disabled={!s.ascendable} onClick={() => ascend(s.index)}
                        style={{ ['--mg' as string]: MULLIGAN_RARITY[s.nextRarity].color }}
                        title={`${s.ascendCost.toLocaleString()} ${GENE_OVERFLOW.name}`}>
                        Ascend → {MULLIGAN_RARITY[s.nextRarity].label} · {GENE_OVERFLOW.glyph} {s.ascendCost.toLocaleString()}
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
                Nothing sequenced yet. Bio-Containers bleed {GENE_OVERFLOW.glyph} {GENE_OVERFLOW.name};
                epic-or-better containers sequence a new modifier.
              </p>
            ) : (
              <div className="mgl-mods">
                {mods.map((m: OwnedModifier) => (
                  <button key={m.id} className="mgl-mod" disabled={armedSite == null} onClick={() => equip(m.id)}
                    style={{ ['--mg' as string]: m.rarityColor }} title={m.desc}>
                    <span className="mgl-mod-name">{m.name}</span>
                    <span className="mgl-mod-sub">{MULLIGAN_RARITY[m.rarity].label} · {CATEGORY_LABEL[m.category]}</span>
                  </button>
                ))}
                {mods.length === 0 && <p className="mgl-empty">No {cat} modifiers sequenced yet.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
