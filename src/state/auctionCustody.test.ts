// Auction House CLIENT CUSTODY (docs/AUCTION-HOUSE.md §client) — the save↔market boundary
// meta owns: what offers itself for sale (with block reasons), what leaves the save when the
// server accepts a listing (escrow-out), what materializes on delivery, and the reconcile
// self-heal. Written with the mulliganPiece category (2026-07) as the primary subject —
// the piece UNLOCK trades; a grafted piece must unslot; a locked organism binds forever;
// delivering an owned piece dissolves to Tissue by the pillar's own duplicate law.

import { beforeEach, describe, expect, it } from 'vitest';
import { meta } from './meta';
import { DUP_TISSUE, mulliganRegistry } from '../core/mulligan';
import { mulliganFamilyKey } from '../core/marketCatalog';
import { CARD_POOL } from '../core/cards';
import { STARTER_GENES } from '../core/geneDiscovery';
import { defaultSave, serializeExport } from '../save/saveStore';
import type { SaveData } from '../save/saveStore';

beforeEach(() => meta.reset());

const PIECE = mulliganRegistry.ids()[0];
const PIECE2 = mulliganRegistry.ids()[1];

/** Inject an arbitrary save through the REAL import path (parseImport → sanitizers). */
function inject(mutate: (s: SaveData) => SaveData): void {
  const result = meta.importText(serializeExport(mutate(defaultSave())));
  expect(result.ok).toBe(true);
}

describe('mulligan pieces on the market', () => {
  it('an owned, unslotted piece offers itself — familyKey carries the sequenced rarity', () => {
    inject((s) => ({ ...s, mulliganDex: { [PIECE]: 'rare' } }));
    const row = meta.auctionSellables().find((x) => x.refKey === `mul:${PIECE}`);
    expect(row).toBeDefined();
    expect(row!.cat).toBe('mulliganPiece');
    expect(row!.rarity).toBe('rare');
    expect(row!.familyKey).toBe(mulliganFamilyKey(PIECE, 'rare'));
    expect(row!.blocks).toEqual([]);
  });

  it('a grafted piece is blocked with slotted; a reforge-LOCKED host reads as bound', () => {
    inject((s) => ({
      ...s,
      mulliganDex: { [PIECE]: 'common', [PIECE2]: 'common' },
      mulligans: {
        ...s.mulligans,
        needle: { slots: [{ id: PIECE, rarity: 'common', level: 1 }, null, null], visualSeed: 1, animSeed: 1 },
        mortar: { slots: [{ id: PIECE2, rarity: 'common', level: 1 }, null, null], visualSeed: 1, animSeed: 1, locked: true },
      },
    }));
    const rows = meta.auctionSellables();
    expect(rows.find((x) => x.refKey === `mul:${PIECE}`)!.blocks).toEqual(['slotted']);
    expect(rows.find((x) => x.refKey === `mul:${PIECE2}`)!.blocks).toEqual(['bound']);
  });

  it('escrow-out removes the dex entry — and refuses while the piece is grafted', () => {
    inject((s) => ({
      ...s,
      mulliganDex: { [PIECE]: 'uncommon', [PIECE2]: 'uncommon' },
      mulligans: {
        ...s.mulligans,
        needle: { slots: [{ id: PIECE2, rarity: 'uncommon', level: 1 }, null, null], visualSeed: 1, animSeed: 1 },
      },
    }));
    expect(meta.auctionEscrowOut(`mul:${PIECE}`)).toBe(true);
    expect(meta.get().mulliganDex[PIECE]).toBeUndefined();
    expect(meta.auctionEscrowOut(`mul:${PIECE2}`)).toBe(false); // slotted — the save keeps it
    expect(meta.get().mulliganDex[PIECE2]).toBe('uncommon');
    expect(meta.auctionEscrowOut(`mul:${PIECE}`)).toBe(false); // already gone
  });

  it('delivery grants an unowned piece at its rarity and stamps Auction House provenance', () => {
    const delivered = meta.auctionDeliver([{
      refKey: `mul:${PIECE}`, payloadJson: JSON.stringify({ grant: { kind: 'mulligan', id: PIECE, rarity: 'epic' } }),
      season: 2, transfers: 1,
    }]);
    expect(delivered).toEqual([{ refKey: `mul:${PIECE}`, cat: 'mulliganPiece', name: mulliganRegistry.get(PIECE)!.name, rarity: 'epic' }]);
    expect(meta.get().mulliganDex[PIECE]).toBe('epic');
    expect(meta.get().provenance[`mul:${PIECE}`]?.source).toBe('Auction House');
    expect(meta.get().provenance[`mul:${PIECE}`]?.transfers).toBe(1);
  });

  it('delivering an OWNED piece dissolves to Mulligan Tissue (the duplicate law, never a copy)', () => {
    inject((s) => ({ ...s, mulliganDex: { [PIECE]: 'rare' } }));
    const tissueBefore = meta.get().mulliganTissue;
    const delivered = meta.auctionDeliver([{
      refKey: `mul:${PIECE}`, payloadJson: JSON.stringify({ grant: { kind: 'mulligan', id: PIECE, rarity: 'legendary' } }),
      season: 0, transfers: 2,
    }]);
    expect(delivered[0]?.cat).toBe('mulliganTissue');
    expect(meta.get().mulliganTissue).toBe(tissueBefore + DUP_TISSUE.legendary);
    expect(meta.get().mulliganDex[PIECE]).toBe('rare'); // ownership untouched
  });

  it('reconcile removes a piece the server shows actively listed', () => {
    inject((s) => ({ ...s, mulliganDex: { [PIECE]: 'common' } }));
    expect(meta.auctionReconcile([`mul:${PIECE}`])).toBe(1);
    expect(meta.get().mulliganDex[PIECE]).toBeUndefined();
    expect(meta.auctionReconcile([`mul:${PIECE}`])).toBe(0); // idempotent
  });
});

describe('the other categories still round-trip (the integration audit floor)', () => {
  it('gene escrow-out + delivery round-trip', () => {
    // Starters are neverTrade (the infinite-printer guard) — discover a non-starter first.
    const tradable = CARD_POOL.find((c) => !STARTER_GENES.includes(c.id))!.id;
    inject((s) => ({ ...s, genesDiscovered: [...s.genesDiscovered, tradable] }));
    const gene = meta.auctionSellables().find((s) => s.cat === 'geneCard' && s.blocks.length === 0);
    expect(gene).toBeDefined();
    expect(meta.auctionEscrowOut(gene!.refKey)).toBe(true);
    const id = gene!.refKey.slice('gene:'.length);
    expect(meta.get().genesDiscovered).not.toContain(id);
    meta.auctionDeliver([{ refKey: gene!.refKey, payloadJson: JSON.stringify({ grant: { kind: 'gene', id } }), season: 0, transfers: 1 }]);
    expect(meta.get().genesDiscovered).toContain(id);
  });

  it('junk payloads and unknown kinds deliver nothing and never throw', () => {
    expect(meta.auctionDeliver([
      { refKey: 'mul:zzz', payloadJson: '{not json', season: 0, transfers: 0 },
      { refKey: 'mul:zzz', payloadJson: JSON.stringify({ grant: { kind: 'mulligan', id: 'no-such-piece', rarity: 'rare' } }), season: 0, transfers: 0 },
      { refKey: 'x:y', payloadJson: JSON.stringify({ grant: { kind: 'wormhole', id: 'x' } }), season: 0, transfers: 0 },
    ])).toEqual([]);
  });
});
