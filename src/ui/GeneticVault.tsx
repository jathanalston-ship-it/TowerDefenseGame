// Genetic Vault — the loot system's home AND its opening floor (LOOTBOX.md). Runs bank
// completed bio-containers UNOPENED into the stockpile; the player cracks them open here,
// one at a time, with the premium reveal ceremony — only then do the rewards apply. Below
// the stockpile, the incubating meter shows the container filling now, the pre-determined
// next, and pity guarantees. Self-contained (inline-styled) to stay conflict-light.

import { useState } from 'react';
import { meta } from '../state/meta';
import type { CrackedContainer } from '../state/meta';
import { costOf, rarityRegistry } from '../core/loot';
import { LootReveal } from './LootReveal';

function rarityColor(id: string | undefined): string {
  return (id ? rarityRegistry.get(id)?.color : undefined) ?? 'var(--r-common)';
}
function rarityName(id: string | undefined): string {
  return (id ? rarityRegistry.get(id)?.name : undefined) ?? 'Common';
}

function Container({ id, pct, big }: { id: string | undefined; pct: number; big?: boolean }): JSX.Element {
  const color = rarityColor(id);
  const size = big ? 96 : 56;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: size, height: size, borderRadius: 14,
          background: `radial-gradient(circle at 50% 35%, ${color}, rgba(8,12,20,0.9))`,
          border: `2px solid ${color}`, boxShadow: `0 0 ${big ? 26 : 12}px ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: big ? 38 : 22, color: '#0a0f18', fontWeight: 800,
        }}
        aria-hidden
      >
        ◈
      </div>
      <span style={{ fontSize: big ? 14 : 11.5, letterSpacing: '0.08em', color, fontWeight: 700 }}>
        {rarityName(id).toUpperCase()}
      </span>
      {big && (
        <div style={{ width: 200, height: 9, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: color, transition: 'width 240ms' }} />
        </div>
      )}
    </div>
  );
}

export function GeneticVault(): JSX.Element {
  const save = meta.use();
  const [opening, setOpening] = useState<CrackedContainer | null>(null);

  const pending = save.pendingContainers;
  // Group the stockpile for a compact display: loot boxes by rarity + the run caches.
  const lootCounts = new Map<string, number>();
  let cacheCount = 0;
  for (const c of pending) {
    if (c.kind === 'cache') cacheCount++;
    else lootCounts.set(c.rarity, (lootCounts.get(c.rarity) ?? 0) + 1);
  }
  const grouped = rarityRegistry.ids().filter((id) => lootCounts.has(id)).map((id) => ({ id, n: lootCounts.get(id) as number }));

  const crack = (): void => {
    const award = meta.openContainer(); // applies the reward + removes it from the stockpile
    if (award) setOpening(award);
  };

  // Incubating meter — read the live queue directly (queue[0] + banked progress; queue[1] next).
  const lq = save.lootQueue;
  const frontId = lq.queue[0] ?? 'common';
  const nextId = lq.queue[1];
  const cost = costOf(frontId);
  const filled = Math.min(Math.max(0, lq.progress), cost);
  const pct = cost > 0 ? filled / cost : 0;
  const pityRows = rarityRegistry
    .all()
    .filter((d) => (d.pity ?? 0) > 0)
    .map((d) => ({ id: d.id, name: d.name, color: d.color, ceiling: d.pity as number, since: lq.pity[d.id] ?? 0 }));

  return (
    <div className="vault">
      <div className="panel-title">Genetic Vault</div>
      <div className="panel-sub">
        Containers you earn in a run bank here unopened. Crack one open to roll its rewards — they
        only apply once you do.
      </div>

      {/* Ready to crack — the stockpile + the open action */}
      <div className="vault-ready">
        <div className="vault-h">Ready to crack {pending.length > 0 && <b style={{ color: 'var(--gold)' }}>· {pending.length}</b>}</div>
        {pending.length === 0 ? (
          <div className="vault-empty">No containers ready — fill the meter in a run to earn one.</div>
        ) : (
          <>
            <div className="vault-stockpile">
              {cacheCount > 0 && (
                <span className="vault-chip" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
                  ◈ Run Cache{cacheCount > 1 ? <b style={{ color: 'var(--text)' }}> ×{cacheCount}</b> : null}
                </span>
              )}
              {grouped.map((g) => (
                <span className="vault-chip" key={g.id} style={{ borderColor: rarityColor(g.id), color: rarityColor(g.id) }}>
                  ◈ {rarityName(g.id)}{g.n > 1 ? <b style={{ color: 'var(--text)' }}> ×{g.n}</b> : null}
                </span>
              ))}
            </div>
            <button className="primary vault-crack" onClick={crack}>
              ◈ Crack Open {pending.length > 1 ? `(${pending.length} left)` : ''}
            </button>
          </>
        )}
      </div>

      {/* Incubating — the meter filling now */}
      <div className="vault-stage">
        <div className="vault-incubating">
          <div className="vault-h">Incubating</div>
          <Container id={frontId} pct={pct} big />
          <div className="vault-fill">
            {Math.floor(filled)} / {cost} pts
            <span className="hud-sub"> · {Math.max(1, Math.ceil(cost - filled))} to complete</span>
          </div>
        </div>
        <div className="vault-next">
          <div className="vault-h">Next in line</div>
          {nextId ? <Container id={nextId} pct={0} /> : <div className="vault-empty">rolling…</div>}
        </div>
      </div>

      {pityRows.length > 0 && (
        <div className="vault-pity">
          <div className="vault-h">Guarantees</div>
          {pityRows.map((p) => {
            const remaining = Math.max(0, p.ceiling - p.since);
            return (
              <div className="vault-pity-row" key={p.id}>
                <span className="vault-pity-k" style={{ color: p.color }}>{p.name}</span>
                <div className="vault-pity-bar">
                  <div style={{ width: `${Math.round((p.since / p.ceiling) * 100)}%`, height: '100%', background: p.color }} />
                </div>
                <span className="vault-pity-v">{remaining === 0 ? 'GUARANTEED next' : `in ${remaining}`}</span>
              </div>
            );
          })}
        </div>
      )}

      {opening && (
        <div className="vault-ceremony">
          <LootReveal
            chest={opening.chest}
            title={opening.label}
            color={opening.color}
            onDone={() => setOpening(null)}
          />
        </div>
      )}
    </div>
  );
}
