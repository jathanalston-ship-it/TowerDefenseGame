// Maps a Gene Card's SUBJECT (what it affects — derived in core/cards.ts) to its draft-badge
// presentation. Tower subjects pull color + name straight from TOWER_DEFS, so a NEW tower needs
// NO change here. This is the UI's single place that turns a subject into icon / color / label.

import { TOWER_DEFS } from '../core/config';
import type { CardSubject } from '../core/types';
import { BiomassIcon, GlobalIcon, HeroIcon, HiveIcon, TowerIcon } from './components/Icon';

export interface Affects {
  label: string; // the recognizable name: a tower's name, or HERO / GLOBAL / ECONOMY / HIVE
  color: string; // accent — a tower's own color (TOWER_DEFS) or a subject CSS var
  icon: JSX.Element;
}

export function affectsOf(s: CardSubject): Affects {
  switch (s.kind) {
    case 'tower': {
      const d = TOWER_DEFS[s.tower];
      return { label: d.name, color: d.color, icon: <TowerIcon /> };
    }
    case 'hero': return { label: 'HERO', color: 'var(--gold)', icon: <HeroIcon /> };
    case 'economy': return { label: 'ECONOMY', color: 'var(--success)', icon: <BiomassIcon /> };
    case 'hive': return { label: 'HIVE', color: 'var(--danger)', icon: <HiveIcon /> };
    case 'global': return { label: 'GLOBAL', color: 'var(--text)', icon: <GlobalIcon /> };
  }
}
