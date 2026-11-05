// RARITY FX — the ONE rarity language every item surface speaks (docs/UI-STANDARDS.md §rarity,
// docs/GAME-FEEL.md §draft-sheen). Born on the draft cards; now shared by gear, gene cards,
// containers, specimens, cosmetics and the reward ceremonies, so a Legendary reads the same in the
// Armory, the Vault, the Archive and a draft. Two halves:
//   • the HOST class (`rfxClass`) — `rfx rfx-<tier>` picks the tier's row in index.css "RARITY FX"
//     (colour, glow, sweep, edge, reveal strength); `rfx-lite` is the quiet grid profile.
//   • <RarityFx> — mounts the decorative layers that tier earns (THIS table decides which; every
//     strength/colour lives in the CSS table). Unknown tiers mount glow + sweep only, so a new
//     rarity slots in by adding a row here + a row there.
// Decorative only (aria-hidden), transform/opacity animation only, reduced motion keeps every colour.

import type { CSSProperties } from 'react';

interface RarityLayers { edge?: boolean; motes?: number; crown?: string }

/** Which EXTRA layers a tier mounts on a full (ceremony / draft) surface. Common/uncommon: glow + glint. */
export const RARITY_FX: Record<string, RarityLayers> = {
  rare: { edge: true },
  epic: { edge: true, motes: 3 },
  legendary: { edge: true, motes: 6, crown: '◆ ◆ ◆' },
  exotic: { edge: true, motes: 7, crown: '✦ ✦ ✦' },
  mythic: { edge: true, motes: 7, crown: '✦ ✦ ✦' },
};

/** Grid (`lite`) surfaces stay calm (and cheap) at 100+ tiles: the circling edge only from legendary up
 *  (a compositor transform), no motes, no crown — the sweep runs on hover/focus instead of on a loop. */
const LITE_EDGE = new Set(['legendary', 'exotic', 'mythic']);

/** The host's class list: `rfx rfx-<tier>` (+ `rfx-lite` on grids). The host must be positioned. */
export function rfxClass(rarity: string, lite = false): string {
  return `rfx rfx-${rarity}${lite ? ' rfx-lite' : ''}`;
}

/** Deterministic spark layout (no Math.random — the same card always sparkles the same way). */
function moteStyle(k: number, n: number): CSSProperties {
  return {
    '--x': `${8 + ((k * 37) % 84)}%`,
    '--d': `${((k * 0.83) % 3.6).toFixed(2)}s`,
    '--t': `${(3.2 + ((k * 7) % 5) * 0.25).toFixed(2)}s`,
    '--dx': `${((k % 2 === 0 ? 1 : -1) * (6 + ((k * 5) % 9)))}px`,
    zIndex: n - k,
  } as CSSProperties;
}

/**
 * The decorative layers for a rarity-lit host. `lite` = the grid profile; `flash` = a one-shot
 * reveal flash in the tier's colour as the surface lands (ceremonies; honours Flashes); `crown`
 * can be turned off where the space above the host is taken.
 */
export function RarityFx({ rarity, lite = false, flash = false, crown = true }: {
  rarity: string;
  lite?: boolean;
  flash?: boolean;
  crown?: boolean;
}): JSX.Element {
  const fx = RARITY_FX[rarity] ?? {};
  const edge = lite ? LITE_EDGE.has(rarity) : !!fx.edge;
  const motes = lite ? 0 : fx.motes ?? 0;
  const diadem = !lite && crown ? fx.crown : undefined;
  return (
    <>
      <span className="rfx-glow" aria-hidden />
      <span className="rfx-sheen" aria-hidden />
      {edge && <span className="rfx-edge" aria-hidden />}
      {motes > 0 && (
        <span className="rfx-motes" aria-hidden>
          {Array.from({ length: motes }, (_, k) => <i key={k} style={moteStyle(k, motes)} />)}
        </span>
      )}
      {diadem && <span className="rfx-crown" aria-hidden>{diadem}</span>}
      {flash && <span className="rfx-flash" aria-hidden />}
    </>
  );
}
