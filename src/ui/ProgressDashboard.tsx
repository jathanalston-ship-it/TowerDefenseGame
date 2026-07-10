// Living Progress dashboard — the Home screen's CLAIM row: each card is a stockpile or
// ready-action surface (containers to crack, stars affordable now, gear to equip, codex
// momentum) that turns HOT (glowing, with an action verb) the moment it has something to
// claim. Campaign/Infinite standings live in the command strip, not here — this row is
// about what the player can DO right now. When Ascension is available it dominates with a
// full-width banner. Pure presentation over the existing meta + notification systems; the
// card set is data-driven so a new progression system is one array entry.

import { meta, nextStarCost } from '../state/meta';
import { audio } from '../audio/sound';
import { notifications } from '../state/notifications';
import { TOWER_ORDER } from '../core/config';
import { costOf, rarityRank, rarityRegistry } from '../core/loot';
import type { NavKey } from './Hub';

interface DashCard {
  key: string;
  title: string;
  accent: string;
  big: string; // the headline (momentum, not a raw stat)
  sub: string; // the next goal / context line
  progress?: number; // 0..1 → a progress bar; omit for count-only cards
  badge?: number; // "new since last viewed" attention count
  hot?: boolean; // something to claim right now → grows + shows a CTA
  cta?: string; // the action verb shown when hot ("Open Now", "Evolve", …)
  chips?: { label: string; color: string }[]; // a "contains" preview (Vault stockpile)
  onClick: () => void;
}

export function ProgressDashboard({ go }: { go: (k: NavKey) => void }): JSX.Element {
  const save = meta.use();
  const badges = notifications.badges(save);

  // Vault — containers ready to crack, else the front box's fill toward its rarity.
  const pendingList = meta.pendingContainers();
  const pending = pendingList.length;
  const lq = meta.lootQueue();
  const front = lq.queue[0] ?? 'common';
  const fillPct = Math.min(1, lq.progress / costOf(front));
  const frontName = rarityRegistry.get(front)?.name ?? 'Common';
  // "Contains" preview — the distinct container types in the stockpile, best rarity first.
  const vaultChips: { label: string; color: string }[] = [];
  {
    const seen = new Set<string>();
    const ranked = pendingList
      .map((c) =>
        c.kind === 'loot'
          ? { id: c.rarity, label: rarityRegistry.get(c.rarity)?.name ?? c.rarity, color: rarityRegistry.get(c.rarity)?.color ?? 'var(--r-common)', rank: rarityRank(c.rarity) }
          : { id: 'cache', label: 'Stage Cache', color: 'var(--gold)', rank: -1 },
      )
      .sort((a, b) => b.rank - a.rank);
    for (const r of ranked) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      vaultChips.push({ label: r.label, color: r.color });
      if (vaultChips.length >= 4) break;
    }
  }

  // Tower Evolution — towers whose next star you can afford right now.
  const towersReady = TOWER_ORDER.reduce((n, k) => {
    const cost = nextStarCost(save, k);
    return n + (cost !== null && (save.towerShards[k] ?? 0) >= cost ? 1 : 0);
  }, 0);

  const items = save.equipment.inventory.length;
  const newGear = badges.equipment ?? 0; // equipment is its own nav now (re-channeled)
  const col = meta.collection();
  const prestige = meta.prestigeView();

  const nav = (k: NavKey): void => { audio.cue('ui'); go(k); };

  const cards: DashCard[] = [
    {
      key: 'vault', title: 'Genetic Vault', accent: 'var(--gold)',
      big: pending > 0 ? `${pending} Ready` : `${Math.round(fillPct * 100)}%`,
      sub: pending > 0 ? 'Containers to crack' : `${frontName} container filling`,
      progress: pending > 0 ? undefined : fillPct, badge: badges.vault,
      hot: pending > 0, cta: 'Open Now', chips: pending > 0 ? vaultChips : undefined,
      onClick: () => nav('vault'),
    },
    {
      key: 'towers', title: 'Tower Evolution', accent: 'var(--kinetic)',
      big: `${towersReady}`, sub: towersReady > 0 ? 'Towers ready to evolve' : 'Earn shards to evolve',
      badge: badges.towers, hot: towersReady > 0, cta: 'Evolve', onClick: () => nav('towers'),
    },
    {
      key: 'equipment', title: 'Hero Equipment', accent: 'var(--caustic)',
      big: `${items}`, sub: items === 1 ? 'Item in the armory' : 'Items in the armory',
      badge: newGear, hot: newGear > 0, cta: 'Equip', onClick: () => nav('equipment'),
    },
    {
      // CollectionView.pct is THE home-surface completion number (the command strip shows
      // the same field) — never .completion here, or the board contradicts itself.
      key: 'collection', title: 'Collection', accent: 'var(--r-epic)',
      big: `${Math.round(col.pct * 100)}%`, sub: `${col.discovered}/${col.total} discovered`,
      progress: col.pct, badge: badges.collection, onClick: () => nav('collection'),
    },
  ];

  return (
    <>
      {/* Ascension: when the mint is ready it dominates the dashboard — as a CTA if the campaign gate
          is met, else a LOCKED banner surfacing the campaign requirement (PROGRESSION.md). */}
      {prestige.shardsReady && (prestige.campaignMet ? (
        <button className="dash-ascension" onClick={() => nav('evolution')}>
          <span className="asc-glyph" aria-hidden>✸</span>
          <span className="asc-body">
            <span className="asc-t">Ascension Available</span>
            <span className="asc-d">Molt now to gain {prestige.gain} Ascendant Cells and begin a stronger cycle.</span>
          </span>
          <span className="asc-cta">Ascend ▸</span>
        </button>
      ) : (
        <button className="dash-ascension is-locked" onClick={() => nav('evolution')}
          title={`Clear Campaign Stage ${prestige.campaignReq} to unlock your ${prestige.molts === 0 ? 'first' : 'next'} Molt.`}>
          <span className="asc-glyph" aria-hidden>🔒</span>
          <span className="asc-body">
            <span className="asc-t">Ascension Locked · Campaign {prestige.campaignStage} / {prestige.campaignReq}</span>
            <span className="asc-d">Molt is ready (+{prestige.gain} Cells) — clear Campaign Stage {prestige.campaignReq} to unlock it.</span>
          </span>
          <span className="asc-cta">View ▸</span>
        </button>
      ))}

      <section className="dash" aria-label="Living progress">
        {cards.map((c) => (
          <button
            key={c.key}
            className={`dash-card ${c.hot ? 'is-hot' : ''} ${c.badge ? 'has-new' : ''}`}
            style={{ ['--c' as string]: c.accent }}
            onClick={c.onClick}
          >
            <div className="dash-top">
              <span className="dash-title">{c.title}</span>
              {c.badge ? <span className="dash-badge">{c.badge > 9 ? '9+' : c.badge} new</span> : null}
            </div>
            <div className="dash-big" style={{ color: c.accent }}>{c.big}</div>
            {c.chips ? (
              <div className="dash-chips">
                {c.chips.map((ch, i) => (
                  <span className="dash-chip" key={i} style={{ ['--cc' as string]: ch.color }}>{ch.label}</span>
                ))}
              </div>
            ) : c.progress != null ? (
              <div className="dash-bar">
                <div className="dash-bar-fill" style={{ width: `${Math.max(0, Math.min(1, c.progress)) * 100}%`, background: c.accent }} />
              </div>
            ) : null}
            {c.hot && c.cta ? <span className="dash-cta">{c.cta} ▸</span> : <div className="dash-sub">{c.sub}</div>}
          </button>
        ))}
      </section>
    </>
  );
}
