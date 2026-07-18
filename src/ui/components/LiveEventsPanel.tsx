// LIVE EVENT CONSOLE (docs/LIVE-EVENTS.md §6) — the Command Center's "loud and proud" first
// read AND the claim surface behind it. The banner headlines the theme owner (major > medium
// > short) with the sibling horizons as chips; tapping it unfolds one card per active event:
// the challenge board (tokens are engagement-only — unpurchasable by design), the milestone
// track (threshold claims over tokens EARNED, not spent), and the finite-stock token shop.
// Claims/buys ride meta.claimEventMilestone / meta.buyEventShopRow → applyRewardList, so every
// grant toasts through the one reward bus and repeat-window permanents substitute themselves.
// Pure calendar math per render — the console is always current, forever, with no server.

import { useState } from 'react';
import { meta } from '../../state/meta';
import { audio } from '../../audio/sound';
import { EVENT_HORIZONS, activeLiveEvents, eventTrack } from '../../core/liveEvents';
import type { ActiveLiveEvent } from '../../core/liveEvents';
import { rewardLabel } from '../../core/battlePass';
import type { SaveData } from '../../save/saveStore';

function daysLeft(endsAt: number): number {
  return Math.max(1, Math.ceil((endsAt - Date.now()) / 86_400_000));
}

function EventCard({ a, save }: { a: ActiveLiveEvent; save: SaveData }): JSX.Element {
  const def = a.def;
  const cur = def.currency;
  const bank = save.liveEvents.tokens[a.key] ?? 0;
  const claimed = save.liveEvents.claimed[a.key] ?? [];
  const progress = save.liveEvents.progress[a.key] ?? {};
  const bought = save.liveEvents.shopBought[a.key] ?? {};
  return (
    <article className="cc-evc" style={{ ['--evc' as string]: def.theme.accent }}>
      <header className="cc-evc-head">
        <span className="cc-evc-logo" aria-hidden>{def.theme.logo}</span>
        <span className="cc-evc-title">
          <b className="cc-evc-name">{def.name}</b>
          <span className="cc-evc-h">{EVENT_HORIZONS[def.horizon].label.toUpperCase()} · ENDS IN {daysLeft(a.endsAt)}D</span>
        </span>
        {cur && (
          <span className="cc-evc-wallet" title={`${cur.name} — earned from this event's challenges; the bank clears when the window rotates`}>
            <span aria-hidden>{cur.glyph}</span> {bank}/{cur.cap}
          </span>
        )}
      </header>

      {cur && def.challenges && def.challenges.length > 0 && (
        <div className="cc-evc-sec">
          <span className="cc-evc-k">CHALLENGES · EARN {cur.name.toUpperCase()}</span>
          {def.challenges.map((ch) => {
            const p = Math.min(ch.target, progress[ch.id] ?? 0);
            const done = p >= ch.target;
            return (
              <div className={`cc-evc-ch${done ? ' is-done' : ''}`} key={ch.id}>
                <span className="cc-evc-chname">{done ? '✓ ' : ''}{ch.name}</span>
                <span className="cc-evc-chbar" aria-hidden><i style={{ width: `${(p / ch.target) * 100}%` }} /></span>
                <span className="cc-evc-chn">{p}/{ch.target}</span>
                <span className="cc-evc-tok">+{ch.tokens}{cur.glyph}</span>
              </div>
            );
          })}
        </div>
      )}

      {cur && (
        <div className="cc-evc-sec">
          <span className="cc-evc-k">REWARD TRACK · CLAIM AT THRESHOLDS</span>
          <div className="cc-evc-track">
            {eventTrack(def).map((m) => {
              const isClaimed = claimed.includes(m.at);
              const ready = !isClaimed && bank >= m.at;
              return (
                <span className={`cc-evc-m${isClaimed ? ' is-claimed' : ready ? ' is-ready' : ''}`} key={m.at}>
                  <b className="cc-evc-mat">{m.at}{cur.glyph}</b>
                  {m.rewards.map((r, i) => {
                    const { icon, label } = rewardLabel(r);
                    return <span className="cc-evc-mi" key={i} title={label} aria-label={label}>{icon}</span>;
                  })}
                  {isClaimed && <span className="cc-evc-got" aria-label="Claimed">✓</span>}
                  {ready && (
                    <button
                      className="cc-evc-claim act-claim"
                      onClick={() => { if (meta.claimEventMilestone(a.key, m.at)) audio.cue('chest'); }}
                    >
                      CLAIM
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {cur && def.shop && def.shop.length > 0 && (
        <div className="cc-evc-sec">
          <span className="cc-evc-k">EVENT SHOP · SPEND {cur.name.toUpperCase()}</span>
          {def.shop.map((row) => {
            const left = row.stock - (bought[row.id] ?? 0);
            const afford = left > 0 && bank >= row.costTokens;
            return (
              <div className="cc-evc-shoprow" key={row.id}>
                <span className="cc-evc-mi" aria-hidden>{rewardLabel(row.rewards[0]).icon}</span>
                <span className="cc-evc-shopname">{row.name}</span>
                <span className="cc-evc-stock">{left > 0 ? `×${left} left` : 'SOLD OUT'}</span>
                <button
                  className="cc-evc-buy"
                  disabled={!afford}
                  onClick={() => { if (meta.buyEventShopRow(a.key, row.id)) audio.cue('power'); }}
                >
                  {row.costTokens}{cur.glyph}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

export function LiveEventsPanel(): JSX.Element {
  const save = meta.use();
  const [open, setOpen] = useState(false);
  const trio = activeLiveEvents(Date.now());
  const [maj, med, sho] = trio;
  // Claimable count lights the banner's own affordance (the same math as event.claimable).
  const readyCount = trio.reduce((n, a) => {
    if (!a.def.currency) return n;
    const bank = save.liveEvents.tokens[a.key] ?? 0;
    const cl = save.liveEvents.claimed[a.key] ?? [];
    return n + eventTrack(a.def).filter((m) => bank >= m.at && !cl.includes(m.at)).length;
  }, 0);
  return (
    <section
      className="cc-events"
      aria-label="Live events"
      style={{ ['--ev' as string]: maj.def.theme.accent, ['--ev-glow' as string]: maj.def.theme.glow }}
    >
      <button className="cc-ev-bar" onClick={() => { audio.cue('ui'); setOpen((o) => !o); }} aria-expanded={open}>
        <div className="cc-ev-major">
          <span className="cc-ev-logo" aria-hidden>{maj.def.theme.logo}</span>
          <span className="cc-ev-body">
            <span className="cc-ev-k">LIVE EVENT · ENDS IN {daysLeft(maj.endsAt)}D</span>
            <span className="cc-ev-name">{maj.def.name}</span>
            <span className="cc-ev-tag">{maj.def.tagline}</span>
          </span>
        </div>
        {[med, sho].map((a) => (
          <span className="cc-ev-chip" key={a.key} style={{ ['--evc' as string]: a.def.theme.accent }}>
            <span aria-hidden>{a.def.theme.logo}</span> {a.def.name} <b>{daysLeft(a.endsAt)}d</b>
          </span>
        ))}
        <span className={`cc-ev-open${readyCount > 0 ? ' has-ready' : ''}`}>
          {readyCount > 0 ? `${readyCount} TO CLAIM` : 'DETAILS'} {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="cc-ev-console">
          {trio.map((a) => <EventCard key={a.key} a={a} save={save} />)}
        </div>
      )}
    </section>
  );
}
