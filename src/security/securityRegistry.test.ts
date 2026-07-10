// AUTOMATIC FUTURE ENFORCEMENT (docs/SECURITY.md §enforcement) — the contracts that make the
// security layer self-maintaining:
//   1. Every registry entry is complete, sane, and its guard('<id>') call site really exists
//      in the file it names — the registry can never rot into fiction.
//   2. Every high-risk meta mutator (buy/claim/spend/unlock/salvage/reforge/upgrade/purchase
//      naming shapes) is either guarded + registered or EXPLICITLY allowlisted with a reason —
//      new economy surfaces cannot ship unguarded by forgetting.
//   3. The debug surface stays behind isDebugEnabled() so release hardening
//      (VITE_RELEASE_HARDENED=1) compiles it out.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUARDED_META_METHODS, SECURITY_ACTIONS, securityActionProblems } from './registry';
import { meta } from '../state/meta';

const ROOT = resolve(__dirname, '../..');
const read = (p: string): string => readFileSync(resolve(ROOT, p), 'utf8');
const metaSrc = read('src/state/meta.ts');

// Mutators that intentionally carry NO direct guard — each with the reason the pipeline
// still covers them. Adding a method here is a REVIEWED decision, not a default.
const UNGUARDED_ALLOWLIST: Record<string, string> = {
  buyPassLevel: 'spends through spendIchor, which carries the ichor.spend guard',
  buyPassPremium: 'spends through spendIchor, which carries the ichor.spend guard',
  buyGeneSlot: 'small core ladder purchase; the persist flood valve covers spam',
  claimAllPass: 'iterates claimPassLevel — each level passes the pass.claim guard',
  spendAdaptation: 'reallocates already-owned points (no currency); flood valve covers spam',
  spendRushEntry: 'stamina itself is the limiter (a regenerating attempt gate)',
  claimExpedition: 'GUARDED — listed for the name-scan (see GUARDED_META_METHODS)',
  salvageValueOf: 'pure read — the salvage-value preview, mutates nothing',
  salvagePreview: 'pure read — the batch salvage preview, mutates nothing',
};

describe('central security registry', () => {
  it('every action policy is complete and within its level ceiling', () => {
    const ids = Object.keys(SECURITY_ACTIONS);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    for (const [key, p] of Object.entries(SECURITY_ACTIONS)) {
      expect(p.id, 'map key must equal policy id').toBe(key);
      expect(securityActionProblems(p), `policy ${key}`).toEqual([]);
    }
  });

  it("every entry's guard('<id>') call site exists in the file it names", () => {
    for (const p of Object.values(SECURITY_ACTIONS)) {
      const src = p.at === 'src/state/meta.ts' ? metaSrc : read(p.at);
      const called = src.includes(`guard('${p.id}'`) || src.includes(`guardOk('${p.id}'`);
      expect(called, `${p.at} must contain a guard call for '${p.id}'`).toBe(true);
    }
  });

  it('every GUARDED_META_METHODS binding is real: method exists, action exists, call site exists', () => {
    const m = meta as unknown as Record<string, unknown>;
    for (const [method, actionId] of Object.entries(GUARDED_META_METHODS)) {
      expect(typeof m[method], `meta.${method} must exist`).toBe('function');
      expect(SECURITY_ACTIONS[actionId], `action '${actionId}' for meta.${method}`).toBeDefined();
      expect(metaSrc.includes(`guardOk('${actionId}'`), `meta.ts must guard '${actionId}'`).toBe(true);
    }
  });

  it('NEW high-risk meta mutators cannot ship unguarded (name-shape scan)', () => {
    // Every method whose NAME declares economy intent must be guarded or allowlisted.
    const risky = /^  ((?:buy|claim|spend|unlock|salvage|purchase)[A-Z][A-Za-z]*|reforge[A-Z][A-Za-z]*|upgrade[A-Z][A-Za-z]*)\(/gm;
    const found = new Set<string>();
    for (const match of metaSrc.matchAll(risky)) found.add(match[1]);
    expect(found.size).toBeGreaterThanOrEqual(20); // the scan is alive
    for (const name of found) {
      const covered = name in GUARDED_META_METHODS || name in UNGUARDED_ALLOWLIST;
      expect(covered, `meta.${name} looks like an economy mutator — guard it (GUARDED_META_METHODS) or allowlist it WITH A REASON`).toBe(true);
    }
  });

  it('the debug surface stays behind isDebugEnabled (release hardening compiles it out)', () => {
    // Every debug*/devReset method body must open with the isolation gate.
    const sigs = [...metaSrc.matchAll(/^  (debug[A-Z][A-Za-z]*|devReset)\([^)]*\)[^{]*\{\n(.*)$/gm)];
    expect(sigs.length).toBeGreaterThanOrEqual(15);
    for (const s of sigs) {
      expect(s[2].includes('isDebugEnabled()'), `meta.${s[1]} must gate on isDebugEnabled()`).toBe(true);
    }
    // …and the kill-switch itself reads the hardening flag.
    expect(read('src/debug/debug.ts')).toContain("VITE_RELEASE_HARDENED !== '1'");
  });

  it('the persist chokepoint carries the flood valve + clock high-water mark', () => {
    expect(metaSrc).toContain('admitWrite()');
    expect(metaSrc).toContain('noteClock()');
  });
});
