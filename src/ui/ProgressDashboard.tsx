// Living Progress dashboard — the Home screen's "how far have I come / what's waiting"
// row, and the engine that always advertises the next dopamine hit. Each card translates a
// progression SYSTEM into momentum (a headline + a bar toward the next goal), deep-links to
// that system's Hub screen, and turns HOT (glowing, with an action verb) the moment it has
// something to claim. When Ascension is available it dominates with a full-width banner.
// Pure presentation over the existing meta + notification systems; the card set is
// data-driven so a new progression system is one array entry.

import { meta, nextStarCost } from '../state/meta';
import { audio } from '../audio/sound';
import { notifications } from '../state/notifications';
import { TOWER_ORDER, CAMPAIGN_REWARDS } from '../core/config';
import { costOf, rarityRegistry } from '../core/loot';
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
  onClick: () => void;
}

export function ProgressDashboard({
  go,
  onStartEndless,
}: {
  go: (k: NavKey) => void;
  onStartEndless: () => void;
}): JSX.Element {
  const save = meta.use();
  const badges = notifications.badges(save);

  // Campaign — deepest cleared across all difficulty tracks, climbing toward the next
  // Evolution-Cap milestone (every CAMPAIGN_REWARDS.milestoneEvery stages).
  const ms = CAMPAIGN_REWARDS.milestoneEvery;
  const campCleared = Math.max(0, ...Object.values(save.campaign?.cleared ?? {}));
  const nextMilestone = (Math.floor(campCleared / ms) + 1) * ms;
  const campProgress = (campCleared - (nextMilestone - ms)) / ms;
  const milestoneNext = (campCleared + 1) % ms === 0; // clearing the next stage unlocks a tier

  // Infinite — best depth + the next round-number personal goal.
  const best = save.bestWave;
  const nextGoal = (Math.floor(best / 10) + 1) * 10;

  // Vault — containers ready to crack, else the front box's fill toward its rarity.
  const pending = meta.pendingContainers().length;
  const lq = meta.lootQueue();
  const front = lq.queue[0] ?? 'common';
  const fillPct = Math.min(1, lq.progress / costOf(front));
  const frontName = rarityRegistry.get(front)?.name ?? 'Common';

  // Tower Evolution — towers whose next star you can afford right now.
  const towersReady = TOWER_ORDER.reduce((n, k) => {
    const cost = nextStarCost(save, k);
    return n + (cost !== null && (save.towerShards[k] ?? 0) >= cost ? 1 : 0);
  }, 0);

  const items = save.equipment.inventory.length;
  const newGear = badges.heroes ?? 0;
  const col = meta.collection();
  const prestige = meta.prestigeView();

  const nav = (k: NavKey): void => { audio.cue('ui'); go(k); };

  const cards: DashCard[] = [
    {
      key: 'campaign', title: 'Campaign', accent: 'var(--vital)',
      big: `Stage ${campCleared}`, sub: `Next unlock · Stage ${nextMilestone}`,
      progress: campProgress, hot: milestoneNext, cta: 'Unlock Next', onClick: () => nav('campaign'),
    },
    {
      key: 'infinite', title: 'Infinite', accent: 'var(--r-rare)',
      big: `Wave ${best}`, sub: `Next goal · Wave ${nextGoal}`,
      progress: (best % 10) / 10, onClick: () => { audio.cue('ui'); onStartEndless(); },
    },
    {
      key: 'vault', title: 'Genetic Vault', accent: 'var(--gold)',
      big: pending > 0 ? `${pending} Ready` : `${Math.round(fillPct * 100)}%`,
      sub: pending > 0 ? 'Containers to crack' : `${frontName} container filling`,
      progress: pending > 0 ? undefined : fillPct, badge: badges.vault,
      hot: pending > 0, cta: 'Open Now', onClick: () => nav('vault'),
    },
    {
      key: 'towers', title: 'Tower Evolution', accent: 'var(--kinetic)',
      big: `${towersReady}`, sub: towersReady > 0 ? 'Towers ready to evolve' : 'Earn shards to evolve',
      badge: badges.towers, hot: towersReady > 0, cta: 'Evolve', onClick: () => nav('towers'),
    },
    {
      key: 'heroes', title: 'Hero Equipment', accent: 'var(--caustic)',
      big: `${items}`, sub: items === 1 ? 'Item in the armory' : 'Items in the armory',
      badge: newGear, hot: newGear > 0, cta: 'Equip', onClick: () => nav('heroes'),
    },
    {
      key: 'collection', title: 'Collection', accent: 'var(--r-epic)',
      big: `${Math.round(col.pct * 100)}%`, sub: `${col.discovered}/${col.total} discovered`,
      progress: col.pct, badge: badges.collection, onClick: () => nav('collection'),
    },
  ];

  return (
    <>
      {/* Ascension available → it dominates the dashboard. */}
      {prestige.canMolt && (
        <button className="dash-ascension" onClick={() => nav('upgrades')}>
          <span className="asc-glyph" aria-hidden>✸</span>
          <span className="asc-body">
            <span className="asc-t">Ascension Available</span>
            <span className="asc-d">Molt now to gain {prestige.gain} Ascendant Cells and begin a stronger cycle.</span>
          </span>
          <span className="asc-cta">Ascend ▸</span>
        </button>
      )}

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
            {c.progress != null && (
              <div className="dash-bar">
                <div className="dash-bar-fill" style={{ width: `${Math.max(0, Math.min(1, c.progress)) * 100}%`, background: c.accent }} />
              </div>
            )}
            {c.hot && c.cta ? <span className="dash-cta">{c.cta} ▸</span> : <div className="dash-sub">{c.sub}</div>}
          </button>
        ))}
      </section>
    </>
  );
}
