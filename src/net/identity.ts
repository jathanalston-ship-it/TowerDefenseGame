// Anonymous device identity for the backend lanes (purchases, cloud save,
// leaderboards). No accounts, no PII: a random UUID names the player and a
// random 256-bit token proves ownership of the cloud-save slot. Both live in
// localStorage OUTSIDE the save blob (they identify the DEVICE lineage, and a
// save import must not overwrite them). The pair doubles as the "sync code" a
// player copies to restore on another device. Storage-less environments
// (private mode) fall back to a per-session identity — play still works.

const ID_KEY = 'assimilate.playerId';
const TOKEN_KEY = 'assimilate.syncToken';

let memoryId: string | null = null;
let memoryToken: string | null = null;

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += b.toString(16).padStart(2, '0');
  return out;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — memory fallback carries the session */
  }
}

export function playerId(): string {
  const stored = read(ID_KEY);
  if (stored && /^[0-9a-f-]{36}$/.test(stored)) return stored;
  if (!memoryId) {
    memoryId = crypto.randomUUID();
    write(ID_KEY, memoryId);
  }
  return memoryId;
}

export function syncToken(): string {
  const stored = read(TOKEN_KEY);
  if (stored && /^[0-9a-f]{64}$/.test(stored)) return stored;
  if (!memoryToken) {
    memoryToken = randomHex(32);
    write(TOKEN_KEY, memoryToken);
  }
  return memoryToken;
}

/** The copyable sync code: `playerId.syncToken` — everything a new device needs
 *  to restore this player's cloud save and purchase history. */
export function syncCode(): string {
  return `${playerId()}.${syncToken()}`;
}

/** Adopt a sync code from another device (restores identity BEFORE a cloud pull).
 *  Returns false when the code doesn't parse. */
export function adoptSyncCode(code: string): boolean {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/.exec(code.trim());
  if (!m) return false;
  memoryId = m[1];
  memoryToken = m[2];
  write(ID_KEY, m[1]);
  write(TOKEN_KEY, m[2]);
  return true;
}
