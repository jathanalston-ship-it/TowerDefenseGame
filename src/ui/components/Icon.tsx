// Inline SVG icon set — drawn glyphs that replace OS emoji (VISUAL-AUDIT M3).
// Every icon inherits the surrounding text color via `currentColor` and scales to
// the `size` prop (default 1em), so it sits inline with text like a glyph would.

interface IconProps {
  size?: number | string;
  className?: string;
}

function svg(path: JSX.Element, { size = '1em', className }: IconProps, stroke = false): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flex: 'none' }}
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 2 : undefined}
      strokeLinecap={stroke ? 'round' : undefined}
      strokeLinejoin={stroke ? 'round' : undefined}
    >
      {path}
    </svg>
  );
}

/** Hexagonal cell — in-run Biomass (replaces ◆ on tower cost chips). */
export const BiomassIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M12 2.5l8.2 4.75v9.5L12 21.5 3.8 16.75v-9.5z" opacity="0.95" />
      <circle cx="12" cy="12" r="2.4" fill="rgba(0,0,0,0.3)" />
    </>,
    p,
  );

/** Diamond + core — the hero (replaces ◆ on the hero pod). */
export const HeroIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M12 2l10 10-10 10L2 12z" opacity="0.95" />
      <circle cx="12" cy="12" r="3" fill="rgba(0,0,0,0.35)" />
    </>,
    p,
  );

// ── Currency icons — one unmistakable silhouette per currency (see core/currencies.ts). Tinted
//    and animated by <CurrencyIcon>; color comes from `currentColor` so the wrapper can override it
//    per-kind (tower/hero). Shapes are deliberately distinct: helix vs crystal vs star vs cell. ──

/** Double helix — the Genome Cores account currency (gold). */
export const GenomeCoreIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M8 3c0 4.5 8 5.5 8 9s-8 4.5-8 9" />
      <path d="M16 3c0 4.5-8 5.5-8 9s8 4.5 8 9" />
      <path d="M9 6.2h6M9.4 9.4h5.2M9.4 14.6h5.2M9 17.8h6" strokeWidth="1.3" />
    </>,
    p,
    true,
  );

/** Faceted crystal — Strain Samples (tinted per tower). */
export const TowerShardIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M12 2l5.5 6.5-5.5 13.5-5.5-13.5z" opacity="0.95" />
      <path d="M6.5 8.5h11M12 2v20" stroke="rgba(0,0,0,0.35)" strokeWidth="1" fill="none" />
    </>,
    p,
  );

/** Four-point star sigil — Apex Genome (tinted per hero). */
export const HeroShardIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M12 1.5l2.6 6.9 6.9 2.6-6.9 2.6L12 22.5l-2.6-6.9L2.5 13l6.9-2.6z" opacity="0.95" />
      <circle cx="12" cy="12" r="1.7" fill="rgba(0,0,0,0.3)" />
    </>,
    p,
  );

/** Dividing cell — Ascendant Cells prestige currency (violet). */
export const AscensionCellIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <circle cx="8.6" cy="12" r="5.7" opacity="0.95" />
      <circle cx="15.4" cy="12" r="5.7" opacity="0.95" />
      <circle cx="8.6" cy="12" r="1.7" fill="rgba(0,0,0,0.32)" />
      <circle cx="15.4" cy="12" r="1.7" fill="rgba(0,0,0,0.32)" />
    </>,
    p,
  );

/** Lightning bolt — the Apex Leap ability (replaces ⚡). */
export const BoltIcon = (p: IconProps): JSX.Element => svg(<path d="M13 2L4 14h6l-1 8 9-12h-6z" />, p);

/** Play triangle (replaces ▶). */
export const PlayIcon = (p: IconProps): JSX.Element => svg(<path d="M7 4v16l13-8z" />, p);

/** Filled plus (replaces ＋). */
export const PlusIcon = (p: IconProps): JSX.Element => svg(<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z" />, p);

/** Download arrow (replaces ⬇). */
export const DownloadIcon = (p: IconProps): JSX.Element =>
  svg(<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 20h14" />, p, true);

/** Upload arrow (replaces ⬆). */
export const UploadIcon = (p: IconProps): JSX.Element =>
  svg(<path d="M12 21V9m0 0l-4 4m4-4l4 4M5 4h14" />, p, true);

/** Check mark (replaces ✓). */
export const CheckIcon = (p: IconProps): JSX.Element => svg(<path d="M5 13l4 4L19 7" />, p, true);

/** Cross / X (replaces ✗). */
export const CrossIcon = (p: IconProps): JSX.Element => svg(<path d="M6 6l12 12M18 6L6 18" />, p, true);

/** Turret — a tower (the Gene Card "affects this tower" badge; tinted to the tower's color). */
export const TowerIcon = (p: IconProps): JSX.Element =>
  svg(<path d="M5 21V9l7-4 7 4v12h-4v-6h-6v6z" />, p);

/** Globe — an army-wide / GLOBAL card. */
export const GlobalIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3.2 2.6 3.2 15.4 0 18M12 3c-3.2 2.6-3.2 15.4 0 18" />
    </>,
    p,
    true,
  );

/** Shielded core — the Hive (Nucleus integrity + build structure). */
export const HiveIcon = (p: IconProps): JSX.Element =>
  svg(<path d="M12 2l8 3v6c0 5-3.4 8.6-8 11-4.6-2.4-8-6-8-11V5z" />, p);
