// Shareable replay codes (docs/REPLAY-SHARE.md). Determinism makes "share this exact
// run" nearly free: the same {ctor args, input log, end, claim} record the leaderboard
// verifies (core/replay.ts) IS the share payload — gzip it, base64url it, and any
// browser can re-run the run in the Replay Theater (ui/SpectateView.tsx).
//
// Wire format: '<PREFIX><base64url bytes>'. ARZ1 = gzipped JSON (the normal path);
// ARR1 = plain JSON for the rare engine without CompressionStream. Decoders accept
// both forever — codes live in chats and posts long after the build that made them.

import type { ReplayRecord } from '../core/replay';
import { MAX_REPLAY_BYTES } from '../core/replay';

const GZ = 'ARZ1.';
const RAW = 'ARR1.';

/** Codes at or under this length ride a ?replay= link; longer ones share as plain text
 *  (practical URL limit across chat apps/browsers is ~2k chars). */
export const MAX_URL_CODE_CHARS = 1_800;

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/** Serialized ReplayRecord JSON → share code. Never throws — falls back to the raw wire. */
export async function encodeReplayCode(json: string): Promise<string> {
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    try {
      return GZ + toB64url(await pipe(bytes, new CompressionStream('gzip')));
    } catch {
      /* compression failed — the raw wire below still shares */
    }
  }
  return RAW + toB64url(bytes);
}

/** Share code → validated ReplayRecord, or null for anything malformed/oversized. */
export async function decodeReplayCode(code: string): Promise<ReplayRecord | null> {
  const c = code.trim();
  const gz = c.startsWith(GZ);
  if (!gz && !c.startsWith(RAW)) return null;
  const bytes = fromB64url(c.slice(GZ.length));
  if (!bytes) return null;
  let json: string;
  try {
    if (gz) {
      if (typeof DecompressionStream === 'undefined') return null;
      json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));
    } else {
      json = new TextDecoder().decode(bytes);
    }
  } catch {
    return null;
  }
  if (json.length > MAX_REPLAY_BYTES) return null;
  try {
    const r = JSON.parse(json) as ReplayRecord;
    // The same shape gate the leaderboard verifier applies (core/replay.ts verifyReplay).
    if (r?.v !== 1 || !Array.isArray(r.args) || !Array.isArray(r.log) || typeof r.end !== 'number' || typeof r.claim?.wave !== 'number') return null;
    return r;
  } catch {
    return null;
  }
}

/** A shareable link for short codes; null when the code must travel as plain text. */
export function replayShareUrl(code: string): string | null {
  if (code.length > MAX_URL_CODE_CHARS || typeof window === 'undefined') return null;
  return `${window.location.origin}/?replay=${code}`;
}
