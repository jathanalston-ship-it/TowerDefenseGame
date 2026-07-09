// Procedural equipment ARTWORK — asset-free bespoke card illustration (docs/EQUIPMENT.md §visuals).
// Each item grows a UNIQUE biomechanical emblem derived from its slot/subtype/set/rarity/affixes via
// the shared generator (render/equipmentArt.ts) — no placeholder icons. The rarity tier drives the
// frame + animated effects (common flat · rare glow · epic particles · legendary living silhouette ·
// exotic floating energy). Premium tiers animate on a rAF; common/rare draw once (cheap for big grids).

import { useEffect, useMemo, useRef } from 'react';
import type { EquipDef } from '../../core/equipment';
import { deriveItemArt, drawItemArt, rarityTier } from '../../render/equipmentArt';

// Rarity colors come from the ONE canonical map (core/equipment.ts) — re-exported for callers.
import { rarityColorOf as rarityColor } from '../../core/equipment';
export { rarityColor };

export function ItemArt({
  def,
  rarity,
  size = 72,
  affixCount = 0,
}: {
  def: EquipDef;
  rarity: string;
  size?: number;
  affixCount?: number;
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const spec = useMemo(() => deriveItemArt(def, rarity, affixCount), [def, rarity, affixCount]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    const paint = (now: number): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      drawItemArt(ctx, size / 2, size / 2, size, spec, now);
    };
    // Premium tiers (epic+) animate; lower tiers are static (draw once).
    if (rarityTier(rarity) >= 2) {
      let raf = 0;
      const t0 = performance.now();
      const loop = (): void => { paint((performance.now() - t0) / 1000); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }
    paint(0);
    return undefined;
  }, [spec, size, rarity]);

  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, display: 'block', borderRadius: Math.round(size * 0.08) }} aria-hidden />;
}
