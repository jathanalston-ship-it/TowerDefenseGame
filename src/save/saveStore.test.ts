import { describe, it, expect } from 'vitest';
import { SaveStore, defaultSave } from './saveStore';
import type { SaveData, StorageLike } from './saveStore';

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('SaveStore', () => {
  it('round-trips data', () => {
    const store = new SaveStore(mem());
    const data: SaveData = { ...defaultSave(), shards: 123, bestWave: 7, upgrades: { lethality: 3 } };
    store.save(data);
    const loaded = store.load();
    expect(loaded.shards).toBe(123);
    expect(loaded.bestWave).toBe(7);
    expect(loaded.upgrades.lethality).toBe(3);
  });

  it('returns defaults when empty', () => {
    expect(new SaveStore(mem()).load()).toEqual(defaultSave());
  });

  it('recovers to defaults from invalid JSON without throwing', () => {
    const s = mem();
    s.map.set('assimilate.save', '{not valid json');
    expect(new SaveStore(s).load()).toEqual(defaultSave());
  });

  it('recovers to defaults from a tampered checksum (integrity guard)', () => {
    const s = mem();
    const store = new SaveStore(s);
    store.save({ ...defaultSave(), shards: 50 });
    const raw = JSON.parse(s.map.get('assimilate.save')!);
    raw.data.shards = 999999; // tamper with the body, leave checksum stale
    s.map.set('assimilate.save', JSON.stringify(raw));
    expect(store.load()).toEqual(defaultSave());
  });
});
