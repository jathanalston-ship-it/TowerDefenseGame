import { describe, expect, it } from 'vitest';
import { randomSkusVisible } from './storeRegion';

describe('paid random containers — client visibility policy', () => {
  it('an explicit answer always wins', () => {
    expect(randomSkusVisible('allowed', 'stripe')).toBe(true);
    expect(randomSkusVisible('blocked', 'sandbox')).toBe(false);
    expect(randomSkusVisible('blocked', 'stripe')).toBe(false);
  });
  it('unknown (loading / config call failed) fails SAFE for real money, soft for the sandbox', () => {
    expect(randomSkusVisible('unknown', 'stripe')).toBe(false);
    expect(randomSkusVisible('unknown', 'sandbox')).toBe(true);
  });
});
