// Developer Tools (docs/DEV-RESET.md) — a DEV/testing-only Settings section to wipe save data at
// any granularity. Gated to dev builds / the debug opt-in (else hidden behind an explicit reveal);
// EVERY reset requires typing "RESET" and shows the exact warning. Pure presentation over
// meta.devReset + the DEV_RESETS catalog.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { meta } from '../state/meta';
import { DEV_RESETS } from '../state/devReset';
import type { DevResetDef } from '../state/devReset';
import { isDebugEnabled } from '../debug/debug';

const CONFIRM_WORD = 'RESET';
const isDevBuild = (): boolean => { try { return !!import.meta.env?.DEV; } catch { return false; } };

export function DevTools(): JSX.Element {
  // Open in a dev build or with the debug opt-in; otherwise hide behind an explicit reveal.
  const [revealed, setRevealed] = useState(() => isDevBuild() || isDebugEnabled());
  const [pending, setPending] = useState<DevResetDef | null>(null); // the reset awaiting typed confirmation
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const openConfirm = (r: DevResetDef): void => { setPending(r); setTyped(''); };
  const cancel = (): void => { setPending(null); setTyped(''); };
  const confirm = (): void => {
    if (!pending || typed !== CONFIRM_WORD) return;
    meta.devReset(pending.id);
    setDone(pending.label);
    setPending(null);
    setTyped('');
    setTimeout(() => setDone((d) => (d === null ? d : null)), 2600);
  };

  return (
    <div className="panel dev-panel">
      <div className="panel-title">Developer Tools</div>
      <p className="panel-sub">
        Development &amp; testing utilities. Each reset is <b>permanent</b> and requires typing
        <code> {CONFIRM_WORD}</code> to confirm.
      </p>

      {!revealed ? (
        <div className="dev-gate">
          <p className="dev-gate-warn">⚠ These tools erase save data. They’re meant for development builds.</p>
          <button className="dev-reveal" onClick={() => setRevealed(true)}>I understand — show Developer Tools</button>
        </div>
      ) : (
        <>
          {done && <div className="dev-done" role="status">✓ {done} — done.</div>}
          <div className="dev-resets">
            {DEV_RESETS.map((r) => (
              <button
                key={r.id}
                className={`dev-reset-btn${r.danger ? ' is-danger' : ''}`}
                onClick={() => openConfirm(r)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      {pending && createPortal(
        <div className="branch-confirm-overlay" onClick={cancel}>
          <div className="branch-confirm dev-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>{pending.label}</h3>
            <p className="dev-confirm-warn">{pending.warning}</p>
            <label className="dev-confirm-label">
              Type <b>{CONFIRM_WORD}</b> to confirm:
              <input
                className="dev-confirm-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); }}
                placeholder={CONFIRM_WORD}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                aria-label={`Type ${CONFIRM_WORD} to confirm ${pending.label}`}
              />
            </label>
            <div className="branch-confirm-btns">
              <button className="primary dev-confirm-go" disabled={typed !== CONFIRM_WORD} onClick={confirm}>
                Erase
              </button>
              <button onClick={cancel}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
