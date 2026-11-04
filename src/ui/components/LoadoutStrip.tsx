// PRE-RUN LOADOUT STRIP (docs/UI-STANDARDS.md §loadout) — run setup lives in four places (heroes
// in the Hero Hall, gear in the Armory, the starting gene loadout in the Gene Archive, the
// doctrine on Home or the Infinite terminal), but the launch button never showed what you are
// about to field. This one compact strip sits beside every launch: fielded hero portraits, gear
// filled, genes slotted, doctrine — each a deep link to where it is changed. READ-ONLY over the
// save (no new state); a segment appears only once its system has revealed, and links only to
// screens the player can open (isOpenNav).

import type { SaveData } from '../../save/saveStore';
import { meta, fieldedLoadout } from '../../state/meta';
import { isOpenNav } from '../../state/unlocks';
import { navBus } from '../../state/navBus';
import { HERO_DEFS } from '../../core/config';
import { EQUIP_SLOTS } from '../../core/equipment';
import { DOCTRINES, DOCTRINE_IDS } from '../../core/doctrines';
import { isDoctrineUnlocked } from '../../save/derive';
import type { HeroKind } from '../../core/types';
import { HeroPortrait } from './HeroPortrait';
import { navLabel, type NavKey } from '../navModel';

export interface LoadoutSummary {
  heroes: HeroKind[];
  /** Gear slots FILLED across the fielded heroes (null = the Armory has not revealed yet). */
  gear: { filled: number; slots: number } | null;
  /** Starting gene loadout slots filled (null = the Gene Archive has not revealed yet). */
  genes: { filled: number; slots: number } | null;
  /** The run's doctrine (null = this mode runs doctrine-less, or none is unlocked yet). */
  doctrine: { id: string; icon: string; name: string } | null;
}

/** Pure read of what the next run fields. `doctrineId` null ⇒ the mode has no doctrine axis. */
export function loadoutSummary(save: SaveData, doctrineId: string | null): LoadoutSummary {
  const heroes = fieldedLoadout(save);
  const owned = new Set(save.equipment.inventory.map((i) => i.uid));
  const gear = isOpenNav(save, 'equipment')
    ? {
        filled: heroes.reduce((n, k) => {
          const lo = save.equipment.loadouts[k];
          return n + (lo ? EQUIP_SLOTS.filter((s) => lo[s] !== null && owned.has(lo[s]!)).length : 0);
        }, 0),
        slots: heroes.length * EQUIP_SLOTS.length,
      }
    : null;
  const geneSlots = Math.max(0, save.geneSlots);
  const genes = isOpenNav(save, 'genes')
    ? { filled: save.geneLoadout.slice(0, geneSlots).filter((g) => g !== null).length, slots: geneSlots }
    : null;
  const anyDoctrine = DOCTRINE_IDS.some((id) => id !== 'none' && isDoctrineUnlocked(save, DOCTRINES[id]));
  const def = doctrineId !== null ? DOCTRINES[doctrineId] ?? DOCTRINES.none : null;
  const doctrine = def && (def.id !== 'none' || anyDoctrine) ? { id: def.id, icon: def.icon, name: def.name } : null;
  return { heroes, gear, genes, doctrine };
}

/** One segment: a deep link when its screen is open, plain text otherwise. */
function Seg({ nav, save, label, children }: { nav: NavKey | null; save: SaveData; label: string; children: React.ReactNode }): JSX.Element {
  if (nav && isOpenNav(save, nav)) {
    return (
      <button type="button" className="lds-seg" onClick={() => navBus.go(nav)} aria-label={`${label} — change it in the ${navLabel(nav)}`}>
        {children}<i className="lds-go" aria-hidden>▸</i>
      </button>
    );
  }
  return <span className="lds-seg is-static" aria-label={label}>{children}</span>;
}

export function LoadoutStrip({ doctrine, doctrineNav = null }: {
  /** The doctrine this launch will run with (null = doctrine-less mode, e.g. Boss Rush). */
  doctrine: string | null;
  /** Where the doctrine is changed (null = on this very screen — shown, not linked). */
  doctrineNav?: NavKey | null;
}): JSX.Element {
  const save = meta.use();
  const s = loadoutSummary(save, doctrine);
  const heroNames = s.heroes.map((k) => HERO_DEFS[k].name).join(' · ');
  return (
    <div className="lds" role="group" aria-label="Your loadout for this run">
      <span className="lds-k">Loadout</span>
      <Seg nav="heroes" save={save} label={`Heroes: ${heroNames}`}>
        <span className="lds-heroes" aria-hidden>
          {s.heroes.map((k) => <span key={k} className="lds-hero" title={HERO_DEFS[k].name}><HeroPortrait def={HERO_DEFS[k]} size={22} /></span>)}
        </span>
        <span className="lds-v">{s.heroes.length === 1 ? HERO_DEFS[s.heroes[0]].name : `${s.heroes.length} heroes`}</span>
      </Seg>
      {s.gear && (
        <Seg nav="equipment" save={save} label={`Gear: ${s.gear.filled} of ${s.gear.slots} slots filled`}>
          <span className="lds-i" aria-hidden>⛨</span>
          <span className={`lds-v${s.gear.filled < s.gear.slots ? ' is-gap' : ''}`}>{s.gear.filled}/{s.gear.slots}</span>
        </Seg>
      )}
      {s.genes && (
        <Seg nav="genes" save={save} label={`Starting genes: ${s.genes.filled} of ${s.genes.slots} slotted`}>
          <span className="lds-i" aria-hidden>⌬</span>
          <span className={`lds-v${s.genes.filled < s.genes.slots ? ' is-gap' : ''}`}>{s.genes.filled}/{s.genes.slots}</span>
        </Seg>
      )}
      {s.doctrine && (
        <Seg nav={doctrineNav} save={save} label={`Doctrine: ${s.doctrine.name}`}>
          <span className="lds-i" aria-hidden>{s.doctrine.icon}</span>
          <span className="lds-v">{s.doctrine.id === 'none' ? 'No doctrine' : s.doctrine.name}</span>
        </Seg>
      )}
    </div>
  );
}
