// COMMANDER DESIGNATION — the first prompt after the tutorial ends (docs/PROFILE.md).
// An unnamed save (fresh grad OR a veteran from before names were prompted) gets ONE
// ceremonial ask on the hub: pick the name the hive — and the leaderboards — will know
// you by. Validation mirrors the server exactly (state/meta.sanitizeCommanderName), so
// what's confirmed here is what every other player sees. "Later" defers for the session
// (the Profile screen can always rename); confirming also arms auto cloud sync and
// takes the first backup immediately.

import { useState } from 'react';
import { meta, sanitizeCommanderName } from '../../state/meta';
import { DEFAULT_PROFILE_NAME } from '../../save/saveStore';
import { startAutoCloudSync } from '../../net/autoSync';
import { backupToCloud } from '../../net/cloudSave';
import { audio } from '../../audio/sound';

const LATER_KEY = 'assimilate.nameLater';

function deferredThisSession(): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === '1';
  } catch {
    return false;
  }
}

export function CommanderName(): JSX.Element | null {
  const save = meta.use();
  const [draft, setDraft] = useState('');
  const [deferred, setDeferred] = useState(deferredThisSession);

  // Every save is BORN as the placeholder — the prompt fires while the name is still
  // exactly that and no explicit designation was ever made on this device. Veterans who
  // renamed long ago (name ≠ placeholder) never see it; confirming the placeholder as a
  // deliberate choice sets the flag and also ends it.
  const designated = ((): boolean => {
    try {
      return localStorage.getItem('assimilate.designated') === '1';
    } catch {
      return false;
    }
  })();
  if (save.profileName !== DEFAULT_PROFILE_NAME || designated || deferred) return null;

  const cleaned = sanitizeCommanderName(draft);
  const confirm = (): void => {
    if (cleaned === null) return;
    meta.setProfileName(cleaned);
    audio.cue('rankup'); // a designation is a promotion
    startAutoCloudSync();
    void backupToCloud(); // first mirror now — fail-soft offline
  };
  const later = (): void => {
    try {
      sessionStorage.setItem(LATER_KEY, '1');
    } catch {
      /* storage unavailable — the prompt simply returns next screen */
    }
    setDeferred(true);
  };

  return (
    <div className="cmdname" role="dialog" aria-modal="true" aria-labelledby="cmdname-title">
      <div className="cmdname-card">
        <div className="cmdname-eyebrow">◈ FIELD COMMAND REGISTRY</div>
        <h2 id="cmdname-title" className="cmdname-title">Designate your Commander</h2>
        <p className="cmdname-sub">
          You fight as <b>{DEFAULT_PROFILE_NAME}</b> — make it yours. This is how you
          appear on the daily standings, and it links your save to the cloud.
        </p>
        <input
          className="cmdname-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm();
          }}
          maxLength={20}
          placeholder="Commander name (2–20)"
          aria-label="Commander name"
          autoFocus
        />
        <div className="cmdname-hint">
          {draft.length === 0
            ? 'Letters, numbers, spaces — 2 to 20 characters.'
            : cleaned === null
              ? 'Too short after cleanup — 2 characters minimum.'
              : cleaned !== draft.trim()
                ? `Will appear as “${cleaned}”`
                : ' '}
        </div>
        <div className="cmdname-actions">
          <button className="primary cmdname-confirm" disabled={cleaned === null} onClick={confirm}>
            Confirm designation
          </button>
          <button className="cmdname-later" onClick={later}>
            Later
          </button>
        </div>
        <div className="cmdname-cloud">☁ Cloud backup arms automatically once designated.</div>
      </div>
    </div>
  );
}
