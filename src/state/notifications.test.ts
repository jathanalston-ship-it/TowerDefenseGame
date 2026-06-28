import { describe, expect, it } from 'vitest';
import { notifications, registerNotification } from './notifications';
import type { SaveData } from '../save/saveStore';

// The sources under test ignore the save (they read mutable closures), so a stub is fine.
const SAVE = {} as SaveData;

describe('notification badges', () => {
  it('reports unseen counts and clears the moment a channel is viewed', () => {
    let containers = 3;
    registerNotification({ id: 'test.vault', channel: 'vault', count: () => containers });

    expect(notifications.badges(SAVE).vault).toBe(3);
    notifications.markSeen('vault', SAVE);
    expect(notifications.badges(SAVE).vault ?? 0).toBe(0); // viewed → gone immediately

    containers = 5; // two new arrive after viewing
    expect(notifications.badges(SAVE).vault).toBe(2); // only the NEW ones, not all 5
  });

  it('re-lights after the count drops then rises (clamp-on-decrease)', () => {
    let pending = 3;
    registerNotification({ id: 'test.queue', channel: 'queue', count: () => pending });

    notifications.markSeen('queue', SAVE); // watermark = 3
    expect(notifications.badges(SAVE).queue ?? 0).toBe(0);

    pending = 1; // claimed two — watermark must clamp down to 1
    notifications.sync(SAVE);
    expect(notifications.badges(SAVE).queue ?? 0).toBe(0);

    pending = 4; // three new — should show 3, not 1
    expect(notifications.badges(SAVE).queue).toBe(3);
  });

  it('sums multiple sources sharing one channel', () => {
    registerNotification({ id: 'test.a', channel: 'multi', count: () => 1 });
    registerNotification({ id: 'test.b', channel: 'multi', count: () => 2 });
    expect(notifications.badges(SAVE).multi).toBe(3);
  });

  it('ignores duplicate ids and never reports negative/zero channels', () => {
    registerNotification({ id: 'test.dupe', channel: 'dupe', count: () => 2 });
    registerNotification({ id: 'test.dupe', channel: 'dupe', count: () => 999 }); // dropped
    expect(notifications.badges(SAVE).dupe).toBe(2);

    registerNotification({ id: 'test.none', channel: 'none', count: () => 0 });
    expect('none' in notifications.badges(SAVE)).toBe(false); // empty channels omitted
  });
});
