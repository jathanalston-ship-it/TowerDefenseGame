// Default notification sources — wires the shipped menus to the generic engine
// (notifications.ts). Each is a pure count(save); the engine handles seen/clear/re-light.
// This is the ONE place menu notifications are declared — menus themselves stay logic-free,
// and a new feature adds a badge with a single registerNotification() call here (or from its
// own module). Channels match Hub nav keys (src/ui/Hub.tsx).
//
// Imported for its side effects (the registrations run on load); Hub.tsx pulls it in.

import { registerNotification } from './notifications';
import { geneArchiveRows } from './geneArchive';
import { unlockedCutsceneIds } from '../save/derive';
import { collectionContextOf, isTowerUnlocked, nextStarCost } from './meta';
import { collectionView } from '../core/collection';
import { TOWER_DEFS, TOWER_ORDER } from '../core/config';
import { marketWindow } from '../core/market';
import { dailyKey } from '../core/daily';

// Genetic Vault — unopened bio-containers banked from runs, waiting to be cracked.
registerNotification({
  id: 'vault.containers',
  channel: 'vault',
  count: (s) => s.pendingContainers.length,
});

// Splice Market — a stock window the player hasn't seen yet (fresh goods landed). Uses the
// max-window rule so a rewound clock can't strobe the badge; viewing the market stamps
// seenWindow (meta.openMarket) and clears it.
registerNotification({
  id: 'market.stock',
  channel: 'market',
  count: (s) => (Math.max(marketWindow(Date.now()), s.market.window) > s.market.seenWindow ? 1 : 0),
});

// Premium Store — today's rotating pack hasn't been SEEN yet (opening the store stamps
// seenKey via meta.openStore; the badge re-lights at the next UTC rotation).
registerNotification({
  id: 'store.rotation',
  channel: 'store',
  count: (s) => (s.premium.seenKey === dailyKey() ? 0 : 1),
});

// Tower Lab — towers whose next star you can afford right now (drops as you buy them),
// plus DORMANT towers whose synthesis is claimable (docs/TOWERS.md §expansion unlock gate).
registerNotification({
  id: 'towers.stars',
  channel: 'towers',
  count: (s) =>
    TOWER_ORDER.reduce((n, k) => {
      if (!isTowerUnlocked(s, k)) {
        const unlock = TOWER_DEFS[k].unlockShards ?? 0;
        return n + ((s.towerShards[k] ?? 0) >= unlock ? 1 : 0); // synthesis ready
      }
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

// Memory Archive — story cutscenes recovered since last viewed (docs/CUTSCENES.md §archive).
registerNotification({
  id: 'collection.memories',
  channel: 'collection',
  count: (s) => unlockedCutsceneIds(s).length,
});

// Gene Archive — cards you can permanently upgrade RIGHT NOW (owned + gate met + affordable).
registerNotification({
  id: 'genes.upgradeable',
  channel: 'genes',
  count: (s) => geneArchiveRows(s).reduce((n, r) => n + (r.upgradeable ? 1 : 0), 0),
});
