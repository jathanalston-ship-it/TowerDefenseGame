// HOST TABS (docs/NOTIFICATIONS.md §hubs — folded screens). A side screen that used to be its
// own nav row now lives as a TAB inside its host (navModel FOLDED_NAVS): Hive Production and
// Expedition Command inside The Hive, Milestones inside the Quest Board, the Specimen Vault inside
// the Phenotype Lab, the Gear Codex inside the Armory. The tab strip lives in the HOST component
// (one <HostedScreen> line), never in Hub's render switch.
//
// Deep links keep working: Hub.go('harvest') calls requestHostTab('harvest') and opens 'hive';
// the host picks the request up on mount — or live, when the host is already on screen.
// Each folded tab keeps its own unlock-registry row, so it reveals on its own beat; the next
// unrevealed tab shows as a locked teaser (the nav teaser rule, scoped to the host).

import { useEffect, useState } from 'react';
import { meta } from '../../state/meta';
import { notifications } from '../../state/notifications';
import { featureRevealed, featureView, nextReveals } from '../../state/unlocks';
import { audio } from '../../audio/sound';
import { foldedInto, hostOf, type NavKey } from '../navModel';

// ── Deep-link requests (module state: Hub writes, the host reads) ────────────────────────
const pending = new Map<NavKey, NavKey>();
const listeners = new Set<(host: NavKey, tab: NavKey) => void>();

/** Ask the host of `k` to show `k`'s tab (no-op for an unfolded key). Hub.go calls this before
 *  it navigates, so a deep link lands on the right tab whether or not the host is mounted. */
export function requestHostTab(k: NavKey): void {
  const host = hostOf(k);
  if (host === k) return;
  pending.set(host, k);
  for (const fn of listeners) fn(host, k);
}

/** The host's active tab: a pending deep link wins on mount; later requests switch it live. */
function useHostTab(host: NavKey): [NavKey, (k: NavKey) => void] {
  const [tab, setTab] = useState<NavKey>(() => pending.get(host) ?? host);
  useEffect(() => {
    pending.delete(host); // consumed (the initializer may run twice in StrictMode — read, then clear here)
    const fn = (h: NavKey, k: NavKey): void => { if (h === host) { pending.delete(host); setTab(k); } };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [host]);
  return [tab, setTab];
}

/** A host screen with its folded tabs. `views` maps each tab key to its body; an unrevealed
 *  (or unknown) tab falls back to the host's own view, so a stale deep link never dead-ends. */
export function HostedScreen({ host, views }: { host: NavKey; views: Partial<Record<NavKey, () => JSX.Element>> }): JSX.Element {
  const save = meta.use();
  const [want, setTab] = useHostTab(host);
  const active = want !== host && featureRevealed(save, want) && views[want] ? want : host;
  // Visiting a folded tab acknowledges its badge + feeds the exposure ledger, exactly like a nav
  // visit did when it was its own screen (the host itself is stamped by Hub.go).
  useEffect(() => {
    if (active === host) return;
    notifications.markSeen(active, meta.get());
    meta.noteNavVisit(active);
  }, [active, host]);
  const View = views[active] ?? views[host];
  return (
    <>
      <HostTabs host={host} active={active} onPick={(k) => { if (k !== active) { audio.cue('ui'); setTab(k); } }} />
      {View && <View />}
    </>
  );
}

/** The tab strip (shared `.wing-tabs` sub-nav styling). Renders nothing until a folded tab has
 *  revealed or is the next teaser — a host with one page shows no strip. */
function HostTabs({ host, active, onPick }: { host: NavKey; active: NavKey; onPick: (k: NavKey) => void }): JSX.Element | null {
  const save = meta.use();
  notifications.use(); // re-render when a tab's badge is acknowledged
  const badges = notifications.badges(save);
  const reasons = notifications.reasons(save);
  const teasers = new Set(nextReveals(save, 2).map((v) => v.def.id));
  const keys = [host, ...foldedInto(host)].filter((k) => k === host || featureRevealed(save, k) || teasers.has(k));
  if (keys.length <= 1) return null;
  return (
    <div className="wing-tabs host-tabs" role="tablist" aria-label={`${featureView(save, host).def.name} pages`}>
      {keys.map((k) => {
        const v = featureView(save, k);
        const locked = !v.revealed;
        const n = k === active || locked ? 0 : badges[k] ?? 0;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            data-tab={k}
            aria-selected={k === active}
            aria-disabled={locked || undefined}
            className={`wing-tab${k === active ? ' on' : ''}${locked ? ' is-locked' : ''}`}
            onClick={() => { if (!locked) onPick(k); }}
            title={locked ? v.label : (reasons[k] ?? []).join(' · ') || v.def.blurb}
          >
            <span className="wing-tab-glyph" aria-hidden>{locked ? '🔒' : v.def.glyph}</span>
            <span className="wing-tab-body">
              <b>{v.def.name}</b>
              <i>{locked ? v.label : (reasons[k] ?? [])[0] ?? v.def.blurb}</i>
            </span>
            {n > 0 && <span className="wing-tab-badge" aria-label={`${n} waiting`}>{n > 9 ? '9+' : n}</span>}
          </button>
        );
      })}
    </div>
  );
}
