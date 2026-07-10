// PREMIUM STORE (docs/PREMIUM-STORE.md) — the monetization terminal. Renders the offer REGISTRY
// (ichor bundles / permanent packs / today's rotating pack / live event offers) as large animated
// cards with contents previews, à-la-carte value badges, and an honest Power note ("up to +N when
// invested" — a purchase alone moves Power by ZERO). Purchase flow: card → confirmation (full
// contents recap + price + sandbox notice) → meta.purchaseOffer → the reveal ceremony (staggered
// line pops + audio). All data-driven: a new offer is a registry row; this screen never changes.

import { useEffect, useMemo, useState } from 'react';
import { meta } from '../state/meta';
import type { PremiumReceipt } from '../state/meta';
import { audio } from '../audio/sound';
import { CHECKOUT_PROVIDER, beginCheckout, takePendingReveal } from '../net/checkout';
import { trackEvent } from '../net/events';
import {
  ICHOR_BUNDLES, PERMANENT_PACKS, activeEventOffers, offerAvailable, offerValueIchor,
  offerValueMultiple, todaysRotatingOffer,
} from '../core/premium';
import type { PremiumGrant, PremiumOfferDef } from '../core/premium';
import { dailyKey, msUntilDailyReset } from '../core/daily';
import { rarityColor } from './components/ItemArt';
import { CurrencyIcon } from './components/CurrencyIcon';
import { Popup } from './components/Popup';

const fmtUsd = (v: number): string => `$${v.toFixed(2)}`;
function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

/** Human line per grant — the card preview (the receipt carries its own resolved lines). */
/** Player-facing copy for checkout failures (machine codes stay in the console). */
function storeErrorCopy(code: string): string {
  switch (code) {
    case 'offer-cap-reached': return 'You already own this pack (or bought today\u2019s).';
    case 'turnstile-failed': return 'Bot check failed \u2014 please try again.';
    case 'rate-limited': return 'Too many attempts \u2014 wait a minute and try again.';
    case 'store-unavailable': return 'The store is not available right now.';
    case 'network': return 'No connection \u2014 check your network and try again.';
    default: return 'Checkout could not start \u2014 please try again.';
  }
}

function grantLine(g: PremiumGrant): { icon: string; label: string; rarity?: string } {
  switch (g.grant) {
    case 'ichor': return { icon: '◆', label: `${g.qty} Ichor` };
    case 'cores': return { icon: '⬡', label: `${g.qty} Genome Cores` };
    case 'geneEssence': return { icon: '⌬', label: `${g.qty} Gene Essence` };
    case 'mats': return { icon: '⚒', label: `Materials ⊕${g.mutagen ?? 0} ◳${g.scrap ?? 0} ✷${g.catalyst ?? 0}` };
    case 'towerShardsAll': return { icon: '✦', label: `${g.qtyEach} Strain Samples × every tower` };
    case 'heroShardsAll': return { icon: '✦', label: `${g.qtyEach} Apex Genome × every hero` };
    case 'container': return { icon: '◈', label: `${g.count}× ${g.rarity} Bio-Container`, rarity: g.rarity };
    case 'runCache': return { icon: '⬢', label: `${g.count}× Run Cache` };
    case 'equipment': return { icon: '⛨', label: `${g.count}× ${g.rarity} Equipment`, rarity: g.rarity };
    case 'rushStamina': return { icon: '☠', label: `${g.qty} Rush Stamina` };
    case 'battlePassPremium': return { icon: '❁', label: 'Premium track — current season' };
  }
}

// ── One offer card (all sections reuse it; `hero` renders the large permanent-pack layout) ──
function OfferCard({ offer, unavailable, note, hero, onBuy }: {
  offer: PremiumOfferDef;
  unavailable?: boolean;
  note?: string; // "Owned" / "Purchased today" / countdown
  hero?: boolean;
  onBuy: (o: PremiumOfferDef) => void;
}): JSX.Element {
  const mult = offerValueMultiple(offer);
  const potential = useMemo(() => meta.offerPowerPotential(offer.id), [offer.id]);
  return (
    <div className={`ps-card${hero ? ' is-hero' : ''}${unavailable ? ' is-off' : ''}`} style={{ ['--ps' as string]: offer.accent }}>
      <div className="ps-art" aria-hidden><span className="ps-glyph">{offer.art}</span><i className="ps-sheen" /></div>
      <div className="ps-body">
        <div className="ps-name">{offer.name}</div>
        <div className="ps-tag">{offer.tagline}</div>
        {offer.audience && <div className="ps-aud">{offer.audience}</div>}
        <div className="ps-grants">
          {offer.grants.map((g, i) => {
            const l = grantLine(g);
            return <span className="ps-grant" key={i} style={l.rarity ? { color: rarityColor(l.rarity) } : undefined}>{l.icon} {l.label}</span>;
          })}
        </div>
        <div className="ps-meta">
          {offer.kind === 'ichor'
            ? <span className={`ps-bonus${(offer.bonusPct ?? 0) > 0 ? ' on' : ''}`}>{(offer.bonusPct ?? 0) > 0 ? `+${offer.bonusPct}% bonus` : 'base rate'}</span>
            : <span className="ps-bonus on">×{mult.toFixed(1)} value</span>}
          <span className="ps-worth">worth ~{offerValueIchor(offer)} <CurrencyIcon id="ichor" size={11} title="Ichor" /></span>
          {potential > 0 && <span className="ps-power" title="A purchase alone moves Power by zero — this is the ceiling if the shards are invested in stars at normal prices.">⚡ up to +{potential} Power when invested</span>}
        </div>
      </div>
      <div className="ps-buy">
        {note && <span className="ps-note">{note}</span>}
        <button className="ps-btn" disabled={unavailable} onClick={() => { audio.cue('ui'); onBuy(offer); }}>
          {fmtUsd(offer.priceUsd)}
        </button>
      </div>
    </div>
  );
}

// ── Confirmation — the trust beat: full recap, price, and the sandbox notice ──
function ConfirmModal({ offer, busy, error, onConfirm, onClose }: { offer: PremiumOfferDef; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }): JSX.Element {
  return (
    <Popup>
    <div className="ps-overlay" onClick={onClose} role="dialog" aria-label="Confirm purchase">
      <div className="ps-box" onClick={(e) => e.stopPropagation()} style={{ ['--ps' as string]: offer.accent }}>
        <div className="ps-box-h">Confirm purchase</div>
        <div className="ps-box-name">{offer.art} {offer.name}</div>
        <div className="ps-box-grants">
          {offer.grants.map((g, i) => {
            const l = grantLine(g);
            return <div className="ps-box-line" key={i} style={l.rarity ? { color: rarityColor(l.rarity) } : undefined}><span aria-hidden>{l.icon}</span> {l.label}</div>;
          })}
        </div>
        <div className="ps-box-price">{fmtUsd(offer.priceUsd)}</div>
        {CHECKOUT_PROVIDER === 'stripe'
          ? <div className="ps-sandbox">Secure checkout by Stripe — you'll be redirected and returned here.</div>
          : <div className="ps-sandbox">Sandbox checkout — no real charge is made in this build.</div>}
        {error && <div className="ps-error" role="alert">{error}</div>}
        <div className="ps-box-btns">
          <button onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Contacting checkout…' : `Purchase ${fmtUsd(offer.priceUsd)}`}
          </button>
        </div>
      </div>
    </div>
    </Popup>
  );
}

// ── The reveal ceremony — staggered line pops, chest audio, the honest Power note ──
function RevealCeremony({ receipt, onClose }: { receipt: PremiumReceipt; onClose: () => void }): JSX.Element {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= receipt.lines.length) return;
    audio.cue('chest'); // the reveal pitch-ramp
    const t = setTimeout(() => setShown((n) => n + 1), 420);
    return () => clearTimeout(t);
  }, [shown, receipt.lines.length]);
  const done = shown >= receipt.lines.length;
  return (
    <Popup>
    <div className="ps-overlay ps-reveal" role="dialog" aria-label="Purchase complete">
      <div className="ps-box" style={{ ['--ps' as string]: receipt.offer.accent }}>
        <div className="ps-reveal-h">✷ {receipt.offer.name}</div>
        <div className="ps-reveal-sub">Delivered to your account</div>
        <div className="ps-box-grants">
          {receipt.lines.slice(0, shown).map((l, i) => (
            <div className="ps-box-line ps-pop" key={i} style={l.rarity ? { color: rarityColor(l.rarity) } : undefined}>
              <span aria-hidden>{l.icon}</span> {l.label}
            </div>
          ))}
        </div>
        {done && (
          <div className="ps-reveal-foot ps-pop">
            {receipt.powerPotential > 0
              ? <span className="ps-power">⚡ up to +{receipt.powerPotential} Power when invested — spend it in the Labs</span>
              : <span className="ps-power dim">Containers crack in the Genetic Vault; currencies are ready to spend.</span>}
          </div>
        )}
        <div className="ps-box-btns">
          <button className="primary" disabled={!done} onClick={onClose}>{done ? 'Collect' : '…'}</button>
        </div>
      </div>
    </div>
    </Popup>
  );
}

export function PremiumStore(): JSX.Element {
  const save = meta.use();
  const [confirm, setConfirm] = useState<PremiumOfferDef | null>(null);
  const [receipt, setReceipt] = useState<PremiumReceipt | null>(null);
  // Live clock: ticks the rotation countdown + flips the rotating slot at UTC midnight.
  const [key, setKey] = useState(() => dailyKey());
  const [, setNow] = useState(0);
  useEffect(() => {
    meta.openStore(); // stamp the badge
    const id = window.setInterval(() => { setNow(Date.now()); setKey((p) => (p === dailyKey() ? p : dailyKey())); }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const rotating = todaysRotatingOffer(key);
  const events = activeEventOffers(key);
  const boughtToday = save.premium.lastRotatingBuyKey === key;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A purchase delivered while the store was closed (Stripe return claimed on
  // boot) plays its reveal ceremony the next time the store opens.
  useEffect(() => {
    trackEvent('store_open');
    const r = takePendingReveal();
    if (r) { audio.cue('draft'); setReceipt(r); }
  }, []);
  const buy = (o: PremiumOfferDef): void => { setError(null); setConfirm(o); };
  const doPurchase = (): void => {
    if (!confirm || busy) return;
    if (CHECKOUT_PROVIDER === 'stripe') {
      // Real money: create the session server-side and redirect. The grant happens
      // on RETURN, after /api/store/claim verifies payment (never client-alone).
      setBusy(true);
      setError(null);
      trackEvent('checkout_start', `checkout_start:${confirm.id}`);
      void beginCheckout(confirm).then((r) => {
        if (!r.ok) { setBusy(false); setError(storeErrorCopy(r.error)); }
        // On success the page navigates away — no state to update.
      });
      return;
    }
    const r = meta.purchaseOffer(confirm.id);
    setConfirm(null);
    if (r) { audio.cue('draft'); setReceipt(r); }
  };

  return (
    <div className="menu pstore">
      <h1 className="title">PREMIUM STORE</h1>
      <p className="subtitle">
        Acceleration, never obligation — purchases save time and add variety, and move Power by <b>zero</b> until you invest them.
        Everything here is earnable in play.
      </p>

      {/* Today's limited pack + live events */}
      <div className="ps-section-h">Today’s Limited Pack <span className="ps-rot">rotates in {fmtCountdown(msUntilDailyReset())}</span></div>
      <div className="ps-row">
        <OfferCard offer={rotating} hero unavailable={boughtToday} note={boughtToday ? 'Purchased today ✓' : 'One per day'} onBuy={buy} />
        {events.map((o) => (
          <OfferCard key={o.id} offer={o} hero
            unavailable={!offerAvailable(o, key, save.premium.purchases, save.premium.lastRotatingBuyKey)}
            note="Limited event" onBuy={buy} />
        ))}
      </div>

      {/* Permanent packs */}
      <div className="ps-section-h">Permanent Packs <span className="ps-rot">once per account</span></div>
      <div className="ps-row">
        {PERMANENT_PACKS.map((o) => {
          const owned = (save.premium.purchases[o.id] ?? 0) >= (o.limit ?? Infinity);
          return <OfferCard key={o.id} offer={o} hero unavailable={owned} note={owned ? 'Owned ✓' : o.audience} onBuy={buy} />;
        })}
      </div>

      {/* Ichor bundles */}
      <div className="ps-section-h">Ichor <span className="ps-rot">the black-market currency — spend it in the Splice Market</span></div>
      <div className="ps-grid">
        {ICHOR_BUNDLES.map((o) => <OfferCard key={o.id} offer={o} onBuy={buy} />)}
      </div>

      <p className="ps-foot">
        Purchased Genome Cores never count toward Prestige. Legendary and Exotic equipment are never sold directly —
        they remain drops. Campaign gates cannot be bought. See the Help wiki for the full fairness contract.
      </p>

      {confirm && <ConfirmModal offer={confirm} busy={busy} error={error} onConfirm={doPurchase} onClose={() => { if (!busy) setConfirm(null); }} />}
      {receipt && <RevealCeremony receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
