// Default notification sources — wires the shipped menus to the generic engine
// (notifications.ts). Each is a pure count(save); the engine handles seen/clear/re-light.
// This is the ONE place menu notifications are declared — menus themselves stay logic-free,
// and a new feature adds a badge with a single registerNotification() call here (or from its
// own module). Channels match Hub nav keys (src/ui/Hub.tsx).
//
// Imported for its side effects (the registrations run on load); Hub.tsx pulls it in.

import { registerNotification } from './notifications';
import { collectionContextOf, nextStarCost } from './meta';
import { collectionView } from '../core/collection';
import { TOWER_ORDER } from '../core/config';

// Genetic Vault — unopened bio-containers banked from runs, waiting to be cracked.
registerNotification({
  id: 'vault.containers',
  channel: 'vault',
  count: (s) => s.pendingContainers.length,
});

// Tower Lab — towers whose next star you can afford right now (drops as you buy them).
registerNotification({
  id: 'towers.stars',
  channel: 'towers',
  count: (s) =>
    TOWER_ORDER.reduce((n, k) => {
      const cost = nextStarCost(s, k);
      return n + (cost !== null && (s.towerShards[k] ?? 0) >= cost ? 1 : 0);
    }, 0),
});

// Equipment — newly acquired gear (the inventory grows as caches drop loot). Its own nav now.
registerNotification({
  id: 'heroes.equipment',
  channel: 'equipment',
  count: (s) => s.equipment.inventory.length,
});

// Profile — achievements unlocked (their Shard rewards are auto-granted) since last viewed.
registerNotification({
  id: 'profile.achievements',
  channel: 'profile',
  count: (s) => (s.achievements ?? []).length,
});

// Collection — codex entries newly discovered since last viewed.
registerNotification({
  id: 'collection.discovered',
  channel: 'collection',
  count: (s) => collectionView(collectionContextOf(s)).discovered,
});
