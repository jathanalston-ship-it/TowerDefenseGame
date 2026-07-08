// FNV-1a string hash — the seed primitive shared by the campaign/daily generators AND the
// Pages Functions backend (functions/ imports it to compute the same daily seed the client
// derives; see docs/DEPLOYMENT.md). Extracted from campaign.ts so server code can import it
// without dragging the stage-generator chain into the Worker bundle. campaign.ts re-exports
// it, so existing call sites are untouched.

/** FNV-1a string hash → uint32. */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
