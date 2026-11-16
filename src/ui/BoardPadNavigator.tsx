import { useId, useState, type RefObject } from 'react';
import { audio } from '../audio/sound';
import { TOWER_DEFS } from '../core/config';
import { deployCost } from '../core/conveyor';
import type { Game } from '../core/game';
import { towerSlots, type TowerSlot } from '../core/map';

const rows = [...new Set(towerSlots.map((slot) => slot.y))].sort((a, b) => a - b);
const columns = [...new Set(towerSlots.map((slot) => slot.x))].sort((a, b) => a - b);
const directions = new Map<string, [number, number]>([
  ['ArrowUp', [-1, 0]],
  ['ArrowDown', [1, 0]],
  ['ArrowLeft', [0, -1]],
  ['ArrowRight', [0, 1]],
]);

export function BoardPadNavigator({ game, enabled, shortcutHint, buttonRef, showPad, onInspect, refresh }: {
  game: Game;
  enabled: boolean;
  shortcutHint: boolean;
  buttonRef: RefObject<HTMLButtonElement>;
  showPad: (slot: TowerSlot | null) => void;
  onInspect: (towerId: number) => void;
  refresh: () => void;
}): JSX.Element {
  const [slot, setSlot] = useState(towerSlots[0]);
  const [focused, setFocused] = useState(false);
  const helpId = useId();
  const row = rows.indexOf(slot.y);
  const column = columns.indexOf(slot.x);
  const tower = game.towers.find((entry) => entry.slot === slot.index);
  const locked = slot.index >= game.unlockedSlots;
  const status = locked ? 'Locked' : tower ? TOWER_DEFS[tower.kind].name : 'Open';
  const position = `Row ${row + 1}, column ${column + 1}. ${status}.`;
  let action = 'Arm a tower with 1–4.';
  if (game.armedAbility) action = 'Escape cancels ability targeting.';
  else if (locked) action = 'Choose an unlocked pad.';
  else if (game.movingTowerId !== null) {
    if (tower?.id === game.movingTowerId) action = 'Enter cancels the move.';
    else action = tower ? 'Choose an open pad.' : 'Enter moves the tower.';
  } else if (tower) action = 'Enter inspects the tower.';
  else if (game.selectedTower) {
    const pod = game.selectedConveyorId === null ? null : game.conveyor.find(({ id }) => id === game.selectedConveyorId);
    if (pod === undefined) action = 'That conveyor pod is gone. Arm another with 1–4.';
    else if (pod && pod.readyAt > game.time) action = 'That conveyor pod is still growing.';
    else if (pod?.free) action = 'Enter deploys for free.';
    else {
      const cost = deployCost(game.deployments);
      action = game.biomass < cost
        ? `Needs ${cost} Biomass. You have ${Math.floor(game.biomass)}.`
        : `Enter deploys for ${cost} Biomass.`;
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="board-pad-key"
        tabIndex={enabled ? 0 : -1}
        aria-label="Tower pads"
        aria-keyshortcuts="B"
        aria-describedby={helpId}
        onFocus={() => {
          if (!enabled) return;
          setFocused(true);
          showPad(slot);
        }}
        onBlur={() => {
          setFocused(false);
          showPad(null);
        }}
        onKeyDown={(event) => {
          const direction = directions.get(event.key);
          if (!enabled || !direction || event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          const [dy, dx] = direction;
          const destination = towerSlots.find((pad) => pad.x === columns[column + dx] && pad.y === rows[row + dy]);
          if (destination) {
            setSlot(destination);
            showPad(destination);
          }
        }}
        onClick={(event) => {
          if (!enabled || game.armedAbility || slot.index >= game.unlockedSlots) return;
          audio.resume();
          const moving = game.movingTowerId;
          if (moving !== null) {
            game.click(slot.x, slot.y);
            if (game.movingTowerId === null && game.selectedPlacedId === moving) onInspect(moving);
          } else if (tower) {
            game.inspectAt(slot.x, slot.y);
            onInspect(tower.id);
          } else if (game.selectedTower) {
            game.click(slot.x, slot.y, { shift: event.shiftKey });
          }
          refresh();
        }}
      >
        <span aria-hidden="true">{position} Arrow keys select. {action}</span>
      </button>
      {enabled && shortcutHint && game.selectedTower && !focused && (
        <span className="board-pad-hint" role="status"><kbd>B</kbd> to choose a tower pad</span>
      )}
      <span id={helpId} className="a11y-only">Use the arrow keys to select a pad. Enter places or moves an armed tower or inspects the tower on the pad. Arm a tower with 1 through 4.</span>
      <span className="a11y-only" role="status">{focused && enabled ? `${position} ${action}` : ''}</span>
    </>
  );
}
