import { describe, it, expect } from 'vitest';
import { meta } from './meta';
import { gameEvents } from '../core/events';

describe('framework-boss collection tracking', () => {
  it('records a slain boss into the Bestiary boss codex (by chassis)', () => {
    meta.reset(); // clean save
    const before = meta.collection().categories.find((c) => c.id === 'bosses')!;
    expect(before.entries.find((e) => e.id === 'juggernaut')!.tier).toBe(0);

    // A procedural boss id encodes its chassis: proc_<chassis>_<tl>.
    gameEvents.emit('bossKilled', { defId: 'proc_juggernaut_8', name: 'Dread', x: 0, y: 0 });
    // An authored boss id resolves its chassis via bossDef.
    gameEvents.emit('bossKilled', { defId: 'progenitor', name: 'The Progenitor', x: 0, y: 0 });

    const after = meta.collection().categories.find((c) => c.id === 'bosses')!;
    expect(after.entries.find((e) => e.id === 'juggernaut')!.tier).toBe(1);
    expect(after.entries.find((e) => e.id === 'swarmlord')!.tier).toBe(1); // progenitor's chassis
    expect(after.discovered).toBeGreaterThanOrEqual(2);
  });
});
