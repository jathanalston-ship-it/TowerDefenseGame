// Codex overlay — the Collection layer's face. Renders the registry-derived categories
// (Bestiary, Towers, Heroes, Mutations, Armory, Caches) with per-entry discovery tiers, plus
// the unlocked completion rewards (badges, titles, portraits, themes, cosmetics). Read-only:
// it reflects meta.collection() / meta.collectionRewards(); it never writes. Self-contained
// (inline-styled) so it doesn't depend on shared CSS and stays conflict-light.

import { useMemo } from 'react';
import { meta } from '../state/meta';
import type { CollectionCategory, CollectionEntry, RewardKind } from '../core/collection';

const REWARD_ICON: Record<RewardKind, string> = {
  title: '✦',
  badge: '◈',
  portrait: '☻',
  theme: '◧',
  cosmetic: '✷',
  bonus: '▲',
};

function tierColor(e: CollectionEntry): string {
  if (e.tier <= 0) return 'rgba(255,255,255,0.10)';
  const frac = e.maxTier > 1 ? e.tier / e.maxTier : 1;
  // dim → bright cyan→gold as mastery rises
  return frac >= 1 ? '#ffd24d' : frac >= 0.66 ? '#9be8ff' : frac >= 0.33 ? '#6fc8e6' : '#4f8aa0';
}

function CategoryBlock({ c }: { c: CollectionCategory }): JSX.Element {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 15, letterSpacing: '0.06em' }}>
          {c.name} {c.complete && <span style={{ color: '#ffd24d' }}>★</span>}
        </h3>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{c.discovered}/{c.total}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 6 }}>
        {c.entries.map((e) => (
          <div
            key={e.id}
            title={`${e.name} — ${e.tierLabel}`}
            style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              padding: '6px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              borderLeft: `3px solid ${tierColor(e)}`,
              opacity: e.tier <= 0 ? 0.45 : 1,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{e.tier <= 0 ? '???' : e.name}</span>
            <span style={{ fontSize: 10.5, opacity: 0.75 }}>
              {e.tierLabel}
              {e.maxTier > 1 && e.tier > 0 ? ` · ${e.tier}/${e.maxTier}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CollectionPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const view = useMemo(() => meta.collection(), []);
  const rewards = useMemo(() => meta.collectionRewards(), []);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(4,8,14,0.74)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          width: 'min(880px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
          background: 'linear-gradient(180deg, #0e1622, #0a0f18)',
          border: '1px solid rgba(120,170,230,0.18)', borderRadius: 12,
          boxShadow: '0 16px 44px rgba(0,0,0,0.5)', padding: '20px 22px', color: '#dfe8f2',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ margin: 0, letterSpacing: '0.12em' }}>CODEX</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: '#9fb2c8', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
            Close
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
          {view.discovered}/{view.total} discovered · {Math.round(view.pct * 100)}% complete
        </div>
        <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ width: `${Math.round(view.pct * 100)}%`, height: '100%', background: 'linear-gradient(90deg, #5ad1ff, #ffd24d)' }} />
        </div>

        {view.categories.map((c) => (
          <CategoryBlock key={c.id} c={c} />
        ))}

        <h3 style={{ margin: '8px 0 8px', fontSize: 15, letterSpacing: '0.06em' }}>Rewards</h3>
        {rewards.length === 0 ? (
          <div style={{ fontSize: 12.5, opacity: 0.7 }}>Complete a category to earn titles, badges, and bonuses.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {rewards.map((r) => (
              <div
                key={r.id}
                title={r.desc}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: 999,
                  background: 'rgba(255,210,77,0.10)', border: '1px solid rgba(255,210,77,0.35)',
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: '#ffd24d' }}>{REWARD_ICON[r.kind]}</span>
                <span>{r.name}</span>
                <span style={{ opacity: 0.55, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.kind}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
