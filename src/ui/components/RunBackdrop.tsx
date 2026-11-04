// RESULTS BACKDROP (docs/SIGNATURE-MOMENTS.md §2) — the run's last frame stays behind Results,
// blurred + dimmed (index.css §S2: --rb-blur / --rb-dim), instead of a black void. Two layers from
// the one snapshot: the BOARD laid back exactly where it stood on screen (so the in-run settle beat
// lands on it without a jump), and a heavily-blurred cover FILL so the margins read as the same
// room. Decorative only (aria-hidden, no pointer events); the image is owned by App's last-run
// state, which drops it when Results goes.
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RunBackdropImage } from '../../render/runOutro';

/** The board's 3:4 shape (sim 720×960) — used when the viewport changed shape since the capture. */
const BOARD_ASPECT = 3 / 4;

/** Where to lay the board back (px): its captured rect while the viewport keeps the capture's shape
 *  (±12%), else contain-fitted and centred (a phone rotated between the run and Results). */
export function backdropBoardRect(img: RunBackdropImage, vw: number, vh: number): { left: number; top: number; width: number; height: number } {
  const aspect = vw / Math.max(1, vh);
  const r = img.rect;
  if (Math.abs(aspect - img.aspect) / img.aspect <= 0.12 && r.w > 0 && r.h > 0) {
    return { left: r.x * vw, top: r.y * vh, width: r.w * vw, height: r.h * vh };
  }
  const width = Math.min(vw, vh * BOARD_ASPECT);
  const height = width / BOARD_ASPECT;
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

const viewport = (): { vw: number; vh: number } => ({ vw: window.innerWidth || 1, vh: window.innerHeight || 1 });

export function RunBackdrop({ image }: { image: RunBackdropImage }): JSX.Element {
  const [vp, setVp] = useState(viewport);
  useEffect(() => {
    const on = (): void => setVp(viewport());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const url = `url("${image.src}")`;
  const board = backdropBoardRect(image, vp.vw, vp.vh);
  const boardStyle: CSSProperties = { backgroundImage: url, left: board.left, top: board.top, width: board.width, height: board.height };
  return (
    <div className="results-backdrop" aria-hidden="true">
      <div className="rb-fill" style={{ backgroundImage: url }} />
      <div className="rb-board" style={boardStyle} />
    </div>
  );
}
