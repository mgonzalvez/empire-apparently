# CHUNKS — Empire, Apparently

The implementation units. **One chunk = one working session.** Chunks are in
strict dependency order: do not start a chunk until its dependencies are done
and green. Every chunk ends with the quality gate (PLAN §14):
`tsc --noEmit` → `vitest run` → `npm run build` → update `IMPLEMENTATION_STATUS.md` → commit.

Size: **S** ≈ half a session, **M** ≈ a full session.
"Play state" notes say what a human can do in the browser at the end of the chunk.

Standing constraints applied to every chunk (PLAN §3, §9, §10):
- No chunk may add a **required** manual decision; every new control ships with its automatic fallback.
- No chunk may add mechanics outside the fixed inventory (3/3/3/5/4/≤2/≤1).
- Engine stays pure; all numbers in `balance.ts`; factual reports never contaminated by narration.
- No unfinished controls advertised as working (core §19) — buttons appear only when functional.

---

## Phase A — Scaffold

### C1 — Toolchain & app skeleton — S
- **Deps:** — · **Play state:** blank themed app.
- **Scope:** `package.json`, `vite.config.ts` (base path), `tsconfig.json`, Vitest config, `index.html` (theme pre-paint script, `empire-apparently-theme`), `src/main.tsx`, `App.tsx` (screen-state stub), `styles/theme.css` (tokens + light/dark), `.github/workflows/ci.yml` (tsc+vitest+build), `.gitignore`.
- **Accept:** `npm i && npx tsc --noEmit && npx vitest run && npm run build` green locally and in CI; app serves from dev server; theme toggle persists; no FOUC of wrong theme.

### C2 — Seeded galaxy generation — M
- **Deps:** C1 · **Play state:** none (headless).
- **Scope:** `engine/types.ts` (entities), `engine/random.ts` (sfc32, serializable), `engine/galaxy.ts` (20 systems: coordinates, star class, planet type, specialization, development, population, defense, affiliation, visibility, instability seed; ownership+visibility fields per core §3), `data/names.ts` (first pools), `tests/galaxy.test.ts`, `tests/determinism.test.ts` (gen slice).
- **Accept:** same seed → deep-equal galaxy; homeworld secure + never a supernova candidate; ≥ 2 viable adjacent early targets; fixed **fixture galaxy** (8 systems) exported for later tests; generation < 50 ms.

## Phase B — Conquest loop (SPEC #1, core M1)

### C3 — Engine core + UI shell — M
- **Deps:** C2 · **Play state:** map renders, systems selectable, wait advances a year.
- **Scope:** `engine/simulation.ts` (GameState v1, `dispatch(action)`, fixed-order tick pipeline with stubbed systems, action ledger enforcing "only listed actions advance time"), `state/gameStore.ts`, `components/GalaxyMap.tsx` (SVG base), `StarSystem.tsx`, `PlanetPanel.tsx` (basic), `EmpireBar.tsx` (year, placeholder totals), `EventLog.tsx`, `tests/simulation.test.ts`.
- **Accept:** pipeline order proven by tests (each system sees prior systems' results); UI navigation advances zero time; state fully serializable; map shows all 20 systems with ownership colors.

### C4 — Travel, fuel, range — M
- **Deps:** C3 · **Play state:** can travel between systems.
- **Scope:** `engine/movement.ts`, `TravelDialog.tsx` (distance, years, fuel, known defenders preview), `balance.ts` (fuel formula, distance bands, range).
- **Accept:** cost/time match `balance.ts` formulas (tested); out-of-range rejected with explanation; in-transit fleet visible on map; arrival at exact tick (tested); fuel below cost blocks travel.

### C5 — Economy base — S
- **Deps:** C3 · **Play state:** resources tick up.
- **Scope:** `engine/economy.ts` (3 resources, specialization×development production table), `EmpireBar.tsx` (totals + per-year income), `tests/economy.test.ts`.
- **Accept:** per-year production equals table sum over owned planets (tested); income display matches state; no resource can go negative without a blocking check.

### C6 — Flagship & construction — M
- **Deps:** C5 · **Play state:** can build/repair the fleet.
- **Scope:** `engine/fleets.ts` (composition, combat/invasion strength, hull, instant construction at shipyards, 1-year repair, shipyard rule: Fortress spec OR dev ≥ 3), `FleetPanel.tsx` (costs + resulting strength shown immediately), `tests/fleets.test.ts`.
- **Accept:** build/repair costs tested; derived strengths tested; construction instant (0 ticks), repair exactly 1 tick; insufficient funds blocks; shipyard gating works.

### C7 — Automatic combat — M
- **Deps:** C6 · **Play state:** can attack; outcome modal.
- **Scope:** `engine/combat.ts` (orbital + invasion, stance multipliers per PLAN §8, seeded variance), `BattleReport.tsx` (minimal FACTUAL modal: result, before/after strengths, losses, casualties, captured-or-held — no narration yet), `tests/combat.test.ts`.
- **Accept:** stance effects match documented numbers across 1k simulated battles per stance (statistical bands); invasion requires surviving transports + orbital superiority; withdrawal (cautious) occurs at ~25%; report contains every number a player needs to understand the outcome.

### C8 — Conquest, occupation basics, rivals v1, win/lose — M
- **Deps:** C7 · **Play state:** **can conquer and win the fixture galaxy.**
- **Scope:** `engine/occupation.ts` (capture → occupied, auto-garrison, stability, integration, rebellion basics), `engine/rivals.ts` (defenses + opportunistic expansion v1), `engine/victory.ts` (victory per PLAN §4; defeat: wipe/mandate/no-recovery), `VictoryDefeatScreen.tsx` (minimal), `tests/occupation.test.ts`, `tests/rivals.test.ts` (slice), `tests/victory.test.ts`, `tests/campaign-sim.ts` (first rule-based player).
- **Accept:** capture→occupied→integrated over ticks (tested); under-garrisoned worlds rebel and revert (tested); rivals expand per budget (tested); **headless cruise profile wins the 8-system fixture using only travel + attack** (Tier-0 floor proven early, PLAN P2); total wipe reaches defeat.
- **Gate M1:** a human wins the fixture galaxy in the browser.

## Phase C — Empire simulation (core M2)

### C9 — Specializations & development — S
- **Deps:** C8 · **Play state:** one-click specialization change.
- **Scope:** specialization change (free, 0 ticks), auto development progression (capped, transparent cost shown in panel), UI badges, `tests/economy.test.ts` extended.
- **Accept:** changing specialization alters next-year income per table (tested); development auto-advances and caps; no action required (Tier-2 optional, fallback = keep current).

### C10 — Occupation depth — M
- **Deps:** C8 · **Play state:** occupation panel complete.
- **Scope:** recommended garrison at capture, stability states (Stable/Unstable/Rebellion Imminent), auto top-up below stability 40 (Tier-0 fallback), optional Reinforce action, estimated integration time in UI, rebellion → independent/previous faction, `tests/occupation.test.ts` extended.
- **Accept:** all fallback behaviors work with zero player input (tested); Reinforce is strictly better under rival pressure (tested); estimated time within 1 year of actual (tested).

### C11 — Rivals v2 + rival fleets — M
- **Deps:** C10 · **Play state:** rivals visibly expand and fight.
- **Scope:** 1-action/tick budget (expand ≥1.5 / reinforce / attack ≥2.0 / build), strength-distance-value rules, fixed starting bonus, rival fleets engage player support fleets later (hook), log reports, `tests/rivals.test.ts` complete.
- **Accept:** action budget never exceeded (tested); **player can still win when a rival takes neutral worlds first** (tested scenario); no rival action is invisible (all logged).

### C12 — Balance pass + campaign simulator — M
- **Deps:** C11 · **Play state:** full 20-system campaign playable end to end.
- **Scope:** complete cruise + engaged player profiles in `tests/campaign-sim`, 100 seeds × 20-system galaxy, metrics (PLAN §15 incl. decision-budget p95 ≤ 3), `balance.ts` tuning pass.
- **Accept:** 20-system campaign completable in browser without manual resource allocation; 100-seed run shows zero unwinnable starts, zero dead ends, no runaway (rivals ≤ 60% in ≥ 90% of engaged wins), no loops; cruise wins ≥ 1 in 2; p50 length in 90–150 tick band.
- **Gate M2.**

## Phase D — Support fleets (core M3)

### C13 — Support fleets: creation & state machine — M
- **Deps:** C12 · **Play state:** can build support fleets.
- **Scope:** construction at shipyards (real ships + credits + materials, max 3), state machine (Idle/Traveling/Scouting/Patrolling/Reinforcing/Defending/Returning), range/fuel rules identical to flagship, no-suicide check, idle-when-infeasible, auto-Patrol-home fallback when unassigned, `tests/support-fleets.test.ts`.
- **Accept:** cannot be created for free (tested); respects range/fuel (tested); never invades without explicit order (tested); returns to safety when critical (tested); unassigned fleets patrol home (Tier-0 fallback, tested).

### C14 — Support missions — M
- **Deps:** C13 · **Play state:** assign missions, watch them resolve.
- **Scope:** Scout (reveal unexplored in region), Patrol (intercept weak hostiles), Reinforce (troops to stability-below-threshold systems), Defend (stationed support in defense calc), log reports, UI assignment + status, per-mission tests.
- **Accept:** each mission resolves with the same rules as player fleets (tested); status visible at a glance; report per significant action.
- **Gate M3.**

## Phase E — Supernovas (core M4)

### C15 — Instability pipeline — M
- **Deps:** C12 · **Play state:** anomaly alerts appear.
- **Scope:** `engine/supernova.ts`, candidate seeding (zero/low/normal = 0/2–3/3–5), states stable→anomalous (≥50: alert + map marker + scouting narrows window)→critical (≥75: window 3–6 yrs, evacuation offered)→supernova→destroyed (remnant), homeworld excluded, victory-condition exclusion, `tests/supernova.test.ts`.
- **Accept:** timing deterministic (tested); warnings precede detonation by ≥ the shown window minus 1 year (no false precision — window always a range); homeworld never a candidate (tested); victory still achievable with destroyed systems excluded (tested).

### C16 — Evacuation & detonation — M
- **Deps:** C15 · **Play state:** can evacuate; explosions happen.
- **Scope:** evacuation (2 ticks, credit cost, ~60% population preserved, stationed fleet withdrawn), detonation resolution (planet/local fleets/production lost, remnant, factual event report), minimal flash on map (full FX in C33), save round-trip across detonation.
- **Accept:** warned supernova occurs in a live game without corrupting state (tested); victory still possible afterward (tested); save/load across the event is deep-equal (tested); evacuation strictly better than standing still (tested).
- **Gate M4.**

## Phase F — Thematic identity (SPEC #2)

### C17 — Title screen & new-game setup — M
- **Deps:** C12 (every setup option must be real) · **Play state:** new themed front door.
- **Scope:** `TitleScreen.tsx` — EMPIRE, APPARENTLY + tagline + actions **New Administrative Disaster** (New game) / **Resume Previous Mistake** (Continue, only when a save exists) / **Options**; tooltips = conventional labels (SPEC §10). `NewGameSetup.tsx` — advisor selection (3, all functional from C19; until C19 this screen ships with M.O.R.T. only and a note), seed display, supernova frequency (zero/low/normal — default low), theme toggle. Title buttons for Tutorial and Handbook appear only in C23/C30 (no fake controls).
- **Accept:** New game → playable in < 2 clicks; Resume restores exactly (tested); no button exists for a feature that doesn't; a first-time user knows what every label means from tooltips.

### C18 — Thematic skin pass — M
- **Deps:** C17 · **Play state:** the game reads as "Empire, Apparently".
- **Scope:** advisor accent CSS vars applied to dialogue/panels (C19 wires actual text), objective readout ("Universal Administrative Alignment: N/M worlds"), dry prose pass over labels/log copy (clarity-first, P5), `audio/sfx.ts` (WebAudio blips, mute, off by default), Victory/Defeat rewrite (mandate fulfilled / appointment rescinded + stats per core §12).
- **Accept:** a first-time user can complete one expedition using only on-screen text; every screen carries the provisional-office identity; SFX audible + mutable.

## Phase G — Dialogue system & M.O.R.T. (SPEC #3)

### C19 — Dialogue variety engine + M.O.R.T. complete — M
- **Deps:** C18 · **Play state:** the galaxy talks back (M.O.R.T. fully; others functional-minimal).
- **Scope:** `dialogue/events.ts` (semantic catalog ~22), `dialogue/mort.ts` (~45 lines: first/rotation/late pools, 10–14 variants on the top-6 common events), `dialogue/bingo.ts` + `dialogue/handbook-adv.ts` (~15 each, functional), `advisors.ts` (metadata, accents, **voice guides**), selection algorithm (PLAN §10: stage + eligibility + maxPerCampaign + cooldown + least-shown-first + 20-ID recent window + narrRng), `DialogueBar.tsx` (advisor-styled, separate from factual report), advisor switch in Options + main interface, `tests/dialogue.test.ts` (cycling property, first-line uniqueness, window behavior, **mechanical neutrality: identical state hash under different advisors**), `tests/dialogue-variety.test.ts` (audit harness over one headless campaign: M.O.R.T. only for now).
- **Accept:** every common event gets a M.O.R.T. line; no line repeats before its pool is exhausted (tested); advisor switch mid-game works with zero sim effect (tested); battle report stays 100% factual; audit table printed for the funny pass.
- **Funny pass #1 (human)** before C20.

## Phase H — Tutorial (SPEC #4)

### C20 — Tutorial engine — M
- **Deps:** C19 · **Play state:** none (headless).
- **Scope:** `engine/tutorial.ts` (step machine: **verify-only advance** — steps advance solely on authoritative state checks; no engine locks, a different valid action never traps; recovery probe emits guidance when the expected action is currently impossible; skip; milestones in save), `TutorialOverlay.tsx` (objective, highlighted control, skip/resume), `tests/tutorial.test.ts` (advance only on verified state; skip; resume after reload; alternate valid action doesn't trap).
- **Accept:** a fabricated wrong action sequence can never fail a step; save/load mid-tutorial resumes the exact step (tested).

### C21 — Tutorial scenario — M
- **Deps:** C20 · **Play state:** none (headless).
- **Scope:** `data/tutorial/scenario.ts` — deterministic 7-system region (homeworld, 2 easy independents, 1 weak rival, 1 empty, 1 scripted anomaly star, 1 finale target); starting Credits/ships/transports/range tuned to make every step possible; **temporary operational support fleet granted** with an in-game line explaining how normal play earns one; scripted anomaly (uninhabited star: anomalous ~tick 14, critical ~17, detonates ~tick 21 over the empty system — nothing of value lost); rival actions frozen; random narrative events disabled; all of it save-safe.
- **Accept:** scenario loads identically every time (tested); the detonation destroys nothing the player needs (tested); zero rival or event interference (tested); save/load mid-scenario resumes identically (tested).

### C22 — The ten lessons — M
- **Deps:** C21 · **Play state:** tutorial playable start to finish (rough).
- **Scope:** `data/tutorial/steps.ts` — 10 steps (homeworld inspection → map navigation → travel+confirm → reconnaissance → reinforcement → automatic combat → conquest+integration → support-fleet delegation → anomaly warning → objective + hints), each: one objective, highlighted control, authoritative verify, 3 advisor intros + 3 completion lines, recovery text; **minimal hint engine (3 rules: objective, expansion target, critical warning)** so step 10 is real (full engine in C24); depth framing: tutorial teaches Tier 0/1 fully, Tier 2 only by exposure ("you can also…").
- **Accept:** every step's verify checks a real state transition (tested with fabricated states); all 30 advisor lines + recoveries written; no step requires a Tier-2 action.

### C23 — Tutorial QA + enable — M
- **Deps:** C22 · **Play state:** **Instructional Misfortune** live on the title screen.
- **Scope:** headless auto-player completing all 10 steps (cold start, mid-save resume, post-skip), tick budget check (~6–8 min nominal), transition into campaign retaining all accomplishments (conquered world stays conquered, support fleet converts to a normal one — or is explained as a loan per scenario line), enable title button, `tests/tutorial.test.ts` complete.
- **Accept:** auto-play passes in all three modes (tested); player accomplishments preserved (tested); a player who ignores every hint and acts out of order still completes (tested via alternate-action path).
- **Gate SPEC #4.**

## Phase I — Hints (SPEC #5)

### C24 — Hint engine + Solicit Unwanted Advice — M
- **Deps:** C23 · **Play state:** hints + button live.
- **Scope:** `data/hints.ts` (10 rules: no transports, out of range, insufficient credits, fleet at disadvantage, occupied world at rebellion risk, support fleet idle, star approaching critical, attractive nearby target, idle empire (you could wait… or expand), fuel below travel budget), priority ladder (critical/high/normal/low), per-advisor commentary, optional action links, cooldowns, settings Off/Occasional/Normal/Frequent (**critical/high never suppressed** — tested), `HintBar.tsx` + badge, permanent **Solicit Unwanted Advice** button (context-sensitive top match + advisor line; fallback = best factual situation summary, never a random joke), `tests/hints.test.ts`.
- **Accept:** all 10 rules fire on constructed states (tested); suppression matrix tested per setting; button always returns useful guidance in 15 constructed situations.
- **Gate SPEC #5.**

## Phase J — Advisors 2 & 3 (SPEC #6)

### C25 — B.I.N.G.O. complete — M
- **Deps:** C24 · **Play state:** B.I.N.G.O. fully voiced.
- **Scope:** `dialogue/bingo.ts` → ~45 lines with first/rotation/late structure and 10–14 variants on the top-6 common events, written against the voice guide (cheerful, service-cadence, never malicious).
- **Accept:** cycling property holds (tested); audit table shows no event where a repeat arrives before ~10 occurrences; voice guide compliance (funny pass).

### C26 — The Mostly Reliable Galactic Handbook complete — M
- **Deps:** C24 · **Play state:** all three advisors fully voiced.
- **Scope:** `dialogue/handbook-adv.ts` → ~45 lines (pompous, encyclopedic, third-person self-reference, footnoted), same structure as C25; **final cross-advisor pass**: no shared phrasing between advisors, each event's three lines approach the same facts from three distinct angles.
- **Accept:** same as C25 + cross-advisor distinctness (reviewed); audit clean for all three.
- **Funny pass #2 (human).**
- **Gate SPEC #6.**

## Phase K — Personality world (SPEC #7)

### C27 — World personality data — M
- **Deps:** C12 · **Play state:** planets have faces and opinions.
- **Scope:** `data/cultures.ts` (10 cultures × 8 governments compatibility matrix, curated pairs only), `data/quirks.ts` (12 quirks, **exactly one transparent mechanical effect each**; effects from PLAN §12 or settled here), `names.ts` expansion, planet generation rewritten to draw compatible culture/government/quirk triples, PlanetPanel shows the **dossier** (flavor line + plain statement of the effect), `tests/cultures.test.ts`.
- **Accept:** every generated planet has a compatible triple + exactly one effect (tested over 5k galaxies); no two quirks interact; dossier states the effect in plain words.

### C28 — Post-conquest quirk decisions — S
- **Deps:** C27 · **Play state:** at most one choice per conquered world.
- **Scope:** ≤ 1 optional decision per planet (engine hook + UI prompt, skippable), documented default option auto-applied on skip (Tier-2 fallback), effect wiring + tests.
- **Accept:** skipping every decision is fully viable (tested); each decision changes exactly one measured thing (tested); no decision required before integration completes.

### C29 — Narrative events — M
- **Deps:** C28 · **Play state:** the galaxy occasionally comments on itself.
- **Scope:** `data/events.ts` (14 events: deterministic state triggers, ≤ 2 choices each, **consequence preview shown before choosing** (factual), resolution stored in `state.narrative`, rarity + cooldowns, queued — never fires mid-travel), event modal UI, `tests/events.test.ts`.
- **Accept:** triggers deterministic (tested); preview matches actual outcome in 100% of test runs (tested — no hidden catastrophes, P5); no event fires twice within its cooldown (tested); event frequency in a full campaign ≤ ~8 occurrences (sim-measured — "popups rare enough", SPEC §11).
- **Gate SPEC #7.**

## Phase L — Handbook & visuals (SPEC #8, #9; core M5)

### C30 — The Mostly Reliable Galactic Handbook — M
- **Deps:** C29 · **Play state:** searchable reference live.
- **Scope:** `data/handbook.ts` (20 entries: topic, humorous intro, accurate mechanics, optional footnote, unlock condition — covering exploration, economy, specializations, development, fleet, travel/fuel, shipbuilding, stances, support fleets + 4 missions, combat, occupation, integration, rebellion, rivals, supernovas, evacuation, victory/defeat, mandate, events, hints), search UI (topic + full text), unlock tracking, accessible from title (button appears now) and in-game.
- **Accept:** every entry's mechanics text verified against actual `balance.ts` values (checked, not vibes); search finds every entry; locked entries show topic only.

### C31 — Map visual personality — M
- **Deps:** C30 · **Play state:** the galaxy looks alive.
- **Scope:** canvas background (nebulae, parallax/particles), procedural planet illustrations per type (original SVG), star-class colors, ownership rings, animated travel routes, strong selection highlight, anomaly/remnant indicators, performance check.
- **Accept:** 20-system map ≥ 50 fps with all animations on a mid-range laptop (measured); every state (unexplored/independent/rival/occupied/integrated/destroyed) distinguishable at a glance; colorblind-safe palette check.

### C32 — Combat presentation — S
- **Deps:** C31 · **Play state:** battles are watchable, skippable, then clear.
- **Scope:** short optional animated sequence (fleet silhouettes, weapon fire, explosions) with **immediate skip**, then the full factual report + short narrative summary (advisor-neutral summary + advisor DialogueBar line alongside, never instead of).
- **Accept:** skip works at any frame (tested in browser); report identical with/without animation (tested — same effect events).

### C33 — Catastrophe & final UX — M
- **Deps:** C31 · **Play state:** polished.
- **Scope:** supernova animation (memorable, brief, skippable if it blocks an action — it shouldn't), tooltip pass (fleet strength, range, stability, production, supernova warnings — core §14), tablet responsive pass (core §2: usable ≥ 768 px width), SFX final pass (travel, battle, alert, explosion, UI).
- **Accept:** full campaign playable on a tablet at 1024×768 (manual check); every mechanic discoverable via tooltip/Handbook without docs; explosion animation < 3 s and never blocks input.
- **Gate M5.**

## Phase M — Balance, saves, deploy (SPEC #10; core M6)

### C34 — Balance refinement & dialogue variety final pass — M
- **Deps:** C33 · **Play state:** tuned.
- **Scope:** campaign simulator at 200+ seeds with both profiles (PLAN §15 targets incl. decision-budget p95 ≤ 3), `balance.ts` tuning, **full dialogue variety audit across all three advisors** (per-event repeat-distance report; expand any pool where median repeat < ~10 occurrences), final funny pass on all content.
- **Accept:** every PLAN §15 guardrail met; audit clean (no pool exhausted late, no early repeats); funny pass #3 signed off.

### C35 — Save polish — S
- **Deps:** C34 · **Play state:** save system final.
- **Scope:** autosave after every state-changing action (audit), export/import JSON + validation + friendly error on corrupt file, restart-current-seed, version field + migration hook, `tests/save.test.ts` complete (round-trip across detonation, event, tutorial, mid-travel).
- **Accept:** import of a hand-corrupted file fails cleanly (tested); resume after 24 h is exact (tested); export → new machine import → identical continuation (tested).

### C36 — Deployment & family integration — S
- **Deps:** C35 · **Play state:** **live on GitHub Pages.**
- **Scope:** `deploy-pages.yml` (tsc → vitest → build → deploy to `mgonzalvez.github.io` subpath; set `base` per final decision PLAN §18.2), one-time Pages source setting, final `README.md`, `IMPLEMENTATION_STATUS.md` closed out, this repo's `AGENTS.md` finalized, master `AGENTS.md` updated (18 → 19 sites), Related Sites link on title screen, final manual QA pass (new game → win; tutorial; save/load; export/import; both themes; tablet).
- **Accept:** production URL playable; CI green on the deploy commit.
- **Gate M6 — done.**

---

## Chunk count & effort

| Phase | Chunks | Size |
|---|---|---|
| A Scaffold | 2 | 1S 1M |
| B Conquest loop | 6 | 1S 5M |
| C Empire sim | 4 | 1S 3M |
| D Support fleets | 2 | 2M |
| E Supernovas | 2 | 2M |
| F Thematic identity | 2 | 2M |
| G Dialogue + M.O.R.T. | 1 | 1M |
| H Tutorial | 4 | 4M |
| I Hints | 1 | 1M |
| J Advisors 2–3 | 2 | 2M |
| K Personality world | 3 | 1S 2M |
| L Handbook & visuals | 4 | 1S 3M |
| M Balance/save/deploy | 3 | 3M |
| **Total** | **36** | **7S 29M ≈ 31–36 sessions** |
