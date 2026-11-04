// FLASH-SALE POPUP (docs/PREMIUM-STORE.md §flash) — the one-time milestone offer, surfaced ONCE
// as a modal at a Hub visit (never in-run, never twice: Hub stamps markFlashShown before this
// mounts, and Later → dismissFlashPopup). Deliberately NOT a checkout: the single CTA routes to
// the Premium Store, where the normal confirm → purchase → reveal pipeline (and its guest gate,
// sandbox notice, and error copy) does the selling. Reuses the store's modal chrome (ps-*).

import { useEffect } from 'react';
import { audio } from '../../audio/sound';
import { trackEvent } from '../../net/events';
import { flashSalePct, flashTriggerLabel } from '../../state/flashOffers';
import { offerHasRandomContent, type PremiumOfferDef } from '../../core/premium';
import { usePaidRandomVisible } from '../../net/storeRegion';
import { rarityColor } from './ItemArt';
import { Popup } from './Popup';
import { fmtCountdown, fmtUsd, grantLine } from '../PremiumStore';

export function FlashOfferPopup({ offer, expiresAt, onStore, onClose }: {
  offer: PremiumOfferDef;
  expiresAt: number | null;
  onStore: () => void;
  onClose: () => void;
}): JSX.Element {
  const regionOk = usePaidRandomVisible() || !offerHasRandomContent(offer); // paid-loot-box region switch
  useEffect(() => {
    if (!regionOk) return;
    audio.cue('draft');
    trackEvent('flash_popup', `flash_popup:${offer.id}`);
  }, [offer.id, regionOk]);
  if (!regionOk) return <></>;
  return (
    <Popup>
      <div className="ps-overlay" onClick={onClose} role="dialog" aria-label="Limited offer">
        <div className="ps-box fo-box" onClick={(e) => e.stopPropagation()} style={{ ['--ps' as string]: offer.accent }}>
          <div className="fo-flare" aria-hidden>⚡ FLASH SALE — {flashSalePct(offer)}% OFF</div>
          <div className="ps-box-name">{offer.art} {offer.name}</div>
          <div className="fo-why">{offer.flash ? flashTriggerLabel(offer.flash.trigger) : ''} — {offer.tagline}</div>
          <div className="ps-box-grants">
            {offer.grants.map((g, i) => {
              const l = grantLine(g);
              return <div className="ps-box-line" key={i} style={l.rarity ? { color: rarityColor(l.rarity) } : undefined}><span aria-hidden>{l.icon}</span> {l.label}</div>;
            })}
          </div>
          <div className="ps-box-price">
            {offer.listUsd !== undefined && <s className="ps-was">{fmtUsd(offer.listUsd)}</s>} {fmtUsd(offer.priceUsd)}
          </div>
          <div className="fo-count">One time only{expiresAt !== null ? ` · ends in ${fmtCountdown(expiresAt - Date.now())}` : ''}</div>
          <div className="ps-box-btns">
            <button onClick={onClose}>Later</button>
            <button className="primary" onClick={onStore}>View in Store</button>
          </div>
        </div>
      </div>
    </Popup>
  );
}
