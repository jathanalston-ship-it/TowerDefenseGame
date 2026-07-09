// MULLIGAN LAB (docs/MULLIGANS.md §UI) — the player equip screen. Pick a tower, fill its three
// modifier slots from your discovered modifiers, then upgrade (Gene Overflow) or ascend each slot.
// A LIVE canvas preview draws the actual procedurally-generated organism grafted onto the turret, so
// you see the creature your build grows. All reads flow through mulliganLabView; all writes through
// the meta pipeline (equip / upgrade / ascend / unequip). Menu-only — never touches the sim.

import { useEffect, useReducer, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { TOWER_DEFS } from '../core/config';
import type { TowerKind } from '../core/types';
import { mulliganLabView } from '../state/mulliganLabModel';
import type { OwnedModifier } from '../state/mulliganLabModel';
import { MULLIGAN_RARITY, resolveMulligan } from '../core/mulligan';
import { drawTowerForm } from '../render/towerForms';
import { drawMulliganOrganism } from '../render/mulliganOrganism';
import { audio } from '../audio/sound';

/** Live preview: the actual turret body with the resolved organism grafted on, idle-animated. */
function OrganismPreview({ kind }: { kind: TowerKind }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (): void => {
      const now = (performance.now() - t0) / 1000;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const cx = cv.width / 2, cy = cv.height / 2, r = 42;
      const st = meta.get().mulligans?.[kind];
      const resolved = resolveMulligan(st);
      if (st) drawMulliganOrganism(ctx, cx, cy, r, resolved, st.visualSeed, st.animSeed, now, 0.1);
      drawTowerForm(ctx, kind, cx, cy, r, TOWER_DEFS[kind].color, now, 0.1, 1);
      if (st) drawMulliganOrganism(ctx, cx, cy, r, resolved, st.visualSeed, st.animSeed, now, 0.1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind]);
  return <canvas ref={ref} width={200} height={200} style={{ width: 200, height: 200, display: 'block', margin: '0 auto' }} />;
}

export function MulliganLab(): JSX.Element {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [selected, setSelected] = useState<TowerKind>('needle');
  const [pickSlot, setPickSlot] = useState<number | null>(null);
  const view = mulliganLabView(meta.get());
  const tv = view.towers.find((t) => t.kind === selected)!;

  const refresh = (): void => force();
  const equip = (slot: number, id: string): void => { if (meta.equipMulligan(selected, slot, id)) { audio.cue('graftSquelch'); setPickSlot(null); refresh(); } };
  const upgrade = (slot: number): void => { if (meta.upgradeMulligan(selected, slot)) { audio.cue('graftCrack'); refresh(); } };
  const ascend = (slot: number): void => { if (meta.ascendMulligan(selected, slot)) { audio.cue('splice'); refresh(); } };
  const unequip = (slot: number): void => { if (meta.unequipMulligan(selected, slot)) { audio.cue('select'); refresh(); } };

  return (
    <div className="screen mulligan-lab" style={{ padding: '18px 22px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Mulligan Lab</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.7, fontSize: 13, maxWidth: 640 }}>
            Graft a biomechanical organism onto each tower from three genetic modifiers. It stays dormant until all three slots are filled — then it grows a unique appearance, behavior, and projectile.
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>
          <div><b style={{ color: '#7de08a' }}>{view.overflow.toLocaleString()}</b> Gene Overflow</div>
          <div style={{ opacity: 0.7 }}>{view.discovered} / {view.total} modifiers discovered</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Tower selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
          {view.towers.map((t) => (
            <button key={t.kind} onClick={() => { setSelected(t.kind); setPickSlot(null); }}
              style={{ textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: `1px solid ${t.kind === selected ? t.color : 'rgba(255,255,255,0.1)'}`,
                background: t.kind === selected ? 'rgba(255,255,255,0.08)' : 'transparent', color: '#e8e8f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span><span style={{ color: t.color }}>◈</span> {t.name}</span>
              {t.active && <span title="active organism" style={{ color: '#7de08a' }}>●</span>}
            </button>
          ))}
        </div>

        {/* Selected tower: preview + slots */}
        <div style={{ flex: '1 1 300px', minWidth: 280 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ background: 'radial-gradient(circle,#141020,#0a0812)', borderRadius: 12, padding: 4 }}>
              <OrganismPreview kind={selected} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{tv.name}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{tv.active ? 'Organism ACTIVE' : `Fill ${tv.slots.filter((s) => !s.filled).length} more slot(s) to activate`}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Power ×<b style={{ color: '#ffd15b' }}>{tv.power.toFixed(2)}</b></div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {tv.slots.map((s) => (
              <div key={s.index} style={{ border: `1px solid ${pickSlot === s.index ? '#5aa9ff' : 'rgba(255,255,255,0.12)'}`, borderRadius: 8, padding: 10 }}>
                {s.filled ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ color: s.rarityColor, fontWeight: 600 }}>{s.name}</span>
                      <span style={{ opacity: 0.7, marginLeft: 8, fontSize: 12 }}>{s.rarity} · Lv {s.level}/{s.maxLevel}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!s.maxed && <button disabled={!s.canAfford} onClick={() => upgrade(s.index)} title={`${s.upgradeCost} Gene Overflow`}
                        style={btn(!!s.canAfford)}>Upgrade ({s.upgradeCost})</button>}
                      {s.maxed && s.ascendCost != null && <button disabled={!s.ascendable} onClick={() => ascend(s.index)} title={`${s.ascendCost} Gene Overflow`}
                        style={btn(!!s.ascendable)}>Ascend ({s.ascendCost})</button>}
                      <button onClick={() => unequip(s.index)} style={btn(true, true)}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setPickSlot(pickSlot === s.index ? null : s.index)} style={{ ...btn(true), width: '100%' }}>
                    {pickSlot === s.index ? 'Choose a modifier below…' : `Slot ${String.fromCharCode(65 + s.index)} — empty (click to fill)`}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Owned modifiers */}
        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>
            {pickSlot != null ? `Click a modifier to slot into ${String.fromCharCode(65 + pickSlot)}` : 'Your discovered modifiers'}
          </div>
          {view.owned.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>None yet — open Bio-Containers to discover modifiers.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
            {view.owned.map((m: OwnedModifier) => (
              <button key={m.id} disabled={pickSlot == null} onClick={() => pickSlot != null && equip(pickSlot, m.id)} title={m.desc}
                style={{ textAlign: 'left', padding: '6px 9px', borderRadius: 6, border: `1px solid ${m.rarityColor}55`, background: 'rgba(255,255,255,0.03)',
                  color: '#e8e8f0', cursor: pickSlot != null ? 'pointer' : 'default', opacity: pickSlot != null ? 1 : 0.7 }}>
                <span style={{ color: m.rarityColor, fontWeight: 600 }}>{m.name}</span>
                <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 6 }}>{MULLIGAN_RARITY[m.rarity].label} · {m.category}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function btn(enabled: boolean, subtle = false): React.CSSProperties {
  return {
    padding: '5px 9px', borderRadius: 6, fontSize: 12, cursor: enabled ? 'pointer' : 'not-allowed',
    border: '1px solid rgba(255,255,255,0.16)', background: subtle ? 'transparent' : 'rgba(90,169,255,0.14)',
    color: enabled ? '#e8e8f0' : 'rgba(255,255,255,0.35)',
  };
}
