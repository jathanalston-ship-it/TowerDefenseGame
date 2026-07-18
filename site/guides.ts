// GUIDES (docs/WEBSITE.md §content) — original written strategy content for every major system.
// Each guide is data: the generator renders it into /guides/<slug>/ with an article layout,
// breadcrumb JSON-LD and the in-article ad seam. Guides that benefit from live game data
// (towers/heroes) splice in the encyclopedia tables, so they expand with the roster for free.

export interface GuideSection { h: string; body: string[] /* paragraphs (may contain safe inline HTML) */; dataTable?: 'towers' | 'heroes' }
export interface Guide {
  slug: string;
  title: string;
  category: 'Getting Started' | 'Combat' | 'Progression' | 'Modes';
  summary: string;
  sections: GuideSection[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'beginner', title: 'Beginner Guide — Your First Runs', category: 'Getting Started',
    summary: 'Everything a new Hive Core needs: the loop, your first towers, and the five mistakes that end early runs.',
    sections: [
      { h: 'The loop in one paragraph', body: [
        'ASSIMILATION is a tower defense where you ARE the thing growing. Enemies march from the breeding membrane at the top of the arena toward your Hive Core at the bottom. Kills drop <b>Biomass</b> — this run’s fuel — which you spend on towers, upgrades and heroes. Between waves you draft <b>Gene Cards</b> that bend the run’s rules. If the Core’s integrity reaches zero, the run ends; everything you learned, unlocked and mastered persists into the next one.',
      ] },
      { h: 'Your first three towers', body: [
        'Open with a <b>Needle Spitter</b> near the center of the line — long range, cheap, reliable single-target damage. Add a second tower one wave later: splash for swarms or a support organ to feed the line. The most common beginner mistake is saving Biomass "for later" — an unspent bank kills nothing. Spend early, spend central.',
        'Place towers where their range circles overlap the approach lanes, not at the map edge. A tower that fires for eight seconds per wave is worth two that fire for three.',
      ] },
      { h: 'Waves, drafting and your hero', body: [
        'Every few waves the run offers a Gene Card draft: a temporary boost for THIS run whose card also joins your permanent Gene Archive for leveling. Never skip a draft. Your hero fights on their own, but their Active Ability is yours — save it for the moment a wave slips past the towers, not the moment it spawns.',
      ] },
      { h: 'The five run-enders', body: [
        '<b>1. Hoarding Biomass.</b> Towers you didn’t build deal no damage. <b>2. Ignoring fliers.</b> Check the wave preview; airborne strains ignore ground obstacles. <b>3. One damage type.</b> Armored waves shrug off chip damage — layer classes. <b>4. Wasting the hero ability.</b> It is your emergency brake. <b>5. Quitting after a loss.</b> Every run pays permanent progression — a lost run is still fuel.',
      ] },
    ],
  },
  {
    slug: 'towers', title: 'Tower Guide — The Full Roster', category: 'Combat',
    summary: 'Every tower in the game with live stats, plus how stars, branches, strains and mastery mutate them.',
    sections: [
      { h: 'The roster', body: [
        'Every tower is an organism with a combat class, a firing pattern and a role on the line. This table is generated from the live game data, so it is always current with the shipped build:',
      ], dataTable: 'towers' },
      { h: 'Four evolution layers', body: [
        'A tower kind grows along four independent axes. <b>Stars</b> (permanent, bought with Tower Shards in the Lab) climb an authored ★-path of stat and behavior upgrades. <b>Branches</b> (in-run, per instance) lock a tower into one of two mutually exclusive mutations that re-author how it fires. <b>Strain</b> (in-run) is the evolution layer fed by consuming duplicate organisms from the Biomorph Conveyor. <b>Mastery</b> (permanent XP from kills) unlocks ranks, lore and cosmetic evolution.',
        'The practical order for a new player: place towers → learn their branches → push stars on your favorites → let mastery accumulate on its own.',
      ] },
      { h: 'Reading a tower’s role', body: [
        'Cost and range tell you where it lives; cadence and splash tell you what it kills. Cheap + long range = your opener. High splash = swarm control. Beam or debuff organs multiply everything AROUND them — they never carry a line alone. Artillery has a deadzone: enemies closer than its minimum range cannot be targeted, so screen it with short-range brawlers.',
      ] },
    ],
  },
  {
    slug: 'heroes', title: 'Hero Guide — Living Weapons', category: 'Combat',
    summary: 'The hero roster, their doctrines and abilities, and how equipment, stars and forks build them out.',
    sections: [
      { h: 'The roster', body: ['Generated from the live build:'], dataTable: 'heroes' },
      { h: 'Doctrines', body: [
        'A hero’s behavior is a doctrine, not a leash. <b>Dive</b> heroes hunt kills aggressively. <b>Guard</b> heroes anchor the Core and regenerate its integrity. <b>Control</b> heroes emit disruption fields that slow the tide. The Revenant’s <b>phase</b> doctrine blink-strikes priority targets. Pick the doctrine that patches your build’s weakness, not the biggest number.',
      ] },
      { h: 'Equipment, stars and forks', body: [
        'Each hero carries a Weapon / Armor / Relic loadout with behavioral affixes and set bonuses — and visibly wears it on the battlefield. Hero Stars (★1–10) climb a permanent upgrade path; at ★5 and ★8 each hero chooses between two <b>ability forks</b> that re-author their kit. Duplicate-set pooling across the team unlocks the deep 4-piece bonuses.',
      ] },
      { h: 'Micro that wins runs', body: [
        'Two inputs separate good hero play from great: the <b>rally point</b> and the <b>ability cast</b>. Rally your hero where the wave preview says the pressure will land, not where the last wave hit. Cast the active ability on the breach that is HAPPENING, never the one you fear — a banked ability costs nothing, a wasted one can cost the Core. When a hero goes down mid-wave, their respawn timer is a resource too: pull the rally back to the Core so they return into safety, not into the same claw that dropped them.',
      ] },
    ],
  },
  {
    slug: 'gene-cards', title: 'Gene Card Guide — Drafting & the Archive', category: 'Progression',
    summary: 'How the in-run draft works, what rarities mean, and why the permanent Gene Archive is your long game.',
    sections: [
      { h: 'The draft', body: [
        'Every few waves you choose one of three Gene Cards. The boost lasts only the current run — but the card itself is permanently added to your Gene Archive, where it can be leveled with Gene Essence to strengthen every future appearance. Draft what the RUN needs; level what your BUILD wants.',
      ] },
      { h: 'Reading a card', body: [
        'Cards speak a small effect language: multipliers, flat adds, flags, grants and hooks. Rarity scales with depth — pushing deeper waves offers rarer drafts. Some cards are gated behind progression unlocks, so the pool itself grows as you clear campaign stages.',
      ] },
      { h: 'Archive strategy', body: [
        'Essence is scarce early: level broad multipliers first (damage, biomass income), then the cards that define your favorite archetype. A leveled common you see every run outperforms a legendary you see once a session.',
      ] },
    ],
  },
  {
    slug: 'bosses', title: 'Boss Guide — Apex Organisms', category: 'Combat',
    summary: 'Chassis, modules and phases: how framework bosses work and how to disassemble each body plan.',
    sections: [
      { h: 'How a boss is built', body: [
        'Every boss is a chassis (bruiser, artillery, swarmlord, controller, juggernaut) carrying ability modules with a phase script that unlocks them as its HP falls. The chassis tells you the body plan; the modules tell you the threat. A controller suppressing your towers dies to hero pressure; a juggernaut eating your hero dies to massed tower fire.',
      ] },
      { h: 'Phase discipline', body: [
        'Bosses escalate at HP thresholds — the last third of a boss fight is always the most dangerous. Bank your hero ability and any run-wide buffs for the final phase, and never let a corruption pool sit under your highest-value tower: relocate it.',
      ] },
      { h: 'Siege behaviors', body: [
        'Deep-campaign bosses bring siege kits: suppressor fields that disable towers, dampener auras that slow fire rates, corruption pools that soften everything inside. All of them are POSITIONAL — the counter is almost always to move something, not to build more.',
      ] },
    ],
  },
  {
    slug: 'mega-bosses', title: 'Mega Boss Guide — Raid Organisms', category: 'Combat',
    summary: 'Battlefield-scale raids: weak-point surgery, ability rotations, and the rewards ledger.',
    sections: [
      { h: 'A raid, not a wave', body: [
        'Every ten campaign stages (and periodically in Infinite and Boss Rush) a Mega Boss arrives OVER the arena — a battlefield-scale organism whose body anchors across the top of the field. It fights through an authored ability rotation while reinforcements keep coming. Your towers and hero automatically raid-fire its exposed weak points.',
      ] },
      { h: 'Weak-point surgery', body: [
        'Weak points descend into reach and each destroyed organ removes a threat or triggers a consequence — the raid is a sequence of surgical decisions under pressure. Killing efficiency (speed, integrity kept, organs burned, casts interrupted) grades the reward payout.',
      ] },
      { h: 'The lone siege', body: [
        'When the wave plan is spent and the Mega Boss is the last thing standing, it TURNS ON THE HIVE: its mass drapes down into every tower’s reach (and takes deeper body damage for it), reinforcements escalate, and it winds up direct HIVE LASHES — telegraphed strikes on your integrity that come FASTER with every landed blow. Stalling is a losing race. Burst an eye mid-windup or topple it with a weak-point push to defuse a lash and buy a full beat.',
      ] },
      { h: 'Preparation', body: [
        'Raids reward sustained single-target damage more than swarm control. Bring a beam or high-cadence core to your line before stage 10, 20, 30… and keep your hero alive: their raid-fire contribution is substantial.',
      ] },
    ],
  },
  {
    slug: 'power-score', title: 'Power Score Guide', category: 'Progression',
    summary: 'The one number that folds your whole account — what feeds it and how to raise it efficiently.',
    sections: [
      { h: 'What it is', body: [
        'Power Score folds every permanent bucket — genome upgrades, tower stars, hero stars, gene levels, equipment, collections, prestige — plus your live run’s temporary buffs into one comparable number. Screens that gate content (campaign recommendations, daily readiness) speak in Power.',
      ] },
      { h: 'Raising it efficiently', body: [
        'Early: genome upgrades and tower stars dominate. Mid: equipment sets and gene leveling take over. Late: prestige nodes and deep collections. When a recommendation says you are underpowered, the fastest patch is usually the cheapest unbought genome tier, not a lucky drop.',
      ] },
      { h: 'What Power does NOT measure', body: [
        'Power is a readiness index, not a skill score. It cannot see your placement discipline, your draft synergy, or whether your build answers the wave composition in front of it — which is why an underpowered, well-played run routinely clears content a lazier, richer account bounces off. Treat a Power gap under ten percent as a suggestion; treat a gap over thirty as physics. In between, the run belongs to whoever plays it.',
      ] },
    ],
  },
  {
    slug: 'progression', title: 'Progression Guide — The Permanent Game', category: 'Progression',
    summary: 'Every run pays forward: the currencies, the labs, and a sane order to spend in.',
    sections: [
      { h: 'The currencies', body: [
        '<b>Biomass</b> dies with the run. Everything else persists: <b>Genome Cores</b> (meta upgrades), <b>Tower/Hero Shards</b> (stars and unlocks), <b>Gene Essence</b> (archive leveling), <b>materials</b> (equipment crafting), and prestige currencies deeper in. Losing a run never loses progression.',
      ] },
      { h: 'A sane spending order', body: [
        'First: the cheap genome economy tiers (they compound). Second: stars on the two towers you actually field every run. Third: your main hero’s stars to ★5 for the first ability fork. Fourth: equipment set completion. Prestige when the game tells you the curve has flattened — not before.',
      ] },
      { h: 'The labs', body: [
        'The Tower Lab evolves the roster; the Hero Lab builds your champions; the Gene Archive levels your draft pool; the Armory manages equipment; the Mulligan Lab assembles per-tower organisms. Each lab reads the same currencies — the order above keeps them from starving each other.',
      ] },
    ],
  },
  {
    slug: 'campaign', title: 'Campaign Guide', category: 'Modes',
    summary: 'The stage ladder: events, biomes, milestone bosses and how depth gates the wider game.',
    sections: [
      { h: 'The ladder', body: [
        'Campaign stages are procedurally authored: each has a biome, a wave plan, events (elite rushes, boss gauntlets, genome caches, mutation choices) and milestone bosses. Depth is the master progression gate — new towers, cards and systems unlock as you clear stages.',
      ] },
      { h: 'When you hit a wall', body: [
        'A wall is information: it names the axis you have underfed. Check the recommended Power, bank a few genome tiers, star up your core towers, then re-attempt. Mutation-choice events are the campaign’s biggest swings — read both options before picking.',
      ] },
      { h: 'Milestones worth planning for', body: [
        'Every tenth stage is a Mega Boss raid — arrive with sustained single-target damage and a living hero. Boss stages telegraph their chassis on the map card: a juggernaut wants massed fire, a controller wants hero pressure, an artillery chassis wants your line spread so one shell can’t erase it. First-clear rewards are the campaign’s richest single payouts, so when you are close to a new stage record, spend your banked currencies BEFORE the attempt, not after.',
      ] },
    ],
  },
  {
    slug: 'infinite', title: 'Infinite Mode Guide', category: 'Modes',
    summary: 'Endless escalation against the AI Director — pacing, biome rotations and personal bests.',
    sections: [
      { h: 'How it escalates', body: [
        'Infinite composes waves from a depth-scaled threat budget — the deeper you go, the smarter and heavier the composition. Biomes rotate as you descend, each warping the rules. Your best wave is a permanent record and unlocks reward tiers.',
      ] },
      { h: 'Building for depth', body: [
        'Infinite rewards compounding economies: income organs early, damage conversion late. The run that reaches wave 40 usually looks greedy at wave 10. Draft economy genes in the first third, control in the second, and pure damage only when the composition demands it.',
      ] },
      { h: 'Reading the Director', body: [
        'The Director spends a threat budget, and its receipts are visible: a wave heavy on shields is buying time for a summoner core; a sudden flier lane means your ground kill-rate scared it. Adapt one axis per wave — a full rebuild mid-descent wastes the Biomass that compounding was supposed to grow. Personal-best pushes end at the wave where your integrity, not your damage, runs out: bank a guard hero or a repair economy for the last stretch and the same build goes five waves deeper.',
      ] },
    ],
  },
  {
    slug: 'boss-rush', title: 'Boss Rush Guide', category: 'Modes',
    summary: 'The gauntlet: wave N is N bosses. Stamina, rewards per kill, and the builds that survive it.',
    sections: [
      { h: 'The format', body: [
        'Wave N spawns N assembled bosses in a staggered column with a thinned escort. Rewards pay PER BOSS DEFEATED, so a deep failed run still pays well. Stamina gates attempts, making each run a deliberate raid rather than a grind loop.',
      ] },
      { h: 'What works', body: [
        'Sustained single-target damage with armor handling; disruption to keep the column from arriving as one fist; a guard hero when your line is strong, a dive hero when it needs a closer. Splash is a luxury here — bodies are few and fat.',
      ] },
      { h: 'Stamina economics', body: [
        'Because attempts are gated, Boss Rush rewards preparation over repetition: a five-minute Lab session before a run (stars on your single-target core, an armor-handling gene leveled, hero equipment aligned) is worth more than a second attempt after a sloppy first. The per-boss payout also means the correct exit is often voluntary — when wave N+1 would clearly end you, banking the completed kills beats donating the stamina to pride.',
      ] },
    ],
  },
  {
    slug: 'daily', title: 'Daily Run Guide', category: 'Modes',
    summary: 'One deterministic seed per day, worldwide — same biome, same bosses, same modifiers for everyone.',
    sections: [
      { h: 'The format', body: [
        'Every UTC day generates one seed: a rolled biome, a seeded boss roster, two gameplay modifiers and a constrained tower pool on the Conveyor. Everyone in the world plays the SAME run — the leaderboard is a pure skill comparison.',
      ] },
      { h: 'Approaching a daily', body: [
        'Read the modifiers before your first placement; they redefine what "good" means for the day. A constrained tower pool is a puzzle, not a punishment — the intended line is always in there. One clean attempt beats three tilted ones.',
      ] },
      { h: 'Climbing the board', body: [
        'Daily standings are verified by deterministic replay, so the board is honest — which means the players above you are simply making better decisions on the same seed, and you can learn from them directly: watch a top replay, note WHERE their first three towers went and WHEN they spent the hero ability, then re-express it in your own attempt. Streaks matter too: the daily pays a completion reward whether or not you chart, so the cheapest progression habit in the game is simply showing up.',
      ] },
    ],
  },
  {
    slug: 'mulligans', title: 'Mulligan Guide — Tower Organisms', category: 'Progression',
    summary: 'Assembling a permanent biomechanical organism onto each tower kind from three genetic modifiers.',
    sections: [
      { h: 'What a Mulligan is', body: [
        'Each tower kind can permanently host ONE Mulligan organism assembled from THREE genetic modifiers (offensive, utility, biological axes). Once all three slots fill, the organism activates: its appearance, animation and projectile are procedurally grown from the modifiers you chose — no two accounts’ organisms look alike.',
      ] },
      { h: 'Assembly strategy', body: [
        'Modifiers are discovered through play and assembled with Gene Essence. Build your first organism on the tower you field EVERY run — the modifiers multiply with usage. Mismatched axes are legal but muddy; a focused organism (all three modifiers feeding one identity) reads and plays better.',
      ] },
      { h: 'Upgrades and the long game', body: [
        'Each slotted modifier can be individually leveled, and swapping a modifier out never destroys it — experimentation is cheap by design, so audition freely before committing Essence to deep levels. The organism also changes what its host FIRES: projectiles inherit the graft’s character, and the creature visibly breathes on the battlefield. When a new tower joins your permanent rotation, its empty Mulligan slots are usually the highest-value Essence you can spend that week.',
      ] },
    ],
  },
  {
    slug: 'collections', title: 'Collection Guide', category: 'Progression',
    summary: 'The account-wide record: categories, ranks and the passive bonuses completion pays.',
    sections: [
      { h: 'How collections work', body: [
        'Everything you encounter is recorded: strains assimilated, bosses felled, biomes survived, cards archived, equipment catalogued. Each category climbs ranks (Bronze → Ascendant) as it completes, and ranks pay permanent account bonuses — the completionist path IS a progression path.',
      ] },
      { h: 'Efficient completion', body: [
        'Most gaps close themselves through normal play. The deliberate ones: biome entries want Infinite depth (rotations), boss entries want campaign milestones, and equipment entries want set-targeted crafting. Check the collection screen’s nearest-rank hints before farming blindly.',
      ] },
      { h: 'Why ranks beat trophies', body: [
        'Collection ranks are not cosmetic: each category’s ladder pays a permanent, stacking account bonus, and the categories are deliberately broad enough that a mid-game account usually has two or three ranks sitting one cheap session away. Before a hard campaign push, sweep the collection screen for near-complete rows — a Gold-to-Platinum bump you earn in twenty minutes is often worth more than the genome tier you were saving for, and unlike a run, it can never be lost.',
      ] },
    ],
  },
  {
    slug: 'mastery', title: 'Mastery Guide', category: 'Progression',
    summary: 'Kill-fed XP per tower and hero: ranks, lore, and the cosmetic evolution that shows your history.',
    sections: [
      { h: 'How mastery accrues', body: [
        'Every kill credits the killing tower kind (or hero) with Mastery XP. Ranks unlock lore entries and visible cosmetic evolution on the battlefield — a mastered tower physically LOOKS like ten thousand kills. There is nothing to buy: mastery is pure history.',
      ] },
      { h: 'Why it matters', body: [
        'Mastery is the long-run identity system: it marks your mains, feeds collection ranks, and its visual tiers stack with stars, strains and skins. If two towers tie on paper, field the one whose mastery you want to grow.',
      ] },
      { h: 'Reading the ranks', body: [
        'Each rank threshold is a visible physical change on the battlefield model — plating, organs, glow — so a veteran’s field tells its own war story at a glance. The lore entries that unlock along the way are not flavor filler: they document each strain’s role and counters in the fiction’s own voice, and more than one balance hint hides in them. Heroes track mastery separately from towers, so your champion’s history survives even when your tower meta shifts underneath it.',
      ] },
    ],
  },
  {
    slug: 'doctrines', title: 'Doctrine Guide — Run Commitments', category: 'Modes',
    summary: 'Nineteen exclusive run-start commitments in three families — what each family changes, and how mastery ranks pay you back for specializing.',
    sections: [
      { h: 'One commitment, whole run', body: [
        'A Doctrine is chosen BEFORE a run and reshapes one rule for its entire length — you take exactly one, or none. <b>Build</b> doctrines bend your own math (Glass Doctrine trades Core integrity for raw tower damage; Overclock trades economy for fire rate). <b>Protocols</b> reshape the enemy world itself (Swarm Protocol nearly doubles spawn counts at half health; Titan Protocol sends a handful of monsters; Famine starves your Biomass and pays premium rewards for surviving it). <b>Pacts</b> do both at once — a sacrifice and a payoff on the same signature.',
        'Exclusivity is the design: you cannot stack every multiplier, so a doctrine forces a divergent build instead of a bigger one. A run with no doctrine is always legal and never punished.',
      ] },
      { h: 'Which doctrine when', body: [
        'Match the doctrine to what your account is good at, not to the biggest advertised number. A splash-heavy line feasts under Swarm Protocol; a beam-and-sniper build wants Titan. If your economy management is strong, Famine and Overclock pay far above their sticker price. Protocols carry reward multipliers up to ×1.6 — the harder the warp, the richer the run — and the reward premium stacks with your mastery rank in that doctrine.',
        'New doctrines unseal as your campaign deepens (the picker shows each gate), so the roster grows with you: two are available from your first run, and the graduate-exam Overmind Protocol waits at stage 30.',
      ] },
      { h: 'Mastery ranks', body: [
        'Every doctrine tracks your wins and your deepest wave under it, and ranks up on whichever signal is further: Initiate, Adept, Zealot, Exemplar. Each rank adds a permanent run-end reward premium for that doctrine, your Bio-Dex records the ladder per doctrine, and achievements recognize breadth — winning under five different doctrines, and under all three families. Commitment is a progression axis of its own: the doctrine you keep returning to literally pays better.',
      ] },
    ],
  },
  {
    slug: 'contracts', title: 'Champion Contracts Guide — The Weekly Board', category: 'Modes',
    summary: 'Three constraint runs a week, the same board for everyone — difficulty pips, the Gilded marquee, near-misses and the Perfect Week.',
    sections: [
      { h: 'How the board works', body: [
        'Every week, three Champion Contracts go live — authored challenges like "win without a single Kinetic tower", "reach wave 12 without losing integrity" or "win fielding Viral towers only". Every player sees the same board on the same UTC clock, and it rotates weekly through an eight-week pool. Any qualifying run counts automatically: there is nothing to activate, no separate mode to enter. Difficulty pips on each contract mark how hard it bites.',
      ] },
      { h: 'Rewards worth planning around', body: [
        'Each honoured contract pays bonus Genome Cores AND Account XP on top of the run’s normal rewards. One contract each week is the <b>marquee</b>: it carries an exclusive GILDED phenotype — a living-gold skin for a specific tower that exists nowhere else in the game. Honour all three in one week and the sweep itself pays out: a <b>Perfect Week</b> bonus, a lifetime counter on your board, and an achievement the first time you do it.',
      ] },
      { h: 'Playing the chase', body: [
        'Check the board before you deploy — a run you were already planning often satisfies a contract with one small adjustment, and the board card names every constraint as a chip so you can read the exact terms. After a run, the Results screen reports <b>near-misses</b>: any open contract you failed by exactly one constraint, with the missed term named ("Missed by one: Lose no integrity"). That line is the whole strategy — it tells you precisely what to change before rerolling the same run. Contracts never re-pay within their week; a ✓ row is settled until rotation.',
      ] },
    ],
  },
  {
    slug: 'quests', title: 'Quest Guide — Missions & The Descent Below', category: 'Progression',
    summary: 'The directive layer: a weekly ring of rotating quests and a permanent three-chapter questline, both fed by everything you already do.',
    sections: [
      { h: 'Two lanes, one credit stream', body: [
        'Quests are composed of counted missions — "fell 20 bosses", "draft 30 gene cards", "open 5 Bio-Containers" — and every mission credits automatically from normal play: runs, vault openings, expeditions, roulette spins and season levels all feed the same ledger, into both lanes at once. The <b>weekly ring</b> rotates three quests on seven-day windows. The <b>main questline</b>, The Descent Below, is three permanent chapters of ten missions each, cleared sequentially at your own pace.',
      ] },
      { h: 'Claims, finales and rollover', body: [
        'Rewards claim on the Quest Board — and the weekly lane is lossless by design: when the window rolls over, anything you earned but hadn’t claimed is auto-claimed into rollover mail (and pays its season XP), then the ring resets. Weekly progress never carries over, so partial quests are not hoarded homework — each week is a fresh ring. Chapter finales in The Descent Below premiere a story cutscene on first completion and grant an exclusive quest-source wardrobe cosmetic.',
      ] },
      { h: 'Playing the board efficiently', body: [
        'Read the ring on Monday and let it steer variety, not grind: the missions are deliberately broad enough that a normal week of play completes most of them. The active-chapter rule matters — only the current Descent chapter accrues, so claim finales promptly to open the next. Weekly finales you repeat in later rotations substitute a flat Ichor-and-Cores payout, so a completed ring is never a dead week.',
      ] },
    ],
  },
  {
    slug: 'account-progression', title: 'Account Level & Genome Rank Guide', category: 'Progression',
    summary: 'The two account-wide meters: an uncapped XP level that pays on everything, and the prestigious rank that measures your breadth.',
    sections: [
      { h: 'Account Level — the dedication meter', body: [
        'Nearly everything pays Account XP: kills, waves, wins, campaign clears, dailies, contracts, achievements, acquisitions. The level curve is smooth and uncapped — there is no ceiling and no reset — and every level pays a procedurally weighted reward, with richer milestone levels carrying titles. Weekly and monthly XP ledgers feed their own leaderboards, so the meter is both a lifetime record and a live race.',
      ] },
      { h: 'Genome Rank — the breadth meter', body: [
        'Your Genome Rating folds a weighted contribution from EVERY major system — campaign depth, Infinite records, Power Score, collections, mastery, doctrines, contracts, cosmetics, prestige and more — into one prestigious rank: Dormant, through the named ladder, to Living Catastrophe and beyond (the ladder is infinite). No single lane can dominate it by design: the rank measures how much of the game you have actually made yours.',
      ] },
      { h: 'Raising them on purpose', body: [
        'Account Level responds to volume — just play, and prefer activities that stack sources (a daily that also honours a contract pays both). Genome Rank responds to breadth: its Progress Advisor names your biggest realistic rating opportunities right now, which is usually a system you have ignored rather than a deeper grind in one you haven’t. Promotions pay prestige-leaning rewards (cores, Ichor, containers, titles) — never gameplay power, so the ladder stays honest.',
      ] },
    ],
  },
  {
    slug: 'nemesis', title: 'Nemesis Guide — The Grudge Ladder', category: 'Combat',
    summary: 'Losses create a hunter that comes back stronger — tiers, vengeance organs, and the trophy rack that pays for revenge.',
    sections: [
      { h: 'How a nemesis is born', body: [
        'Lose a run to a boss and it remembers: that organism becomes your Nemesis and returns in later runs, branded and buffed. Every time it beats you the grudge ladder escalates — Marked, Hunted, Reviled, Apex Predator — each tier layering real, deterministic advantages (more HP, armor, heavier Core damage, faster sieges). Dailies are excluded, so the shared worldwide seed stays fair; everywhere else, your history hunts you.',
      ] },
      { h: 'The revenge payout', body: [
        'Killing your Nemesis pays tier-scaled Genome Cores, an exclusive Abyssal phenotype, and a permanent <b>Vengeance organ</b> — a pure-upside trophy from that chassis, one per body plan. The deeper the grudge ladder climbed before you ended it, the richer the revenge: a nemesis you let reach Apex Predator is a walking jackpot, if you can collect.',
      ] },
      { h: 'The trophy rack', body: [
        'Harvested organs mount on a trophy RACK that grows to three slots as your collection deepens. Classic trophy organs are tradeoffs — real power with a real cost — while vengeance organs are clean bonuses; the rack lets you mix them. Rack composition is a genuine build decision between runs: match the organs to the mode you are about to enter, not to the biggest number on the shelf.',
      ] },
    ],
  },
  {
    slug: 'equipment', title: 'Equipment Guide — The Armory', category: 'Progression',
    summary: 'Weapon, Armor and Relic loadouts with behavioral affixes: acquisition, sets, crafting, reforging and salvage without regret.',
    sections: [
      { h: 'What equipment does', body: [
        'Each hero carries a Weapon / Armor / Relic loadout, worn visibly on the battlefield. Affixes are BEHAVIORAL, not just numeric — items change how a hero fights: what they prioritize, how abilities echo, what happens on kill or on wound. Set bonuses reward committing to a family, with deep four-piece bonuses unlocked by pooling duplicate sets across your whole team.',
      ] },
      { h: 'Getting and improving items', body: [
        'Items drop from Bio-Containers and craft from materials (mutagen, scrap, catalyst) in the Armory; the Gear Codex tracks every definition you have ever owned as a collection. Crafting is pity-protected — bad-luck streaks bend the odds back toward you. Reforging rerolls an item’s affixes when the base is right but the behavior is wrong; it is usually cheaper than chasing a fresh drop of the same slot.',
      ] },
      { h: 'Salvage without regret', body: [
        'Salvage converts surplus into crafting materials — and it is deliberately hard to hurt yourself: equipped items, set pieces you still need, and recent acquisitions are guarded, and salvage itself carries an UNDO. The rule of thumb: keep one strong item per slot per hero plus anything completing a set; melt the rest without ceremony. Materials in the bank are worth more than a museum of almost-good relics.',
      ] },
    ],
  },
  {
    slug: 'prestige', title: 'Prestige Guide — The Ascendant Layer', category: 'Progression',
    summary: 'When to reset, what carries over, and how Ascendant nodes reshape the early game.',
    sections: [
      { h: 'What prestige is', body: [
        'Prestige trades your current curve position for <b>Ascendant nodes</b> — permanent account-wide multipliers and new income levers that make every subsequent run start stronger and climb faster. Collections, mastery, archives and unlocks persist through it.',
      ] },
      { h: 'When to pull the lever', body: [
        'Prestige when progress per session has visibly flattened: campaign walls that ignore your spending, genome tiers priced beyond a session’s income. The first prestige is the hardest to commit to and the most transformative — the early nodes are deliberately the strongest in the tree.',
      ] },
      { h: 'Spending the tree', body: [
        'Ascendant nodes split into deep stackers (multipliers that scale with everything you already own) and new income levers (sources that did not exist before). Take one income lever early — it changes the shape of every run — then alternate into stackers as your permanent buckets grow, because a multiplier is only as good as what it multiplies. Post-prestige, the early campaign replays in a fraction of the time; treat the first hour as a victory lap that funds the next wall, not as lost ground.',
      ] },
    ],
  },
  {
    slug: 'live-events', title: 'Live Events Guide — The Rotating Hive', category: 'Modes',
    summary: 'Three event horizons run at once — surges, seasons and epochs — each with its own identity, currency, reward track and ceremony.',
    sections: [
      { h: 'Three horizons, always live', body: [
        'ASSIMILATION runs three event layers simultaneously: a 3-day <b>Surge</b> (Ember Tide, Spore Bloom, Static Night), a 2-week <b>Season</b> (The Great Hunt, Deep Current, Red Famine) and a 3-month <b>Epoch</b> (Assimilation, Overgrowth). They rotate on independent, worldwide-deterministic clocks — the hub wears the Epoch\u2019s identity while the shorter events surface as chips, so the calendar is always readable at a glance.',
      ] },
      { h: 'Event currencies and reward tracks', body: [
        'Each event mints its own token — Ember Spores, Hunt Marks, Epoch Strands and the rest — earned ONLY from that event\u2019s challenges and gone when the event rotates. Tokens climb a miniature battle pass scaled to the event\u2019s length (5 levels for a surge, 10 for a season, 18 for an epoch); every level pays, and longer events carry strictly richer ladders. Tokens cannot be bought: playing the event is the only lever.',
      ] },
      { h: 'Playing differently', body: [
        'Events transform the run itself: unique hazards (Thermal Fissures, Static Veils), pickups (Pollen Clusters, Seed Pods), hero and tower buffs, temporary Mega Bosses and event-tinted battlefields. Each event also ends in its own reward ceremony machine — a bio-reactor, an incubation pod, a DNA sequencer — never the same machine as another live event, so you always know which event just paid you.',
      ] },
      { h: 'Repeats respect veterans', body: [
        'When an event returns, any permanent reward you already own substitutes into a compensation bundle automatically — duplicate unlocks are impossible, and most of every track is consumable value, so a repeat window is still worth playing from level one.',
      ] },
    ],
  },
];
