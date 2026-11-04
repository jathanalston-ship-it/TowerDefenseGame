// ADVICE IS A LINK (2026-11, docs/NOTIFICATIONS.md §recommendations) — a guidance line that
// names a screen ("Farm Infinite", "buy one in the Tower Lab") carries the SAME "Go ▸" the
// Results debrief uses. Advice producers return `{ text, nav? }`; this renders the link only
// where it can work: inside the hub (the HubScreen context the Hub provides — off-hub surfaces
// like Results have no router), never to the screen already open, never to a sealed wing
// (unlocks.isOpenNav — the one "never advise a sealed destination" rule).

import { createContext, useContext } from 'react';
import { meta } from '../../state/meta';
import { isOpenNav } from '../../state/unlocks';
import { navBus } from '../../state/navBus';
import { hostOf, type NavKey } from '../navModel';

/** The hub screen currently on stage (provided by Hub; null off-hub). */
export const HubScreen = createContext<string | null>(null);

/** A guidance line plus the screen it names (no nav = plain advice). */
export interface Advice {
  text: string;
  nav?: string;
}

export function AdviceGo({ nav }: { nav?: string }): JSX.Element | null {
  const here = useContext(HubScreen);
  if (!nav || here === null || hostOf(nav as NavKey) === here || !isOpenNav(meta.get(), nav)) return null;
  return (
    <button type="button" className="advice-go" onClick={() => navBus.go(nav)}>Go ▸</button>
  );
}
