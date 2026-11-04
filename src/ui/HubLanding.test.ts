// Hub doors (docs/NOTIFICATIONS.md §hubs/§decisions): a door badge counts member SCREENS that hold
// a decision (never summed item counts — those read "9+" forever), and a hub with exactly one
// open screen has no landing — its door opens the screen directly.

import { describe, expect, it } from 'vitest';
import { doorBadge, soleOpenScreen } from './HubLanding';
import { navGroups } from './navModel';
import { defaultSave } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

const group = (id: string) => navGroups().find((g) => g.id === id)!;

describe('doorBadge — screens needing a decision, not items', () => {
  it('16 upgradeable gene cards + 3 affordable stars is TWO screens, not "9+"', () => {
    expect(doorBadge(['towers', 'genes', 'heroes'], { towers: 3, genes: 16 }, new Map())).toBe(2);
  });

  it('teasers never count (a sealed screen is not a decision)', () => {
    expect(doorBadge(['towers', 'genes'], { towers: 3, genes: 16 }, new Map([['genes', {}]]))).toBe(1);
    expect(doorBadge(['towers'], {}, new Map())).toBe(0);
  });
});

describe('soleOpenScreen — the one-screen hub door', () => {
  it('a fresh account: the Mission hub IS the Campaign (Home never counts — it has its own door)', () => {
    expect(soleOpenScreen(defaultSave(), group('play'))).toBe('campaign');
  });

  it('a developed hub with several open screens keeps its landing', () => {
    const fresh = defaultSave();
    const deep: SaveData = { ...fresh, campaign: { ...fresh.campaign, cleared: { standard: 30 } }, totalRuns: 40 };
    expect(soleOpenScreen(deep, group('play'))).toBeNull();
  });
});
