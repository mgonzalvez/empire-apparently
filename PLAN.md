# PLAN — Empire, Apparently

Integrated implementation plan. Read `SPEC.md` (creative direction v4.0) and
`SPEC-CORE.md` (the Galactic Dominion core spec) first; this document resolves
their conflicts and defines how the game is actually built.

## 1. Document map

| Doc | Role |
|---|---|
| `SPEC.md` | Creative direction v4.0 — theme, humor, advisors, tutorial, hints, quirks, events, Handbook. **Source of truth for personality.** |
| `SPEC-CORE.md` | Galactic Dominion spec — simulation rules, economy, fleets, combat, supernovas, tech requirements. **Source of truth for mechanics and stack.** |
| `PLAN.md` | This document — decisions, architecture, contracts, schemas, QA strategy. |
| `CHUNKS.md` | The implementation units (C1–C36) in dependency order, each with acceptance criteria. **Work happens in chunks.** |
| `IMPLEMENTATION_STATUS.md` | Live chunk/gate status. Updated after every chunk. |
| `AGENTS.md` | Repo conventions for agents working here. |

## 2. Precedence and conflict resolution

- `SPEC.md` wins on: theme, humor, dialogue, advisors, tutorial, hints, quirks, events, Handbook, title screen.
- `SPEC-CORE.md` wins on: simulation rules, economy, time model, fleets, combat, support fleets, supernovas, technology requirements (stack).
- `PLAN.md` wins on: integration details neither spec covers. Assumptions are flagged **⚠** and live in `src/data/balance.ts` so they can be changed without touching logic.

**Flag:** the brief referenced the core spec "Version 3.0"; the provided document is **Version 2.0**. It is treated as canonical. If a v3.0 with real differences surfaces, re-review §4 before starting Phase B.

## 3. Design principles

**P1 — Conquest first.** The loop is *travel → decide → attack → integrate*. Every other system serves this loop.

**P2 — Automation floor (the game must be winnable while doing almost nothing).**
Every system has an automatic default. A player who only travels, picks a stance, and attacks can finish a campaign. Nothing in the game is *required* micromanagement.

**P3 — Complexity ladder (scale from abstracted to optional, not-too-much depth).**
- **Tier 0 (cruise):** travel, wait, attack. Everything else automatic. A full campaign is completable at this tier.
- **Tier 1 (normal):** + combat stance choice, multi-target destination choice, evacuation order.
- **Tier 2 (engaged):** + specialization changes, support-fleet missions, garrison reinforce, ship construction, quirk decisions.

Rules:
- Tier-2 controls are never required. Their automatic fallbacks must achieve **≥ 90%** of the manual outcome (see §9 fallback table).
- **Decision budget:** at any moment the UI presents **≤ 3** "needs attention" items (warnings + surfaced opportunities). Everything else lives in the log and hints. This is a measured property in the campaign simulator, not a hope.
- **Fixed complexity inventory (hard cap):** 3 resources, 3 ship classes, 3 stances, 5 specializations, 4 support missions, ≤ 2 choices per event, ≤ 1 quirk decision per planet. No sliders, no tech tree, no worker allocation, no diplomacy, no ship designer.
- If a mechanic adds administration without a meaningful decision, it is simplified or removed (SPEC §11, final directive).

**P4 — Personality carries the weight.** Most content investment goes into humor and personality (dialogue, quirks, events, Handbook); the mechanical core stays small and is effectively frozen after Phase C. Personality phases may add *presentation* but never change simulation rules for a joke.

**P5 — Clarity beats jokes.** Factual reports (battles, production, warnings) are always complete and unambiguous; narration is a separate layer that can be wrong, dry, or silly without ever obscuring a number (SPEC §11).

**P6 — Dialogue quality and variety are first-class requirements.** Dialogue must stay high-quality over a full 45–60 minute campaign and must not repeat visibly. Architecture in §10; writing process in §11; automated repetition audit in §14.

**P7 — Determinism and testability.** Single seeded PRNG, pure engine (no DOM in `src/engine`), versioned saves. The same seed + same action sequence always produces the same state.

## 4. Decisions and assumptions

| Topic | Decision | Source |
|---|---|---|
| Stack | Vite + React + TypeScript + Vitest; zero other runtime deps (React bound via `useSyncExternalStore`) | Core §2. **Deviates from the family's vanilla convention** by explicit precedence of core-spec tech requirements. |
| Time model | Discrete galactic-year ticks; time advances only via the time-consuming action ledger (§6) | Core §4 |
| Galaxy | 20 systems, 2–3 rival factions, 45–60 min campaign | Core §1, §3 |
| Progression | **No tech tree.** Development levels + specializations are the progression. Combat "technology modifiers" = development level | Core §5, §19 |
| Victory | All surviving inhabitable systems player-controlled AND (Integrated OR integration ≥ 60) **⚠**; destroyed systems excluded | Core §12 |
| Defeat | Homeworld + all recoverable territory lost; OR mandate deadline (120 galactic years) **⚠**; OR no recovery path (flagship destroyed AND cannot afford rebuild). Flagship loss alone is not defeat. | Core §12 |
| Deployment | Subdirectory `mgonzalvez.github.io/empire-apparently` (default) **⚠**; alternative `empire.gonzhome.us` subdomain. Decide before C36. | Core §2 subpath requirement |
| Advisors | 3, mechanically neutral (verified by test), switchable from main interface | SPEC §3 |
| Tutorial | Deterministic 7-system scenario, 10 steps, state-verified advance, milestones survive save/load | SPEC §5 |
| Complexity | Ladder + decision budget + fixed inventory (§3, §9) | User requirement + SPEC final directive |
| Dialogue | Variety engine: signature/rotation/late pools, least-shown-first cycling, stage-aware eligibility, repetition audit (§10) | User requirement + SPEC §4 |

## 5. Architecture

**Stack:** Vite, React 18, TypeScript (strict), Vitest. No router — a small screen state in the store. No state library.

**Layering (non-negotiable):**
- `src/engine/` — pure TS. No React, no DOM, no `localStorage`, no `Date.now()`. All inputs: `(state, action)`. All outputs: new state + effect events.
- `src/state/` — thin React binding (store) + persistence.
- `src/data/` — balance numbers (`balance.ts` is the ONLY home for tunables) + all personality content.
- `src/components/` — React UI. May call the store, never the engine directly except through store actions.
- `src/audio/` — WebAudio synth SFX (no audio files), mutable, off by default until C18.
- Map rendering: **SVG interactive layer** (20 systems, crisp, accessible, easy to animate) over a **canvas background** (nebula, parallax particles).

**File tree:**

```
empire_apparently/
├── index.html                    # theme pre-paint script (no flash)
├── vite.config.ts                # base: '/empire-apparently/' (or '/' for subdomain)
├── package.json / tsconfig.json
├── src/
│   ├── main.tsx / App.tsx        # screen state machine: title | setup | game | handbook | options | victory | defeat
│   ├── engine/
│   │   ├── types.ts              # GameState, entities, actions, effect events
│   │   ├── random.ts             # sfc32, state [u32×4], single stream per rng field
│   │   ├── galaxy.ts             # generation, fairness, visibility
│   │   ├── simulation.ts         # dispatch(action), tick pipeline (fixed order)
│   │   ├── economy.ts            # production, development
│   │   ├── movement.ts           # travel, fuel, range
│   │   ├── fleets.ts             # flagship, construction, repair, hull
│   │   ├── combat.ts             # orbital + invasion, stances
│   │   ├── occupation.ts         # garrison, stability, integration, rebellion
│   │   ├── supportAI.ts          # support fleet state machines + missions
│   │   ├── rivals.ts             # rule-based faction decisions
│   │   ├── supernova.ts          # instability pipeline, evacuation
│   │   ├── events.ts             # narrative event triggers/resolution
│   │   ├── victory.ts            # win/defeat/mandate
│   │   └── tutorial.ts           # tutorial step machine (verify-only advance)
│   ├── state/
│   │   ├── store.ts              # useSyncExternalStore binding
│   │   └── persistence.ts        # autosave, export/import, validation, restart-seed
│   ├── data/
│   │   ├── balance.ts            # ALL tunables, versioned, documented
│   │   ├── names.ts              # system/name pools
│   │   ├── cultures.ts           # curated cultures × governments matrix
│   │   ├── quirks.ts             # 12 quirks, one effect each
│   │   ├── events.ts             # 14 narrative events
│   │   ├── handbook.ts           # 20 handbook entries
│   │   ├── advisors.ts           # advisor metadata, accents, VOICE GUIDES
│   │   ├── dialogue/
│   │   │   ├── events.ts         # semantic event catalog (~22 types)
│   │   │   ├── mort.ts / bingo.ts / handbook-adv.ts
│   │   ├── hints.ts              # hint rules
│   │   └── tutorial/
│   │       ├── scenario.ts       # deterministic 7-system region
│   │       └── steps.ts          # 10 steps × content
│   ├── components/               # GalaxyMap, SystemNode, SystemPanel, FleetPanel,
│   │   …                         # TravelDialog, BattleReport, EventLog, EmpireBar,
│   │                             # DialogueBar, HintBar, AdvisorPortrait, Handbook,
│   │                             # TitleScreen, NewGameSetup, OptionsScreen,
│   │                             # TutorialOverlay, VictoryDefeatScreen, SupernovaFx
│   ├── styles/                   # theme.css (tokens + light/dark), app.css, advisors.css
│   └── audio/sfx.ts
├── tests/                        # one file per engine subsystem + campaign-sim +
│   …                             # dialogue-variety + tutorial autoplays + save round-trip
├── .github/workflows/            # ci.yml, deploy-pages.yml (C36)
└── docs (this folder's root)     # SPEC.md, SPEC-CORE.md, PLAN.md, CHUNKS.md,
                                  # IMPLEMENTATION_STATUS.md, AGENTS.md, README.md
```

**Theme:** family convention — light/dark toggle, persisted key `empire-apparently-theme`, inline pre-paint script in `index.html` (never remove).

## 6. Time and action contract

Tick = 1 galactic year. **Fixed per-tick pipeline order** (all systems share this clock; no ordering drift):

1. Production → 2. Development → 3. Occupation/stability/rebellion → 4. Flagship movement & arrivals → 5. Support-fleet steps → 6. Rival decisions → 7. Stellar instability → 8. Narrative event roll → 9. Tutorial verification → 10. Victory/defeat evaluation.

**Action ledger** (only these advance time; no UI path may advance time any other way — the exploit rule from core §4):

| Action | Years | Notes |
|---|---|---|
| Travel | 1–3 (distance bands) | fuel = f(fleet size, distance); range-limited |
| Wait | 1 | |
| Repair/refit | 1 | |
| Evacuation order | 2 | completes over time, then resolves |
| Construction (add ships) | 0 | instant, cost-based — "quick decision, not queue management" (core §6) |
| Stance choice, specialization change, mission assignment, selection, panels, dialogue, hints | 0 | simple UI, free |

Every elapsed year runs the full pipeline. Combat resolves on arrival (no separate tick).

## 7. Determinism and save contract

- **RNG:** sfc32 (4×u32 state) serialized in state. Two independent streams:
  - `rng` — simulation. Every sim draw goes through it, in pipeline order.
  - `narrRng` — narrative-only (dialogue variant selection, flavor rolls). Never influences sim outcomes. Also serialized, so replays reproduce the same jokes.
- **Save format v1:**
  ```ts
  { v: 1, seed, tick, rng: [u32×4], narrRng: [u32×4],
    galaxy, empire, flagship, supports, rivals,
    narrative: { resolvedIds, cooldowns },          // deterministic event state
    tutorial?: { step, completedSteps, scenario },
    dialogue: { advisor, recentIds: string[],
                shown: Record<eventId, Record<lineId, count>> },
    settings: { hints: 'off'|'occasional'|'normal'|'frequent',
                supernovaFreq: 'zero'|'low'|'normal',
                advisor, sound, theme },
    stats: { battles, wins, losses, fleetsLost, supernovas, conquests } }
  ```
- Autosave after **every** state-changing action (core §15 says "major" actions; every is cheaper and safer).
- Export/import as JSON file with schema validation; reject unknown `v` (migration hook reserved).
- "Restart current seed" = regenerate galaxy from `seed`, reset everything else.

## 8. Core simulation summary (numbers all in `src/data/balance.ts`)

- **Resources:** Credits / Materials / Fuel. Three global pools, per-year income from planets.
- **Specializations** (initial auto-chosen per planet, one-click change, free):
  | Spec | Credits | Materials | Fuel | Special |
  |---|---|---|---|---|
  | Industrial | 1 | 3 | 1 | better shipyard costs |
  | Mining | 1 | 2 | 2 | +fuel |
  | Economic | 3 | 1 | 1 | +research-free income |
  | Fortress | 1 | 1 | 1 | +planet defense, +fleet support |
  | Balanced | 2 | 2 | 2 | — |
  Scaled by development level 1–5 (auto-advancing, capped, transparent cost). *Initial table — tuned in C12/C34.*
- **Fleet:** Interceptors (cheap, anti-ship), Cruisers (main strength), Transports (invasion capacity). Hull condition per fleet; repair 1 year. Combat strength and invasion strength are derived, always displayed.
- **Travel:** fuel = ships × distance factor; range in distance bands (1–3 years); destination preview shows distance, years, fuel, known defenders, estimated outcome.
- **Combat stances (documented multipliers):** Aggressive ×1.25 attack / ×0.85 taken. Balanced ×1.0 / ×1.0. Cautious ×0.85 attack / ×1.2 taken, +25% withdrawal after orbital phase. Orbital: class-weighted exchange with seeded variance. Invasion (only with surviving transports + orbital superiority): invasion strength vs garrison + fortifications + development modifier.
- **Occupation:** auto-garrison assigned at capture (recommended, from surviving troops); stability 0–100; integration rate ∝ stability; auto top-up when stability < 40 (the Tier-0 fallback); rebellion at stability 0 with under-garrison → independent or previous faction. UI: Stable / Unstable / Rebellion Imminent + estimated integration time + garrison + Reinforce (optional).
- **Support fleets:** max 3, built at shipyards with real ships + credits + materials. State machine: Idle/Traveling/Scouting/Patrolling/Reinforcing/Defending/Returning. Unassigned → auto-Patrol home region (Tier-0 safe). Never invade without explicit order; avoid suicidal fights; idle when infeasible; report via log.
- **Rivals:** 1 action/tick budget: Expand (ratio ≥ 1.5, adjacent independent), Reinforce (below defense target), Attack (ratio ≥ 2.0, weak neighbor), else build. Fixed starting bonus. No cheating.
- **Supernovas:** candidates seeded at new game: zero/low/normal = 0 / 2–3 / 3–5. Instability 0–100, rise 2–5/yr (seeded). Anomalous ≥ 50 (alert + map marker + scouting narrows window). Critical ≥ 75 (stronger warning, window shown as 3–6 years, no false precision). Detonation at 100: planet destroyed, local fleets destroyed, production lost, system = non-colonizable remnant. **Homeworld is never a candidate** (fairness). Destroyed systems excluded from victory.
- **Mandate deadline:** 120 years ⚠.
- **Victory:** all surviving inhabitable systems player-controlled AND (Integrated OR integration ≥ 60) ⚠.
- **Defeat:** per §4 (wipe / mandate / no-recovery). Victory/defeat screens show campaign duration, systems conquered, fleets lost, battles won, supernovas survived, empire score (core §12).

## 9. Complexity ladder — automatic fallback table

Every optional control has a documented automatic behavior. The manual choice is an *advantage*, never a *requirement*.

| Control | Tier | Automatic fallback (default) | Manual edge |
|---|---|---|---|
| Travel / wait / attack | 0 | — (the core loop) | — |
| Combat stance | 1 | Balanced | risk/reward trade on risky fights |
| Evacuation order | 1 | none (warnings always loud, critical/high priority) | save population + stationed fleets |
| Specialization change | 2 | keep current | ~+15% production fit over long term |
| Garrison reinforce | 2 | auto-garrison at capture + auto top-up < 40 stability | avoid rebellion under rival pressure |
| Support-fleet mission | 2 | auto-Patrol home region | recon/defense coverage where you choose |
| Ship construction | 2 | none (fleet as-is) | stronger fleet, costs credits+materials |
| Quirk decision | 2 | documented default option | avoid a small specific penalty |

**"Needs attention" list:** max 3 items — anything with a warning (rebellion imminent, critical star, fuel below travel budget) or a top hint-engine opportunity. Overflow collapses into the event log. Measured in the campaign simulator (p95 ≤ 3).

## 10. Dialogue system (variety engine)

**Architecture:** game rules emit *semantic events* (factual, e.g. `{ type: "combat.victory", planetName, losses, captured }`). The dialogue layer picks one line for the selected advisor. The factual report is rendered independently and is never affected by which line shows (SPEC §4, P5).

**Entry schema:**

```ts
type DialogueLine = {
  id: string;                    // "mort.combat.victory.r3"
  event: EventType;              // one of ~22 semantic events
  advisor: 'mort' | 'bingo' | 'handbook';
  kind: 'first' | 'rotation' | 'late';   // pool role (below)
  stage?: 'early' | 'mid' | 'late';      // tick-window eligibility
  eligibility?: (ev: DialogueEvent, s: GameState) => boolean; // e.g. losses > 3
  text: string;                  // supports {planetName} {factionName} {years} vars
  priority: number;              // first > late > rotation; within pool, tie-broken by rng
  cooldownTicks: number;         // min ticks after this line before it may show again
  maxPerCampaign?: number;       // hard frequency cap
}
```

**Pool design per (event, advisor):**
- `first` (1–2 lines): guaranteed on the *first occurrence in a campaign*. These are the identity lines — the best writing in the game.
- `rotation` (N lines): the bulk. Cycled least-shown-first.
- `late` (1–2 lines): eligible only tick > ~60 or after ≥ 8 occurrences — the "M.O.R.T. is tired of winning" layer. Makes long campaigns feel alive.

**Selection algorithm (deterministic, uses `narrRng`):**
1. Candidates = lines for (event, advisor) passing `stage`, `eligibility`, `maxPerCampaign`, and not currently on cooldown.
2. Order: unseen `first` lines first (highest priority). Then among rotation/late: **least shown count in this campaign** (ties broken by `narrRng`). This makes the full pool cycle evenly before any repeat.
3. Filter the top candidates against the **global recent window** (last 20 shown line IDs); if all top candidates are in the window, allow the least-recent one (never block a line just to avoid a repeat).
4. Record: push to `recentIds`, increment `shown[event][line]`, apply cooldown.

**Guarantees (all testable):**
- No line repeats until *every eligible rotation line has shown once* (modulo the 20-line window edge case).
- First-occurrence lines are unique per campaign.
- Surface variety via variables: planet names, faction names, loss counts, year numbers are interpolated, so identical lines land differently.
- Advisor switch mid-game never changes simulation state (neutrality test: identical state hash with different advisors).

**Semantic event catalog (~22):** travel.depart, travel.arrive, recon.reveal, combat.victory, combat.defeat, combat.withdraw, invasion.success, invasion.failure, planet.captured, planet.integrated, occupation.unstable, occupation.rebellion, ship.built, fleet.repaired, support.report (per mission), supernova.anomalous, supernova.critical, supernova.detonation, evacuation.done, rival.expansion, rival.attack, rival.defeated, event.resolved, victory, defeat. (Pruned/expanded to the real engine event list during C19; catalog is data, not code.)

## 11. Writing process (quality bar)

- **Voice guides:** `src/data/advisors.ts` carries a written voice guide per advisor (cadence, vocabulary, what they'd never say). M.O.R.T.: dry, pessimistic, precise, secretly proud; short sentences; quantifies doom. B.I.N.G.O.: relentlessly cheerful, customer-service cadence, treats catastrophes as service opportunities; no malice. The Mostly Reliable Galactic Handbook: pompous, encyclopedic, wry footnotes, refers to itself in the third person, corrects the reader's assumptions.
- **Write in event-family batches per advisor**, reviewing the variant table (event × line) before merge — not line-by-line against the UI.
- **Funny pass (human, required):** after C19, C25, C26, and C34. Checklist = SPEC §11's eight questions + "would I still find this funny on the 4th occurrence?"
- **Repetition audit (automated, §14):** headless full campaign logs every displayed line; reports per-event repeat distances; fails if any rotation line repeats before its pool is exhausted or if median gap < 6 ticks.

## 12. Other personality schemas (abridged)

- **Hint:** `{ id, when(state), priority: 'critical'|'high'|'normal'|'low', advice (factual), commentary: Record<advisor,string>, action?: panelRef, cooldownTicks }`. Settings Off/Occasional/normal/Frequent gate only normal/low; **critical/high never suppressed**. "Solicit Unwanted Advice" (permanent button) = run the hint pass for the current context, show top match + advisor line; falls back to the best *factual* situation summary, never a random joke.
- **Quirk:** `{ id, name, flavor, effect: ExactlyOneMechanicalEffect, decision?: { question, options: [A, B] (A = documented default) } }`. Cultures (10) × governments (8) compatibility matrix in `cultures.ts`; generation picks compatible triples only — no random word salad. Effect examples: Excessive Paperwork (integration −20%, or pay a credits toll to keep it at 0%), Dubious Cartography (defender estimates unreliable until scouted), Chronic Committee Formation (integration +50% but first integration takes an extra year). Each final effect is settled in C27 with exactly one transparent mechanical consequence.
- **Narrative event:** `{ id, trigger(state) (state-condition, deterministic), rarity, cooldownTicks, choices: ≤ 2, each { label, preview (consequence shown BEFORE choosing, factual), outcome(state) } }`. Never fires mid-travel (queued until arrival). Never hides a catastrophic outcome behind a joke (P5).
- **Handbook entry:** `{ topic, intro (humorous), mechanics (accurate), footnote?, unlock: condition }`. 20 entries; search; accessible from title screen and in-game.
- **Tutorial step:** `{ id, objective (one sentence), highlight: controlRef, verify(state) → boolean (authoritative), intro: Record<advisor,string>, complete: Record<advisor,string>, recovery(state) → string, onEnter?: scenarioCommands }`.

## 13. Content budget

| Item | Count | Where | Phase |
|---|---|---|---|
| Semantic dialogue events | ~22 | `dialogue/events.ts` | C19 |
| M.O.R.T. lines | ~45 (signature 12, rotation ~28 incl. 10–14 variants on top-6 common events, late 4) | `dialogue/mort.ts` | C19 |
| B.I.N.G.O. / Handbook (minimal, functional) | ~15 each | `dialogue/…` | C19 |
| B.I.N.G.O. / Handbook (full, with 10–14 variants on top-6 common events + late lines) | ~45 each | `dialogue/…` | C25 / C26 |
| Hint rules | 10 (8 from SPEC §6 + idle support + critical star) | `hints.ts` | C24 (3-rule minimal engine lands in C22 for tutorial step 10) |
| Cultures / governments / quirks | 10 / 8 / 12 | `cultures.ts`, `quirks.ts` | C27 |
| Narrative events | 14 | `events.ts` | C29 |
| Handbook entries | 20 | `handbook.ts` | C30 |
| Tutorial steps / lines | 10 steps × (1 objective + 6 advisor lines + recovery) | `tutorial/steps.ts` | C22 |

All content is original. No recognizable copyrighted characters, dialogue, or fictional brands (SPEC §2).

## 14. Testing and QA strategy

**Vitest matrix** (core §18, one file each): galaxy determinism & fairness; production; movement costs & range; construction costs; combat casualty math (statistical, 1k battles per stance); invasion; occupation & rebellion; support missions (per mission); rival expansion; supernova timing/destruction/evacuation; victory/defeat; save restoration (deep-equal round-trip incl. mid-supernova, mid-tutorial, mid-event).

**Determinism:** replay test — fixed seed + recorded action list → identical state hash at every 10th tick across two runs.

**Campaign simulator (the balance workhorse):** headless rule-based players, two profiles:
- **cruise** (Tier 0): travel to weakest adjacent target, attack at strength ratio ≥ 2.0, else wait. *Must be able to win* (proves P2).
- **engaged** (Tier 1–2): adds stance choice by odds, specialization changes, support missions, evacuation, construction at threshold. *Must win at least as well and finish no slower than cruise.*

Metrics per run: win/lose, tick count, p50/p95 length, dead ends, no-progress loops (>50 ticks with no state change), rival share of inhabitable systems, **"needs attention" count per tick (p95 ≤ 3 — the decision-budget property)**⚠.

**Tutorial auto-play:** headless player completes all 10 steps within the tick budget (~6–8 min nominal), from a cold start, mid-save-resume, and after skip.

**Dialogue variety audit:** as §11.

**Chunk quality gate (core §20, after EVERY chunk):** `npx tsc --noEmit` → `npx vitest run` → `npm run build` → update `IMPLEMENTATION_STATUS.md` → git commit. Never claim complete without this passing.

## 15. Balance guardrails (campaign simulator targets, enforced at C34)

- p50 campaign length 45–60 min ≈ 90–150 ticks at ~20–30 s of player time per action.
- Zero unwinnable starts across 200 seeds.
- cruise win rate ≥ 50%; engaged win rate ≥ 70%.
- Zero dead ends (supernova or otherwise).
- Rivals hold ≤ 60% of inhabitable systems at campaign end in ≥ 90% of engaged wins.
- No no-progress loops.
- Decision-budget p95 ≤ 3.

## 16. Phases → chunks (detail in `CHUNKS.md`)

| Phase | Chunks | Gate |
|---|---|---|
| A — Scaffold | C1–C2 | toolchain green |
| B — Conquest loop | C3–C8 | **M1: human wins the fixture galaxy** |
| C — Empire sim | C9–C12 | **M2: full 20-system campaign, no manual allocation; cruise profile wins** |
| D — Support fleets | C13–C14 | **M3** |
| E — Supernovas | C15–C16 | **M4** |
| F — Thematic identity | C17–C18 | SPEC #2: title, setup, skin, on-theme |
| G — Dialogue + M.O.R.T. | C19 | SPEC #3: variety engine live, M.O.R.T. complete, others functional-minimal |
| H — Tutorial | C20–C23 | SPEC #4: auto-play passes, title button enabled |
| I — Hints | C24 | SPEC #5 |
| J — Advisors 2–3 | C25–C26 | SPEC #6: full pools, funny passes |
| K — Personality world | C27–C29 | SPEC #7: quirks + events |
| L — Handbook & visuals | C30–C33 | SPEC #8–9; **M5: polished** |
| M — Balance, saves, deploy | C34–C36 | SPEC #10; **M6: live on GitHub Pages** |

Playable builds at every gate. The sim core is frozen after Phase C; later phases are presentation + content + balance.

## 17. Deployment and family integration

- **Default:** build with `base: '/empire-apparently/'`; GitHub Actions workflow (tsc → vitest → build → deploy to `mgonzalvez.github.io` subpath). One-time manual step: set the Pages source of `mgonzalvez.github.io` to "GitHub Actions".
- **Alternative:** own subdomain `empire.gonzhome.us` (`base: '/'`, CNAME → `mgonzalvez.github.io`, Cloudflare DNS-only per family convention). Decide before C36.
- Family integration at C36: master `AGENTS.md` updated (18 → 19 sites), Related Sites link on the title screen, theme toggle per family convention.

## 18. Open items (user)

1. Core spec version: provided doc is **v2.0**, brief said v3.0 — confirm v2.0 is canonical.
2. Deployment: subdirectory (default) vs subdomain.
3. Mandate deadline 120 years + victory integration threshold 60% — accept as defaults (tunable in `balance.ts` later).
