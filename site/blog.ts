// DEV BLOG (docs/WEBSITE.md §blog) — structured posts rendered to /blog/ + /blog/<slug>/.
// A post is data: the generator emits the page, the Article JSON-LD, the tag chips and the
// search text. DRAFTS are produced automatically every 10 commits by `npm run blog:draft`
// (scripts/blog-draft.ts) into site/drafts/ — a human polishes one and moves it here.
// Newest first is enforced by the generator (sorted by date), not by author discipline.

export interface BlogPost {
  slug: string;
  date: string; // ISO yyyy-mm-dd
  title: string;
  category: 'Systems' | 'Art & Audio' | 'Balance' | 'Tech' | 'Release';
  tags: string[];
  summary: string;
  /** Article body — h2/p/ul HTML (kept simple; the shell provides the chrome). */
  body: string;
}

export const POSTS: BlogPost[] = [
  {
    slug: 'the-weekly-game',
    date: '2026-07-11',
    title: 'The Weekly Game: contracts, quests and a hive that keeps a calendar',
    category: 'Systems',
    tags: ['liveops', 'contracts', 'quests', 'progression', 'design'],
    summary: 'The last month rebuilt what a week of ASSIMILATE feels like: a worldwide contract board with near-miss feedback, a lossless quest ring, weekly directives, and two account-wide meters that recognize all of it — with a hard rule that none of it may become a chore.',
    body: `
<p>A single run of ASSIMILATE has always known what it is. The question this batch of updates answered is different: what is a <i>week</i> of ASSIMILATE?</p>
<h2>One board, everyone</h2>
<p>Champion Contracts put three authored constraint runs on a weekly board — "win without a single Kinetic tower", "reach wave 12 flawless" — and every player on Earth sees the same board, rotating on the same UTC clock through an eight-week pool. There is no server deciding this: the rotation is deterministic, the same trick our daily seeds use. One contract each week is the marquee, carrying a Gilded phenotype that exists nowhere else; sweeping all three pays a Perfect Week bonus and a lifetime badge.</p>
<h2>Near-misses are the feature</h2>
<p>The quietly important part is what happens when you FAIL a contract. If a run missed by exactly one constraint, the results screen names it: "Missed by one: Lose no integrity." The evaluator that pays the reward is the same code that writes that sentence, so the feedback can never lie — and a board you haven't beaten becomes a puzzle with a visible next move instead of a wall.</p>
<h2>Quests that respect the clock</h2>
<p>The quest layer is two lanes fed by one credit stream: a weekly ring of three rotating quests, and The Descent Below — a permanent three-chapter questline whose finales premiere story cutscenes. Every mission credits from things you were already doing; nothing asks you to play differently. And the weekly lane is lossless: at rollover, anything earned but unclaimed auto-claims into mail, then the ring resets. A busy week never becomes homework debt.</p>
<h2>Meters that notice everything</h2>
<p>Underneath it all, two account-wide meters landed. The Account Level is an uncapped XP curve that pays on nearly every action, with procedurally weighted rewards and weekly/monthly leaderboards. The Genome Rank folds a weighted contribution from EVERY major system into one prestigious, infinite ladder — and its advisor names the system you've been neglecting, because breadth is what it measures. Promotions pay prestige, never power: the ladders stay honest, and the weekly game stays a game.</p>`,
  },
  {
    slug: 'living-battlefield',
    date: '2026-07-09',
    title: 'The Living Battlefield: making the ground remember your run',
    category: 'Systems',
    tags: ['rendering', 'procedural', 'atmosphere'],
    summary: 'By late game the arena should no longer resemble the map you started on. Here is how the terrain now evolves with your build — veins, frontiers, flora and eyes — without costing a frame.',
    body: `
<p>ASSIMILATE has always been about growth, but until recently the ground you fought on stayed politely inert. That changed with the Living Battlefield: a terrain layer that assimilates alongside your run.</p>
<h2>One hidden number</h2>
<p>Everything you build feeds a hidden assimilation state — tower count and depth (strains, branches, stars, mastery, grafted organisms), heroes and their equipment, kills, bosses, wave depth, your Power Score, even the biome. That state drives an evolution stage from 0 (pristine terrain) to 5 (an unmistakably alive biomechanical ecosystem), shared with the music and HUD so the whole presentation deepens together.</p>
<h2>Mutation spreads from the build</h2>
<p>The membrane doesn't tint uniformly — it radiates outward from every tower and pools up from the hive, merging as the run deepens. A vein network grows through your actual layout (each tower joins its nearest connected neighbor, so the network branches organically), nutrient beads pulse along it in time with a shared heartbeat, and parasites crawl the channels. At the deepest stages the terrain opens eyes that track the nearest enemy.</p>
<h2>The performance trick</h2>
<p>All of the stable terrain is baked into two cached canvases — a base layer that breathes and a glow layer whose alpha rides the heartbeat — rebuilt only when the run actually changes and crossfaded so the arena grows instead of popping. A steady frame costs two draw calls. The whole system is render-only: the deterministic simulation never reads it, so replays and leaderboards are untouched.</p>
<p>A screenshot of a deep run now tells you how deep it is, what the player built, and how thoroughly the environment has been consumed — which was the point all along.</p>`,
  },
  {
    slug: 'opening-cinematic',
    date: '2026-07-10',
    title: 'From slideshow to cold open: scoring the first 40 seconds',
    category: 'Art & Audio',
    tags: ['cinematic', 'audio', 'onboarding'],
    summary: 'The opening is now a continuous, fully scored film — radar pings on the sweep, a heartbeat on the core — that dives you straight into the tutorial. All procedural, no video files.',
    body: `
<p>First impressions compound, so we rebuilt the opening from scratch. The old intro was five click-through slides; the new one is a film.</p>
<h2>The autoplay problem, made diegetic</h2>
<p>Browsers won't play audio before a user gesture — so the film opens on a transmission waiting to be received. The tap that "receives" it unlocks audio, and from that moment the entire sequence is scored: a 62bpm processional that swells scene by scene, under sound design fired by per-scene beat events synced to the visuals. The radar pings when the sweep passes a contact. The core's heartbeat lands on its visual double-thump. The title chord hits with the wordmark.</p>
<h2>Everything is procedural</h2>
<p>There are no video files. Every set-piece — the deep-crust listening post, the swarm boiling up the cavern, steel being consumed by veins, the breathing Hive Core — is painted by the same canvas language the game itself uses, under a slow cinematic camera drift. The whole opening costs kilobytes.</p>
<h2>The descent</h2>
<p>Leaving the title never hard-cuts. The camera dives from the looming nucleus down a living tunnel and blooms white-gold into the tutorial, which picks up the film's voice with its own letterboxed cold open. New players go from first paint to first lesson without a single loading-screen seam.</p>`,
  },
  {
    slug: 'mega-boss-raids',
    date: '2026-06-28',
    title: 'Designing Mega Bosses: raids for a tower defense',
    category: 'Systems',
    tags: ['bosses', 'design', 'combat'],
    summary: 'Battlefield-scale organisms that arrive OVER the arena, fought through weak-point surgery under an ability rotation — with their own composed hymn.',
    body: `
<p>Ordinary bosses walk down the lane. Mega Bosses don't walk anywhere — they arrive over the battlefield itself, anchoring across the top of the arena as terrain-scale organisms.</p>
<h2>Weak-point surgery</h2>
<p>A raid is a sequence of decisions under pressure: organs descend into your towers' reach, each destroyed weak point removes a threat or triggers a consequence, and your whole garrison plus your hero automatically raid-fire whatever is exposed. Speed, integrity kept, organs burned and casts interrupted grade the payout — a perfect raid is loud about it.</p>
<h2>One data row per monster</h2>
<p>Under the hood a Mega Boss is a definition: palette, ability rotation, weak-point loadout, phase script. The renderer grows the body procedurally from the palette; the raid bar, codex, achievements and daily variant pick a new definition up automatically. That's why the roster can keep growing without the systems around it changing.</p>
<h2>The Colossus Hymn</h2>
<p>Mega raids own a dedicated composed piece — an 84bpm half-time processional in C harmonic minor whose choir layers swell as the raid escalates. Burning a weak point audibly angers the music. It is our favorite dial in the whole soundtrack.</p>`,
  },
  {
    slug: 'determinism',
    date: '2026-06-15',
    title: 'Why ASSIMILATE is deterministic (and why you should care)',
    category: 'Tech',
    tags: ['engineering', 'replays', 'fairness'],
    summary: 'Same seed, same inputs, same run — byte for byte. The engineering constraint that gives us shareable replays, fair daily leaderboards, and a test suite that catches balance drift.',
    body: `
<p>Every run of ASSIMILATE is a pure function of its seed and your inputs. Play the same run twice and the simulation produces byte-identical results.</p>
<h2>What that buys players</h2>
<p><b>Replays as links.</b> A finished run compresses to a short code — anyone can watch your exact run, because their machine recomputes it. <b>Fair dailies.</b> Everyone's daily run is the same seed with the same modifiers; the leaderboard measures decisions, not luck. <b>Trust.</b> No hidden rubber-banding, no server-side dice.</p>
<h2>What it costs us</h2>
<p>Discipline. The renderer may never write into the simulation; every visual system — gore, terrain evolution, cinematics — reads snapshots and keeps its state on its own side of the wall. A "golden test" pins six seeded runs byte-for-byte in CI, so a stray floating-point reorder or an accidental sim read fails the build before it ships. It is the strictest rule in the codebase, and the one we would never trade away.</p>`,
  },
  {
    slug: 'equipment-identity',
    date: '2026-05-30',
    title: 'Heroes wear their story: procedural equipment art',
    category: 'Art & Audio',
    tags: ['equipment', 'procedural', 'heroes'],
    summary: 'Hundreds of items, zero drawn assets: every card illustration and every piece of battlefield gear is grown from the item’s own data.',
    body: `
<p>Equipment systems die when items are just stat rows. Ours generate their own art.</p>
<h2>Data-grown illustrations</h2>
<p>An item's card emblem is derived from its slot, subtype, set, rarity and affixes plus a stable per-item seed — so a legendary caustic weapon LOOKS like a legendary caustic weapon, and no two items render identically. New items need zero new art; the generator scales to the whole catalogue for free.</p>
<h2>Worn on the battlefield</h2>
<p>The same generator dresses the hero in-game: your equipped loadout renders as visible gear, set bonuses add their aura, and the inspect screen shows the hero on a rotatable turntable with the exact battlefield look. When you upgrade an item you can see the change before you commit — the preview and the field always agree, because they are the same code.</p>`,
  },
];
