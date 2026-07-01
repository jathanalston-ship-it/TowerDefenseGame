// One component renders every currency's visual identity — the right silhouette (core/Icon.tsx),
// in the right color, with a per-currency glow, idle shimmer, optional one-shot pickup burst, and
// the currency's tooltip. Driven entirely by core/currencies.ts, so a NEW currency needs only a
// registry entry + an icon; no caller changes. The goal: a reward is recognizable from the visual
// alone, never the text.

import { CURRENCIES } from '../../core/currencies';
import type { CurrencyId } from '../../core/currencies';
import { GenomeCoreIcon, TowerShardIcon, HeroShardIcon, AscensionCellIcon, GeneEssenceIcon } from './Icon';

interface IconProps {
  size?: number | string;
}

const SVG: Record<CurrencyId, (p: IconProps) => JSX.Element> = {
  genomeCores: GenomeCoreIcon,
  towerShards: TowerShardIcon,
  heroShards: HeroShardIcon,
  ascendantCells: AscensionCellIcon,
  geneEssence: GeneEssenceIcon,
};

export function CurrencyIcon({
  id,
  color,
  size = '1em',
  animated = true,
  pickup = false,
  title,
  className,
}: {
  id: CurrencyId;
  /** Per-kind tint override (a tower/hero color); defaults to the currency's signature color. */
  color?: string;
  size?: number | string;
  /** Idle shimmer (on by default — a second recognition cue beyond shape + color). */
  animated?: boolean;
  /** One-shot "gain" burst in the currency's color (used where a reward is revealed). */
  pickup?: boolean;
  /** Tooltip override; defaults to the currency blurb. Pass '' to suppress (e.g. a labelled chip). */
  title?: string;
  className?: string;
}): JSX.Element {
  const def = CURRENCIES[id];
  const Svg = SVG[id];
  // Pickup is a one-shot burst; it owns the icon's animation while it plays, so don't also arm idle.
  const cls = `cur-ico cur-${id}${pickup ? ' is-pickup' : animated ? ' is-anim' : ''}${className ? ` ${className}` : ''}`;
  return (
    <span
      className={cls}
      style={{ color: color ?? def.color, ['--cur-glow' as string]: def.glow }}
      title={title === undefined ? def.blurb : title || undefined}
    >
      <Svg size={size} />
    </span>
  );
}
