// Codex screen — the Collection layer's face, and a genuine PROGRESSION dashboard (docs/COLLECTION.md).
// Three wings under one masthead (no infinite scroll): CODEX — a compact category tile grid that
// drills into a per-category detail (rank badge, completion bar, reward TRACK with milestone pips,
// live BONUSES, the entry grid); MEMORIES — the cutscene archive; REWARDS — earned identity items.
// A rank-up CELEBRATION (Power-gain popup + fanfare) fires for any promotions since the last visit
// (meta.pollCollectionRankUps, session-diffed). Read-only over meta.collection().

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { meta } from '../state/meta';
import { audio } from '../audio/sound';
import { music } from '../audio/music';
import { motionPrefs, onMotionPrefs, resolveMotion, systemReducedMotion } from '../state/prefs';
import { RANK_COLORS, rankMilestones } from '../core/collection';
import type { BonusLine, CollectionCategory, CollectionEntry, CollectionRank, CollectionRankUp, RewardKind } from '../core/collection';
import type { CutsceneDef } from '../core/cutscenes';
import { drawCutsceneStill } from '../render/cutsceneScenes';
import { CutscenePlayer } from './CutscenePlayer';
import './CollectionPanel.css';

const REWARD_ICON: Record<RewardKind, string> = { title: '✦', badge: '◈', portrait: '☻', theme: '◧', cosmetic: '✷', bonus: '▲' };
const MILES = rankMilestones(); // [{ rank, at }] — the reward-track pip positions (single source)

const KEYFRAMES = `
@keyframes codexFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes codexPop { 0% { transform: scale(0.82); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
@keyframes codexPow { 0% { transform: scale(0.5); opacity: 0 } 55% { transform: scale(1.18) } 100% { transform: scale(1); opacity: 1 } }
@keyframes codexBadge { 0% { transform: scale(0.4) rotate(-12deg); opacity: 0 } 70% { transform: scale(1.15) rotate(4deg) } 100% { transform: scale(1) rotate(0); opacity: 1 } }
`;

/** One Memory Archive card — the cutscene as a collectible: painted thumbnail art (its own
 *  opening tableau), the memory's name, its small permanent passive, and ▶ Watch when
 *  unlocked; locked cards show the silhouette + the unlock hint (docs/CUTSCENES.md §archive). */
function MemoryCard({ def, unlocked, onPlay }: { def: CutsceneDef; unlocked: boolean; onPlay: () => void }): JSX.Element {
  const cvRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    cv.width = 260;
    cv.height = 96;
    drawCutsceneStill(ctx, cv.width, cv.height, def);
    if (!unlocked) {
      // the locked silhouette: dim the still to a rumor of itself
      ctx.fillStyle = 'rgba(3,5,9,0.82)';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
  }, [def, unlocked]);
  return (
    <div className={`mem-card${unlocked ? '' : ' is-locked'}`} style={{ ['--mc' as string]: def.palette.glow }}>
      <canvas ref={cvRef} className="mem-art" aria-hidden />
      <div className="mem-body">
        <span className="mem-kind">{def.kind === 'mega' ? '☠ MEGA MEMORY' : '◈ STORY MEMORY'}</span>
        <h3 className="mem-title">{unlocked ? def.title : 'Unrecovered memory'}</h3>
        <span className="mem-sub">{unlocked ? def.subtitle : def.unlockHint}</span>
        <span className="mem-boost">{unlocked ? `✦ ${def.boost.label}` : '✦ Unlock for a small permanent boost'}</span>
      </div>
      {unlocked ? (
        <button className="mem-play" onClick={onPlay} aria-label={`Watch ${def.title}`}>▶ Watch</button>
      ) : (
        <span className="mem-lock" aria-hidden>🔒</span>
      )}
    </div>
  );
}

/** The Memory Archive wing — every story cutscene as a collectible, replayable forever. */
function MemoryArchive({ memories }: { memories: ReturnType<typeof meta.cutscenesView> }): JSX.Element {
  const [playing, setPlaying] = useState<CutsceneDef | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<'all' | 'recovered' | 'unrecovered'>('all');
  const unlocked = memories.filter((m) => m.unlocked).length;
  const needle = query.trim().toLocaleLowerCase();
  const visible = memories.filter(({ def, unlocked: recovered }) => {
    if (filter === 'recovered' && !recovered || filter === 'unrecovered' && recovered) return false;
    // Search only revealed copy: locked titles, subtitles and bonuses stay secret.
    const copy = [def.kind === 'mega' ? 'mega memory' : 'story memory',
      ...(recovered ? [def.title, def.subtitle, def.boost.label] : ['Unrecovered memory', def.unlockHint])];
    return copy.join(' ').toLocaleLowerCase().includes(needle);
  });
  return (
    <>
      <div className="cx-wing-sub">
        {unlocked}/{memories.length} recovered. Recovered bonuses apply automatically to your runs. Replay memories anytime; watching again does not grant another bonus.
      </div>
      <label className="mem-search">Search memories
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, bonus, or unlock hint" />
      </label>
      <div className="mem-filters" role="group" aria-label="Memory recovery">
        {(['all', 'recovered', 'unrecovered'] as const).map((value) => (
          <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {value === 'all' ? `All (${memories.length})` : value === 'recovered' ? `Recovered (${unlocked})` : `Unrecovered (${memories.length - unlocked})`}
          </button>
        ))}
      </div>
      <div className="cx-wing-sub" role="status">Showing {visible.length} of {memories.length} memories</div>
      {visible.length === 0 && <div className="mem-empty">
        <span>No memories match. Clear the search or choose All.</span>
        <button onClick={() => { setQuery(''); setFilter('all'); searchRef.current?.focus(); }}>Show all memories</button>
      </div>}
      <div className="mem-grid">
        {visible.map((m) => (
          <MemoryCard key={m.def.id} def={m.def} unlocked={m.unlocked} onPlay={() => { audio.cue('ui'); setPlaying(m.def); }} />
        ))}
      </div>
      {playing && (
        <CutscenePlayer def={playing} onDone={() => { setPlaying(null); music.play('menu'); }} />
      )}
    </>
  );
}

function RankBadge({ rank, size = 11 }: { rank: CollectionRank; size?: number }): JSX.Element {
  const c = RANK_COLORS[rank];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: `${size * 0.2}px ${size * 0.7}px`, borderRadius: 999,
      fontSize: size, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: c, background: `${c}22`, border: `1px solid ${c}66`,
    }}>{rank}</span>
  );
}

function Bar({ pct, color }: { pct: number; color: string }): JSX.Element {
  return (
    <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${color}aa, ${color})`, transition: 'width 0.6s ease' }} />
    </div>
  );
}

/** The reward track: a filled line with a pip per earnable rank; reached pips glow in the rank color. */
function RewardTrack({ completion, rankIndex }: { completion: number; rankIndex: number }): JSX.Element {
  return (
    <div style={{ position: 'relative', height: 20, margin: '9px 2px 3px' }}>
      <div style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: 8, left: 0, width: `${Math.round(completion * 100)}%`, height: 3, background: 'linear-gradient(90deg,#5ad1ff,#ffd24d)', borderRadius: 2, transition: 'width 0.6s ease' }} />
      {MILES.map((m, i) => {
        const reached = rankIndex >= i + 1; // milestone i (0-based) is rank index i+1 (Bronze=1)
        const c = RANK_COLORS[m.rank];
        const translate = i === 0 ? '0' : i === MILES.length - 1 ? '-100%' : '-50%';
        return (
          <div key={m.rank} title={`${m.rank} — ${Math.round(m.at * 100)}%`}
            style={{ position: 'absolute', left: `${Math.round(m.at * 100)}%`, top: 1, transform: `translateX(${translate})` }}>
            <div style={{
              width: 15, height: 15, borderRadius: '50%',
              background: reached ? c : 'rgba(255,255,255,0.10)',
              border: `2px solid ${reached ? c : 'rgba(255,255,255,0.22)'}`,
              boxShadow: reached ? `0 0 8px ${c}` : 'none',
            }} />
          </div>
        );
      })}
    </div>
  );
}

function Bonuses({ lines }: { lines: BonusLine[] }): JSX.Element {
  if (lines.length === 0) return <div style={{ fontSize: 11, opacity: 0.45, marginTop: 8 }}>Cosmetic set — no combat bonus.</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {lines.map((b, i) => (
        <span key={i} style={{
          fontSize: 11.5, padding: '3px 8px', borderRadius: 6,
          background: b.power ? 'rgba(230,162,255,0.12)' : 'rgba(90,209,255,0.10)',
          border: `1px solid ${b.power ? 'rgba(230,162,255,0.35)' : 'rgba(90,209,255,0.25)'}`,
          color: b.power ? '#e6a2ff' : '#bfe9ff',
        }}><b>{b.value}</b> {b.label}</span>
      ))}
    </div>
  );
}

function tierColor(e: CollectionEntry): string {
  if (e.tier <= 0) return 'rgba(255,255,255,0.10)';
  const frac = e.maxTier > 1 ? e.tier / e.maxTier : 1;
  return frac >= 1 ? '#ffd24d' : frac >= 0.66 ? '#9be8ff' : frac >= 0.33 ? '#6fc8e6' : '#4f8aa0';
}

function EntryGrid({ entries }: { entries: CollectionEntry[] }): JSX.Element {
  return (
    <div role="list" aria-label="Collection entries" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(126px, 1fr))', gap: 6, marginTop: 8 }}>
      {entries.map((e) => (
        <div key={e.id} role="listitem" title={`${e.tier <= 0 ? 'Undiscovered entry' : e.name} — ${e.tierLabel}`} style={{
          display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', borderRadius: 6,
          background: 'rgba(255,255,255,0.04)', borderLeft: `3px solid ${tierColor(e)}`, overflowWrap: 'anywhere',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{e.tier <= 0 ? 'Undiscovered entry' : e.name}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.tierLabel}{e.maxTier > 1 && e.tier > 0 ? ` · ${e.tier}/${e.maxTier}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

/** Next-rank line for a category — shared by the tile hint and the detail header. */
function nextRankText(c: CollectionCategory): string {
  if (c.nextRankAt == null || c.rankIndex >= MILES.length) return 'Fully mastered ★';
  if (c.rankIndex === 0) return `${c.nextRank} — make a discovery`;
  return `${c.nextRank} at ${Math.ceil(c.nextRankAt * 100)}%`;
}

/** One compact category tile — the codex browses as a wall of these; tap to drill in. */
function CategoryTile({ c, onOpen }: { c: CollectionCategory; onOpen: () => void }): JSX.Element {
  const color = RANK_COLORS[c.rank];
  return (
    <button className="cx-tile" data-category={c.id} style={{ ['--cxc' as string]: color }} onClick={onOpen}>
      <span className="cx-tile-top">
        <b className="cx-tile-name">{c.name}</b>
        <RankBadge rank={c.rank} size={10} />
      </span>
      <span className="cx-tile-bar" aria-hidden><i style={{ width: `${Math.round(c.completion * 100)}%` }} /></span>
      <span className="cx-tile-foot">
        <span>{c.discovered}/{c.total} · {Math.round(c.completion * 100)}%</span>
        <i className="cx-tile-go" aria-hidden>▸</i>
      </span>
    </button>
  );
}

/** The drilled-in category page: back row, header, reward track, bonuses, every entry. */
function CategoryDetail({ c, onBack }: { c: CollectionCategory; onBack: () => void }): JSX.Element {
  const color = RANK_COLORS[c.rank];
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, [c.id]);
  return (
    <div className="cx-detail" style={{ ['--cxc' as string]: color }}>
      <button className="cx-back" onClick={onBack}>‹ All categories</button>
      <div className="cx-detail-head">
        <div className="cx-detail-title">
          <h3 ref={titleRef} tabIndex={-1}>{c.name}</h3>
          <RankBadge rank={c.rank} />
        </div>
        <span className="cx-detail-count">{c.discovered}/{c.total} · {Math.round(c.completion * 100)}%</span>
      </div>
      <RewardTrack completion={c.completion} rankIndex={c.rankIndex} />
      <div style={{ fontSize: 10.5, opacity: 0.6 }}>{c.rankIndex >= MILES.length ? 'Fully mastered ★' : `Next: ${nextRankText(c)}`}</div>
      <Bonuses lines={c.bonuses} />
      <EntryGrid entries={c.entries} />
    </div>
  );
}

/** Celebration overlay — fires the fanfare + a Power-gain popup for promotions since the last visit. */
function RankUpCelebration({ rankUps, powerGain, onClose }: { rankUps: CollectionRankUp[]; powerGain: number; onClose: () => void }): JSX.Element {
  const titleId = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const [motion, setMotion] = useState(() => resolveMotion(motionPrefs(), systemReducedMotion()).motion);
  useEffect(() => { audio.resume(); audio.cue('rankup'); }, []);
  useEffect(() => {
    const previous = document.activeElement;
    continueRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    let prefs = motionPrefs();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotion(resolveMotion(prefs, media.matches).motion);
    const unsubscribe = onMotionPrefs((next) => { prefs = next; update(); });
    media.addEventListener('change', update);
    update();
    return () => { unsubscribe(); media.removeEventListener('change', update); };
  }, []);
  return (
    <div className={`cx-celebration${motion ? '' : ' is-still'}`} onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(4,8,14,0.74)', backdropFilter: 'blur(3px)', animation: 'codexFade 0.3s ease',
    }}>
      <div className="cx-celebration-card" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        if (e.key !== 'Tab') return;
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[tabindex="0"], button'));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }} style={{
        width: 420, maxWidth: 'calc(100% - 24px)', boxSizing: 'border-box', padding: '22px 26px', borderRadius: 14, textAlign: 'center',
        background: 'linear-gradient(160deg, rgba(28,20,44,0.98), rgba(12,16,26,0.98))',
        border: '1px solid rgba(230,162,255,0.4)', boxShadow: '0 12px 48px rgba(0,0,0,0.6)', animation: 'codexPop 0.5s cubic-bezier(.2,1.3,.4,1)',
      }}>
        <h2 id={titleId} style={{ fontSize: 11, letterSpacing: '0.28em', opacity: 0.7, margin: '0 0 12px' }}>CODEX RANK UP</h2>
        <div className="cx-celebration-results" role="region" aria-label="Collection promotions and Power gain" tabIndex={0}>
        {rankUps.map((r) => (
          <div key={r.category} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '8px 0', animation: 'codexBadge 0.6s ease both' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{r.categoryName}</span>
            <RankBadge rank={r.rank} size={14} />
          </div>
        ))}
        {powerGain > 0 && (
          <div style={{ marginTop: 10, fontSize: 24, fontWeight: 800, color: '#e6a2ff', animation: 'codexPow 0.7s ease both' }}>
            +{powerGain.toLocaleString()} Power
          </div>
        )}
        </div>
        <button ref={continueRef} onClick={onClose} style={{
          marginTop: 16, minHeight: 44, padding: '8px 22px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          color: '#0a0e16', background: 'linear-gradient(90deg,#c9a2ff,#e6a2ff)', border: 'none',
        }}>Continue ▸</button>
      </div>
    </div>
  );
}

const CX_TABS = [
  { id: 'codex', glyph: '▤', label: 'Codex' },
  { id: 'memories', glyph: '▣', label: 'Memories' },
  { id: 'rewards', glyph: '✦', label: 'Rewards' },
] as const;
type CxTab = (typeof CX_TABS)[number]['id'];

/** Codex as a dedicated headquarters screen. Reflects meta.collection() / meta.collectionRewards();
 * read-only, except it polls session rank-ups on mount to celebrate promotions. */
export function CollectionScreen(): JSX.Element {
  const screenId = useId();
  const screenRef = useRef<HTMLDivElement>(null);
  const returnCategory = useRef<string | null>(null);
  const view = useMemo(() => meta.collection(), []);
  const rewards = useMemo(() => meta.collectionRewards(), []);
  const memories = useMemo(() => meta.cutscenesView(), []);
  const [celebration, setCelebration] = useState<{ rankUps: CollectionRankUp[]; powerGain: number } | null>(null);
  const [tab, setTab] = useState<CxTab>('codex');
  const [openCat, setOpenCat] = useState<string | null>(null);
  const open = view.categories.find((c) => c.id === openCat) ?? null;
  const memUnlocked = memories.filter((m) => m.unlocked).length;

  useEffect(() => {
    if (openCat !== null || returnCategory.current === null) return;
    const tile = Array.from(screenRef.current?.querySelectorAll<HTMLButtonElement>('[data-category]') ?? [])
      .find((button) => button.dataset.category === returnCategory.current);
    tile?.focus();
    returnCategory.current = null;
  }, [openCat]);

  useEffect(() => {
    const { rankUps, powerGain } = meta.pollCollectionRankUps();
    if (rankUps.length > 0) setCelebration({ rankUps, powerGain });
  }, []);

  return (
    <div ref={screenRef} className="collection cx" style={{ color: '#dfe8f2' }}>
      <style>{KEYFRAMES}</style>

      {/* ── MASTHEAD — the whole collection at a glance ── */}
      <div className="cx-mast">
        <div className="cx-mast-id">
          <div className="panel-title">Bio-Dex Codex</div>
          <div className="cx-mast-sub">
            {view.discovered}/{view.total} discovered · {Math.round(view.pct * 100)}% found · {Math.round(view.completion * 100)}% mastery
          </div>
        </div>
        <div className="cx-mast-stats">
          <RankBadge rank={view.rank} size={12} />
          <span className="cx-mast-power" title="The collection's contribution to your Power Score">
            ◆ Power ×{view.power.toFixed(2)}
          </span>
        </div>
      </div>
      <Bar pct={view.completion} color={RANK_COLORS[view.rank]} />

      {/* ── SUB-NAV — three wings, no infinite scroll ── */}
      <div className="wing-tabs cx-tabs" role="tablist" aria-label="Codex pages" style={{ ['--wingc' as string]: 'var(--viral)' }}>
        {CX_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`${screenId}-tab-${t.id}`}
            aria-controls={`${screenId}-panel-${t.id}`}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            className={`wing-tab${tab === t.id ? ' on' : ''}`}
            onClick={() => { setTab(t.id); setOpenCat(null); }}
            onKeyDown={(e) => {
              const index = CX_TABS.findIndex((entry) => entry.id === t.id);
              const next = e.key === 'ArrowRight' ? (index + 1) % CX_TABS.length
                : e.key === 'ArrowLeft' ? (index + CX_TABS.length - 1) % CX_TABS.length
                : e.key === 'Home' ? 0 : e.key === 'End' ? CX_TABS.length - 1 : -1;
              if (next < 0) return;
              e.preventDefault();
              setTab(CX_TABS[next].id); setOpenCat(null);
              e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}
          >
            <span className="wing-tab-glyph" aria-hidden>{t.glyph}</span>
            <span className="wing-tab-body">
              <b>{t.label}</b>
              <i>{t.id === 'codex' ? `${view.categories.length} categories`
                : t.id === 'memories' ? `${memUnlocked}/${memories.length} recovered`
                : `${rewards.length} earned`}</i>
            </span>
          </button>
        ))}
      </div>
      {CX_TABS.filter((entry) => entry.id !== tab).map((entry) => (
        <div key={entry.id} hidden role="tabpanel" id={`${screenId}-panel-${entry.id}`} aria-labelledby={`${screenId}-tab-${entry.id}`} />
      ))}

      <div className="cx-page" role="tabpanel" id={`${screenId}-panel-${tab}`} aria-labelledby={`${screenId}-tab-${tab}`} tabIndex={0}>
      {tab === 'codex' && (open ? (
        <CategoryDetail c={open} onBack={() => { returnCategory.current = open.id; setOpenCat(null); }} />
      ) : (
        <>
          <div className="cx-wing-sub">Every category ranks Bronze → Ascendant — open one for its reward track, bonuses and entries.</div>
          <div className="cx-tiles" data-guide="collection-tiles">
            {view.categories.map((c) => <CategoryTile key={c.id} c={c} onOpen={() => { audio.cue('ui'); setOpenCat(c.id); }} />)}
          </div>
        </>
      ))}

      {tab === 'memories' && <MemoryArchive memories={memories} />}

      {tab === 'rewards' && (
        <>
          <div className="cx-wing-sub">Identity rewards earned from category ranks — titles, badges and cosmetics.</div>
          {rewards.length === 0 ? (
            <div style={{ fontSize: 12.5, opacity: 0.7 }}>Complete a category to earn titles, badges, and cosmetics.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {rewards.map((r) => (
                <div key={r.id} title={r.desc} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
                  background: 'rgba(255,210,77,0.10)', border: '1px solid rgba(255,210,77,0.35)', fontSize: 12.5,
                }}>
                  <span style={{ color: '#ffd24d' }}>{REWARD_ICON[r.kind]}</span>
                  <span>{r.name}</span>
                  <span style={{ opacity: 0.55, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.kind}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      </div>
      {celebration && <RankUpCelebration rankUps={celebration.rankUps} powerGain={celebration.powerGain} onClose={() => setCelebration(null)} />}
    </div>
  );
}
