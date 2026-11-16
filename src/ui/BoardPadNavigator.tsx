import { useId, useState } from 'react';
import { audio } from '../audio/sound';
import { TOWER_DEFS } from '../core/config';
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

export function BoardPadNavigator({ game, enabled, showPad, refresh }: {
  game: Game;
  enabled: boolean;
  showPad: (slot: TowerSlot | null) => void;
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
  else if (game.selectedTower) action = 'Enter deploys the tower.';

  return (
    <>
      <button
        type="button"
        className="board-pad-key"
        tabIndex={enabled ? 0 : -1}
        aria-label="Tower pads"
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
          if (game.selectedTower || game.movingTowerId !== null) game.click(slot.x, slot.y, { shift: event.shiftKey });
          else game.inspectAt(slot.x, slot.y);
          refresh();
        }}
      >
        <span aria-hidden="true">{position} Arrow keys select. {action}</span>
      </button>
      <span id={helpId} className="a11y-only">Use the arrow keys to select a pad. Enter places or moves an armed tower or inspects the tower on the pad. Arm a tower with 1 through 4.</span>
      <span className="a11y-only" role="status">{focused && enabled ? `${position} ${action}` : ''}</span>
    </>
  );
}
