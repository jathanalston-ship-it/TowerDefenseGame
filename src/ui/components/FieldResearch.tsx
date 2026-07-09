// FIELD RESEARCH surfaces (docs/RESEARCH.md) — the optional rewarded-ad lane, in-fiction:
// the hive reviews surveillance of corporate specimens and is paid in samples. Two shapes:
//   <FieldResearchPanel />  — the Market's full "Research Samples" section (claims left,
//                             reset timer, reward cards, armed boosts, emergency choice)
//   <FieldResearchCard />   — a compact one-reward entry point (Daily / Boss Rush / Results)
// Menus only, player-initiated only, hidden entirely without a provider. Grants apply
// AFTER the provider confirms a completed study; the reveal mirrors the store ceremony.

import { useEffect, useState } from 'react';
import { meta } from '../../state/meta';
import type { PremiumReceipt } from '../../state/meta';
import { EMERGENCY_PICKS, RESEARCH } from '../../core/research';
import type { EmergencyPick, ResearchCategory, ResearchRewardDef } from '../../core/research';
import { adProvider, researchLaneEnabled } from '../../ads/provider';
import { audio } from '../../audio/sound';
import { trackEvent } from '../../net/events';
import { Popup } from './Popup';

const CATEGORY_LABEL: Record<ResearchCategory, string> = {
  sample: 'Specimen Samples',
  boost: 'Observation Boosts',
  specimen: 'Sealed Specimen',
  stamina: 'Stamina Infusion',
  emergency: 'Emergency Protocol',
};

function msUntilUtcMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime();
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** One study → claim round-trip. Resolves null when the study didn't complete. */
async function runStudy(rewardId: string, pick?: EmergencyPick): Promise<PremiumReceipt | null> {
  const verdict = await adProvider.show();
  trackEvent(verdict === 'completed' ? 'research_view' : 'research_abort');
  if (verdict !== 'completed') return null;
  meta.recordResearchView();
  const receipt = meta.claimResearch(rewardId, pick);
  if (receipt) {
    audio.cue('chest');
    trackEvent('research_claim', `research_claim:${rewardId}`);
  }
  return receipt;
}

function Reveal({ receipt, onClose }: { receipt: PremiumReceipt; onClose: () => void }): JSX.Element {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= receipt.lines.length) return;
    audio.cue('chest');
    const t = setTimeout(() => setShown((n) => n + 1), 380);
    return () => clearTimeout(t);
  }, [shown, receipt.lines.length]);
  const done = shown >= receipt.lines.length;
  return (
    <Popup>
    <div className="ps-overlay ps-reveal" role="dialog" aria-label="Field study complete">
      <div className="ps-box" style={{ ['--ps' as string]: receipt.offer.accent }}>
        <div className="ps-reveal-h">⌬ {receipt.offer.name}</div>
        <div className="ps-reveal-sub">Field study complete — findings delivered</div>
        <div className="ps-box-grants">
          {receipt.lines.slice(0, shown).map((l, i) => (
            <div className="ps-box-line ps-pop" key={i}>
              <span aria-hidden>{l.icon}</span> {l.label}
            </div>
          ))}
        </div>
        <div className="ps-box-btns">
          <button className="primary" disabled={!done} onClick={onClose}>{done ? 'File the report' : '…'}</button>
        </div>
      </div>
    </div>
    </Popup>
  );
}

function EmergencyChoice({ onPick, onClose }: { onPick: (p: EmergencyPick) => void; onClose: () => void }): JSX.Element {
  return (
    <Popup>
    <div className="ps-overlay" role="dialog" aria-label="Emergency Protocol — choose your payout" onClick={onClose}>
      <div className="ps-box" onClick={(e) => e.stopPropagation()}>
        <div className="ps-box-h">Emergency Protocol</div>
        <div className="fr-em-sub">Once a day, the hive liquidates a study on YOUR terms. Choose the payout, then complete the field study.</div>
        <div className="fr-em-grid">
          {EMERGENCY_PICKS.map((p) => (
            <button key={p.pick} className="fr-em-opt" onClick={() => onPick(p.pick)}>
              <span className="fr-em-ic" aria-hidden>{p.icon}</span>
              <b>{p.name}</b>
              <small>{p.blurb}</small>
            </button>
          ))}
        </div>
        <div className="ps-box-btns"><button onClick={onClose}>Not now</button></div>
      </div>
    </div>
    </Popup>
  );
}

export function FieldResearchPanel(): JSX.Element | null {
  meta.use(); // reactive: claims/boosts move the panel live
  const [receipt, setReceipt] = useState<PremiumReceipt | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000); // reset countdown
    return () => window.clearInterval(id);
  }, []);
  if (!researchLaneEnabled()) return null;

  const view = meta.researchView();
  const claimsLeft = (Object.keys(RESEARCH.pools) as ResearchCategory[])
    .reduce((n, c) => n + (view.pools[c].cap - view.pools[c].used), 0);

  const start = (row: ResearchRewardDef & { claimed: number; cap: number; poolLeft: number }): void => {
    if (busy) return;
    if (row.category === 'emergency') { setChoosing(true); return; }
    setBusy(row.id);
    void runStudy(row.id).then((r) => { setBusy(null); if (r) setReceipt(r); });
  };
  const pickEmergency = (p: EmergencyPick): void => {
    setChoosing(false);
    setBusy('emergency_protocol');
    void runStudy('emergency_protocol', p).then((r) => { setBusy(null); if (r) setReceipt(r); });
  };

  const groups: ResearchCategory[] = ['sample', 'boost', 'specimen', 'stamina', 'emergency'];
  return (
    <section className="market-research" aria-label="Research Samples">
      <div className="fr-head">
        <div>
          <div className="panel-title">Research Samples</div>
          <div className="panel-sub">
            Optional field studies — a small daily accelerator, never the path. The hive progresses by PLAYING.
          </div>
        </div>
        <div className="fr-meta">
          <span className="fr-claims" title="Remaining studies today across all categories">{claimsLeft} studies left</span>
          <span className="fr-reset" title="Daily reset (UTC midnight)">resets in {fmtCountdown(msUntilUtcMidnight())}</span>
          {view.scale > 1 && <span className="fr-scale" title="Sample payouts scale with campaign depth, prestige and collection">×{view.scale.toFixed(1)} yield</span>}
        </div>
      </div>

      {view.pendingBoosts.length > 0 && (
        <div className="fr-armed" role="status">
          Armed for your next run: {view.pendingBoosts.map((b) => `${b.icon} ${b.name}`).join(' · ')}
        </div>
      )}

      {groups.map((cat) => {
        const rows = view.rows.filter((r) => r.category === cat);
        if (rows.length === 0) return null;
        const pool = view.pools[cat];
        return (
          <div className="fr-group" key={cat}>
            <div className="fr-group-h">
              <span>{CATEGORY_LABEL[cat]}</span>
              <b>{pool.cap - pool.used}/{pool.cap} today</b>
            </div>
            <div className="fr-grid">
              {rows.map((row) => {
                const spent = row.claimed >= row.cap || row.poolLeft <= 0;
                return (
                  <button
                    key={row.id}
                    className={`fr-card${spent ? ' spent' : ''}`}
                    style={{ ['--fr' as string]: row.accent }}
                    disabled={spent || busy !== null || !adProvider.ready()}
                    onClick={() => start(row)}
                    title={spent ? 'Exhausted for today — resets at UTC midnight' : row.blurb}
                  >
                    <span className="fr-ic" aria-hidden>{row.icon}</span>
                    <b>{row.name}</b>
                    <small>{row.blurb}</small>
                    <span className="fr-cta">{busy === row.id ? 'Study running…' : spent ? 'Spent today' : `Conduct field study · ${row.cap - row.claimed} left`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {choosing && <EmergencyChoice onPick={pickEmergency} onClose={() => setChoosing(false)} />}
      {receipt && <Reveal receipt={receipt} onClose={() => setReceipt(null)} />}
    </section>
  );
}

/** Compact entry point (Daily / Boss Rush / Results): the first still-claimable reward
 *  of the given category as a one-tap study. Renders nothing when the lane is off,
 *  the category is spent, or the reward is gated. */
export function FieldResearchCard({ category, note }: { category: ResearchCategory; note?: string }): JSX.Element | null {
  meta.use();
  const [receipt, setReceipt] = useState<PremiumReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  if (!researchLaneEnabled()) return null;
  const view = meta.researchView();
  const row = view.rows.find((r) => r.category === category && r.claimed < r.cap && r.poolLeft > 0);
  if (!row) return null;
  return (
    <div className="panel fr-compact">
      <div className="panel-title">Field Research</div>
      <div className="panel-sub">{note ?? row.blurb}</div>
      <button
        className="fr-card fr-card-wide"
        style={{ ['--fr' as string]: row.accent }}
        disabled={busy || !adProvider.ready()}
        onClick={() => {
          setBusy(true);
          void runStudy(row.id).then((r) => { setBusy(false); if (r) setReceipt(r); });
        }}
      >
        <span className="fr-ic" aria-hidden>{row.icon}</span>
        <b>{row.name}</b>
        <span className="fr-cta">{busy ? 'Study running…' : 'Conduct field study'}</span>
      </button>
      {receipt && <Reveal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
