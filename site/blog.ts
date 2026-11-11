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
    slug: 'a-lighter-hub',
    date: '2026-11-11',
    title: 'Playtest fixes: a lighter hub, End Early and quieter notifications',
    category: 'Tech',
    tags: ['hub', 'performance', 'ui', 'infinite'],
    summary: 'A playtest pass. Buy best-upgrade no longer freezes the screen, the hub trades paragraphs for icons and tiles, notifications only point at things you can do, and Infinite gets a Campaign-based wall and an End Early option.',
    body: `
<p>A recent playtest went well, and it turned up a list of things worth fixing straight away. All of them are in this update.</p>
<h2>The quick-buy no longer stalls</h2>
<p>Pressing <b>Buy</b> on the hub's best upgrade used to freeze everything for about half a second. Every panel on the screen was redoing the same Power maths for the new purchase, and some did it more than once. Each answer is now worked out once and shared. A purchase does about five times less work, and the screen responds to your click first while the advice panels catch up a moment later.</p>
<h2>Unlock cards you can read at a glance</h2>
<p>When you reach a new system, its card is now a big icon, a name and one line about what it does, with buttons to go there or carry on. The full explanation is still there under <b>Details</b>, and in Help, for anyone who wants it.</p>
<h2>A hub that looks like a game</h2>
<p>The things you can do right now are big icon tiles instead of sentences: each one shows the screen's icon, how many things are waiting there and what pressing it does (claim, upgrade, open). Your headline stats carry icons, Growth shows each system's Power gain as <b>+N ⚡</b>, and the update briefing shows the three biggest changes as tiles with a link to the full notes. The longer explanations haven't gone anywhere. Hover a tile or row, or read it with a screen reader, to see them.</p>
<h2>Notifications you can act on</h2>
<p>A badge now means there is something you can actually do. Tower Stars past your Evolution Cap no longer light up the Tower Lab however many Strain Samples you hold, Antigen only badges when there is a rung you can buy, and the hub stopped showing "almost unlocked" tiles for systems you can't reach yet. The Best Move button follows the same rule: it skips upgrades you can afford but can't take yet. If that's all you have, it greys out and tells you what's in the way.</p>
<h2>End Early in Infinite</h2>
<p>A deep Infinite run used to end only when your Core fell. Now you can pause and choose <b>End Early</b> to bank the run right away at <b>60%</b> of its Genome Cores, mastery and XP. Depth records, contracts and any containers you already filled pay in full. Infinite also fills Bio-Containers at a fifth of its old pace, so a long farm no longer outpaces every other way of earning them.</p>
<h2>Infinite has a wall</h2>
<p>Infinite used to scale the same way for everyone, so an account that geared far past its Campaign stage could ride it almost forever. Now every account has a <b>wall</b> at depth 4 plus its highest cleared Campaign stage. Past it, enemy health doubles every depth. Strong gear still buys you a few depths beyond it, and every Campaign stage you clear pushes it one deeper. In our test runs, a Stage 12 account geared far past its stage now falls around depth 20 with a few containers to show for it, where before it was still standing at depth 56 after an hour and a half. The Infinite screen marks your wall on its forecast, and a record you set before the wall never stops a run from qualifying for rewards.</p>
<h2>Small things</h2>
<p>The post-run summary's Continue button stays in one place while your rewards reveal. And at the start of each wave, Hive Intelligence now sits on the build console with Auto Wave and Auto Gene instead of on the edge of the battlefield.</p>
`,
  },
  {
    slug: 'hive-calls-the-wave',
    date: '2026-11-11',
    title: 'The Hive calls the wave',
    category: 'Systems',
    tags: ['hive intelligence', 'automation', 'design'],
    summary: 'On content you have already beaten, Hive Intelligence now calls the next wave early when it forecasts your board will hold, and Auto Gene picks your recommended card after three seconds.',
    body: `
<p>Farming a stage you have mastered should feel fast. Two changes make the Hive a better co-pilot there.</p>
<h2>Early calls, when it is safe</h2>
<p>Turn on <b>Hive Intelligence</b> or <b>Auto Wave</b> and the Hive watches every fight. It measures how far down the field enemies get before your towers kill them, counting only the distance past where your towers first reach them. Then it asks one question: if the next wave landed on top of this one, would your board still kill everything with room to spare? When the answer is a clear yes, it calls the next wave early and banks the Early Call Biomass for you. A callout and the Hive Intelligence ticker tell you the wave it called, what it earned and how comfortable the forecast was.</p>
<p>It is deliberately careful. It never calls into or over a boss wave, never once your Core has taken damage that wave, never on a wounded Core, and only once before the field clears. We tuned it by forcing hundreds of calls in simulation and checking what really happened against the forecast. The threshold sits where calls stopped costing the Core at all. In our test runs, boards that let the Hive call early lost less often than the same boards without it.</p>
<h2>Faster drafts</h2>
<p><b>Auto Gene</b> now takes the recommended card after three seconds instead of ten. Any pick you make yourself still wins.</p>
<h2>Where it works</h2>
<p>Like the rest of Hive Intelligence, both work in Campaign and Infinite once you have cleared Campaign Stage 5. In the Daily and in Boss Rush record runs, the calls stay yours.</p>
`,
  },
  {
    slug: 'market-constructs',
    date: '2026-11-06',
    title: 'Meet the Constructs: AI players who grind, and trade with you',
    category: 'Systems',
    tags: ['auction house', 'economy', 'design'],
    summary: 'Eight AI players now play ASSIMILATION around the clock and trade on the Auction House, always clearly marked as Constructs. They keep the board stocked and give fair listings a buyer. They never set prices, trade with each other or rank.',
    body: `
<p>A market is only as good as the people on the other side of it. To make sure there is always someone there, eight <b>Constructs</b> now live in ASSIMILATION: AI players run by the game itself.</p>
<h2>They really play</h2>
<p>Each Construct is an account like yours, with its own save. It plays the campaign around the clock at a human pace, with no fast-forward, through the same progression code you do: it earns cores and drops, opens its containers, upgrades its towers and pushes stages. Each has its own play style. Some push the campaign, some farm Infinite for gear, one chases completion.</p>
<h2>They trade fairly</h2>
<p>What a Construct earns, it may sell on the Auction House at the market price, never dumped. It also shops <i>your</i> listings, buying only at or below an item's value. Constructs use the exact same market as you, with the same fees, taxes, limits and account-age rule, and get no special prices. They never trade with each other, so they can't fake volume, and they never buy the market's baseline stock.</p>
<h2>Always labelled</h2>
<p>Every listing, bid and trade by a Construct carries a <b>⚙ Construct</b> mark, and you can hover it for the Construct's name. You will always know who you are trading with. Help → <b>Constructs</b> explains them in full.</p>
<h2>Never on a leaderboard</h2>
<p>Constructs play nonstop, so they would top every board within days. They are kept off the leaderboards and the Arena ladder entirely, and those boards stay yours.</p>
<h2>Also fixed</h2>
<p>While building this we found a bug that stopped synced accounts from listing on the Auction House. The server misread your campaign stage, so everyone looked like a brand-new account. That's fixed: once the Auction House is open for you, the Sell tab works.</p>
`,
  },
  {
    slug: 'let-the-hive-take-over', date: '2026-11-09', title: 'Let the hive take over',
    category: 'Release', tags: ['gameplay', 'heroes', 'quality of life'],
    summary: 'After Campaign Stage 5, Hive Intelligence can handle repetitive setup, waves, gene picks and hero abilities while you watch or take over.',
    body: `<p>Easy waves should not mean placing the same organisms over and over. Hive Intelligence is now an optional continuous assistant.</p>
<h2>Unlock it after Campaign Stage 5</h2><p>Complete Stage 5 on any difficulty, then turn on <b>HIVE INTELLIGENCE</b> in Campaign or Infinite. It works on new campaign stages as well as replays.</p>
<h2>What the hive handles</h2><ul><li>Deploying towers, buying mutations and hero upgrades, and merging conveyor organisms.</li><li>Starting waves after the setup countdown and picking the recommended gene after a visible countdown.</li><li>Directing the lead hero toward threats and using their ability when ready.</li></ul>
<h2>You stay in control</h2><p>Switch it off whenever you want, including during a gene draft. Pick a gene yourself to override the recommendation. Pause suspends automation, and the toggle starts off each run.</p><p>This is a simple helper, not a guaranteed win. Daily, Boss Rush, Quick Skirmish, tutorials and uncleared Threat levels remain manual. The hive does not spend permanent or premium currencies, sell your towers, or launch another run.</p>`,
  },
  {
    slug: 'class-bonds',
    date: '2026-11-06',
    title: 'Class Bonds: build around a class, and make it stronger',
    category: 'Systems',
    tags: ['towers', 'heroes', 'design', 'progression'],
    summary: 'Every tower and hero already belonged to one of six classes. Now fielding enough of one class wakes its bond, a set bonus that lasts as long as they stay deployed, and you can level each bond up between runs.',
    body: `
<p>Every tower and hero in ASSIMILATION has always had a class: Kinetic, Caustic, Viral, Neural, Vital or Resonant. Until now that was mostly colour. Now it's a decision.</p>
<h2>How a bond wakes</h2>
<p>Field <b>2</b> units of one class in a run and its bond wakes at tier I. Field <b>4</b> for tier II and <b>6</b> for tier III. Every tower on the board counts once, so two of the same tower count twice, and every hero you field counts too. The bond lasts as long as those units stay deployed. Sell one and a tier can drop.</p>
<h2>Six bonds, six jobs</h2>
<ul>
<li><b>Impact</b> (Kinetic): Kinetic units hit harder.</li>
<li><b>Dissolution</b> (Caustic): Caustic units hit harder and fire faster.</li>
<li><b>Contagion</b> (Viral): Viral towers fire much faster, so infections spread sooner.</li>
<li><b>Lattice</b> (Neural): Neural towers fire faster and hit harder.</li>
<li><b>Sustain</b> (Vital): your Hive Core mends at every wave clear, and Vital units hit harder.</li>
<li><b>Chorus</b> (Resonant): <i>every</i> tower fires faster, and Resonant units hit harder.</li>
</ul>
<p>Committing to one class pays off, but six of one class leaves gaps a mixed board would cover. That trade-off is the point.</p>
<h2>Make your bonds stronger</h2>
<p>The new <b>Class Bonds</b> screen in the Evolution Hub lists every class, its members and its three tiers. Spend Genome Cores to level a bond up: each level strengthens all three of its tiers in every run, up to ×1.8 at level 10, and raises your Power.</p>
<h2>Learning it</h2>
<p>Bonds open after Campaign Stage 13, once you've fielded every class a few times. A card introduces them, and a short guided tour walks you through the screen and your first level-up. The first time a bond wakes in a fight, a field note points to it. From then on, the Run Build panel shows every class you've fielded and how close the next tier is, and conveyor pods carry their class mark so you can plan as they arrive.</p>
`,
  },
  {
    slug: 'first-steps-walked',
    date: '2026-11-06',
    title: 'Your first steps, walked with you',
    category: 'Systems',
    tags: ['onboarding', 'design', 'ui', 'performance'],
    summary: 'Coming back to base after your first fights used to mean a screen full of panels, cards and pop-ups. Now the game walks you through it one button at a time: you open the menus, buy your first upgrade and crack your first container yourself. Plus Early Call drafts that arrive on time, a fix for Best Move, and a lighter battlefield.',
    body: `
<p>A player told us the truth after their first session: the fight was fine, but coming back to base was a lot on the screen at once. The tutorial taught combat well. Nothing taught the loop around it. Here is what changed.</p>
<h2>First steps, hands-on</h2>
<p>After the tutorial, your first three visits to the Command Center are guided, and you do every step yourself. Each step lights up the real button and waits for you to press it:</p>
<ul>
<li><b>Before your first run:</b> where your next fight is, and how to deploy.</li>
<li><b>After run 1:</b> open the Evolution Hub, open the Tower Lab, buy your first star, watch your Power rise, head home, read what to do next, and deploy into Stage 2.</li>
<li><b>After run 2:</b> open the Rewards Hub, crack your first Bio-Container, meet Best Move, and open your Daily Bio-Cache.</li>
</ul>
<p>On a phone it opens the ☰ menu with you, and if you wander off it offers to take you back. You can skip it at any step.</p>
<h2>A calmer board while you learn</h2>
<p>While the guide is running, the Command Center only shows what it has introduced so far. The live-event banner, the side panels and the reward pop-ups wait, and the goal list shows just your two nearest goals. The full board opens up when the guide is done.</p>
<h2>Early Call drafts arrive on time</h2>
<p>Calling waves early used to leave their gene drafts until every called wave was gone, so you could face three or four drafts in a row. Now each called wave's draft arrives the moment that wave's own last enemy falls. You pick, and the fight carries on.</p>
<h2>Best Move respects what you've unlocked</h2>
<p>The Best Move shortcut on the Command Center could spend points in systems you hadn't reached yet. It could even level Adaptations before the Adaptation Chamber opened. It now only suggests upgrades on screens you've unlocked, and points you earn early wait safely until their screen opens.</p>
<h2>A lighter battlefield</h2>
<p>We profiled busy fights and rapid clicking on a deliberately slowed-down machine. On that machine the game loop now does 8–14% less work per frame, creates about a third less memory garbage, and handles tower clicks more cheaply. The battlefield looks exactly the same: we compared every draw call before and after.</p>
`,
  },
  {
    slug: 'a-lighter-first-download',
    date: '2026-11-05',
    title: 'A lighter first download: the game starts sooner',
    category: 'Tech',
    tags: ['performance', 'mobile', 'tech'],
    summary: 'Before you could see the first screen, the game used to download about 667 KB of compressed code and styling. It’s now about 549 KB, roughly a sixth less, so the game starts sooner, most noticeably on a phone connection. Nothing looks or plays differently.',
    body: `
<p>Opening ASSIMILATION means your browser downloads the game’s code and its styling before anything appears. We measured exactly what that first download contained, and a lot of it was for screens you don’t see until later. Here is what changed.</p>
<h2>Each screen brings its own pieces</h2>
<p>The game is split into parts, and most screens already loaded their code only when you opened them. Their <b>styling</b> didn’t: one large stylesheet covering every screen had to arrive before the first frame. Now every screen carries its own styling and fetches it the moment you open it, and the first download keeps only what the opening screens need. The stylesheet you wait for went from 115 KB to 52 KB.</p>
<h2>Text that waits for its moment</h2>
<p>The full Help entries for every system and the complete patch-note history were part of the first download, though they only appear when you open Help, a “new system” card or the update briefing. They now load when one of those opens. The Premium Store and The Front also stopped riding along with the home screen. The code you wait for went from 552 KB to 497 KB.</p>
<h2>Nothing else changes</h2>
<p>Before shipping, we opened every screen of the game, on desktop and on phone sizes, in the old version and the new one, and compared the final look of every element. They match. While splitting the Help text we also fixed a small bug: the Towers, Heroes and Infinite entries in Help were missing their links to related topics.</p>
<p>Both numbers are now checked on every build, so the first download can’t quietly grow back.</p>
`,
  },
  {
    slug: 'playing-in-your-phones-browser',
    date: '2026-11-05',
    title: 'Playing in your phone’s browser, without the address bar in the way',
    category: 'Tech',
    tags: ['mobile', 'ui', 'design'],
    summary: 'In a phone’s web browser the address bar takes part of the screen, and parts of the game ran underneath it. The game now fits what is actually visible, goes full screen on Android and iPad with one tap, and shows iPhone players how to add it to the Home Screen.',
    body: `
<p>ASSIMILATION was laid out for the whole screen, which is what a store app or an installed web app gets. A phone’s web browser keeps its toolbar on screen, and the game was measuring the screen as if that bar weren’t there. Here is what changed.</p>
<h2>Sized to what you can see</h2>
<p>Every full-screen part of the game now sizes itself to the area the browser actually leaves visible, and it adjusts if the toolbar shows or hides. The bottom of the menus, the Results screen and the dialogs no longer slip under the address bar. Holding your phone upright during a run, the board now keeps its share of the screen: the loot meter folds into a thin strip and the controls tighten so the battlefield stays big.</p>
<h2>Full screen on Android and iPad</h2>
<p>On Android and iPad your first tap takes the game full screen, so the address bar disappears. If you leave full screen, the game respects that; tap <b>⛶</b> in the top bar to go back. You can turn this off in <b>Settings → Full screen in mobile browsers</b>.</p>
<h2>On iPhone: add it to your Home Screen</h2>
<p>Safari on iPhone doesn’t let web pages go full screen, so the game shows a one-time card: tap <b>Share</b>, then <b>Add to Home Screen</b>. The game then opens from its own icon with no address bar, in landscape, like an app. The Home Screen version used to be locked to portrait, where the menus ask you to turn your phone; that’s fixed.</p>
<p>We test the game at the sizes phone browsers really leave visible, on iPhone and Android, upright and sideways, so it stays that way.</p>
`,
  },
  {
    slug: 'the-first-hour-and-a-sound-pass',
    date: '2026-11-05',
    title: 'A calmer first hour, and every sound rebuilt',
    category: 'Systems',
    tags: ['onboarding', 'audio', 'design', 'game-feel'],
    summary: 'Your first run used to end with a list of eleven new systems. Now each run teaches two, fight controls explain themselves the moment they matter, and every new screen comes with a guided tour. Plus a full sound pass: effects that cut through the music, impacts with weight, and separate volume sliders.',
    body: `
<p>We replayed a brand-new account's first hours, run by run, and counted everything the game told the player. The answer was a spike: right after the very first run, eleven new systems were announced at once, in one long list. Here is what changed.</p>
<h2>Two new things per run</h2>
<p>After each run you now learn <b>at most two</b> new systems, each on its own card with what it is, why it matters and where to find it. Anything else waits for the next run. Nothing is hidden in the meantime: everything you've unlocked is already in Help. The first card after your first run is the <b>Tower Lab</b>, the screen your first rewards point to.</p>
<h2>Every new screen gets a tour</h2>
<p>When a new screen opens, its card now carries a short guided tour (<b>Show me</b>). The Tower Lab, the Hero Hall and Infinite used to open with no introduction at all. They now get one, like every screen after them.</p>
<h2>Fight controls explain themselves</h2>
<p>Early Call, game speed, the red defense line and mid-run hero evolution used to be explained in a card after the run, about a fight that was already over. Now each one gets a one-line <b>field note</b> during the fight, pointing at the control, the first time it matters. The fight never pauses, and a tap dismisses it.</p>
<h2>Nothing points at a locked door</h2>
<p>Help no longer lists systems whose screens haven't opened yet. One was visible from the very first minute, twenty-five stages before you could use it.</p>
<h2>A full sound pass</h2>
<p>Every sound in the game is still synthesized, with no audio files, but now every effect's loudness is measured. A tool renders each one and checks it against its category.</p>
<ul>
<li><b>Effects cut through the music.</b> Kills, rewards and the wave horn sat well under the soundtrack. Now combat sits level with the music and rewards rise above it.</li>
<li><b>Impacts have weight.</b> Tower fire, hits, deaths, placing a tower, the wave horn, wave clears, drafts, chests, reveals and level-ups are rebuilt in layers, with the same notes and the same character.</li>
<li><b>No more machine-gun repeats.</b> Frequent sounds vary very slightly every time they play.</li>
<li><b>A room around the big moments.</b> Rewards and story moments have a little space; frequent combat stays dry and crisp.</li>
<li><b>Fixed:</b> some long sounds, including the opening film's rumble, title and dive and the boss stings, used to cut off after half a second.</li>
<li><b>New:</b> separate <b>Effects</b> and <b>Music</b> volume sliders in Settings and the pause menu.</li>
</ul>
`,
  },
  {
    slug: 'the-opening-film',
    date: '2026-11-05',
    title: 'The opening film, rebuilt: the real swarm, the real towers, and a turn',
    category: 'Art & Audio',
    tags: ['visuals', 'audio', 'onboarding', 'design'],
    summary: 'The cinematic that plays on your first boot now tells a story with a turn. It shows the creatures you will fight and the towers you will grow, drawn by the game itself, and ends on a title that assembles in front of the organism you now are.',
    body: `
<p>The opening film is the first thing a new player sees, and it was telling half a story. It showed a signal, a swarm, a takeover and the Hive Core, then cut to the title. It never showed the game: the Hive fighting back. We rebuilt it around that missing scene.</p>
<h2>A story with a turn</h2>
<p>The film now runs in six scenes. The listening post's contact count climbs by orders of magnitude until the whole scope floods red. The crust splits, and the swarm climbs out of the seams: the <b>actual creatures</b> from the game, drawn by the same code that draws them on the battlefield, with a giant rising past the camera. The veins take a steel truss <b>whole</b>, so it sags, shudders and turns green. The Core refuses to be eaten. Then comes the new scene: <b>the Hive answers</b>. Tendrils reach out from the Core, real towers burst out of the ground along the line, and the swarm pours down the lane and dies on it. Every kill streams home as gold biomass, and the Core swells with each one. The last thing down the lane is the apex, and every tower turns on it.</p>
<h2>A title that lands</h2>
<p>The wordmark now assembles letter by letter in front of the organism you have become, with its membranes, its veins and a slow heartbeat. A glint crosses it, and <b>DEFEND · EVOLVE · CONSUME</b> lands one word at a time, each on its own sound. Then the film asks you to descend, and dives you into the first battle.</p>
<h2>Smaller details</h2>
<ul>
<li>On a narrow phone the title used to clip to "ASSIMILAT…". It now sizes itself to the screen.</li>
<li>Every line of copy sits on a soft dark backdrop, so the radar sweep, the swarm and the light never cross the words.</li>
<li>Two new sounds: towers bursting out of the ground, and the swarm breaking on the line.</li>
<li>The film now loads on its own, only when it plays, so the game's first download got smaller even though the film got bigger.</li>
<li>Reduced motion still gets the whole story, as one hand-picked still per scene.</li>
</ul>
<p>Already seen it? Replay it any time from <b>Settings → Help</b>.</p>
`,
  },
  {
    slug: 'a-battlefield-you-can-read',
    date: '2026-11-05',
    title: 'A battlefield you can read: a full visual pass, a Hive that probes your board, and levels that keep coming',
    category: 'Release',
    tags: ['visuals', 'game-feel', 'bosses', 'campaign', 'progression', 'design'],
    summary: 'The biggest visual update ASSIMILATION has had: every tower fires in its damage type, bosses and Megas telegraph their attacks, every biome has its own ground, towers land and evolve with weight, and rarity looks the same everywhere. Plus a Hive that probes your weakest coverage, account levels that keep pace deep into the game, and a big performance fix.',
    body: `
<p>We went through the whole game frame by frame (combat, bosses, the battlefield itself and every menu) and asked one question of each effect: does this help you read the fight? Four passes later, here is what changed.</p>
<h2>See who is hitting what</h2>
<p>Every tower used to fire the same pale-cyan bolt. Now each damage type has its own shot and its own impact: <b>Kinetic</b> darts, <b>Caustic</b> globs, <b>Viral</b> spores, <b>Neural</b> bolts, <b>Vital</b> orbs and <b>Resonant</b> pulses, each in its tower's own colour. A hit lights the enemy in the striker's colour instead of a white blob. Mortar blasts show their true radius, field towers pulse out to their reach, and kills pop harder the more you overkill. When the field is crowded, small damage numbers and repeated reaction callouts fade, so the big hits still read.</p>
<h2>Bosses tell you what they're about to do</h2>
<p>Boss abilities used to fire with no warning. Now every one of them winds up on the battlefield: a ring shows where a heal, a gun-silence or a drag will land, and a closing lock shows when. A boss's core-shot visibly crawls toward your Hive Core, a charge shows the lane it will run, and phase changes burst. Bosses no longer turn into a white disc under heavy fire. Mega cataclysms mark your Core and strike down to it, and weak points flinch and show the damage each volley takes. Hero abilities land with a lock-on and an impact frame, and heroes breathe and recoil when they strike.</p>
<h2>A battlefield of its own</h2>
<p>Every biome now has its own ground and air: frost-cracked slate with drifting snow, lava-seamed basalt with rising embers, moss, mire, chitin plates and more. Obstacles look like rock outcrops instead of grids. Placing a tower lands with a thump, every upgrade and strain molts it more visibly than the last, and a maxed tower raises a column of light. The Hive Core now wears its health as an arc around itself.</p>
<h2>Rarity looks the same everywhere</h2>
<p>Gear, gene cards, containers and cosmetics now share the draft cards' rarity look: a glow, a sweep, a light around the edge, and sparks and a crown for the rarest tiers. The Vault now shows the rarity you actually pulled in its rarity colour (it used the reward type's colour before), exotic is one colour across the game, and a Genome Rank promotion gets a golden ceremony.</p>
<h2>The Hive probes your board</h2>
<p>The Hive now grades every tower you field on reach, area damage, armour pierce, burst and control, and when it adapts it sends the enemy role your board is thinnest against. That might be artillery against a board without burst, sprinters past thin control, or flier packs if you have no area damage. The briefing names it before you launch. In our tests, flawless frontier wins dropped from about 70% to about 63%, without making runs any longer.</p>
<h2>Levels that keep coming</h2>
<p>Past Campaign Stage 30, every run's Account XP is now multiplied by how deep your account has pushed (Results shows it as <b>DEPTH ×N</b>), so deep players level up about once an hour again instead of every few hours. Deep levels pay smaller, more frequent rewards, so the total stays the same. The weekly and monthly XP leaderboards count XP before the multiplier, so they stay a race of time played, not of depth.</p>
<h2>Faster, and fixed along the way</h2>
<ul>
<li>The battlefield floor was being redrawn from scratch every frame. That was the biggest single cost in the renderer, and it's gone.</li>
<li>Hive Intelligence now spends overflowing Biomass on Splice. The draft it opens is still yours to pick.</li>
<li>If you've played for a long time, your first goal estimates after the update show as minimums ("25+ runs") until the game has seen a few of your runs.</li>
<li>A stage you're within reach of now reads as one or two attempts, not "~7 runs".</li>
<li>Back-to-back drafts after an Early Call say how many more are owed.</li>
<li>A boss's ability name now stays on its health bar long enough to read.</li>
</ul>
`,
  },
  {
    slug: 'the-hive-probes',
    date: '2026-11-05',
    title: 'The Hive probes your board, and your picks carry the run',
    category: 'Balance',
    tags: ['balance', 'campaign', 'gene-cards', 'difficulty', 'design'],
    summary: 'Two changes to how the Hive answers a strong board: it no longer counts your drafted gene cards, so a good pick finally decides runs, and part of its answer is now a probe, the enemy role your board covers least.',
    body: `
<p>Earlier today the Hive learned to read your whole board. Two things were still wrong. Too many frontier wins were flawless, and your draft picks barely mattered: in our tests, always taking the strongest card won no more often than always taking the weakest.</p>
<h2>Your picks carry the run</h2>
<p>The Hive was counting your drafted gene cards when it decided how hard to push back. So a great pick made the next waves harder, and a weak pick made them easier, and the two came out level. The Hive no longer counts drafted cards. It still reads your account Power, what you have invested in your board this run (branches, strains, hero evolutions) and how many towers you have fielded. In our tests, a player who always takes the strongest card now wins <b>16 points</b> more often than one who always takes the weakest, up from about zero.</p>
<h2>The Hive probes your weakest coverage</h2>
<p>Instead of only sending more or tougher enemies, part of the Hive's answer is now a <b>probe</b>: it swaps some of a wave's ordinary enemies for the role your board covers least, at the same overall threat. If you have no area damage, that's a pack of fliers. Otherwise it may be artillery that shells you from range or burrowers that surface past your line. It always sends the lightest enemy of that role, so the probe tests your coverage without dragging the wave out, and the wave briefing names it before you launch.</p>
<p>New eight-hour frontier stages are now won about 58% of the time, runs are no longer than before, and losses still come late in a run. Flawless wins barely moved, and a smarter coverage model (range and armour) is next.</p>
`,
  },
  {
    slug: 'frontiers-bite-again',
    date: '2026-11-05',
    title: 'Frontiers bite again: the Hive reads your whole board',
    category: 'Balance',
    tags: ['balance', 'campaign', 'difficulty', 'design'],
    summary: 'The Grind took the luck out of Campaign openings, and with it most of the challenge: new stages were won almost nine times in ten. This update gives the frontier its teeth back without making runs longer, and makes the under-powered warning mean what it says.',
    body: `
<p>Yesterday's update stopped Campaign runs from being decided in the first thirty seconds. It worked: wave-1 losses went to zero. But the opening lottery had been doing most of the work of making stages hard, and without it new stages were won 82–87% of the time, mostly without a scratch. The hive's answer to a strong board was too small, because it only saw your Power. Power can't see a board that has grown from two towers to eighteen.</p>
<h2>The hive reads your board</h2>
<p>From wave 4 (and from Stage 4 on), the hive now counts how many towers you have fielded, along with your Power and this run's genes, and scales its waves to the board in front of it. It also answers differently. Before, it mostly made enemies tougher, which made waves longer. Now most of the answer is <b>speed</b>: faster enemies spend less time in your kill zones, which raises the threat while making the wave shorter. Some of it is denser waves, and only a little is extra health. Speed is capped at the same readability limit Infinite uses, so the field never turns into a blur.</p>
<p>In our test runs, new stages are now won about 73% of the time at eight hours and 59% at a hundred, down from 87% and 82%. Runs are no longer than they were yesterday, losses still come late in a run, and the first three Campaign stages are unchanged.</p>
<h2>"Under-powered" means it</h2>
<p>The stage card used to warn you below 90% of a stage's recommended Power, but players in that range won about two runs in three. The warning, and Home's suggestion to farm Infinite, now appears below 70%. That is where runs are usually lost. Above it, the stage is within reach: push it.</p>
<h2>What's next</h2>
<p>Too many wins are still flawless, and your draft picks still don't decide enough Campaign runs. Next we want the hive to answer with the composition of its waves (which roles and elites it sends) rather than just their numbers, and to stop counting your drafted cards as a reason to push back.</p>
`,
  },
  {
    slug: 'the-grind',
    date: '2026-11-04',
    title: 'The Grind: runs that aren\'t decided in thirty seconds, goals that tell the truth, and chases that keep climbing',
    category: 'Release',
    tags: ['progression', 'balance', 'campaign', 'gene-cards', 'boss-rush', 'mega-bosses', 'design'],
    summary: 'We sent two auditors through hundreds of simulated runs and 400 hours of simulated accounts. This update fixes what they found: a Campaign opening that no longer decides the run, drafts dealt for your build, goals with honest ETAs, gear that keeps improving, Mega raids that pay when you lose, and a Boss Rush with a real wall.',
    body: `
<p>A grind is only fun if every run is a real decision and every hour moves you somewhere you can see. To check whether ASSIMILATION delivers that, we ran two audits. One played about 560 Campaign runs headlessly on accounts at three depths. The other simulated players for 400 hours and watched what happened to their goals, gear and rank. Both found real problems. Here is what changed.</p>
<h2>The opening is no longer a coin flip</h2>
<p>Nine in ten lost runs were lost by wave 3, and the run's seed mostly decided which. Fliers could arrive in wave 1 before you had anything that shoots up, and a Mega could surface on top of a two-tower board. Now fliers stay out of wave 1 and come only in small numbers in wave 2, a Mega arrives with wave 3, and on deeper stages your free first organism is one that answers the stage's opening threats. Wave-1 losses in the audit went from fifteen to zero.</p>
<p>The pressure moved to where it belongs. From wave 4, and on every boss, the hive answers your snowball: waves and bosses grow with how far your board has outgrown the stage, and the briefing tells you by how much (<b>▲ ADAPTED ×N</b>). Losses now happen in the back half of a run, where your choices have had time to matter.</p>
<h2>Call the next wave early</h2>
<p>When your board is holding, press <b>⏩ Call early</b> (or Space) mid-wave to send the next wave in now. You earn Biomass for the time you skipped, waves overlap, and any gene draft you skipped is still dealt when the field clears.</p>
<h2>Drafts dealt for your build</h2>
<p>Gene drafts used to deal from the whole pool, so a third of the offers were for towers doing almost nothing in your run. Now cards for the towers and heroes carrying your damage come up more, recent offers come up less, and <b>◆ PICK</b> marks the best fit for this board, not just the rarest card. It now agrees with the strongest option nine times in ten. Campaign runs from Stage 8 open with an <b>Opening Draft</b>, and when Biomass piles up between waves, <b>Splice</b> spends it on an extra draft. Hive Intelligence also builds your opening towers before it spends on hero stats.</p>
<h2>Goals that tell the truth</h2>
<p>Results used to promise "one more run" for goals that were two days away. Every goal now carries an estimate in runs, measured from your own recent income, and "one more run" means one more run (the estimate now lands within two runs 84% of the time, up from 41%). When a stage outweighs you, Home's main button says <b>Farm Infinite</b> and shows how much each run closes the gap. Achievement ladders keep milestones coming at any depth, the daily Bio-Cache grows with your income, and commons get a Claim all in the Specimen Cabinet. Nothing you earn quietly un-earns itself anymore: Gear Codex entries are permanent, and a Molt never demotes your Genome Rank. After a Molt, one tap rebuilds your Genome by best value.</p>
<h2>Chases that keep climbing</h2>
<p>Gear stopped getting better after about three hours, because item level was capped at 30. Item level now follows how deep you've pushed and keeps climbing, rarity odds rise with it, and the top affix tier appears deep in the Campaign. Mega stages used to stall players for most of a day; they now ask far less extra Power, and every organ you burst counts toward a <b>Mega Hunt</b> rank that pays Genome Cores, even when the raid fails.</p>
<h2>Boss Rush has a wall</h2>
<p>Built accounts could stand in Boss Rush for half an hour without ever being threatened. Now bosses are sized to your Power and grow faster past wave 10, and 28 seconds after a wave's last boss arrives, the next column marches in whether you're ready or not. Runs are a few minutes of dense decisions. Because old records were set when waves waited forever, records restarted with the wall: your old best is kept as a <b>Pre-wall Record</b>, the leaderboard started fresh, and new records pay Ichor again.</p>
<h2>Fixed along the way</h2>
<ul>
<li>A Daily run that used the draft reroll could fail replay verification.</li>
<li>The Mega bar covered the gene draft's header, and the Boss Rush tray clipped its last pod on 1440-wide screens.</li>
<li>Defeats now show your board size against what winning boards field, and when your first flier went down. The mission card shows wave 1.</li>
</ul>
`,
  },
  {
    slug: 'moments-that-land',
    date: '2026-11-04',
    title: 'Moments That Land: the last kill, a victory that takes the board, and films that finally move',
    category: 'Release',
    tags: ['game-feel', 'cutscenes', 'mega-bosses', 'presentation', 'design'],
    summary: 'Four moments we storyboarded in the feel audit are in: the last kill of a wave slows time for a heartbeat, a victory washes the hive across the whole battlefield, the biome now continues past the board edge, and every Mega premiere finally shows its monster.',
    body: `
<p>When we audited how ASSIMILATION feels, four moments kept coming up. Each was a place where something big happened and the game barely noticed. We storyboarded all four, built them, and reviewed every one frame by frame before shipping. Each also has a still version for reduced motion, and a phone version.</p>
<h2>The last kill of a wave</h2>
<p>The final enemy of a wave used to pop like any other, and the wave-clear fanfare played later, when the gene draft opened. Now the last kill <b>lands</b>. Time slows to half speed for a heartbeat, the camera leans toward the kill, and the fanfare plays on the kill itself. When a boss or a Mega falls, the moment runs deeper and longer. The simulation is untouched: we simply play it back more slowly for a moment, so replays and leaderboards don't change. At 5× speed the beat is shorter, and if the wave ends because the last enemy breached, there's no slow-down at all.</p>
<h2>A victory that takes the board</h2>
<p>A win used to freeze the board for three and a half seconds and then float your summary in a black void. Now the hive <b>assimilates the battlefield</b>: the same terraforming you watch grow during a run sweeps outward from the Hive Core to the edges, in the colour of the biome you won in. Results then opens over a blurred, darkened copy of that final frame. Defeats get their own look: the colour drains from the board and cracks spread from where the line broke.</p>
<h2>A battlefield without edges</h2>
<p>On a desktop screen the board used to sit in a frame of flat black. Now the biome <b>continues past the edge</b>, dimmed so it never reads as playable space: the ground, its veins and flora, and, as your run's Assimilation rises, the infestation creeping outward. On a Mega stage, the organism's limbs reach in from beyond the frame. It's painted once and refreshed only when something changes, so it adds no work while you play, and phones skip it entirely.</p>
<h2>Films that move, and premieres that show their monster</h2>
<p>Our cutscenes were nearly still frames. Only a few percent of the pixels changed across a scene, and MERIDIA's own premiere never actually showed MERIDIA. Every scene now has three layers of motion: a slow camera drift, a middle layer that moves on the score's beats, and drifting particles in front. The camera also punches in on the big beats. Every Mega premiere now paints the real Mega with the same painter the raid uses: it rises from silhouette, its weak points ignite one by one, and it falls. Captions sit on the quiet part of each scene instead of on the brightest thing in it.</p>
<h2>Fixed along the way</h2>
<ul>
<li>A boss dying on a slow frame (most often on phones) could end the run with an error. This shipped earlier today as a hotfix.</li>
<li>Rank promotions and other pop-ups could cover a live Arena match. They now wait until the match is over (also in today's hotfix).</li>
<li>The last enemy's death burst froze mid-air while the gene draft opened.</li>
<li>Home's Hive Intel feed and the Vault history could drop or double a row.</li>
</ul>
`,
  },
  {
    slug: 'feel-and-flow',
    date: '2026-11-04',
    title: 'Feel and Flow: boss kills that land, a Back button that works, and three new answers',
    category: 'Release',
    tags: ['game-feel', 'navigation', 'towers', 'heroes', 'enemies', 'economy'],
    summary: 'The second update of the day is about how ASSIMILATION feels in the hand: boss kills with weight, centre-screen moments that take turns, a Back button that walks the game, one Claim all, three new towers, a new hero, six puzzle enemies, an honest look at the economy and a Molt that no longer wipes everything.',
    body: `
<p>The First Hour update was about taking things away. This one is about the moments that remain: what a boss kill feels like, what happens when you press Back, how many taps it takes to get where the game is pointing you. We recorded the battlefield frame by frame, walked every menu with a script that counts clicks, and fixed what we found.</p>
<h2>Boss kills land</h2>
<p>A boss death used to borrow the Hive's breach alarm and pop like any other enemy. Now it lands: a short freeze-frame, a gold shockwave at the body, its own sound and a fall card that brings its title back. A Mega's collapse is the biggest card of all, and it clears everything beneath it.</p>
<p>All of these centre-screen moments (WAVE N, boss and Mega arrivals, weak-point callouts, the assimilation tier) now share one stage and take turns by priority, so they never print on top of each other. Damage numbers are bolder and readable over anything. Picking a gene card has a real moment: the chosen card flares in its rarity colour and the others dissolve.</p>
<p>New <b>Motion settings</b> let you set screen shake, damage numbers and flashes, and they follow your device's reduced-motion setting. With motion off you get the same information, held still.</p>
<h2>A game you can walk back through</h2>
<ul>
<li><b>Back</b> (browser or Android) steps back through menus, closes the top pop-up first, and pauses a live run instead of quitting it. <b>Escape</b> does the same on desktop.</li>
<li>Advice that names a screen, like "Farm Infinite", now carries a <b>Go ▸</b> that takes you there in one tap.</li>
<li>Hub badges count the screens that need a decision instead of piling up to "9+", and the Continue Campaign button is always on screen.</li>
<li>Screens open without a loading flash, and if one ever fails to load you can retry it instead of losing the game.</li>
<li>Every screen has one name everywhere (the Specimen Vault is now the Specimen Cabinet), long screens get jump chips and folding sections, and a loadout strip sits beside every launch button.</li>
</ul>
<h2>After the run</h2>
<p>Win a Campaign stage and Results offers the next one directly. Claiming is one <b>Claim all</b> on the Quest Board, Season Pass and Milestones, and the Season Pass now clears even a hundred-level backlog in one press. On a phone held upright, Results and the Boss Rush roulette now show up instead of a "turn your device" prompt.</p>
<h2>Three new answers, six new questions</h2>
<p>The roster grows by three towers, each built as the answer to a problem: the <b>Gristle Warren</b> raises thralls that body-block the lane, the <b>Tick Battery</b> seeds Infection into three hosts from long range, and the <b>Keening Quill</b> cracks armour for your whole board. The <b>Myceliarch</b>, a fungal gatekeeper who rots every leak at the Core, joins the heroes at 8,000 lifetime kills.</p>
<p>The questions arrive from Stage 4: the plated <b>Chitin Scuttler</b>, the airborne <b>Blight Moth</b>, the burrowing <b>Marrow Borer</b>, the shielded <b>Shellback Bombard</b>, the <b>Veil Moth</b> that shields its flock, and the <b>Wisp Mother</b> that births fliers. Each one asks for a specific answer, and the first three stages are unchanged.</p>
<h2>An honest look at the economy</h2>
<p>Our balance simulator plays eleven kinds of player for 400 hours each. In July it raised seventeen warnings. Most of them turned out to be the simulator misreading its own data, mainly the Power drop after every Molt. With those fixed, three remain, and two real problems are now solved. Every Gene Card level visibly raises your Power, even small economy upgrades. And deep into the game, Strain Samples a tower can never spend turn into Gene Essence instead of piling up.</p>
<p>The simulator also showed us the one thing that did hurt: the <b>Molt</b>. Every Molt bought your whole Genome engine back from zero, and the deeper you went the harder that landed. By a few hundred hours a Molt dropped your Power thirty-fold, and you spent most of each cycle unable to play your own frontier. Now a Molt leaves an <b>Imprint</b>. From your second Molt on, every Genome upgrade keeps a growing share of its levels (1.25% more per Molt, up to 70%). Those are the cheap bottom rungs of each ladder, so the climb back still costs. Power now dips about threefold instead of crashing, and a late Molt costs roughly half the hours to recover. The first Molt works exactly as before, and the Molt Chamber now shows what you keep and your Power after the Molt before you confirm.</p>
<h2>Fixes worth naming</h2>
<ul>
<li>Watching a replay no longer adds its kills to your own Bestiary, Mega records or nemesis revenge.</li>
<li>Replay links recorded before an update play again, and the replay theater shows boss falls.</li>
<li>A Mitotic Horror falls once; its split pieces no longer each announce a kill.</li>
<li>The Bio-Dex counts only real Brood Tyrants.</li>
<li>Upgrades that promise an effect "around the victim" (Acid Lancet, Basilisk, Chrysalis, Siphon, Coil, Spire and Spitfang upgrades) now land on the struck enemy. They used to fire around the tower.</li>
<li>Miasma Lung's infection-spread upgrades work: an infection now spreads by the reach of the tower that laid it.</li>
<li>When the next stage offers a boon, "Stage N+1 ▸" on Results lets you pick it instead of taking the default.</li>
</ul>
<p>Next up are four signature moments: the last kill of a wave, victory carrying into Results, cutscenes that move, and a battlefield that continues past its edges. Each one ships only after we've reviewed it frame by frame.</p>
`,
  },
  {
    slug: 'the-first-hour',
    date: '2026-11-04',
    title: 'The First Hour: fewer popups, more battlefields, and a game that tells you the truth',
    category: 'Release',
    tags: ['onboarding', 'battlefields', 'gene-cards', 'threat', 'mobile', 'design'],
    summary: 'We played ASSIMILATION as a brand-new player and did not like everything we saw: eleven popups after the first run, every system unlocked inside an hour, one map, and a difficulty curve that went easy, easy, wall. This update fixes all of it — and adds thirteen battlefields, Rule Genes, the Threat ladder and real phone layouts on the way.',
    body: `
<p>Every so often we wipe a profile and play ASSIMILATION the way a new player meets it: from the opening cinematic to the first loss. The last time we did, the game was deep and handsome and, in its first hour, exhausting. The first clear of Stage 1 ended in eleven "new system unlocked" cards, nine toasts underneath them, and an "Under-Powered" warning on the very next stage — right after a flawless win. Every one of thirty-four systems had revealed itself within about an hour. And all of it played out on one map.</p>
<p>This update is the answer. It is the largest change to the early game since launch, and most of it is about taking things away.</p>
<h2>One reward, one summary, no lies</h2>
<p>The tutorial now teaches the actual loop over two waves — wave, draft, build, wave — with callouts that measure the board and never sit on the lane, a draft card or your hero's ability. It ends with <b>one</b> graduation reward instead of two identical ones. After a run, three or more announcements fold into a single summary card; achievement toasts wait until it closes and collapse into one. Advice never points at a screen you can't open yet, and the readiness warning has a tolerance — 1,027 Power against a recommended 1,050 is a push, not an alarm. Lose a run and Results now tells you how close you were, what got through, and one thing to try.</p>
<p>We measure this now. A scripted first session runs against fixed budgets on every build: it counts the popups after the first run (10 before this update, 1 after), the time to your first tower (about 8 seconds once the cinematic is skipped), and the JavaScript a new player downloads before the game starts (down from 820 KB to about 518 KB, because hub screens now load on demand).</p>
<h2>The hive opens up over hours, not minutes</h2>
<p>New systems now reveal across your first ten-ish hours — Infinite after Stage 3, the Daily after Stage 5, Boss Rush after Stage 12, and the rest a wing or two at a time. Five side screens became tabs inside their hosts, the top bar shows a handful of currencies instead of ten, routine rewards claim themselves into the results of the run that earned them, and menu badges only appear where there is a decision to make. If you already had a screen, you keep it.</p>
<h2>Thirteen battlefields</h2>
<p>The arena used to be one map. It is now a registry of battlefields — twin lanes, an open maw, a maze-like coil, broken walls, flank funnels, a central breach — each one a row of data that a validator proves fair before it ships (every cell reaches the line, nothing blocks a build slot). The first three campaign stages use fixed maps chosen to teach; deeper stages roll a battlefield that suits their biome; the Daily rolls one for the world; Infinite shifts map with every biome. Walls are solid now, too: nothing gets shoved through rock.</p>
<p>While we were in there, we fixed the curve. Stages 1 and 2 were trivially easy and Stage 3 was a wall; a gentler grace window, scaled-down first bosses, and invasions limited to each stage's own enemies now make the first three stages rise steadily.</p>
<h2>Rule Genes, Hive Intelligence and the Threat ladder</h2>
<p>Most gene cards bend numbers. Twenty-five new <b>Rule Genes</b> bend rules — shred builds, spreading infections, conveyor economies, placement tricks, hero stances, and deliberate risk-for-reward bargains — and once you have earned one, every draft guarantees a rule-changing option. <b>Hive Intelligence</b>, the one-button Biomass planner, now works only on content you have already beaten: it is the reward for mastery, not a replacement for it. And every mode you have cleared opens the <b>Threat ladder</b> — ten named rungs of difficulty that pay titles, profile frames and a little more reward, and never Power.</p>
<h2>A board-first screen, on every screen</h2>
<p>The run layout was rebuilt around the largest board the window allows — a third bigger at 1440×900 — with speed, Hive Intelligence and Pause sharing one strip so nothing overlaps the Start Wave button again. Phones get real portrait and landscape layouts with drawers and thumb-sized targets, and a phone held upright no longer asks you to rotate during a run. And yes, the hero health bar that briefly read 359/248 is fixed.</p>
<h2>A note on the store</h2>
<p>In Belgium and the Netherlands, loot-box law treats a randomized reward bought with money — or with a currency bought with money — as gambling. Rather than argue the edge cases, we took the strict reading: in those countries we don't sell anything that can end in a random reward. The whole game, containers included, stays earnable in play. Everywhere else, container drop rates are shown in the Vault.</p>
<h2>What's next</h2>
<p>More battlefields and Threat rungs are now data rows, so expect them often. New tower strains and heroes are next on the roadmap, and the first-session probe means every future update gets measured against a new player's first hour before it ships. Patch notes for this update are on the <a href="/news/">News page</a>.</p>`,
  },
  {
    slug: 'every-cast-a-set-piece',
    date: '2026-07-14',
    title: 'Every cast is a set piece: hero ability cinematics',
    category: 'Art & Audio',
    tags: ['heroes', 'vfx', 'rendering', 'design', 'cinematics'],
    summary: 'All thirty hero abilities now stage a procedural performance when they fire — the Cinderwyrm\'s breath is a dragon sweeping the lane — and the damage lands the exact moment the performance strikes. Here is how we made abilities feel cinematic without a single sprite, and why the delay is honest gameplay.',
    body: `
<p>Until this week, casting a hero ability in ASSIMILATION looked like a particle burst. A good burst — tinted per ability, shaped per class — but a burst: the damage happened the instant you clicked, and the screen punctuated it after the fact.</p>
<p>Now the Cinderwyrm folds out of the sky. A winged serpent enters from beyond the arena edge, banks low across your target zone trailing embers, and the pyroclastic blast lands <i>under its wings</i> — then it keeps flying, out past the spawn line, while the firestorm it left keeps burning. Every one of the roster's thirty abilities got this treatment: the Fovea's stare is an eye that opens and lances, the Knell's peal is a bell descending to its slam, the Carrion's feast is a spiral of flies collapsing onto the pack.</p>
<h2>The delay is a promise</h2>
<p>The interesting design decision wasn't visual — it was temporal. A performance takes time; if the damage still landed on the click, the dragon would arrive at a battlefield of corpses. So the zone payload of every ability — the damage, the stagger, the pools — now lands when the performance strikes, a beat (0.3–0.55s) after the cast. Two rules keep that honest. First, <b>support never lags</b>: heals, shields, rally buffs and summons still land the instant you cast, because waiting on a heal feels broken. Second, <b>the telegraph is real</b>: the strike hits whatever stands in the ring when it lands, not a snapshot from cast time. Fast enemies can genuinely slip a slow strike. That's not a nerf — that's the zone mattering.</p>
<h2>Puppets, not sprites</h2>
<p>There is no video and no sprite sheet behind any of this. Each hero has a procedural puppet — the dragon is seven undulating segments, two flapping wing membranes and an ember wake, drawn in code every frame — riding a shared trajectory vocabulary (swoop, dive, lob, converge, beam, blink…). A new hero picks a puppet and a path in one line of data. The whole system respects the game's calm-render covenant: no screen shake, no full-field flashes, and if you play with reduced motion enabled, the theater steps aside entirely while the landing burst still marks every impact.</p>
<h2>Determinism survives</h2>
<p>ASSIMILATION's simulation stays a pure function of seed and inputs — replays and daily leaderboards depend on it. The performances run on the simulation clock (pause freezes a dragon mid-bank; game speed keeps the landing synced), critical hits are still rolled at cast time, and a run that never casts an ability simulates byte-for-byte identically to the old engine. The set pieces are honest theater on top of honest math.</p>`,
  },
  {
    slug: 'the-weekly-game',
    date: '2026-07-11',
    title: 'The Weekly Game: contracts, quests and a hive that keeps a calendar',
    category: 'Systems',
    tags: ['liveops', 'contracts', 'quests', 'progression', 'design'],
    summary: 'The last month rebuilt what a week of ASSIMILATION feels like: a worldwide contract board with near-miss feedback, a lossless quest ring, weekly directives, and two account-wide meters that recognize all of it — with a hard rule that none of it may become a chore.',
    body: `
<p>A single run of ASSIMILATION has always known what it is. The question this batch of updates answered is different: what is a <i>week</i> of ASSIMILATION?</p>
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
<p>ASSIMILATION has always been about growth, but until recently the ground you fought on stayed politely inert. That changed with the Living Battlefield: a terrain layer that assimilates alongside your run.</p>
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
    title: 'Why ASSIMILATION is deterministic (and why you should care)',
    category: 'Tech',
    tags: ['engineering', 'replays', 'fairness'],
    summary: 'Same seed, same inputs, same run — byte for byte. The engineering constraint that gives us shareable replays, fair daily leaderboards, and a test suite that catches balance drift.',
    body: `
<p>Every run of ASSIMILATION is a pure function of its seed and your inputs. Play the same run twice and the simulation produces byte-identical results.</p>
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
