// Localized-economy laws (docs/ECONOMY.md §localized) — the currency registry IS the economy
// contract: every currency names the ONE system it upgrades and ≥2 gameplay sources it comes
// from. These tests pin the live registry as lawful and prove the laws actually bite.

import { describe, expect, it } from 'vitest';
import { ACCOUNT_CURRENCY, CURRENCIES, currency, currencyProblems } from './currencies';
import type { CurrencyDef, CurrencyId } from './currencies';

/** A lawful stand-alone def to mutate per negative case. */
const mk = (over: Partial<CurrencyDef> & { id: CurrencyDef['id'] }): CurrencyDef => ({
  name: `Name ${over.id}`,
  blurb: 'blurb',
  color: `#00000${over.id.length % 10}`,
  glow: 'rgba(0,0,0,0.5)',
  domain: 'account',
  earnedFrom: ['source-a', 'source-b'],
  ...over,
});

describe('currency registry', () => {
  it('the live registry is lawful', () => {
    expect(currencyProblems()).toEqual([]);
  });

  it('every id resolves through currency() and record keys match ids', () => {
    for (const key of Object.keys(CURRENCIES) as CurrencyId[]) {
      expect(currency(key).id).toBe(key);
    }
    expect(ACCOUNT_CURRENCY).toBe(CURRENCIES.genomeCores);
  });

  it('pins the localized map: one specialized wallet per system, broad wallets stay broad', () => {
    expect(CURRENCIES.hiveMaterials.domain).toBe('hive-production');
    expect(CURRENCIES.mulliganTissue.domain).toBe('mulligans');
    expect(CURRENCIES.geneEssence.domain).toBe('gene-archive');
    // The ONLY deliberately broad wallets — everything else upgrades exactly one system.
    const broad = Object.values(CURRENCIES).filter((d) => d.domain === 'account').map((d) => d.id).sort();
    expect(broad).toEqual(['genomeCores', 'ichor']);
  });
});

describe('currencyProblems() laws', () => {
  it('flags a record key that does not match its def id', () => {
    const bad = { genomeCores: mk({ id: 'ichor' }) };
    expect(currencyProblems(bad).join('\n')).toContain('record key must equal def.id');
  });

  it('flags duplicate names (case-insensitive) and duplicate colors', () => {
    const bad = {
      genomeCores: mk({ id: 'genomeCores', name: 'Chitin', color: '#111111' }),
      ichor: mk({ id: 'ichor', name: 'CHITIN', color: '#111111' }),
    };
    const text = currencyProblems(bad).join('\n');
    expect(text).toContain("name 'CHITIN' collides with genomeCores");
    expect(text).toContain("color '#111111' collides with genomeCores");
  });

  it('one specialized currency per system — duplicate non-account domains are unlawful', () => {
    const bad = {
      hiveMaterials: mk({ id: 'hiveMaterials', domain: 'hive-production' }),
      mulliganTissue: mk({ id: 'mulliganTissue', domain: 'hive-production' }),
    };
    expect(currencyProblems(bad).join('\n')).toContain("domain 'hive-production' already upgraded by hiveMaterials");
    // …but two 'account' wallets are lawful (broad by design).
    const ok = {
      genomeCores: mk({ id: 'genomeCores' }),
      ichor: mk({ id: 'ichor' }),
    };
    expect(currencyProblems(ok)).toEqual([]);
  });

  it('requires ≥2 distinct earn sources — except the single-faucet prestige mint', () => {
    const single = { antigen: mk({ id: 'antigen', domain: 'adaptation', earnedFrom: ['only-one'] }) };
    expect(currencyProblems(single).join('\n')).toContain('needs ≥2 distinct earn sources');
    const dupes = { antigen: mk({ id: 'antigen', domain: 'adaptation', earnedFrom: ['same', 'same'] }) };
    expect(currencyProblems(dupes).join('\n')).toContain('needs ≥2 distinct earn sources');
    const prestige = { ascendantCells: mk({ id: 'ascendantCells', domain: 'prestige', earnedFrom: ['molt'] }) };
    expect(currencyProblems(prestige)).toEqual([]);
  });
});
