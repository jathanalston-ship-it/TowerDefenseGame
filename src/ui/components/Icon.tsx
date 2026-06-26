// One inline-SVG icon set so the UI never relies on OS emoji (which render
// differently per platform). Uniform 16-unit viewBox, sized by `size`, inherits
// color via currentColor. Solid glyphs (play/bolt/diamond) read as symbols; the
// action icons (download/upload/plus/lock) are consistent 1.6 line-weight.

import type { CSSProperties } from 'react';

export type IconName = 'play' | 'bolt' | 'diamond' | 'download' | 'upload' | 'plus' | 'lock';

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const solid = { fill: 'currentColor' };

const SHAPES: Record<IconName, JSX.Element> = {
  play: <path d="M5.5 3.2 12 8l-6.5 4.8z" {...solid} />,
  bolt: <path d="M8.8 1.5 4 9h3.1l-.9 5.5L12 6.6H8.4z" {...solid} />,
  diamond: <path d="M8 2.2 13.8 8 8 13.8 2.2 8z" {...solid} />,
  download: (
    <g {...line}>
      <path d="M8 2.5v7.4" />
      <path d="m4.9 6.9 3.1 3.1 3.1-3.1" />
      <path d="M3 13.2h10" />
    </g>
  ),
  upload: (
    <g {...line}>
      <path d="M8 13.5V6.1" />
      <path d="m4.9 9.1 3.1-3.1 3.1 3.1" />
      <path d="M3 2.8h10" />
    </g>
  ),
  plus: (
    <g {...line}>
      <path d="M8 3.4v9.2" />
      <path d="M3.4 8h9.2" />
    </g>
  ),
  lock: (
    <g {...line}>
      <rect x="3.5" y="7" width="9" height="6.4" rx="1.2" />
      <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" />
    </g>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 14, className, style }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      focusable={false}
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flex: 'none', ...style }}
    >
      {SHAPES[name]}
    </svg>
  );
}
