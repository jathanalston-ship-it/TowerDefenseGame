// Genetic Vault — the loot system's home AND its opening floor (LOOTBOX.md). Runs bank
// completed bio-containers UNOPENED into the stockpile; the player cracks them open here,
// one at a time, with the premium reveal ceremony — only then do the rewards apply. Below
// the stockpile, the incubating meter shows the container filling now, the pre-determined
// next, and pity guarantees. Self-contained (inline-styled) to stay conflict-light.

import { useRef, useState } from 'react';
import { meta } from '../state/meta';
import { rewardVisible } from '../state/rewardVisibility';
import type { CrackedContainer } from '../state/meta';
import { RARITIES, costOf, rarityRegistry } from '../core/loot';
import { VaultReveal } from './VaultReveal';
import { BioCacheCard } from './BioCache';
import { NextUp } from './HubLanding';
import { navBus, rouletteBus } from '../state/navBus';
import { ROULETTE } from '../state/bioRoulette';
import { compareItemPower } from '../state/itemPower';
import { recordVaultOpen, vaultLedger } from '../state/prefs';
import { telemetry } from '../net/telemetry';
import { useDismiss } from './browserBack';
import { RarityFx, rfxClass } from './components/RarityFx';

/** Merge N cracked containers into ONE ceremony (Open Five/Ten): items concatenate in crack
 * order; the best pull drives the ceremony scale; the label counts the batch. */
function mergeCracked(list: CrackedContainer[]): CrackedContainer {
  if (list.length === 1) return list[0];
  const rank = (r: string): number => RARITIES.findIndex((d) => d.id === r);
  const top = list.reduce((a, b) => (rank(b.chest.topRarity) > rank(a.chest.topRarity) ? b : a));
  return {
    label: `${list.length} Containers`,
    color: top.color,
    chest: {
      ...top.chest,
      items: list.flatMap((c) => c.chest.items),
    },
  };
}

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
        className={rfxClass(id ?? 'common')}
        style={{
          position: 'relative', width: size, height: size, borderRadius: 14,
          background: `radial-gradient(circle at 50% 35%, ${color}, rgba(8,12,20,0.9))`,
          border: `2px solid ${color}`, boxShadow: `0 0 ${big ? 26 : 12}px ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: big ? 38 : 22, color: '#0a0f18', fontWeight: 800,
        }}
        aria-hidden
      >
        <RarityFx rarity={id ?? 'common'} crown={false} />
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
  useDismiss(() => setOpening(null), opening !== null); // Escape / Back close the reveal (rewards already banked)
  // Bumped on every crack so the reveal remounts & replays when the player taps "Open More"
  // (without it, opening the next box in place would keep the finished summary's stage).
  const [crackSeq, setCrackSeq] = useState(0);

  const pending = save.pendingContainers;
  // Group the stockpile for a compact display: loot boxes by rarity + the run caches.
  const lootCounts = new Map<string, number>();
  let cacheCount = 0;
  for (const c of pending) {
    if (c.kind === 'cache') cacheCount++;
    else lootCounts.set(c.rarity, (lootCounts.get(c.rarity) ?? 0) + 1);
  }
  const grouped = rarityRegistry.ids().filter((id) => lootCounts.has(id)).map((id) => ({ id, n: lootCounts.get(id) as number }));

  // A double-tap (or jittery mouse) must never burn extra vaults mid-ceremony: all the
  // clicks of one physical burst land before React re-renders, so state alone can't gate
  // them — a ref-based window turns any burst into exactly one crack.
  const lastCrackRef = useRef(0);
  // The tap answers on the NEXT frame (docs/LOOTBOX.md §rarity-fx): the open itself is synchronous and
  // heavy (it persists the save and re-renders the hub — ~0.5 s on a deep account), so the pressed state
  // and the shelf's compositor-driven crack pulse paint FIRST, then the open runs (the pulse keeps moving
  // through the main-thread work — it never looks frozen).
  const [cracking, setCracking] = useState(false);
  const crack = (count = 1): void => {
    const now = performance.now();
    if (now - lastCrackRef.current < 600) return;
    lastCrackRef.current = now;
    setCracking(true);
    requestAnimationFrame(() => window.setTimeout(() => { setCracking(false); crackNow(count); }, 0));
  };
  const crackNow = (count: number): void => {
    // ONE guarded batch call — looping meta.openContainer() here would trip the guard's
    // per-open cooldown on calls 2..N and silently turn "Open Ten" into "open one".
    const opened = meta.openContainers(count); // applies each reward + removes it from the stockpile
    if (opened.length === 0) { setOpening(null); return; }
    const merged = mergeCracked(opened);
    for (const c of opened) recordVaultOpen(c.label, c.chest.topRarity, c.chest.items.length);
    // Telemetry: container-open lane, one event per rarity band (docs/ANALYTICS.md §economy).
    // The cracked label IS the band ("Rare", "Run Cache") — slugged into a bounded token.
    const byBand = new Map<string, number>();
    for (const c of opened) {
      const band = c.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'box';
      byBand.set(band, (byBand.get(band) ?? 0) + 1);
    }
    for (const [band, n] of byBand) telemetry.emit('box_open', { d: band, v: Math.min(200, n) });
    setOpening(merged);
    setCrackSeq((n) => n + 1);
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
    <div className={`vault${cracking ? ' is-cracking' : ''}`}>
      <div className="panel-title">Genetic Vault</div>
      <div className="panel-sub">
        Containers you earn in a run bank here unopened. Crack one open to roll its rewards — they
        only apply once you do.
      </div>

      {/* Daily Bio-Cache — the login faucet lives HERE too (the vault is where things crack;
          the vault nav badge lights while today's cache is sealed). Same self-contained card
          as the home board — one component, two surfaces. */}
      <BioCacheCard />

      {/* Bio-Roulette bay (docs/BOSS-RUSH.md §roulette) — the wheel's hub door: spores banked
          from Boss Rush, first-kill chassis, quest finales and Season Pass milestones spin
          HERE, the same way containers crack here. Empty ⇒ disabled with the earn paths named.
          Arrives with Boss Rush (state/rewardVisibility — spores banked earlier wait for it). */}
      {rewardVisible(save, 'bioSpores') && (() => {
        const bank = save.bioSpores;
        const session = Math.min(bank, ROULETTE.sporeCap);
        return (
          <div className={`roulette-bay${bank > 0 ? ' is-loaded' : ''}`} data-guide="vault-roulette">
            <span className="roulette-bay-core" aria-hidden>✺</span>
            <div className="roulette-bay-body">
              <div className="vault-h">
                Bio-Roulette{bank > 0 && <b style={{ color: 'var(--gold)' }}> · {bank} spore{bank === 1 ? '' : 's'} banked</b>}
              </div>
              <div className="roulette-bay-sub">
                {bank > 0
                  ? `Feed ${session} Bio-Spore${session === 1 ? '' : 's'} to the wheel — every pod pays, one is jackpot.`
                  : 'Earn Bio-Spores from Boss Rush, first-time boss kills, quest finales and Season Pass milestones — then spin them here.'}
              </div>
            </div>
            <button className="primary roulette-bay-spin" disabled={bank <= 0} onClick={() => rouletteBus.open()}>
              ✺ Spin the Wheel
            </button>
          </div>
        );
      })()}

      {/* Ready to crack — the stockpile + the open action */}
      <div className="vault-ready" data-guide="vault-ready">
        <div className="vault-h">Ready to crack {pending.length > 0 && <b style={{ color: 'var(--gold)' }}>· {pending.length}</b>}</div>
        {pending.length === 0 ? (
          <div className="vault-empty">
            No containers ready — fill the meter in a run to earn one.
            {/* No dead ends: an empty vault immediately offers the loop's next step. */}
            <NextUp save={save} exclude="vault" go={(k) => navBus.go(k)} />
          </div>
        ) : (
          <>
            <div className="vault-objects">
              {cacheCount > 0 && (
                <div className="vault-obj" style={{ ['--vc' as string]: 'var(--cache)' }}>
                  <span className="vault-obj-core" aria-hidden>⬢</span>
                  <span className="vault-obj-name">Run Cache</span>
                  {cacheCount > 1 && <span className="vault-obj-n">×{cacheCount}</span>}
                </div>
              )}
              {grouped.map((g, gi) => {
                const def = rarityRegistry.get(g.id);
                const rw = def?.reward;
                return (
                  <div className={`vault-obj tt ${rfxClass(g.id)}`} key={g.id} tabIndex={0} style={{ ['--vc' as string]: rarityColor(g.id), ['--i' as string]: gi }}>
                    <RarityFx rarity={g.id} crown={false} />
                    <span className="vault-obj-core" aria-hidden>◈</span>
                    <span className="vault-obj-name">{rarityName(g.id)}</span>
                    {g.n > 1 && <span className="vault-obj-n">×{g.n}</span>}
                    {rw && (
                      <span className="tt-bubble">
                        {rw.rolls} rolls · {rw.towerShardRange[0]}–{rw.towerShardRange[1]} Strain Samples each ·
                        {' '}{Math.round(rw.heroShardChance * 100)}% hero-shard rolls · materials &amp; essence scale with rarity
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="vault-actions">
              <button className="primary vault-crack" data-guide="vault-crack" onClick={() => crack(1)}>◈ Open One</button>
              {pending.length >= 5 && <button className="vault-crack act-open" onClick={() => crack(5)}>Open Five</button>}
              {pending.length >= 10 && <button className="vault-crack act-open" onClick={() => crack(10)}>Open Ten</button>}
              {pending.length >= 50 && <button className="vault-crack act-open" onClick={() => crack(50)}>Open 50</button>}
              {pending.length >= 100 && <button className="vault-crack act-open" onClick={() => crack(100)}>Open 100</button>}
              {pending.length >= 2 && <button className="vault-crack act-open" onClick={() => crack(pending.length)}>Open All ({pending.length})</button>}
              <span className="vault-left">{pending.length} banked</span>
            </div>
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

      {/* Rarity odds — the roll distribution the queue draws from (weights normalized). */}
      <div className="vault-odds">
        <div className="vault-h">Drop rates</div>
        <div className="vault-odds-row">
          {(() => {
            const total = RARITIES.reduce((s2, d) => s2 + d.weight, 0);
            return RARITIES.map((d) => (
              <span className="vault-odd" key={d.id} style={{ color: d.color }} title={`${d.name}: ${((d.weight / total) * 100).toFixed(1)}%`}>
                {d.name.slice(0, 4)} <b>{((d.weight / total) * 100).toFixed(d.weight / total < 0.05 ? 1 : 0)}%</b>
              </span>
            ));
          })()}
        </div>
      </div>

      {/* Opening ledger — device-local history + counters (docs/LOOTBOX.md §vault). */}
      {(() => {
        const led = vaultLedger();
        if (led.opened === 0) return null;
        return (
          <div className="vault-history">
            <div className="vault-h">Vault history · {led.opened} opened</div>
            <div className="vault-hist-rows">
              {led.recent.slice(0, 5).map((r, i) => (
                // a multi-open stamps several rows in the same millisecond — the index keeps keys unique
                <span className="vault-hist" key={`${r.at}:${i}`} style={{ color: rarityColor(r.rarity) }}>
                  {r.label} · {r.items} rewards
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* The opening ceremony is a fullscreen fixed overlay (VaultReveal) — it escapes the panel
          so nothing clips. `remaining` is what's still stockpiled AFTER this crack. */}
      {opening && (
        <VaultReveal
          key={crackSeq}
          chest={opening.chest}
          title={opening.label}
          color={opening.color}
          remaining={pending.length}
          onOpenMore={() => crack(1)}
          onClose={() => setOpening(null)}
          compareEquip={(item) => compareItemPower(save, item, save.selectedHero)}
        />
      )}
    </div>
  );
}
