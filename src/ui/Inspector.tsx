// RIGHT panel — "what I'm inspecting right now" (HUD.md §5). Contextual:
//   • a PLACED tower is selected → its Mutation panel (TOWER-BRANCHES.md): pick one of two
//     branch paths and buy tiers with Biomass; Tier 1 warns + permanently locks the path;
//   • a tower KIND is armed for placement → its live combat stats (mobile stat readout);
//   • otherwise → hero status + a live run summary so the panel is never dead space.

import { useState } from 'react';
import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import type { HudSnapshot } from '../core/types';

function StatRow({ k, v }: { k: string; v: string | number }): JSX.Element {
  return (
    <div className="ins-stat">
      <span className="ins-stat-k">{k}</span>
      <span className="ins-stat-v">{v}</span>
    </div>
  );
}

function InsHead({ title, onCollapse }: { title: string; onCollapse?: () => void }): JSX.Element {
  return (
    <div className="side-head">
      <span>{title}</span>
      {onCollapse && (
        <button className="panel-collapse" onClick={onCollapse} title="Hide panel" aria-label="Hide panel">
          »
        </button>
      )}
    </div>
  );
}

/** Compact Biomass cost (600 → "600", 2500 → "2.5k", 140000 → "140k"). */
function fmtCost(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
}

export function Inspector({
  hud,
  onCollapse,
  onBranchBuy,
  onDeselect,
}: {
  hud: HudSnapshot;
  onCollapse?: () => void;
  onBranchBuy?: (towerId: number, branchId: string) => void;
  onDeselect?: () => void;
}): JSX.Element {
  // Tier-1 commit confirmation (the lock warning).
  const [confirm, setConfirm] = useState<{ towerId: number; branchId: string; name: string } | null>(null);

  // ── Mutation panel: a PLACED tower is selected ──────────────────────────────
  const sp = hud.selectedPlaced;
  if (sp) {
    const cls = sp.combatClass.toLowerCase();
    return (
      <aside className="side-panel inspector" aria-label="Tower mutation panel">
        <InsHead title="Mutate" onCollapse={onCollapse} />
        <div className="ins-title">
          <span className="ins-name" style={{ color: `var(--${cls})` }}>{sp.name}</span>
          <span className="class-badge" style={{ background: `var(--${cls})` }}>{sp.combatClass}</span>
        </div>
        {sp.branchName ? (
          <p className="branch-status">Path locked: <b>{sp.branchName}</b> · Tier {sp.tier}/5</p>
        ) : (
          <p className="side-hint">Choose a mutation path — Tier 1 permanently locks it for this run.</p>
        )}

        <div className="branch-list">
          {sp.branches.map((b) => (
            <div key={b.branchId} className={`branch-card${b.locked ? ' is-locked' : ''}`}>
              <div className="branch-card-head">
                <span className="branch-name">{b.name}</span>
                {b.tier > 0 && <span className="branch-tier">T{b.tier}/5</span>}
              </div>
              <p className="branch-theme">{b.theme}</p>
              {b.next ? (
                <button
                  className={`branch-buy${b.next.affordable ? '' : ' is-poor'}`}
                  disabled={!b.next.affordable}
                  onClick={() => {
                    if (b.next!.tier === 1) setConfirm({ towerId: sp.id, branchId: b.branchId, name: b.name });
                    else onBranchBuy?.(sp.id, b.branchId);
                  }}
                >
                  <span className="branch-buy-top">
                    <span className="branch-buy-name">T{b.next.tier} · {b.next.name}</span>
                    <span className="branch-buy-cost">{fmtCost(b.next.cost)} ⬡</span>
                  </span>
                  <span className="branch-buy-desc">{b.next.desc}</span>
                </button>
              ) : (
                <div className="branch-maxed">★ FULLY MUTATED</div>
              )}
            </div>
          ))}
        </div>

        <button className="branch-done" onClick={onDeselect}>Done</button>

        {confirm && (
          <div className="branch-confirm-overlay" onClick={() => setConfirm(null)}>
            <div className="branch-confirm" onClick={(e) => e.stopPropagation()}>
              <h3>Splice the {confirm.name} strain?</h3>
              <p>
                This <b>permanently</b> commits this tower to one mutation path for the rest of the
                run. The other path is closed off. There is no reverting.
              </p>
              <div className="branch-confirm-btns">
                <button
                  className="primary"
                  onClick={() => {
                    onBranchBuy?.(confirm.towerId, confirm.branchId);
                    setConfirm(null);
                  }}
                >
                  Commit
                </button>
                <button onClick={() => setConfirm(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </aside>
    );
  }

  // ── Stat readout: a tower KIND is armed for placement ───────────────────────
  const kind = hud.selectedTower;
  if (kind) {
    const def = TOWER_DEFS[kind];
    const cls = def.combatClass.toLowerCase();
    const dps = def.fireInterval > 0 ? Math.round(def.damage / def.fireInterval) : 0;
    const rate = def.fireInterval > 0 ? (1 / def.fireInterval).toFixed(1) : null;
    return (
      <aside className="side-panel inspector" aria-label="Tower inspector">
        <InsHead title="Inspect" onCollapse={onCollapse} />
        <div className="ins-title">
          <span className="ins-name" style={{ color: `var(--${cls})` }}>
            {def.name}
          </span>
          <span className="class-badge" style={{ background: `var(--${cls})` }}>
            {def.combatClass}
          </span>
        </div>
        <div className="ins-stats">
          {dps > 0 && def.firing !== 'field' && <StatRow k="DPS" v={`~${dps}`} />}
          {def.range > 0 && <StatRow k="Range" v={def.range} />}
          {rate && def.firing !== 'field' && <StatRow k="Fire rate" v={`${rate}/s`} />}
          {def.firing === 'field' && rate && <StatRow k="Pulse" v={`${rate}/s`} />}
          {def.splash > 0 && <StatRow k="Splash" v={def.splash} />}
          {def.firing === 'support' && <StatRow k="Role" v="Support" />}
          {def.firing === 'field' && <StatRow k="Role" v="Control" />}
          {def.firing === 'infest' && <StatRow k="Role" v="DoT / Spread" />}
          <StatRow k="Cost" v={`${def.cost} biomass`} />
        </div>
        <p className="ins-blurb">{def.blurb}</p>
        <p className="side-hint">Tap a glowing slot to grow it — then tap a placed tower to mutate it.</p>
      </aside>
    );
  }

  // ── Default: hero status + run summary ──────────────────────────────────────
  const heroDef = HERO_DEFS[hud.hero.kind];
  const abName = heroDef.ability.name;
  const ability = hud.hero.down
    ? `Reviving ${Math.ceil(hud.hero.respawn)}s`
    : hud.hero.abilityReady
      ? `${abName} ready`
      : `${abName} ${Math.ceil(hud.hero.abilityCd)}s`;

  return (
    <aside className="side-panel inspector" aria-label="Run inspector">
      <InsHead title="Status" onCollapse={onCollapse} />

      <div className="ins-title">
        <span className="ins-name" style={{ color: heroDef.color }}>
          {heroDef.name}
        </span>
        <span className="class-badge" style={{ background: heroDef.color, color: '#1a1206' }}>
          {heroDef.combatClass}
        </span>
      </div>
      <div className="ins-stats">
        <StatRow k="Health" v={`${hud.hero.hp}/${hud.hero.maxHp}`} />
        {hud.hero.shield > 0 && <StatRow k="Shield" v={hud.hero.shield} />}
        <StatRow k="Ability" v={ability} />
      </div>

      <div className="side-k">Run</div>
      <div className="ins-stats">
        <StatRow k="Wave" v={`${Math.max(1, hud.wave)}/${hud.totalWaves}`} />
        <StatRow k="Kills" v={hud.kills} />
        <StatRow k="Threat" v={`${hud.enemiesAlive} alive`} />
        <StatRow k="Biomass" v={hud.biomass} />
      </div>

      <p className="side-hint">Tap a placed tower to mutate it; tap a slot to build.</p>
    </aside>
  );
}
