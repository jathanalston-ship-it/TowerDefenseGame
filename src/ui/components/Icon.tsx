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

/** Faceted gem — the Genome Cores account currency (replaces ◆ in menus). */
export const ShardIcon = (p: IconProps): JSX.Element =>
  svg(
    <>
      <path d="M12 2l7 6-7 14L5 8z" opacity="0.95" />
      <path d="M5 8h14M12 2v20" stroke="rgba(0,0,0,0.35)" strokeWidth="1" fill="none" />
    </>,
    p,
  );

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
