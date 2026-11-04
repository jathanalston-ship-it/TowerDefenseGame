// RESULTS BACKDROP layout (docs/SIGNATURE-MOMENTS.md §2): the board goes back exactly where it
// stood while the viewport keeps its shape; a rotated phone gets it contain-fitted and centred.
import { describe, expect, it } from 'vitest';
import { backdropBoardRect } from './RunBackdrop';
import type { RunBackdropImage } from '../../render/runOutro';

const img = (aspect: number, rect = { x: 0.31, y: 0.1, w: 0.377, h: 0.8 }): RunBackdropImage => ({ src: 'data:image/jpeg;base64,', rect, aspect });

describe('backdropBoardRect', () => {
  it('same viewport shape → the captured on-screen rect (no jump at the hand-off)', () => {
    const r = backdropBoardRect(img(1440 / 900), 1440, 900);
    expect(r.left).toBeCloseTo(0.31 * 1440, 5);
    expect(r.top).toBeCloseTo(0.1 * 900, 5);
    expect(r.width).toBeCloseTo(0.377 * 1440, 5);
    expect(r.height).toBeCloseTo(0.8 * 900, 5);
  });

  it('a resized window of the same shape scales the rect with it', () => {
    const r = backdropBoardRect(img(1440 / 900), 1280, 800);
    expect(r.width).toBeCloseTo(0.377 * 1280, 5);
  });

  it('rotated (landscape run → portrait Results) → contain-fit, centred, 3:4', () => {
    const r = backdropBoardRect(img(844 / 390), 390, 844);
    expect(r.width).toBeCloseTo(390, 5);
    expect(r.height).toBeCloseTo(520, 5);
    expect(r.left).toBeCloseTo(0, 5);
    expect(r.top).toBeCloseTo((844 - 520) / 2, 5);
  });

  it('portrait → landscape fits by height', () => {
    const r = backdropBoardRect(img(390 / 844), 844, 390);
    expect(r.height).toBeCloseTo(390, 5);
    expect(r.width).toBeCloseTo(292.5, 5);
    expect(r.left).toBeCloseTo((844 - 292.5) / 2, 5);
  });

  it('a degenerate rect falls back to the fit', () => {
    const r = backdropBoardRect(img(1.6, { x: 0, y: 0, w: 0, h: 0 }), 1440, 900);
    expect(r.height).toBeCloseTo(900, 5);
  });
});
