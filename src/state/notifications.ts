// Global notification badges — a generic, future-proof registry so ANY feature can flag
// "there's something here" on a menu, without that menu (or this module) hardcoding the logic.
//
// A SOURCE declares which menu CHANNEL it lights up and a pure count(save) of how many
// noteworthy things exist right now. A channel's badge = how many of those the player hasn't
// acknowledged yet: max(0, count − seen). Acknowledgement (markSeen) is per-source and
// persisted device-locally (like prefs). The "seen" watermark is clamped DOWN whenever a
// count drops — open a container, claim a reward, buy a star — so re-earning later re-lights
// the dot. This one rule handles both flavours of notification uniformly:
//   • pending/actionable (containers, claimable rewards, affordable upgrades) — drops on action;
//   • cumulative/"new since viewed" (equipment, discoveries) — monotonically climbs.
//
// Adding a sixth source is a single registerNotification() call (see notificationSources.ts).
// Nothing in the menus changes.

import { createStore } from './store';
import type { SaveData } from '../save/saveStore';

export interface NotificationSource {
  /** Stable, unique id — the persisted watermark key. */
  id: string;
  /** The menu / nav key this badge attaches to (e.g. 'vault', 'towers', 'collection'). */
  channel: string;
  /** How many noteworthy things exist right now. Pure function of the save. */
  count: (save: SaveData) => number;
}

const sources: NotificationSource[] = [];

/** Register a notification source. Idempotent by id (safe to call on every import/mount). */
export function registerNotification(src: NotificationSource): void {
  if (sources.some((s) => s.id === src.id)) return;
  sources.push(src);
}

// ── Persisted "seen" watermarks (device-local UX state, like prefs) ───────────
const SEEN_KEY = 'assimilate.notif.seen';

function loadSeen(): Record<string, number> {
  try {
    const obj = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
    return obj && typeof obj === 'object' ? (obj as Record<string, number>) : {};
  } catch {
    return {}; // storage unavailable / corrupt → start fresh (badges simply re-show)
  }
}

const seenStore = createStore<Record<string, number>>(loadSeen());

function persistSeen(next: Record<string, number>): void {
  seenStore.set(next);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
}

export const notifications = {
  /** Subscribe React to seen-watermark changes (pair with meta.use() for the save). */
  use: seenStore.use,

  /** Unacknowledged counts per channel, e.g. { vault: 2, towers: 1 }. Pure read — channels
   *  with nothing new are omitted. Reads the clamped watermark so display is always correct. */
  badges(save: SaveData): Record<string, number> {
    const seen = seenStore.get();
    const out: Record<string, number> = {};
    for (const s of sources) {
      const count = Math.max(0, s.count(save));
      const ack = Math.min(seen[s.id] ?? 0, count); // never "seen" more than currently exist
      const unseen = count - ack;
      if (unseen > 0) out[s.channel] = (out[s.channel] ?? 0) + unseen;
    }
    return out;
  },

  /** Mark every source on a channel as seen at its current count — the badge clears now. */
  markSeen(channel: string, save: SaveData): void {
    const next = { ...seenStore.get() };
    let changed = false;
    for (const s of sources) {
      if (s.channel !== channel) continue;
      const count = Math.max(0, s.count(save));
      if (next[s.id] !== count) { next[s.id] = count; changed = true; }
    }
    if (changed) persistSeen(next);
  },

  /** Lower any watermark that now exceeds its count (so a later increase re-lights the dot,
   *  and a save reset/import can't leave a stale watermark suppressing real notifications).
   *  Idempotent — call whenever the save changes. */
  sync(save: SaveData): void {
    const next = { ...seenStore.get() };
    let changed = false;
    for (const s of sources) {
      const count = Math.max(0, s.count(save));
      if (next[s.id] !== undefined && next[s.id] > count) { next[s.id] = count; changed = true; }
    }
    if (changed) persistSeen(next);
  },
};
