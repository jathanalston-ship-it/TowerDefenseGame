// Genetic Vault — the loot system's dedicated home (LOOTBOX.md). Bio-containers incubate as
// you fight: a meter fills toward the front container (its rarity already decided), the next
// container is pre-shown, and pity counters build toward guaranteed tiers. Containers crack
// open automatically with the premium reveal ceremony (LootReveal) as they complete — this
// screen is the read-only vault that shows what's incubating and what's guaranteed next.
// Self-contained (inline-styled) so it stays conflict-light against the shared loot CSS.

import { meta } from '../state/meta';
import { costOf, rarityRegistry } from '../core/loot';

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
  // Read the live meta queue directly (loot banks into it during a run): the front container
  // is queue[0] with `progress` points banked toward its cost; queue[1] is the pre-shown next.
  const lq = save.lootQueue;
  const frontId = lq.queue[0] ?? 'common';
  const nextId = lq.queue[1];
  const cost = costOf(frontId);
  const filled = Math.min(Math.max(0, lq.progress), cost);
  const view = { frontId, nextId, cost, filled, pct: cost > 0 ? filled / cost : 0 };
  const pity = lq.pity;
  // Pity rails: every rarity with a pity ceiling shows how close a guarantee is.
  const pityRows = rarityRegistry
    .all()
    .filter((d) => (d.pity ?? 0) > 0)
    .map((d) => ({ id: d.id, name: d.name, color: d.color, ceiling: d.pity as number, since: pity[d.id] ?? 0 }));

  return (
    <div className="vault">
      <div className="panel-title">Genetic Vault</div>
      <div className="panel-sub">
        Bio-containers incubate as you fight — the meter fills toward the container below, then it
        cracks open automatically with the reveal ceremony. The next container is already determined.
      </div>

      <div className="vault-stage">
        <div className="vault-incubating">
          <div className="vault-h">Incubating</div>
          <Container id={view.frontId} pct={view.pct} big />
          <div className="vault-fill">
            {Math.floor(view.filled)} / {view.cost} pts
            <span className="hud-sub"> · {Math.max(1, Math.ceil(view.cost - view.filled))} to crack</span>
          </div>
        </div>

        <div className="vault-next">
          <div className="vault-h">Next in line</div>
          {view.nextId ? (
            <Container id={view.nextId} pct={0} />
          ) : (
            <div className="vault-empty">rolling…</div>
          )}
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
                <span className="vault-pity-v">
                  {remaining === 0 ? 'GUARANTEED next' : `in ${remaining}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="vault-foot">
        Containers crack open the moment they fill — rewards (tower &amp; hero Shards, gear) bank straight
        into your account. Push deeper and clear waves to fill them faster.
      </div>
    </div>
  );
}
