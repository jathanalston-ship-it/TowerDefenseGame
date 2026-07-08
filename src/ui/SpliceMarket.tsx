// Splice Market (docs/MARKET.md) — the organ-trade bazaar. A refreshing 8-slot stock:
// small goods for Genome Cores, premium goods — including Bio-Containers — for ICHOR.
// Stock is deterministic per (profile, 5-minute window); this screen is presentation only —
// meta.marketState/buyMarketSlot own the window record, the clock-tamper rule, and grants.
// Mounting pays the one-time starter vial + stamps the seen-window (clears the nav badge).

import { FieldResearchPanel } from './components/FieldResearch';
import { useEffect, useMemo, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { marketView } from '../state/spliceMarket';
import type { MarketSlotView } from '../state/spliceMarket';
import { ICHOR, MARKET } from '../core/market';
import { CURRENCIES } from '../core/currencies';
import { CurrencyIcon } from './components/CurrencyIcon';

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function SlotCard({ slot, justBought, onBuy }: { slot: MarketSlotView; justBought: boolean; onBuy: (id: string) => void }): JSX.Element {
  const cls = `market-card${slot.pay === 'ichor' ? ' is-premium' : ''}${slot.isContainer ? ' is-container' : ''}${slot.bought ? ' is-sold' : ''}${justBought ? ' is-just-bought' : ''}`;
  // Rarity marker (containers) so the stylesheet can give the top tiers a premium frame —
  // the EXOTIC Bio-Container gets the vault's --viral glow/shimmer instead of a flat card.
  const rarity = slot.item.good === 'container' ? slot.item.rarity : undefined;
  return (
    <div className={cls} data-rarity={rarity} style={{ ['--mk' as string]: slot.color }}>
      <div className="market-card-art" aria-hidden>
        {slot.currencyId ? <CurrencyIcon id={slot.currencyId} color={slot.color} size={30} title="" /> : <span className="market-card-glyph">{slot.glyph}</span>}
      </div>
      <div className="market-card-name">{slot.name}</div>
      {slot.qtyLabel && <div className="market-card-qty">{slot.qtyLabel}</div>}
      {slot.bought ? (
        <span className="market-sold">SOLD</span>
      ) : (
        <button
          type="button"
          className={`shop-buy market-buy ${slot.affordable ? 'is-afford' : ''}`}
          disabled={!slot.affordable}
          onClick={() => onBuy(slot.id)}
        >
          {slot.price.toLocaleString()} <CurrencyIcon id={slot.pay === 'cores' ? 'genomeCores' : 'ichor'} />
        </button>
      )}
    </div>
  );
}

export function SpliceMarket(): JSX.Element {
  const save = meta.use();
  const [now, setNow] = useState(() => Date.now());
  const [justBought, setJustBought] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // First open: the starter vial + the seen-window stamp (badge). Re-runs are no-ops.
  useEffect(() => { meta.openMarket(); }, []);
  // The countdown tick — when the window rolls over, `marketView(save, now)` re-rolls the
  // stock in place (fresh slots, SOLD stamps cleared); stale-slot buys can't succeed anyway.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const view = useMemo(() => marketView(save, now), [save, now]);
  const onBuy = (id: string): void => {
    if (!meta.buyMarketSlot(id)) return;
    setJustBought(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setJustBought(null), 620);
  };

  return (
    <div className="market">
      <header className="market-head">
        <div className="market-eyebrow">◈ Organ Trade</div>
        <h2 className="market-title">Splice Market</h2>
        <p className="market-sub">
          The black bazaar restocks itself on a timer — small goods for Genome Cores, rarer
          organs and whole Bio-Containers for Ichor.
        </p>
      </header>

      <section className="market-bal" aria-label="Budgets">
        <span className="market-bal-chip"><CurrencyIcon id="genomeCores" size={17} /> {view.cores.toLocaleString()} <i>Genome Cores</i></span>
        <span className="market-bal-chip is-ichor"><CurrencyIcon id="ichor" size={17} /> {view.ichor.toLocaleString()} <i>Ichor</i></span>
        <button
          type="button"
          className="market-mtx"
          disabled={!MARKET.mtxEnabled}
          title="The trade routes are not open yet."
        >
          Acquire Ichor — routes closed
        </button>
      </section>

      <section className="market-refresh" aria-label="Stock refresh">
        <span className="market-refresh-k">Fresh stock in</span>
        <span className="market-refresh-t" aria-live="off">{countdown(view.msToRefresh)}</span>
        <span className="market-refresh-w">lot #{view.window % 1000}</span>
      </section>

      <div className="market-grid">
        {view.slots.map((s) => (
          <SlotCard key={s.id} slot={s} justBought={justBought === s.id} onBuy={onBuy} />
        ))}
      </div>

      <FieldResearchPanel />

      <section className="market-src" aria-label="Where Ichor comes from">
        <div className="market-src-h">Where does Ichor come from?</div>
        <ul className="market-src-list">
          <li>Achievements bleed {ICHOR.achievementSmall}–{ICHOR.achievementBig} each.</li>
          <li>Every Collection rank pays {ICHOR.collectionRank}.</li>
          <li>Every {ICHOR.campaignEvery}th Campaign stage pays {ICHOR.campaignAmount} on first clear.</li>
          <li>Each new {ICHOR.infiniteBand}-wave Infinite depth record pays {ICHOR.infinitePerBand}.</li>
          <li>…and sometimes, a Bio-Container bleeds.</li>
        </ul>
        <div className="market-src-note">{CURRENCIES.ichor.blurb}</div>
      </section>
    </div>
  );
}
