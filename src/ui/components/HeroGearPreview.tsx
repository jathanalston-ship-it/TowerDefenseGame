// HERO GEAR PREVIEW (docs/EQUIPMENT.md §visuals) — a large, live, animated canvas of a hero wearing
// its equipped loadout, for the Inspect screen + Hero Lab. Optionally PREVIEWS a candidate item: the
// hero is drawn as it WOULD look with that item slotted (the "visual change preview"). Reuses the
// battlefield gear generator (render/equipmentArt), so it always matches the in-game look. Menu-only,
// render-only ⇒ golden-safe.

import { useEffect, useMemo, useRef } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { HERO_DEFS } from '../../core/config';
import type { HeroKind } from '../../core/types';
import { meta } from '../../state/meta';
import { activeSets, itemDef } from '../../core/equipment';
import type { EquipSlot, OwnedItem } from '../../core/equipment';
import { deriveHeroGear, drawHeroGear } from '../../render/equipmentArt';

const TAU = Math.PI * 2;
type Shape = 'diamond' | 'hex' | 'triangle' | 'square' | 'circle';
const HERO_SHAPE: Record<string, Shape> = { ravager: 'diamond', shepherd: 'hex', overseer: 'triangle', vitriol: 'square', revenant: 'circle' };

function bodyPath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number): void {
  ctx.beginPath();
  if (shape === 'circle') { ctx.arc(x, y, r, 0, TAU); return; }
  const n = shape === 'diamond' ? 4 : shape === 'hex' ? 6 : shape === 'triangle' ? 3 : 4;
  const rot = shape === 'square' ? Math.PI / 4 : shape === 'triangle' ? -Math.PI / 2 : shape === 'hex' ? 0 : -Math.PI / 2;
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath();
}

export function HeroGearPreview({ heroKind, item, size = 180 }: { heroKind: HeroKind; item?: OwnedItem; size?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  // The gear the hero would wear: its current loadout, but with the candidate item slotted in its slot.
  const spec = useMemo(() => {
    const s = meta.get();
    const inv = s.equipment.inventory;
    const lo = meta.loadoutOf(heroKind);
    const candDef = item ? itemDef(item.defId) : undefined;
    const bySlot: Record<EquipSlot, string | null> = { weapon: lo.weapon, armor: lo.armor, relic: lo.relic };
    const items = (['weapon', 'armor', 'relic'] as EquipSlot[]).flatMap((slot) => {
      if (candDef && candDef.slot === slot) return [{ def: candDef, rarity: item!.rarity }]; // preview the candidate
      const uid = bySlot[slot];
      if (!uid) return [];
      const it = inv.find((x) => x.uid === uid);
      const d = it && itemDef(it.defId);
      return d ? [{ def: d, rarity: it!.rarity }] : [];
    });
    const setBonuses = activeSets(inv, lo).reduce((n, se) => n + (se.bonus2 ? 1 : 0) + (se.bonus4 ? 1 : 0), 0);
    return deriveHeroGear(items, setBonuses);
  }, [heroKind, item]);

  // Turntable: auto-rotate, or drag horizontally to spin. `spinRef` persists across frames.
  const spinRef = useRef(0.6);
  const dragRef = useRef<{ x: number } | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    cv.width = size * dpr; cv.height = size * dpr;
    const def = HERO_DEFS[heroKind];
    const shape = HERO_SHAPE[heroKind] ?? 'circle';
    const cx = size / 2, cy = size / 2, r = size * 0.16;
    let raf = 0;
    const t0 = performance.now();
    const loop = (): void => {
      const now = (performance.now() - t0) / 1000;
      if (!dragRef.current) spinRef.current += 0.006; // idle auto-rotate
      const spin = spinRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // A turntable base disc under the hero sells the rotation.
      ctx.fillStyle = 'rgba(120,150,200,0.09)';
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.55, r * 1.5, r * 0.42, 0, 0, TAU); ctx.fill();
      // hero body, then the gear revolving over/around it (turntable).
      bodyPath(ctx, shape, cx, cy, r * 1.25); ctx.fillStyle = '#22283a'; ctx.fill();
      bodyPath(ctx, shape, cx, cy, r); ctx.fillStyle = def.color; ctx.fill();
      ctx.fillStyle = '#eef3ff'; ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 0.32, 0, TAU); ctx.fill();
      drawHeroGear(ctx, cx, cy, r, spec, now, def.color, 1, spin);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spec, heroKind, size]);

  const onDown = (e: RPointerEvent): void => { dragRef.current = { x: e.clientX }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: RPointerEvent): void => { if (dragRef.current) { spinRef.current += (e.clientX - dragRef.current.x) * 0.015; dragRef.current.x = e.clientX; } };
  const onUp = (): void => { dragRef.current = null; };

  return <canvas ref={ref} width={size} height={size} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
    style={{ width: size, height: size, display: 'block', cursor: 'ew-resize', touchAction: 'none' }} title="Drag to rotate" />;
}
