// RIGHT panel — "what I'm inspecting right now" (HUD.md §5). Contextual:
//   • a PLACED tower is selected → its Mutation panel (TOWER-BRANCHES.md): pick one of two
//     branch paths and buy tiers with Biomass; Tier 1 warns + permanently locks the path;
//   • a tower KIND is armed for placement → its live combat stats (mobile stat readout);
//   • otherwise → hero status + a live run summary so the panel is never dead space.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HERO_DEFS, TOWER_DEFS } from '../core/config';
import { branchStatsView, branchTreeView } from '../core/branchTree';
import { BranchTree } from './components/BranchTree';
import type { HudSnapshot, SelectedPlacedTower } from '../core/types';

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

export function Inspector({
  hud,
  onCollapse,
  onBranchBuy,
  onDeselect,
  onSell,
  onMove,
  onCancelMove,
}: {
  hud: HudSnapshot;
  onCollapse?: () => void;
  onBranchBuy?: (towerId: number, branchId: string) => void;
  onDeselect?: () => void;
  onSell?: (towerId: number) => void;
  onMove?: (towerId: number) => void;
  onCancelMove?: () => void;
}): JSX.Element {
  // Tier-1 commit confirmation (the lock warning).
  const [confirm, setConfirm] = useState<{ towerId: number; branchId: string; name: string } | null>(null);
  // Sell confirmation (docs/TOWER-MANAGEMENT.md §2) — a lightweight, non-modal centered popup.
  const [sell, setSell] = useState<SelectedPlacedTower | null>(null);

  // ── Mutation panel: a PLACED tower is selected (the Tower Inspect redesign) ──
  // The upgrade TREE is the centerpiece (core/branchTree → BranchTree). Around it:
  // current branch + tier, the branch-folded stat readout, and the lock warning.
  const sp = hud.selectedPlaced;
  if (sp) {
    const cls = sp.combatClass.toLowerCase();
    const accent = `var(--${cls})`;
    const committedId = sp.branches.find((b) => b.locked)?.branchId ?? null;
    const tree = branchTreeView(sp.kind, committedId, sp.tier, hud.biomass);
    const stats = branchStatsView(sp.kind, committedId, sp.tier);
    const hasBranches = tree.lanes.length > 0;
    return (
      <aside className="side-panel inspector is-mutate" aria-label="Tower mutation panel">
        <InsHead title="Mutate" onCollapse={onCollapse} />
        <div className="ins-title">
          <span className="ins-name" style={{ color: accent }}>{sp.name}</span>
          <span className="class-badge" style={{ background: accent }}>{sp.combatClass}</span>
        </div>

        {/* Current branch + current tier */}
        <div className="mut-sum">
          {sp.branchName ? (
            <span className="mut-sum-branch" style={{ color: accent }}>{sp.branchName}</span>
          ) : (
            <span className="mut-sum-branch is-none">Unmutated strain</span>
          )}
          <span className="mut-sum-tier">
            Tier <b>{sp.tier}</b>
            <span className="mut-sum-max">/{tree.maxTier || 5}</span>
          </span>
        </div>

        {/* Current stats — the base profile folded with this tower's purchased tiers. */}
        <div className="ins-stats">
          {stats.dps !== null && <StatRow k="DPS" v={`~${stats.dps}`} />}
          {stats.range > 0 && <StatRow k="Range" v={stats.range} />}
          {stats.rate !== null && stats.firing !== 'field' && stats.firing !== 'support' && (
            <StatRow k="Fire rate" v={`${stats.rate.toFixed(1)}/s`} />
          )}
          {stats.firing === 'field' && stats.rate !== null && <StatRow k="Pulse" v={`${stats.rate.toFixed(1)}/s`} />}
          {stats.splash > 0 && <StatRow k="Splash" v={stats.splash} />}
          {stats.shots > 1 && <StatRow k="Targets" v={`×${stats.shots}`} />}
        </div>

        {/* Branch lock warning (pre-commit; the commit overlay re-warns on the click). */}
        {hasBranches && !committedId && (
          <p className="mut-warn" role="note">
            ⚠ Pick a path to mutate — <b>Tier 1 locks it for the run</b> and closes the other.
          </p>
        )}

        {/* The upgrade tree — the centerpiece. */}
        {hasBranches ? (
          <BranchTree
            tree={tree}
            accent={accent}
            onBuyNext={(branchId, tier) => {
              if (tier === 1) {
                setConfirm({ towerId: sp.id, branchId, name: tree.lanes.find((l) => l.branchId === branchId)?.name ?? '' });
              } else {
                onBranchBuy?.(sp.id, branchId);
              }
            }}
          />
        ) : (
          <p className="side-hint">This tower has no mutation paths yet.</p>
        )}

        {/* Tower management (docs/TOWER-MANAGEMENT.md): Relocate (Build Phase) + Sell. */}
        <div className="mut-manage">
          {sp.moving ? (
            <button className="mut-btn is-moving" onClick={() => onCancelMove?.()}>
              Tap a slot · <b>Cancel move</b>
            </button>
          ) : (
            <button
              className="mut-btn mut-move"
              disabled={!sp.canMove}
              title={sp.canMove ? 'Relocate this tower (free, Build Phase)' : 'Cannot relocate towers during combat.'}
              onClick={() => onMove?.(sp.id)}
            >
              ⤢ Move
            </button>
          )}
          <button className="mut-btn mut-sell" onClick={() => setSell(sp)} title={`Sell for +${sp.sell.total} biomass`}>
            Sell <span className="mut-sell-amt">+{sp.sell.total}</span>
          </button>
        </div>
        {!sp.canMove && !sp.moving && <p className="mut-move-note" role="note">Cannot relocate towers during combat.</p>}

        <button className="branch-done" onClick={onDeselect}>Done</button>

        {/* Portal to <body> so the modal is a true screen-centered pop-up — rendering it inside the
            transformed/animated sidebar trapped `position: fixed` to the sidebar (warped + cut off). */}
        {sell && createPortal(
          <div className="branch-confirm-overlay" onClick={() => setSell(null)}>
            <div className="branch-confirm sell-confirm" onClick={(e) => e.stopPropagation()}>
              <h3>Sell {sell.name}?</h3>
              <div className="sell-rows">
                <div className="sell-row"><span>Current investment</span><b>{sell.sell.investment} biomass</b></div>
                <div className="sell-row"><span>Tower refund</span><b className="sell-pos">+{sell.sell.towerRefund}</b></div>
                {sell.sell.branchRefund > 0 && (
                  <div className="sell-row"><span>Branch upgrades refunded</span><b className="sell-pos">+{sell.sell.branchRefund}</b></div>
                )}
                <div className="sell-row sell-total"><span>Total refund</span><b className="sell-pos">+{sell.sell.total} biomass</b></div>
              </div>
              <p className="sell-warn" role="note">⚠ This tower is <b>permanently removed</b> for this run. Gene Cards, mastery, and stars are kept.</p>
              <div className="branch-confirm-btns">
                <button className="primary" onClick={() => { onSell?.(sell.id); setSell(null); }}>Sell tower</button>
                <button onClick={() => setSell(null)}>Cancel</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {confirm && createPortal(
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
          </div>,
          document.body,
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
