// Shared Chromium resolution for the headless dev probes (mobilecheck, cogload, first-session).
// MOBILECHECK_CHROMIUM overrides; otherwise the newest preinstalled headless shell under
// /opt/pw-browsers, then a full Chromium there, else undefined (Playwright's own default).
// Resolving by scan — not a pinned build number — keeps the probes working across image updates.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function chromePath(): string | undefined {
  if (process.env.MOBILECHECK_CHROMIUM) return process.env.MOBILECHECK_CHROMIUM;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const shells = readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of shells) {
    for (const rel of ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) { const p = join(base, d, rel); if (existsSync(p)) return p; }
  }
  const full = readdirSync(base).filter((d) => /^chromium-\d+/.test(d)).sort().reverse();
  for (const d of full) {
    for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) { const p = join(base, d, rel); if (existsSync(p)) return p; }
  }
  return undefined;
}
