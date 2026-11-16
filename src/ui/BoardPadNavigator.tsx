import { useId, useLayoutEffect, useState, type RefObject } from 'react';
import { audio } from '../audio/sound';
import { TOWER_DEFS } from '../core/config';
import { deployCost } from '../core/conveyor';
import type { Game } from '../core/game';
import { CELL, COLS, ROWS, center, nucleusPoint, towerSlots } from '../core/map';
import type { Pointer } from '../render/renderer';

const rows = [...new Set(towerSlots.map((slot) => slot.y))].sort((a, b) => a - b);
const columns = [...new Set(towerSlots.map((slot) => slot.x))].sort((a, b) => a - b);
const directions = new Map<string, [number, number]>([
  ['ArrowUp', [-1, 0]],
  ['ArrowDown', [1, 0]],
  ['ArrowLeft', [0, -1]],
  ['ArrowRight', [0, 1]],
]);

export function BoardPadNavigator({ game, enabled, shortcutHint, rallyShortcut, rallyTargeting, onRallyEnd, buttonRef, showTarget, onInspect, refresh }: {
  game: Game;
  enabled: boolean;
  shortcutHint: boolean;
  rallyShortcut: boolean;
  rallyTargeting: boolean;
  onRallyEnd: () => void;
  buttonRef: RefObject<HTMLButtonElement>;
  showTarget: (target: Pointer | null) => void;
  onInspect: (towerId: number) => void;
  refresh: () => void;
}): JSX.Element {
  const [slot, setSlot] = useState(towerSlots[0]);
  const [focused, setFocused] = useState(false);
  const [aim, setAim] = useState({ column: 0, row: 0 });
  const [rallyFeedback, setRallyFeedback] = useState('');
  const armedAbility = game.armedAbility;
  const mode = armedAbility ? 'ability' : rallyTargeting ? 'rally' : 'pad';
  useLayoutEffect(() => {
    if (mode === 'pad') return;
    const hero = game.heroes[0];
    const start = (mode === 'rally' ? hero?.rally : hero) ?? nucleusPoint;
    setRallyFeedback('');
    setAim({
      column: Math.min(COLS - 1, Math.max(0, Math.floor(start.x / CELL))),
      row: Math.min(ROWS - 1, Math.max(0, Math.floor(start.y / CELL))),
    });
  }, [game, mode]);
  useLayoutEffect(() => {
    if (focused && enabled) {
      showTarget(mode !== 'pad'
        ? { ...center(aim.column, aim.row), keyboardTarget: mode }
        : { x: slot.x, y: slot.y, keyboardTarget: 'pad' });
    }
    return () => showTarget(null);
  }, [aim, enabled, focused, mode, showTarget, slot]);
  const helpId = useId();
  const row = rows.indexOf(slot.y);
  const column = columns.indexOf(slot.x);
  const tower = game.towers.find((entry) => entry.slot === slot.index);
  const locked = slot.index >= game.unlockedSlots;
  const status = locked ? 'Locked' : tower ? TOWER_DEFS[tower.kind].name : 'Open';
  const position = mode !== 'pad'
    ? `Row ${aim.row + 1} of ${ROWS}, column ${aim.column + 1} of ${COLS}.`
    : `Row ${row + 1}, column ${column + 1}. ${status}.`;
  const help = armedAbility
    ? 'Use the arrow keys to aim. Hold Shift to move farther. Enter casts and Escape cancels.'
    : rallyTargeting
      ? 'Use arrow keys to aim. Hold Shift to move farther. Enter sets the hero rally point and Escape cancels.'
      : 'Use arrow keys to select a pad. Enter deploys, moves or inspects a tower. Arm with 1 through 4.' + (rallyShortcut ? ' Press R to set the hero rally point.' : '');
  let action = rallyShortcut ? '1–4 arm a tower. R sets the rally.' : 'Arm a tower with 1–4.';
  if (armedAbility) action = 'Enter casts. Escape cancels.';
  else if (rallyTargeting) action = 'Enter sets rally. Escape cancels.';
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
        aria-label={mode === 'ability' ? 'Hero ability target' : mode === 'rally' ? 'Hero rally target' : 'Tower pads'}
        aria-keyshortcuts={rallyShortcut ? 'B R' : 'B'}
        aria-describedby={helpId}
        onFocus={() => { if (enabled) setFocused(true); }}
        onBlur={() => {
          setFocused(false);
          setRallyFeedback('');
          if (rallyTargeting) onRallyEnd();
        }}
        onKeyDown={(event) => {
          const direction = directions.get(event.key);
          if (!enabled || !direction || event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          const [dy, dx] = direction;
          setRallyFeedback('');
          if (mode !== 'pad') {
            const step = event.shiftKey ? 3 : 1;
            setAim((target) => ({
              column: Math.min(COLS - 1, Math.max(0, target.column + dx * step)),
              row: Math.min(ROWS - 1, Math.max(0, target.row + dy * step)),
            }));
            return;
          }
          const destination = towerSlots.find((pad) => pad.x === columns[column + dx] && pad.y === rows[row + dy]);
          if (destination) setSlot(destination);
        }}
        onClick={(event) => {
          if (!enabled) return;
          if (game.armedAbility) {
            if (!armedAbility) return;
            const target = center(aim.column, aim.row);
            audio.resume();
            game.click(target.x, target.y);
            refresh();
            return;
          }
          if (armedAbility) return;
          if (rallyTargeting) {
            const target = center(aim.column, aim.row);
            game.setRally(target.x, target.y);
            audio.cue('select');
            setRallyFeedback(`Hero rally set at row ${aim.row + 1}, column ${aim.column + 1}.`);
            onRallyEnd();
            refresh();
            return;
          }
          if (slot.index >= game.unlockedSlots) return;
          setRallyFeedback('');
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
        <span aria-hidden="true">{rallyFeedback || `${position} ${mode === 'pad' ? 'Arrow keys select.' : 'Arrow keys aim.'} ${action}`}</span>
      </button>
      {enabled && !focused && (armedAbility || (shortcutHint && game.selectedTower)) && (
        <span className="board-pad-hint" role="status"><kbd>B</kbd> {armedAbility ? 'to aim with the keyboard' : 'to choose a tower pad'}</span>
      )}
      <span id={helpId} className="a11y-only">{help}</span>
      <span className="a11y-only" role="status">{focused && enabled ? rallyFeedback || `${position} ${action}` : ''}</span>
    </>
  );
}
