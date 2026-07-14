// CORE PAGES (docs/WEBSITE.md §content) — home + the static pages, as functions of a small
// context the generator supplies (latest post/patch, live content counts, featured picks).
// All copy is original and specific — no lorem, no stubs: every page must stand alone for a
// human reader (and an AdSense reviewer) with real information.

import { CONTACT_EMAIL, PLAY_PATH } from './config';
import { adSlot, esc } from './shell';
import type { BlogPost } from './blog';

export interface HomeCtx {
  latestPost: BlogPost;
  latestPatch: { date: string; title: string; categories: string[] } | null;
  counts: { towers: number; heroes: number; enemies: number; biomes: number; bosses: number; doctrines: number };
  featuredTower: { name: string; blurb: string; color: string };
  featuredHero: { name: string; blurb: string; color: string };
}

export function homePage(ctx: HomeCtx): string {
  const c = ctx.counts;
  return `
<section class="home-hero">
  <div class="shell-wrap">
    <div class="eyebrow">DEFEND · EVOLVE · CONSUME</div>
    <h1 class="home-title">ASSIMILATE</h1>
    <p class="home-tag">A cyberpunk bio-horror tower defense. Grow a living hive, mutate ${c.towers} tower strains through stars, branches and grafts, and hold the line against ${c.bosses}+ apex organisms.</p>
    <div class="hero-ctas">
      <a class="btn-primary" href="${PLAY_PATH}">▶ PLAY FREE IN YOUR BROWSER</a>
      <a class="btn-ghost" href="/about/">What is ASSIMILATE?</a>
    </div>
    <p class="hero-sub">No install. No account. Your hive saves on your device — with optional cloud backup.</p>
    <div class="store-row">
      <span class="store-pill"><b>Steam</b> — wishlist coming soon</span>
      <span class="store-pill"><b>iOS / Android</b> — in development</span>
      <span class="store-pill"><b>Web</b> — playable now</span>
    </div>
  </div>
</section>

<section class="section"><div class="shell-wrap">
  <h2>Watch the hive at work</h2>
  <p class="lead">Real gameplay: the Command Center, the line under siege, and a battlefield-scale raid organism.</p>
  <video class="trailer-video" controls muted playsinline preload="metadata"
         poster="/media/shots/combat.webp" src="/media/trailer.webm"
         aria-label="ASSIMILATE gameplay trailer">
    Your browser can't play this video — <a href="${PLAY_PATH}">play the game itself instead</a>.
  </video>
</div></section>

${adSlot('home-below-trailer', 'banner')}

<section class="section"><div class="shell-wrap">
  <h2>Screenshots</h2>
  <div class="shots-grid">
    <figure><img src="/media/shots/combat.webp" alt="Combat: a full garrison holding the line against a hundred-strong wave" loading="lazy" width="720" height="960" />
      <figcaption>Hold the line — every enemy is a body on a battlefield, not a number on a path.</figcaption></figure>
    <figure><img src="/media/shots/megaraid.webp" alt="A Mega Boss raid: a battlefield-scale organism with exposed weak points" loading="lazy" width="720" height="960" />
      <figcaption>Mega raids: battlefield-scale organisms fought through weak-point surgery.</figcaption></figure>
    <figure><img src="/media/shots/command.webp" alt="The Command Center home screen with the living world status organism" loading="lazy" width="720" height="960" />
      <figcaption>The Command Center — your hive between runs, alive and growing.</figcaption></figure>
  </div>
</div></section>

<section class="section"><div class="shell-wrap">
  <h2>This week in the hive</h2>
  <div class="widget-grid">
    <div class="widget"><div class="k">Latest Devlog</div>
      <h3><a href="/blog/${ctx.latestPost.slug}/">${esc(ctx.latestPost.title)}</a></h3>
      <p>${esc(ctx.latestPost.summary)}</p>
      <a class="more" href="/blog/">All devlogs →</a></div>
    <div class="widget"><div class="k">Latest Patch</div>
      ${ctx.latestPatch
        ? `<h3><a href="/news/">${esc(ctx.latestPatch.title)}</a></h3><p>${esc(ctx.latestPatch.date)} · ${esc(ctx.latestPatch.categories.slice(0, 4).join(', '))}</p>`
        : '<h3><a href="/news/">Patch notes</a></h3><p>The full change history, categorized and searchable.</p>'}
      <a class="more" href="/news/">All patch notes →</a></div>
    <div class="widget"><div class="k">Featured Tower</div>
      <h3><span class="swatch" style="background:${esc(ctx.featuredTower.color)}"></span>${esc(ctx.featuredTower.name)}</h3>
      <p>${esc(ctx.featuredTower.blurb)}</p>
      <a class="more" href="/guides/towers/">Tower guide →</a></div>
    <div class="widget"><div class="k">Featured Hero</div>
      <h3><span class="swatch" style="background:${esc(ctx.featuredHero.color)}"></span>${esc(ctx.featuredHero.name)}</h3>
      <p>${esc(ctx.featuredHero.blurb)}</p>
      <a class="more" href="/guides/heroes/">Hero guide →</a></div>
    <div class="widget"><div class="k">Today's Daily Run</div>
      <h3>One seed, worldwide</h3>
      <p>Every UTC day generates one deterministic run — same biome, same bosses, same modifiers for everyone. Pure skill on the board.</p>
      <a class="more" href="${PLAY_PATH}">Play today's seed →</a></div>
    <div class="widget"><div class="k">This Week's Contracts</div>
      <h3>Three constraint runs</h3>
      <p>One Champion Contract board worldwide, rotating weekly — honour all three for a Perfect Week, and chase the exclusive Gilded marquee.</p>
      <a class="more" href="/guides/contracts/">How contracts work →</a></div>
    <div class="widget"><div class="k">Up Next</div>
      <h3>The roadmap</h3>
      <p>Steam release, new tower strains, deeper prestige, and community events — see what's growing.</p>
      <a class="more" href="/roadmap/">Full roadmap →</a></div>
  </div>
</div></section>

<section class="section"><div class="shell-wrap">
  <h2>A tower defense that grows back</h2>
  <div class="feature-strip">
    <div class="f"><b>${c.towers} tower strains</b><span>Stars, branches, strains and mastery — four evolution layers per tower.</span></div>
    <div class="f"><b>${c.heroes} heroes</b><span>Living weapons with doctrines, equipment, ability forks and ★10 paths.</span></div>
    <div class="f"><b>${c.enemies}+ enemy strains</b><span>Swarms, fliers, artillery, summoners, volatiles — every body a real threat.</span></div>
    <div class="f"><b>${c.bosses} bosses</b><span>Framework apexes and battlefield-scale Mega raid organisms.</span></div>
    <div class="f"><b>${c.biomes} biomes</b><span>Ecosystems that warp the rules — permafrost, bone dunes, neural storms.</span></div>
    <div class="f"><b>${c.doctrines} doctrines</b><span>Exclusive run commitments that reshape the rules — and rank up as you master them.</span></div>
    <div class="f"><b>A living week</b><span>Daily seeds, Champion Contracts, quest rings and directives — the hive resets its rituals weekly.</span></div>
    <div class="f"><b>Set-piece casts</b><span>Every hero ability is a staged performance — the sky-dragon strafes the lane, and the blow lands with it.</span></div>
    <div class="f"><b>Works while you're away</b><span>The Idle Harvest accrues honestly — a welcome back, never a replacement for play.</span></div>
    <div class="f"><b>Deterministic</b><span>Same seed, same run, byte for byte — shareable replays and fair dailies.</span></div>
  </div>
  <p style="margin-top:22px"><a class="btn-ghost" href="/features/">Every feature in depth →</a></p>
</div></section>`;
}

export function aboutPage(): string {
  return `
<h2>What ASSIMILATE is</h2>
<p>ASSIMILATE is a single-player tower defense set inside a bio-mechanical ecosystem. You are the Hive Core — the last organism still growing back — holding a defensive line against an appetite that consumes flesh, steel and thought. It plays free in any modern browser: no install, no account, no pay-to-win.</p>
<h2>What makes it different</h2>
<p><b>Everything grows.</b> Towers are organisms with four independent evolution layers. Heroes wear their equipment on the battlefield. The terrain itself assimilates as your run deepens, until the arena no longer resembles the map you started on.</p>
<p><b>Everything is deterministic.</b> A run is a pure function of its seed and your inputs — which gives you shareable replay links, honest daily leaderboards and a game that can never secretly cheat you.</p>
<p><b>Everything persists.</b> Biomass dies with the run; knowledge, shards, genes, mastery and collections do not. A lost run is still fuel.</p>
<h2>The state of the game</h2>
<p>ASSIMILATE is in active development with frequent updates — the <a href="/news/">patch notes</a> are generated straight from the development history, and the <a href="/blog/">dev blog</a> covers the systems as they land. The web version is the live game, not a demo.</p>
<h2>Who makes it</h2>
<p>ASSIMILATE is an independent project — a small team building the tower defense we always wanted: systems-deep, visually alive, and respectful of your time and wallet. Say hello on the <a href="/contact/">contact page</a>.</p>`;
}

export function featuresPage(): string {
  return `
<h2>Combat</h2>
<p>Waves descend from the breeding membrane toward your Hive Core. Towers target, lead and fire on their own; you decide what grows where, when to relocate, and when to spend your hero's ability. Reactions (fracture + corrosion = shred), armor, shields, auras, artillery deadzones and flying strains keep placement decisions sharp for hundreds of hours.</p>
<h2>Four evolution layers per tower</h2>
<p><b>Stars</b> — permanent ★-paths bought with shards. <b>Branches</b> — in-run mutually exclusive mutations that re-author how a tower fires. <b>Strains</b> — in-run evolution fed by consuming duplicates from the Biomorph Conveyor. <b>Mastery</b> — kill-fed ranks with lore and visible cosmetic evolution. All four stack, and all four are visible on the battlefield model.</p>
<h2>Heroes</h2>
<p>Champions with battle doctrines (dive, guard, control, phase), active abilities, ★10 upgrade paths with ability forks at ★5/★8, and full Weapon/Armor/Relic loadouts with behavioral affixes and set bonuses — rendered on the battlefield by a procedural gear system. Benched heroes run timed <b>Expeditions</b> for materials while you play.</p>
<h2>Doctrines — commit to a run</h2>
<p>Before a run you may sign exactly ONE <a href="/guides/doctrines/">Doctrine</a>: a Build doctrine that bends your own math, a Protocol that reshapes the enemy world (double swarms at half health; a handful of titans; a famine that pays premium rewards), or a Pact that does both. Doctrines carry campaign unlock gates, mastery ranks that raise their payouts, and a Bio-Dex codex of their own — commitment is a progression axis.</p>
<h2>The weekly game</h2>
<p>The hive runs on rituals. A <b>Daily Run</b> — one deterministic seed worldwide. <a href="/guides/contracts/"><b>Champion Contracts</b></a> — three constraint runs a week on one shared board, with a Gilded marquee exclusive and a Perfect Week sweep bonus. A <b>weekly quest ring</b> plus the permanent Descent Below questline, credited automatically from everything you already do. <b>Weekly Directives</b> — a cumulative objective ladder with milestone payouts. A <b>Season Pass</b> fed by all of it. None of these are chores: they read from your normal play.</p>
<h2>Set-piece hero casts</h2>
<p>Every hero ability stages a procedural performance when it fires — the Cinderwyrm's breath is a dragon sweeping the lane, the Fovea's stare is a vast eye opening into a psionic lance, the Knell's peal is a bell descending to its slam — and the blow <b>lands the moment the performance strikes</b>. Support (heals, shields, rally buffs) stays instant, the zone payload travels with the animation, and the telegraph is real: what stands in the ring when it lands is what gets hit. All of it procedural, no sprites, no video — and it respects reduced-motion settings.</p>
<h2>The permanent game</h2>
<p>A genome upgrade tree, a levelable Gene Archive of draft cards, tower and hero labs, equipment crafting with pity protection and undo-able salvage, per-tower Mulligan organisms with class adaptations, collections with rank bonuses, prestige with Ascendant nodes, and a Power Score that folds all of it into one honest number. Above the star caps sit <b>Prime Strains</b> — a deep per-unit ascension lane for maxed towers and heroes that folds into the same Power math.</p>
<h2>The hive works while you're away</h2>
<p>The <b>Idle Harvest</b> accrues while you're gone — materials, essence, shards, the occasional sealed container — with its own upgrade tree of harvest nodes. It is deliberately, provably the <i>slower</i> path: the design guardrail (enforced by automated economy simulations) keeps away-time income well under active play at every stage band, so the harvest welcomes you back without ever replacing the game.</p>
<h2>Account mastery</h2>
<p>An uncapped <b>Account Level</b> pays on nearly everything you do, with procedurally weighted level rewards, milestone titles and weekly/monthly XP leaderboards. Above it sits the <b>Genome Rank</b> — a breadth-weighted rating folding every major system into one prestigious, infinite ladder, with a Progress Advisor that names your best next move. Promotions pay prestige, never power.</p>
<h2>The hunt hunts back</h2>
<p>Lose to a boss and it becomes your <a href="/guides/nemesis/"><b>Nemesis</b></a> — returning branded and buffed, escalating a grudge ladder (Marked → Apex Predator) every time it wins again. Revenge pays tier-scaled rewards, an exclusive phenotype and a permanent Vengeance organ for the trophy rack. Meanwhile the <b>Infestation Map</b> turns every finished run into territory: sectors climb tiers, regions entrench, and your conquest pays live passives.</p>
<h2>Modes</h2>
<p><b>Campaign</b> — a procedurally authored stage ladder with events and milestone bosses every tenth stage. <b>Infinite</b> — an AI Director escalating against your best. <b>Boss Rush</b> — wave N is N bosses, stamina-gated, paying per kill. <b>Daily Run</b> — one deterministic seed per day, worldwide, verified by replay.</p>
<h2>Presentation</h2>
<p>A living battlefield that terraforms with your run, procedural creature and turret bodies, set-piece hero-cast performances, a fully scored opening cinematic plus story cutscenes premiered by quest finales and Mega defeats, an adaptive generative soundtrack (the Mega raids have their own hymn; events re-voice the dailies), and gore that routes every kill's biomass visibly home. All of it procedural — the whole game ships lighter than one video file.</p>
<h2>Fair by construction</h2>
<p>Deterministic simulation, replays as links, replay-verified leaderboards, no energy timers on core play, no loot boxes for power, and saves that live on YOUR device with optional cloud accounts for backup and cross-device play.</p>`;
}

export function roadmapPage(): string {
  return `
<p class="note">This roadmap reflects current development priorities. Order and scope evolve with player feedback — the <a href="/blog/">dev blog</a> announces changes.</p>
<ul class="timeline">
  <li><span class="t-date">NOW — LIVE</span><h3>The living game</h3>
    <p>Four modes (Campaign, Infinite, Boss Rush, Daily); the full tower roster with stars, branches, strains, mastery and Mulligan organisms; heroes with equipment, forks and expeditions; Mega Boss raids; Doctrines with mastery ranks; the Living Battlefield; story cutscenes; collections and prestige.</p></li>
  <li><span class="t-date">NOW — LIVE</span><h3>The weekly game</h3>
    <p>Shipped and running on the weekly clock: Champion Contracts with Gilded marquees and Perfect Weeks, the rotating quest ring plus The Descent Below questline, Weekly Directives, a two-season Battle Pass, a LiveOps event calendar, and Account Level + Genome Rank with weekly and monthly leaderboards.</p></li>
  <li><span class="t-date">NOW — LIVE</span><h3>The deep game</h3>
    <p>The latest wave of systems: set-piece hero-cast cinematics (every ability a staged performance with its payload landing on the strike), Prime Strains above the star caps, the Idle Harvest with its guardrailed away-time economy, and a roster grown to ten heroes across six combat classes — each gated by a different feat.</p></li>
  <li><span class="t-date">NEXT</span><h3>Deeper roster</h3>
    <p>New tower strains and heroes toward the long-term targets (100 towers / 30 heroes), more authored bosses and Mega organisms, and new biome ecosystems with bespoke terrain flora.</p></li>
  <li><span class="t-date">SOON</span><h3>Community & competition</h3>
    <p>Community spotlight features on this site, richer replay-theater sharing, and seasonal leaderboard ladders built on the replay-verified boards already live.</p></li>
  <li><span class="t-date">PLANNED</span><h3>Steam release</h3>
    <p>A Steam edition with achievements and cloud saves. Wishlist link lands on the homepage the day the store page is live.</p></li>
  <li><span class="t-date">PLANNED</span><h3>Mobile</h3>
    <p>iOS and Android builds — the game is already touch-first and portrait-native; the remaining work is store packaging and platform polish.</p></li>
  <li><span class="t-date">EXPLORING</span><h3>The far horizon</h3>
    <p>Co-op raid experiments, user-authored daily modifiers, and localization beyond EN/ES/PT.</p></li>
</ul>`;
}

export function faqPage(): { html: string; qa: [string, string][] } {
  const qa: [string, string][] = [
    ['Is ASSIMILATE really free?', 'Yes. The full game plays free in your browser with no install and no account. Optional cosmetic and convenience purchases support development — power is never for sale.'],
    ['Where is my save stored?', 'On your device, in your browser\'s local storage. Named accounts can additionally mirror saves to the cloud for free backup and cross-device play. Export/import is always available.'],
    ['Does it work on mobile?', 'Yes — the game is touch-first and portrait-native, and plays well in mobile browsers. Native iOS/Android builds are on the roadmap.'],
    ['Does it work offline?', 'Yes. After your first visit the game installs a service worker and runs fully offline. You can also install it as an app from your browser.'],
    ['What does "deterministic" mean here?', 'A run is a pure function of its seed and your inputs: replaying it reproduces the exact same result, byte for byte. That is what makes replay links and fair daily leaderboards possible.'],
    ['How do daily runs work?', 'Every UTC day generates one seed — the same biome, bosses, modifiers and tower pool for every player in the world. The leaderboard compares decisions, not luck.'],
    ['I lost a run. Did I lose progress?', 'No. Biomass dies with the run; everything else — shards, genes, mastery, collections, unlocks — persists. Losing runs is part of the loop.'],
    ['Will it come to Steam?', 'A Steam release is planned. The homepage will carry the wishlist link the day the store page is live.'],
    ['How often does the game update?', 'Continuously — patch notes are generated straight from the development history. See the News page for the full record.'],
    ['What is there to do each week?', 'The hive runs on a weekly clock: a daily seed every UTC day, three Champion Contracts on one worldwide board (sweep all three for a Perfect Week), a rotating quest ring, Weekly Directives, and a season pass fed by all of it. Everything credits from normal play — no chore lists.'],
    ['What are Doctrines?', 'Optional run-start commitments — you sign exactly one, and it reshapes a rule for the whole run: your own math (Build), the enemy world (Protocol), or both (Pact). Harder doctrines pay reward premiums, and each ranks up as you master it.'],
    ['Do I earn anything while I\'m away?', 'Yes — the Idle Harvest accrues materials while you\'re gone, with its own small upgrade tree. It is deliberately the slower path: an automated economy guardrail keeps away-time income well below active play, so it welcomes you back without ever playing the game for you.'],
    ['Are the hero abilities animated?', 'Every hero cast stages a procedural set-piece — the sky-dragon strafes the lane, the great eye opens and lances — and the damage lands exactly when the performance strikes. It is all drawn in code (no sprites or video), and it respects your reduced-motion setting.'],
    ['Do I need an account?', 'No. The game plays fully without one. A free named account adds cloud backup, cross-device play and leaderboard identity — and you can delete it in-game at any time.'],
    ['How do I report a bug or give feedback?', `Email ${CONTACT_EMAIL} — reports with a replay code attached are gold, because we can reproduce your exact run.`],
  ];
  const html = qa.map(([q, a]) => `<h2>${esc(q)}</h2><p>${a}</p>`).join('');
  return { html, qa };
}

export function contactPage(): string {
  return `
<h2>Get in touch</h2>
<p>ASSIMILATE is an independent project and we read everything.</p>
<p><b>Email:</b> <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
<h2>Bug reports</h2>
<p>The most useful bug report includes: what you expected, what happened, your browser, and — if it happened during a run — the run's <b>replay code</b> (Results screen → Share). Because the game is deterministic, a replay code lets us reproduce your exact run.</p>
<h2>Press & content creators</h2>
<p>You are welcome to publish videos, streams and articles about ASSIMILATE, monetized or not. Screenshots and captures from the game may be used freely for coverage. For a press kit or interview, email us with "PRESS" in the subject.</p>
<h2>Business</h2>
<p>Partnership or platform inquiries: same address, subject "BIZ". We answer within a few business days.</p>`;
}

export function creditsPage(): string {
  return `
<h2>The team</h2>
<p>ASSIMILATE is designed, engineered, composed and illustrated by a small independent team, with systems and content built in the open — the development history behind the <a href="/news/">patch notes</a> is the honest record of who did what, when.</p>
<h2>Technology</h2>
<p>Built with TypeScript, React and Vite. Rendering is hand-written Canvas 2D. The soundtrack and every sound effect are synthesized procedurally in the Web Audio API — the game ships with no audio files. Hosting by Cloudflare Pages.</p>
<h2>Special thanks</h2>
<p>To the early players who lost runs so you don't have to, filed replay codes with their bug reports, and argued about tower balance until it got better. The hive remembers.</p>
<h2>Open-source acknowledgements</h2>
<p>React (MIT), Vite (MIT), TypeScript (Apache-2.0), Vitest (MIT). Full license texts ship with the source distribution.</p>`;
}

export function leaderboardsPage(): string {
  return `
<h2>Daily Run standings</h2>
<p>Every UTC day, one deterministic seed — the same run for every player on Earth. Standings are recorded in-game and verified by replay: a submitted score is its run, recomputable byte-for-byte.</p>
<p><a class="btn-primary" href="${PLAY_PATH}">Play today's seed →</a></p>
<h2>Where the boards live</h2>
<p>Live standings — today's daily, all-time Infinite depth records, and Boss Rush bests — are inside the game's <b>Leaderboards</b> screen, next to the modes they measure. This page is the map; the game is the territory.</p>
<h2>How verification works</h2>
<p>Because the simulation is deterministic, a leaderboard entry is more than a number: it is the seed plus your inputs. Suspicious entries can be replayed exactly, which makes the classic fake-score attack useless. Fair by construction beats fair by moderation.</p>
<h2>Personal records</h2>
<p>Your own bests — deepest Infinite wave, highest Boss Rush wave, daily streaks and per-mode records — live in the game's Progress Dashboard and persist with your save.</p>`;
}

export function privacyPage(): string {
  return `
<p class="note">Effective date: July 10, 2026. This policy covers assimilationtowerdefense.com and the ASSIMILATE web game.</p>
<h2>The short version</h2>
<p>Your game save lives on your device. We don't sell data, we don't require accounts, and the game contains no third-party trackers. The website may show clearly-labelled advertisements; if and when it does, the ad provider's cookie usage is disclosed here and governed by the <a href="/cookies/">Cookie Policy</a>.</p>
<h2>Data stored on your device</h2>
<p>The game stores your save (progression, settings, records) in your browser's local storage. It never leaves your device unless you explicitly use cloud backup or share a replay. Clearing site data deletes it — use the in-game export first.</p>
<h2>Optional cloud backup</h2>
<p>If you create a named account for cloud backup, we store: your chosen name, a credential hash, and your save blob, solely to provide sync. We do not use it for anything else and you can delete it in-game at any time.</p>
<h2>Replays and leaderboards</h2>
<p>Submitting a daily score or sharing a replay uploads that run's seed and inputs plus your chosen display name. Replays contain no personal data beyond the name you picked.</p>
<h2>Analytics</h2>
<p>We use Cloudflare's privacy-preserving, cookie-free analytics to count page views and measure performance. It does not profile you across sites.</p>
<h2>Advertising</h2>
<p>Website pages (never gameplay) may carry advertisements from Google AdSense or similar providers. Ad providers may use cookies to serve non-personalized or personalized ads depending on your region and consent; see the <a href="/cookies/">Cookie Policy</a> for controls. Ads are always visually labelled and separated from content.</p>
<h2>Children</h2>
<p>The site and game are suitable for a general audience and do not knowingly collect personal information from children.</p>
<h2>Your rights</h2>
<p>You can export or delete your local save in-game, delete any cloud account in-game, and contact <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> for any privacy request. We answer within 30 days.</p>
<h2>Changes</h2>
<p>Material changes to this policy are announced on the <a href="/news/">News page</a> and the effective date above is updated.</p>`;
}

export function termsPage(): string {
  return `
<p class="note">Effective date: July 10, 2026.</p>
<h2>The service</h2>
<p>ASSIMILATE is a free browser game provided as-is. We work hard to keep it available and your progress safe, but we cannot guarantee uninterrupted service or that updates will never affect balance, content or saved data. The in-game export tool is your friend.</p>
<h2>Acceptable use</h2>
<p>Don't attack the service, scrape it abusively, submit falsified leaderboard entries, or attempt to disrupt other players' experience. Leaderboard entries may be verified by deterministic replay and removed if falsified.</p>
<h2>Purchases</h2>
<p>Optional purchases (cosmetics and convenience) are processed by third-party payment providers; we never see your card details. Purchases attach to your save/account. Consumed digital goods are generally non-refundable except where law requires otherwise — contact us and we'll be reasonable.</p>
<h2>Your content</h2>
<p>Replay codes, display names and shared runs you publish may be visible to other players. Don't use a display name you wouldn't show a stranger.</p>
<h2>Intellectual property</h2>
<p>The game, site, art, music and written content are © ASSIMILATE. You may capture, stream and publish gameplay freely (monetized included). You may not redistribute the game itself or use our assets to build a competing product.</p>
<h2>Liability</h2>
<p>To the maximum extent permitted by law, the service is provided without warranties, and our liability is limited to the amount you paid us in the past twelve months.</p>
<h2>Governing law</h2>
<p>These terms are governed by the laws of the United States and of the operator's state of residence, without regard to conflict-of-law rules. Disputes will be resolved in the courts of that jurisdiction, except where the consumer-protection law of your country of residence grants you mandatory rights or venue — nothing in these terms limits rights that cannot be waived.</p>
<h2>Contact</h2>
<p>Questions about these terms: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`;
}

export function cookiesPage(): string {
  return `
<p class="note">Effective date: July 10, 2026.</p>
<h2>What we use</h2>
<p><b>Strictly necessary storage.</b> The game uses your browser's local storage for your save and settings. This is not a tracking cookie — it never leaves your device and is required for the game to function.</p>
<p><b>Analytics.</b> Cloudflare Web Analytics is cookie-free and does not track you across sites.</p>
<p><b>Advertising cookies.</b> Only if advertisements are enabled on website pages: the ad provider (e.g. Google AdSense) may set cookies to serve and measure ads. In regions requiring consent, a consent prompt is shown before any advertising cookies are set, and non-personalized ads are served absent consent.</p>
<h2>Your controls</h2>
<p>You can clear local storage from your browser (export your save first!), block third-party cookies entirely, and — where the consent prompt is shown — change your choice at any time from the link in the site footer. Google's ad settings are at <a href="https://adssettings.google.com" rel="noopener nofollow">adssettings.google.com</a>.</p>
<h2>No dark patterns</h2>
<p>Declining advertising cookies never blocks content, gameplay or features. Ads are labelled, separated from content, and never appear inside gameplay.</p>`;
}
