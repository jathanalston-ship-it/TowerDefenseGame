// THE COMMISSIONING (docs/PROFILE.md §commissioning) — account creation as a ceremony, fired
// once at genuine tutorial completion. Four steps, every one skippable, none ever re-asked:
//   1 GRADUATION  — the one-time reward payout (the old TutorialRewardReveal, now step one).
//   2 DESIGNATION — the commander name (server-mirrored sanitizer + a callsign generator).
//   3 IDENTITY    — a SIGIL worn beside the name + the FOUNDING TITLE oath (one of three,
//                   permanent — the roads not taken stay untaken).
//   4 SAFEGUARD   — the account decision, folded in from the accounts platform (guest /
//                   create / sign in) — asked HERE, after the player has something to lose,
//                   instead of cold on first launch.
// Skippers keep today's fallbacks (CommanderName modal + WelcomeGate); graduates get ONE
// coherent ceremony and never see either.

import { useState } from 'react';
import { meta, sanitizeCommanderName } from '../../state/meta';
import { DEFAULT_PROFILE_NAME } from '../../save/saveStore';
import { FOUNDING_TITLES, SIGILS, displayCommanderName, suggestCommanderName } from '../../core/identity';
import { myDesignationTag } from '../../net/identity';
import { account } from '../../account/accountStore';
import { ensureGuestRegistered } from '../../account/providers';
import { guestModeActive, useGuestMode } from '../../state/guestMode';
import { startSyncEngine, syncEngine } from '../../net/syncEngine';
import { AuthForms, useOnline } from '../components/AccountPanel';
import { RewardRows } from './TutorialRewardReveal';
import { audio } from '../../audio/sound';
import { music } from '../../audio/music';
import { t, useLocale } from '../../i18n';
import type { MsgKey } from '../../i18n';
import type { TutorialRewardSummary } from '../../state/meta';

type Step = 'rewards' | 'name' | 'identity' | 'account';
const STEPS: Step[] = ['rewards', 'name', 'identity', 'account'];
const STEP_LABEL: Record<Step, MsgKey> = {
  rewards: 'commission.step.rewards',
  name: 'commission.step.name',
  identity: 'commission.step.identity',
  account: 'commission.step.account',
};

const alreadyDesignated = (): boolean => {
  try { return localStorage.getItem('assimilate.designated') === '1'; } catch { return false; }
};
const deferNameThisSession = (): void => {
  try { sessionStorage.setItem('assimilate.nameLater', '1'); } catch { /* the menu modal simply re-asks */ }
};

export function Commissioning({ reward, onClose }: { reward: TutorialRewardSummary; onClose: () => void }): JSX.Element {
  useLocale();
  const guest = useGuestMode();
  // Guest Mode has no name (DESIGNATION is skipped like a named veteran's) — converting on the
  // SAFEGUARD step brings the name prompt back through the normal hub modal afterwards.
  const named = meta.get().profileName !== DEFAULT_PROFILE_NAME || alreadyDesignated() || guest;
  const [step, setStep] = useState<Step>('rewards');
  const [draft, setDraft] = useState('');
  const [sigilId, setSigilId] = useState<string | null>(null);
  const [titleId, setTitleId] = useState<string | null>(null);
  const [auth, setAuth] = useState<'none' | 'register' | 'signin'>('none');
  const online = useOnline();

  const cleaned = sanitizeCommanderName(draft);
  const advance = (from: Step): void => {
    audio.cue('ui');
    const next = STEPS[STEPS.indexOf(from) + 1];
    // A named veteran completing the tutorial skips straight past DESIGNATION.
    setStep(next === 'name' && named ? 'identity' : next);
  };

  const confirmName = (): void => {
    if (cleaned === null) return;
    meta.commission({ name: cleaned });
    audio.cue('rankup'); // a designation is a promotion
    advance('name');
  };
  const skipName = (): void => {
    deferNameThisSession(); // the hub modal stays quiet THIS session, re-asks next boot
    advance('name');
  };
  const confirmIdentity = (): void => {
    if (sigilId !== null || titleId !== null) {
      meta.commission({ sigilId, titleId });
      music.stinger('unlock'); // the oath lands musically
    }
    advance('identity');
  };
  const finish = (): void => {
    // Guest Mode leaves no durable trace — the onboarded mark only lands when the session
    // converted (AuthForms cleared the flag) or was never a guest-mode tryout at all.
    if (!guestModeActive()) account.set({ onboarded: true });
    startSyncEngine();
    void syncEngine.syncNow(); // fail-soft offline — guests mirror on first contact
    onClose();
  };
  const asGuest = (): void => {
    void ensureGuestRegistered(); // lazy + fail-soft (the WelcomeGate contract)
    finish();
  };

  return (
    <div className="tut-reward commission" role="dialog" aria-label="Commissioning">
      <div className="evo-rays" aria-hidden />
      <div className="tut-reward-card commission-card" onClick={(e) => e.stopPropagation()}>
        <div className="tut-reward-badge">{t('commission.eyebrow')}</div>
        {/* Step rail — where you are in the ceremony (named grads see DESIGNATION dimmed out). */}
        <div className="commission-steps" aria-hidden>
          {STEPS.map((s) => (
            <span key={s} className={`commission-step${s === step ? ' on' : ''}${s === 'name' && named ? ' is-void' : ''}`}>
              {t(STEP_LABEL[s])}
            </span>
          ))}
        </div>

        {step === 'rewards' && (
          <>
            <h2 className="tut-reward-title">{t('commission.rewards.title')}</h2>
            <p className="tut-reward-sub">{t('commission.rewards.sub')}</p>
            <RewardRows reward={reward} />
            <button className="primary tut-reward-go" onClick={() => advance('rewards')}>{t('commission.rewards.next')}</button>
          </>
        )}

        {step === 'name' && (
          <>
            <h2 className="tut-reward-title">{t('commission.name.title')}</h2>
            <p className="tut-reward-sub">{t('commission.name.sub')}</p>
            <div className="commission-namerow">
              <input
                className="cmdname-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmName(); }}
                maxLength={20}
                placeholder={t('cmdname.placeholder')}
                aria-label="Commander name"
                autoFocus
              />
              <button className="commission-suggest" onClick={() => setDraft(suggestCommanderName())} title={t('commission.name.suggest')}>
                ⟳
              </button>
            </div>
            <div className="cmdname-hint">
              {draft.length === 0
                ? t('cmdname.hint.rules')
                : cleaned === null
                  ? t('cmdname.hint.short')
                  // Always preview the FULL identity — the register number rides every name
                  // (docs/PROFILE.md §designation-tags), so no one is surprised by it later.
                  : t('cmdname.hint.preview', { name: displayCommanderName(cleaned, myDesignationTag()) })}
            </div>
            <div className="cmdname-actions">
              <button className="primary cmdname-confirm" disabled={cleaned === null} onClick={confirmName}>
                {t('commission.name.confirm')}
              </button>
              <button className="cmdname-later" onClick={skipName}>{t('commission.name.skip')}</button>
            </div>
          </>
        )}

        {step === 'identity' && (
          <>
            <h2 className="tut-reward-title">{t('commission.identity.title')}</h2>
            <p className="tut-reward-sub">{t('commission.identity.sub')}</p>
            <div className="commission-k">{t('commission.identity.sigil')}</div>
            <div className="commission-sigils" role="radiogroup" aria-label="Sigil">
              {SIGILS.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={sigilId === s.id}
                  className={`commission-sigil${sigilId === s.id ? ' on' : ''}`}
                  style={{ ['--sg' as string]: s.accent }}
                  title={`${s.name} — ${s.blurb}`}
                  onClick={() => { audio.cue('hover'); setSigilId(sigilId === s.id ? null : s.id); }}
                >
                  <i aria-hidden>{s.glyph}</i>
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
            <div className="commission-k">{t('commission.identity.titles')}</div>
            <div className="lab-fork-opts commission-titles">
              <button className={`fork-opt ${titleId === null ? 'on' : ''}`} onClick={() => setTitleId(null)}>
                {t('commission.identity.none')}
              </button>
              {FOUNDING_TITLES.map((f) => (
                <button
                  key={f.id}
                  className={`fork-opt ${titleId === f.id ? 'on' : ''}`}
                  title={f.blurb}
                  onClick={() => setTitleId(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="commission-oath">{t('commission.identity.oath')}</div>
            <button className="primary tut-reward-go" onClick={confirmIdentity}>{t('commission.identity.next')}</button>
          </>
        )}

        {step === 'account' && (
          <>
            <h2 className="tut-reward-title">{t('commission.account.title')}</h2>
            <p className="tut-reward-sub">{t('commission.account.sub')}</p>
            {auth === 'none' ? (
              <div className="acct-welcome-btns">
                {guest && <div className="acct-note">{t('commission.account.guestmode')}</div>}
                {/* ONE guest choice (onboarding pass 2026-11): the volatile session-only Guest Mode
                    sat beside "Continue as Guest" with near-identical wording — and right after a
                    payout it only offered a way to lose it. It lives on the WelcomeGate tryout. */}
                <button className="acct-btn primary big" onClick={asGuest}>{t('commission.account.guest')}</button>
                {!guest && <div className="acct-note">{t('commission.account.guest.hint')}</div>}
                <button className="acct-btn big" onClick={() => setAuth('register')} disabled={!online} title={online ? undefined : t('commission.account.offline')}>
                  {t('commission.account.create')}
                </button>
                <button className="acct-btn big" onClick={() => setAuth('signin')} disabled={!online} title={online ? undefined : t('commission.account.offline')}>
                  {t('commission.account.signin')}
                </button>
                {!online && <div className="acct-note">{t('commission.account.offline')}</div>}
              </div>
            ) : (
              <>
                <AuthForms mode={auth} onDone={finish} />
                <button className="acct-btn ghost" onClick={() => setAuth('none')}>{t('commission.account.back')}</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
