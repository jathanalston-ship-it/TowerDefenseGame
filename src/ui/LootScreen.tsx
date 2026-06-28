// LOOT bay — the dedicated, primary place players engage with rewards. Bio-Containers
// are inventory items (earned during runs, never auto-opened); here the player opens
// them at will. Per container type: preview art, owned quantity, lifetime collection
// stats, a pity meter (opens toward a guaranteed gear), and Open / Open-×N actions.
// Opening reveals the haul. Future-proofed: the grid is driven by meta.boxCollection(),
// so new/seasonal container types appear here automatically.

import { useState } from 'react';
import { meta, gearAffixLines } from '../state/meta';
import type { LootReward, LootHaul } from '../state/meta';
import { LOOT_RARITY } from '../core/config';
import { audio } from '../audio/audio';
import { LootMeter } from './LootMeter';
import { CountUp } from './components/CountUp';

const SLOT_LABEL: Record<string, string> = { weapon: 'Weapon', armor: 'Armor', relic: 'Relic' };

type Reveal = { kind: 'one'; reward: LootReward } | { kind: 'haul'; haul: LootHaul };

export function LootScreen({ onBack }: { onBack: () => void }): JSX.Element {
  meta.use(); // re-render as the inventory changes
  const collection = meta.boxCollection();
  const disc = meta.boxDiscovery();
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [seq, setSeq] = useState(0);

  const openOne = (id: string): void => {
    const r = meta.openBox(id);
    if (r) {
      audio.play('box_open');
      setReveal({ kind: 'one', reward: r });
      setSeq((s) => s + 1);
    }
  };
  const openMany = (id: string, count: number): void => {
    const h = meta.openBoxes(id, count);
    if (h) {
      audio.play('box_open');
      setReveal({ kind: 'haul', haul: h });
      setSeq((s) => s + 1);
    }
  };

  return (
    <div className="menu loot-screen">
      <div className="menu-header">
        <div>
          <h1 className="title">Bio-Containers</h1>
          <p className="subtitle">Your stash. Crack them open — currency, Genome Shards, and Hero gear gestate inside.</p>
        </div>
        <button onClick={onBack}>← Back</button>
      </div>

      <div className="panel">
        <LootMeter />
        <div className="loot-collection">
          Collection: <b>{disc.discovered}/{disc.total}</b> container types · <b>{disc.opened}</b> opened
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Stash</div>
        <div className="loot-grid">
          {collection.map(({ type, owned, earned, opened }) => {
            const color = LOOT_RARITY[type.rarity].color;
            const pity = meta.boxPity(type.id);
            return (
              <div key={type.id} className={`loot-card rarity-${type.rarity}`} style={{ ['--rarity' as string]: color }}>
                <div className={`bio-art bio-${type.rarity}`} aria-hidden><span>{type.glyph}</span></div>
                <div className="loot-card-name" style={{ color }}>{type.label}</div>
                <div className="loot-card-qty">Owned <b>×{owned}</b></div>
                <div className="loot-card-stat">{earned} earned · {opened} opened</div>
                {pity && (
                  <div className="loot-pity" title="Opens toward a guaranteed gear item">
                    <div className="loot-pity-bar"><div style={{ width: `${Math.min(100, (pity.value / pity.every) * 100)}%` }} /></div>
                    <span>Pity {pity.value}/{pity.every}</span>
                  </div>
                )}
                <div className="loot-card-actions">
                  <button className="primary" disabled={owned <= 0} onClick={() => openOne(type.id)}>Open</button>
                  <button disabled={owned <= 1} onClick={() => openMany(type.id, owned)} title="Open all of this type">
                    Open ×{owned}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="panel-sub" style={{ marginTop: 10 }}>
          Bio-Containers are earned during runs and banked here — never opened automatically.
        </div>
      </div>

      {reveal && <RevealOverlay reveal={reveal} seq={seq} onClose={() => setReveal(null)} />}
    </div>
  );
}

function Cur({ label, value }: { label: string; value: number }): JSX.Element | null {
  if (value <= 0) return null;
  return (
    <span>
      <b><CountUp value={value} animateFrom={0} duration={650} /></b> {label}
    </span>
  );
}

function GearLine({ slot, rarity, lines }: { slot: string; rarity: LootReward['rarity']; lines: string[] }): JSX.Element {
  return (
    <div className="lr-gear">
      <div className="lr-gear-name">⚙ {LOOT_RARITY[rarity].label} {SLOT_LABEL[slot]}</div>
      <ul className="lr-gear-affixes">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

function RevealOverlay({ reveal, seq, onClose }: { reveal: Reveal; seq: number; onClose: () => void }): JSX.Element {
  const rarity = reveal.kind === 'one' ? reveal.reward.rarity : reveal.haul.rarity;
  const label = reveal.kind === 'one' ? reveal.reward.label : `${reveal.haul.label} ×${reveal.haul.count}`;
  const r = reveal.kind === 'one' ? reveal.reward : reveal.haul;
  const gear = reveal.kind === 'one' ? (reveal.reward.gear ? [reveal.reward.gear] : []) : reveal.haul.gear;

  return (
    <div
      className={`loot-reveal-overlay`}
      role="button"
      tabIndex={0}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
    >
      <div className={`loot-reveal rarity-${rarity}`} key={seq} style={{ ['--rarity' as string]: LOOT_RARITY[rarity].color }}>
        <div className="lr-rarity">{label}</div>
        <div className="lr-rewards">
          <Cur label="Shards" value={r.shards} />
          <Cur label="Essence" value={r.essence} />
          <Cur label="Components" value={r.components} />
          <Cur label="Genome Shards" value={r.genomeShards} />
        </div>
        {gear.length > 0 && (
          <div className="lr-gear-list">
            {gear.map((g, i) => <GearLine key={i} slot={g.slot} rarity={g.rarity} lines={gearAffixLines(g)} />)}
          </div>
        )}
        <div className="lr-dismiss">Tap to continue</div>
      </div>
    </div>
  );
}
