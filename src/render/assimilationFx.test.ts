import { describe, it, expect } from 'vitest';
import { drawAssimilationFx } from './assimilationFx';
import { assimilationPresentation, tierAt, type AssimilationState } from '../core/assimilation';

// A mock 2D context that records the draw calls the veil makes and swallows every property set
// (fillStyle, globalCompositeOperation, font, shadowBlur, letterSpacing …). This exercises the real
// draw path — vignette, rim, membrane veins, spores, and the Ascension flourish — with no browser or
// canvas backend, so a bad ctx call or a logic error in the veil fails loudly and deterministically.
function mockCtx(): { ctx: CanvasRenderingContext2D; calls: Record<string, number> } {
  const calls: Record<string, number> = { fillRect: 0, arc: 0, stroke: 0, fillText: 0 };
  const grad = { addColorStop(): void {} };
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
        return (): void => { if (prop in calls) calls[prop]++; };
      },
      set() { return true; },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const stateAt = (index: number, ascensionPulse = 0, ascendedTier = 0): AssimilationState => ({
  index, target: index, tier: tierAt(index).tier.index, tierProgress: tierAt(index).progress,
  override: null, peakTier: tierAt(index).tier.index, ascensionPulse, ascendedTier,
});

describe('assimilationFx — the veil draw path', () => {
  it('is a true no-op at the Contained baseline (nothing drawn)', () => {
    const { ctx, calls } = mockCtx();
    drawAssimilationFx(ctx, assimilationPresentation(stateAt(0)), 0, 1280, 720);
    expect(calls.fillRect).toBe(0);
    expect(calls.arc).toBe(0);
    expect(calls.fillText).toBe(0);
  });

  it('draws the veil (fills + spores) at a mid index without throwing', () => {
    const { ctx, calls } = mockCtx();
    expect(() => drawAssimilationFx(ctx, assimilationPresentation(stateAt(0.5)), 12.3, 1280, 720)).not.toThrow();
    expect(calls.fillRect).toBeGreaterThan(0); // vignette / tint fills
    expect(calls.arc).toBeGreaterThan(0); // drifting spores
  });

  it('surfaces membrane veins at high tiers (strokes present past Dominance)', () => {
    const low = mockCtx();
    drawAssimilationFx(low.ctx, assimilationPresentation(stateAt(0.3)), 5, 1280, 720);
    const high = mockCtx();
    drawAssimilationFx(high.ctx, assimilationPresentation(stateAt(0.9)), 5, 1280, 720);
    expect(high.calls.stroke).toBeGreaterThan(low.calls.stroke);
  });

  it('renders the Ascension flourish (ring strokes + tier name) when the pulse is live', () => {
    const { ctx, calls } = mockCtx();
    const pres = assimilationPresentation(stateAt(0.46, 1, 3)); // just crossed into Dominance
    expect(() => drawAssimilationFx(ctx, pres, 0.2, 1280, 720)).not.toThrow();
    expect(calls.stroke).toBeGreaterThan(0); // shock rings
    expect(calls.fillText).toBeGreaterThan(0); // "▲ DOMINANCE" + subtitle
  });

  it('never throws across the full index × pulse sweep', () => {
    const { ctx } = mockCtx();
    for (let x = 0; x <= 1.0001; x += 0.1) {
      for (const pulse of [0, 0.5, 1]) {
        for (let tier = 0; tier <= 5; tier++) {
          expect(() => drawAssimilationFx(ctx, assimilationPresentation(stateAt(x, pulse, tier)), x * 30, 1920, 1080)).not.toThrow();
        }
      }
    }
  });
});
