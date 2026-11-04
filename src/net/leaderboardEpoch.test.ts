// The Boss Rush record epoch (docs/BOSS-RUSH.md §epoch): the client's claim key and the server's
// bucket key are two copies of one constant (functions/ stays import-isolated) — pin them equal.
import { describe, expect, it } from 'vitest';
import { RUSH_BOARD_EPOCH as SERVER } from '../../functions/lib/period';
import { RUSH_BOARD_EPOCH as CLIENT } from './leaderboard';

describe('Boss Rush board epoch', () => {
  it('client claim key ≡ server bucket key', () => {
    expect(CLIENT).toBe(SERVER);
  });
});
