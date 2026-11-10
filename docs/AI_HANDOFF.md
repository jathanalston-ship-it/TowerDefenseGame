# AI_HANDOFF.md — session handoff

> Scaffolded by `npm run handoff`; the sections marked TODO are filled by the session
> before committing. Read together with docs/PROJECT_STATUS.md and the latest
> docs/VALIDATION_REPORT.md. Next session: start at docs/PROJECT_MANIFEST.md.

- **Generated:** 2026-11-10 17:11 UTC · **Diff scope:** working tree vs HEAD
- **Branch:** codex/hive-autoplay · **HEAD:** 21102f9e

## Summary of work completed

LIVE .7 remains SHA b441f62cf0512d7da5c8d0692d53d3927fead962 with five verified notes. LOCAL unsealed .8 Know What Is Coming has one generated website note for readable wave intel and explicit base stats/rewards. Final phone refinement now hides only the compact intel row while details are open, preserves launch controls, and restores focus after the row reappears. Short/long elite-probe explanations pass actual GameView at390x844,320x568,844x390,1280x800; no clipping, keyboard End reaches text, Close stays44px/visible, reading does not dispatch Space, Escape restores chip focus. Screenshots inspected: ../wave-briefing-game-phone.png and ../wave-briefing-long-phone.png. The prior20px reading-area issue is RESOLVED. Build38551 PASS12.07s. No core/balance/save changes.

## Files modified

- Source (2): `src/ui/BuildControls.tsx`, `src/ui/GameView.css`
- Tests (0): —
- Docs (3): `docs/HUD.md`, `docs/devlog/DRAFT-2026-11-09.md`, `docs/devlog/DRAFT-2026-11-10.md`

## Systems affected (from the dependency registry)

- **run-ui** — `src/ui/BuildControls.tsx`

## Power Score changes

None. Combat, economy, progression, Power formulas and saves unchanged.

## UI changes

Live .5: readable reduced-motion gain/Power/Mastery notices; hero/tower portrait visibility and live motion lifecycle; keyboard focus/Tab/Escape for wardrobe and tower star ceremonies; complete Vault keyboard flow and live heartbeat/flash/shake settings; stable accessible reward totals alongside visual count-ups; reward placards held while hovered/focused/expanded and pinned through incoming bursts. Reading deadlines are separate from original merge timing.

## Documentation changes

Canonical UI-MOTION, HERO-SYMBIOTES, COSMETICS, TOWER-LAB, LOOTBOX, NOTIFICATIONS plus release ledger/generated website and validation/status updated. No mechanic/tutorial/save changes required. DIL/PIL latest regeneration: zero structural findings,34 existing stale pairs.

## Save changes

None. Presentation only; reward queue model and persistence untouched.

## Known edge cases

Windows validate wrapper fails spawning npx shell:false; direct gates supplement. Chrome probes use headless=new compatibility shim. AX-tree checks do not prove speech output of every screen reader. Generated docs/devlog/DRAFT-2026-11-09.md is untracked/unpublished; do not stage. Custom-domain version.json is404: verify hashed game entry and matching website notes instead.

## Remaining technical debt

Windows validate wrapper cannot launch npx/npm with shell:false; use direct gates and record results honestly. Browser accessibility-tree checks do not establish speech output in every screen reader.

## Recommended next tasks

Current live handle: final mobile99756 (wave-briefing-reading-mobile.log), run against final reading-layout dist; poll same handle. Docs96417 terminal PASS (anchors/references/staleness). All browser probes and devserver76491 terminal. Fullsuite3192/354files passed321.95s before final UI-only focus/layout refinements; targeted browser checks cover these refinements. Previous mobile94526 passed27nav/9gameplay but predates refinement; final99756 is authoritative.13site/registry tests passed earlier; website artifacts unchanged this turn. Continue useful improvements while respecting active mobilecheck dist (do not overwrite dist). Approx next deployment17:41UTC; seal/regenerate/build/test finalrelease when due. One next read-only investigation: Hud.tsx doctrine/vow/threat chips are title-only and mention docs/*.md, so phone explanation/accessibility may be improvable; do not assume a functional defect without probing. Do not stage untracked devlog drafts.

## Future expansion hooks

Existing RewardToaster presentation seams and resolveMotion remain the extension points. No new systems/files under src. Scratch browser probes in parent workspace: reward-reading-check.cjs (hover/focus/expanded hold, grace expiry, burst stability, unchanged merge windows); reward-announcement-check.cjs (AX stable totals); vault-focus-check.cjs and vault-focus-phone-check.cjs (keyboard flow); vault-motion-check.cjs; star-focus-check.cjs; wardrobe-focus-check.cjs; portrait and feedback motion probes. All focused probes passed. Reward reading change re-passed accessible totals probe. Earlier47 rewardToast/Vault tests and4 site tests passed. Validation history has full detail.

LOCAL .6 SFX control change: existing master fades20ms for volume/mute, latest ramp cancels old one, explicit current-time anchor, fallback supported; no context creation or synth/mix changes. ../volume-transition-check.cjs baseline single-step0.187501 ->0.000195 and silence. ../volume-sequence-check.cjs native/fallback rapid/interrupted volume/mute/unmute PASS max step0.000156, muted0, expected final0.112501.42 sound/music/cues tests PASS. Initial ramp without timed anchor failed offline sample check and was corrected; initial build found test Array.at lib mismatch, corrected. Final build87703 PASS; sound/site15 tests re-passed after compatibility correction. No browser/dev servers running.

LOCAL .6 music volume fix: old duck recovery restored0.296109 output after volume0 in real offline renderer. setVolume now cancels/holds prior automation, anchors current gain and keeps original100ms ramp. ../music-volume-check.cjs and ../music-volume-sequence-check.cjs native/fallback PASS for zero/rapid20->80% and duress multiplier (expected0.658559989,observed0.658559978).42 audio tests and4 site-sync tests PASS. Build45854 PASS (music-volume-build.log,Vite8.57s); all processes terminal. No dev/browser processes. Two Audio notes generated. No compositions/synths/mix levels changed.

Latest local .6: music toggle restores latest looping scene, including muted boss changes; skips stale one-shots and honors explicit stop. Baseline/after actual Chrome probe confirms fix.46 audio tests+4 site tests PASS; existing zero-volume and SFX sequence browser probes re-PASS. Build87156 terminal PASS (music-toggle-build.log,Vite9.06s). Three website Audio notes prepared. No running processes. Next deploy approximately06:38UTC. Live remains .5.

Latest local .6 shared mute: updateMasterVolume applies enabled state to100ms fade, used by toggle/volume; duress skips master updates while muted. Actual legendary-stinger offline probe baseline after-mute RMS0.017549 ->0; volume/duress while muted stay silent.47 audio+4 site tests PASS; toggle and rapid-volume/duress probes re-PASS. Four website notes prepared. Build28873 pending at this entry; next result supersedes it.

Final shared-mute production build28873 PASS (music-mute-build.log); all task processes terminal. Four notes prepared for .6; next approximate deployment06:38UTC. Live remains .5.

LATEST checkpoint06:04UTC:353 files/3155 full tests PASS (audio-batch-tests.log,150.14s,25991 terminal0). Shared AudioToggles keyboard/persistence/compact/mute independence/current-boss restoration browser PASS (../audio-controls-check.cjs production React bundle,no page errors). Initial Vite-only HMR socket error isolated by standalone bundle; dev93300 intentionally stopped. docs check23386 PASS anchors/references/freshness. FULL MOBILE29287 RUNNING against existing production dist, log audio-batch-mobile.log; poll same handle, never restart on observation timeout. No source edits this turn. ../verify-audio-release.ps1 now targets .6 title/notes and exact built asset; use after deployment. Next deployment approximately06:38UTC. Live remains .5; four local .6 notes.

LATEST: mobile29287 terminal PASS,CLEAN27navscreens+live runs across9viewports (audio-batch-mobile.log). All processes terminal. All current audio .6 gates complete:3155tests/build/47audio/4site/browsercontrol/offlineaudio/docs/mobile. No source changes since checks. Next audit candidate: src/ui/Toolbar.tsx hero auto-cast control visually ON/OFF but lacks aria-pressed (unlike other automation controls); inspect actual accessibility tree and fix if confirmed. Do not alter purchase semantics: before unlock it is a purchase button, after unlock a toggle; Hive-managed is disabled+on. Next approximate deploy06:38UTC; ../verify-audio-release.ps1 prepared. Live .5 remains unchanged.

LATEST .6 hero auto-cast fix: one aria-pressed expression in Toolbar, no gameplay/layout change. Actual Chrome AX baseline lacked pressed state; after fix purchase:none,on:true,off:false,Hive:true+disabled. Real Game buy/toggle/Hive APIs, Enter/Space exercised by ../autocast-accessibility-check.cjs. Initial fixture needed full build-env object; corrected then baseline/after worked.41 Hive/heroEvolution/site tests PASS. Full3155 and full mobile passed before this single attribute. Build19427 pending at this entry. Five website notes prepared. Next deploy~06:38UTC, live .5.

Final auto-cast accessibility build19427 PASS (autocast-accessibility-build.log), all processes terminal. Five notes local for .6; live remains .5.

LATEST .6 placement ARIA followup: Toolbar favorite and conveyor Deploy aria-pressed; conveyor aria-label includes organism/current Biomass cost or free. ../placement-accessibility-check.cjs baseline no states; after keyboard select/clear/switch AXstates PASS; free/paid labels PASS via normal wave-grown pod. Fixture first sim tick seeds gift; prep time does not grow paid pod, so probe starts wave. Auto-cast AX re-PASS.4 site-sync tests PASS; build23561 terminal0 (placement-accessibility-build.log). Full3155/mobile completed before four ARIA attributes across these followups; no visual/layout/gameplay changes. All processes terminal. Five local notes (combined UI note); next approx deploy06:38UTC. Live .5 remains. ../verify-audio-release.ps1 targets .6 game/home/news.

RELEASE .6 CHECKPOINT: sealed5notes, final build35451 PASS (audio-release-build.log), sealed siteSync4 PASS. All local processes terminal. Full3155/mobile9viewport before ARIA-only followups; actualGame/AXkeyboard probes cover latest attributes. Remote deploy branch remainsfa4f78bc. Publishing now; exact-SHA workflow and ../verify-audio-release.ps1 livechecks pending. Active continuous goal remains active.

LATEST DEPLOYMENT VERIFIED:4545bff2,Actions42767736604 SUCCESS; normal /play/ assetplay-BAy15d18.js HTTP200 + home/news title + all5 notes PASS06:22UTC. Initial custom-domain propagation checks saw .5, then normal URL reached .6; no intervention needed. All processes terminal. New batch next, .6 sealed. Next approx deployment07:22UTC. This docs-only checkpoint need not trigger another deploy.

LATEST LOCAL .7 Clearer Battlefield Choices,oneUI note: Toolbar corrects free starting gift recycle50shown/0paid mismatch to0; focus after consumed merge/recycle ->remaining enabledDeploy,favorite,namedconveyor group; only when consumed button hadfocus and noothercontrol nowfocused. Merge/recycle names includeorganism+amount. ../conveyor-recycle-check.cjs baseline/bodyfocus andafterPASS; ../conveyor-focus-check.cjs paidrefund/nextdeploy/favorite/merge/poor-group/unrelatedfocusPASS. Initial long-wave fixturelost beforeaction; validhighintegritymeta fixture thenPASS.20 conveyor/site testsPASS; build65033terminal0 (conveyor-focus-build.log). No processes. Live .6 unchanged; .7 unsealed. Next approxdeploy07:22UTC. Potential next targeted audit: Toolbar discard still calls audio.cue(dissolve), while Game.discardConveyor also queues dissolve; verify actual delivery before changing.

LATEST LOCAL .7: recycle duplicate confirmed/fixed. ../recycle-audio-check.cjs mounts actual GameView: baseline directdissolve1+queued1; now queued1only, staleconsumedidfalse and0cues. Removedone Toolbar audio.cue; sim/mix unchanged. Known fixtureViteHMRsocket warning excluded from producterrorlist.35 conveyor/sound/cues/site tests5415PASS; build40516PASS (recycle-audio-build.log,Vite6.17s). Dev4900 intentionallystopped. All processes terminal. Two .7notes prepared. Live .6 unchanged; nextapprox07:22UTC.

LATEST .7 Inspector confirmations: local TowerConfirmation+Popup adds namedmodal, safeCancel, Tabtrap, allkeyisolation, Escape+focusrestore; fallbackfocusnamedInspector ifopenergone/disabled. Pause subscription closespendingprompt. No globalBackpolicychange: runBackstillPause. Baseline no role/focus/Escape; actualGameView Back originallyleft2dialogs (confirmoverPause,focusbehind), now1Pause andresumefocusmut-buy. ../inspector-confirm-matrix.cjs PASS realGame keyboard/transaction/Back; ../inspector-pause-check.cjs fullGameView PASS Back/Pause/Resume; ../inspector-confirm-layout.cjs actualCSS/fonts2dialogsx3viewportsPASS.29testsPASS; build96060PASS. All processes terminal. Three .7 notes local, live .6 unchanged,nextapprox07:22UTC. Fullbatchgates stillneededbefore .7publish.

LATEST .7 BranchTree focus: baselineTier5 purchase->BODY; now focusselectedtierpreview ifbuyremoved/disabled, retainnextbuyifavailable, donotstealunrelatedfocus. ../branch-final-focus-check.cjs --assert / --poor / --outside PASS; confirmationmatrixrePASS. Fixture100k lacked160kfinalprice; corrected1mfixtureverifiedcompletionandkeptpoorcase.20testsPASS; build28850PASS Vite6.20s. Full3155batchsuite19178PASS164.59s (startedbeforefollowup); docs34520PASS. MOBILE63403RUNNING onfinaldist, logbattlefield-batch-mobile.log, pollsameworker. Four noteslocal. Live.6unchanged,nextdeploy~07:22UTC.

Local v2026.11.10.1 now has two notes: Hero Ops uses effective abilityCdMax and reports recovery/armed state accurately, plus run controls. Actual Chrome probe reproduced half-progress .75/.25 with cooldown modifiers; now .5 for1/.5/1.5 multipliers. Recovery7s, armed, fully ready and AX image name plus ability description PASS.24 heroes/equipment/evolution and4 site tests PASS. Docs check PASS. No core/CSS/save/cost changes; not deployed. Both generated devlog drafts remain unpublished.

Hero readiness final build65590 PASS (Vite7.59s); all processes terminal. Next release remains roughly08:14UTC with matching website notes; live .7 unchanged.



## 2026-11-10 16:57 UTC — wave briefing checkpoint

LIVE remains v2026.11.10.7, SHA b441f62cf0512d7da5c8d0692d53d3927fead962, verified normal game/home/news with five notes. LOCAL .8 Know What Is Coming has one generated website note. Incoming-wave reward/enemy/adaptation chips now open a readable detail region outside the mobile scroller. Base Biomass/HP/armor and inclusive elite counts are explicit. Keyboard opening, Escape/Close restoration, preview-change dismissal, reading-key isolation, phone/landscape geometry and real-game launch/inert behavior pass the isolated Chrome probe. No core, balance or save changes. Continuous goal remains active.

Poll existing handles, never restart on observation timeout: final production build21016 (wave-briefing-release-build.log); full regression suite77517 (wave-briefing-full-tests.log); browser probe60232 printed PASS but Chrome shutdown was still live at last poll. Earlier builds90994 and19517 succeeded; latter predates final reading-key isolation.13 registry/site tests and docs check PASS. After final build completes, run mobilecheck against its dist, then continue improvements toward approximate17:41 UTC deployment. .8 remains unsealed; regenerate/build if further changes. Existing Windows validate wrapper launcher failure reproduced (wave-briefing-wrapper-report.log); direct gates required. Do not stage the two untracked devlog drafts.


## 2026-11-10 17:06 UTC — integrated wave details

Full3192tests/354files PASS321.95s (77517 terminal). Build21016 PASS10.40s. Mobile94526 CLEAN27nav/9gameplay viewports (terminal), predating last CSS-only constraint. Actual GameView probe found 320x568 clipping: detail bottom509 exceeded canvas bottom440. BuildControls max-height now subtracts controls strip, bar does not shrink, details shrink/scroll. Full-game campaign probe passes 390x844,320x568,844x390,1280x800 geometry, End scrolling, Escape focus restoration and Space isolation; latest10106 terminalPASS. Two original fixture failures were from endless mode intentionally lacking previews; campaign uses actual preview. Screenshot ../wave-briefing-game-phone.png inspected: final sticky44px close header remains visible but leaves only about20px of reading height at320x568. This is a remaining usability issue: refine details presentation before release, preserving full-text scrolling, accessible Close/Escape and existing Start Wave behavior. No core changes; website note remains unsealed .8.

Next: improve 320x568 detail reading area (sticky header currently consumes most of83px region). Consider using more of the existing briefing area while details are open, rather than squeezing text below all launch controls; verify in actual GameView with ../wave-briefing-game-check.cjs. Final CSS build22763 terminal PASS11.88s (wave-briefing-constrained-build.log). Local Vite95476 stopped intentionally; browser10106 terminal. All earlier handles terminal. After any final layout change run the real-game probe, build and mobile gate on final dist. Fullsuite3192 and13registry/site tests already pass; repeat only when justified by later code changes. Next approx deployment17:41UTC; live .7 remains verified. Do not stage two untracked devlog drafts.

## 2026-11-10 17:12 UTC — readable compact wave details

LIVE .7 remains SHA b441f62cf0512d7da5c8d0692d53d3927fead962 with five verified notes. LOCAL unsealed .8 Know What Is Coming has one generated website note for readable wave intel and explicit base stats/rewards. Final phone refinement now hides only the compact intel row while details are open, preserves launch controls, and restores focus after the row reappears. Short/long elite-probe explanations pass actual GameView at390x844,320x568,844x390,1280x800; no clipping, keyboard End reaches text, Close stays44px/visible, reading does not dispatch Space, Escape restores chip focus. Screenshots inspected: ../wave-briefing-game-phone.png and ../wave-briefing-long-phone.png. The prior20px reading-area issue is RESOLVED. Build38551 PASS12.07s. No core/balance/save changes.

Current live handle: final mobile99756 (wave-briefing-reading-mobile.log), run against final reading-layout dist; poll same handle. Docs96417 terminal PASS (anchors/references/staleness). All browser probes and devserver76491 terminal. Fullsuite3192/354files passed321.95s before final UI-only focus/layout refinements; targeted browser checks cover these refinements. Previous mobile94526 passed27nav/9gameplay but predates refinement; final99756 is authoritative.13site/registry tests passed earlier; website artifacts unchanged this turn. Continue useful improvements while respecting active mobilecheck dist (do not overwrite dist). Approx next deployment17:41UTC; seal/regenerate/build/test finalrelease when due. One next read-only investigation: Hud.tsx doctrine/vow/threat chips are title-only and mention docs/*.md, so phone explanation/accessibility may be improvable; do not assume a functional defect without probing. Do not stage untracked devlog drafts.
