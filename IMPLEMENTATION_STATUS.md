# Implementation Status — Empire, Apparently

Last updated: 2026-10-25 — **C9 complete.** Next chunk: **C10** (Occupation depth).

Rules of this file: updated at the end of every chunk (quality gate, AGENTS.md).
"Done" means the chunk's acceptance criteria passed and are committed.

## Gates

| Gate | Meets | Status |
|---|---|---|
| M1 — Playable conquest loop | Core §17.M1 | ✅ | C8: conquest loop end-to-end; Tier-0 cruise profile wins the 8-system fixture headless (tick 23, 6/6 battles, 0 fleets lost, 5/7 integrated ≥ 60%) |
| M2 — Empire simulation | Core §17.M2 | ⬜ |
| M3 — Automated support | Core §17.M3 | ⬜ |
| M4 — Stellar catastrophes | Core §17.M4 | ⬜ |
| M5 — Visual polish | Core §17.M5 | ⬜ |
| M6 — Deployment | Core §17.M6 | ⬜ |
| SPEC #2 — Title + identity | SPEC.md §12.2 | ⬜ |
| SPEC #3 — M.O.R.T. complete | SPEC.md §12.3 | ⬜ |
| SPEC #4 — Interactive tutorial | SPEC.md §12.4 | ⬜ |
| SPEC #5 — Hint engine | SPEC.md §12.5 | ⬜ |
| SPEC #6 — Advisors 2–3 | SPEC.md §12.6 | ⬜ |
| SPEC #7 — Quirks + events | SPEC.md §12.7 | ⬜ |
| SPEC #8 — Handbook | SPEC.md §12.8 | ⬜ |
| SPEC #9 — Visual personality | SPEC.md §12.9 | ⬜ |
| SPEC #10 — Variety + balance | SPEC.md §12.10 | ⬜ |

## Chunks

| Chunk | Title | Phase | Status | Notes |
|---|---|---|---|---|
| C1 | Toolchain & app skeleton | A | ✅ | React 19 / Vite 8 / TS 7 / Vitest 5; base path verified under subpath via preview server; theme toggle persists; CI workflow in place |
| C2 | Seeded galaxy generation | A | ✅ | sfc32 Rng (serializable state); 20-system generator with fairness invariants (secure homeworld, rivals ≥ grid-2, ≥ 2 weak adjacent targets, no candidates in opening zone, default supernova freq = low); 8-system fixture galaxy; 80 tests, 100-seed invariant sweep; gen ≈ 0.3 ms avg |
| C3 | Engine core + UI shell | B | ✅ | GameState v1 (PLAN §7 fields, JSON round-trip tested); 7-stage tick pipeline in core §4 canonical order (order + cross-stage visibility tested); action ledger — only `WAIT` advances time; store keeps selection as view state (navigation proven zero-time); SVG map (fog, routes, faction colors, homeworld ring, fleet badges, candidate ✳); PlanetPanel/EmpireBar/EventLog; Wait-one-year button; title screen with reproducible seed input; 103 tests |
| C4 | Travel, fuel, range | B | ✅ | `engine/movement.ts`: distance bands (close ≤30u/1y, medium ≤60u/2y, far ≤80u/3y; fuel = ships × band rate, paid at departure); `TRAVEL` on the time-advancing ledger — departure advances 1 year, voyage resolves on its exact arrival tick in the fleets stage; max jump range 80u enforced with stated reason; TravelDialog quote = engine quote (shown = simulated: distance, years, fuel, known defenders); in-transit flagship rendered at interpolated position with route line; arrival reveals destination (name withheld until then); in-transit blocks new courses; 121 tests |
| C5 | Economy base | B | ✅ | `ECON` table (PLAN §8 values verbatim) in balance.ts; `engine/economy.ts`: production = table × development (all 25 spec×dev combos tested), `empireIncome` = table sum over owned inhabited non-destroyed systems; resources stage (core §4 step 1) applies it; EmpireBar shows totals + per-year income from the same function the engine uses (drift impossible); no-negative guarantee: spends blocked when short, production additive — 60 mixed actions stay ≥ 0; 128 tests |
| C6 | Flagship & construction | B | ✅ | `FLEET` table (costs/weights/troops/repair/rearm) in balance.ts; `engine/fleets.ts`: derived combat (class weights × hull factor 0.5+0.5·hull/100, floored) & invasion (troops; capacity = transports × 10) strengths; shipyard rule = player world w/ Fortress spec or dev ≥ 3 (dev-3 homeworld always qualifies); BUILD/REARM instant (0 ticks, off-ledger), REPAIR exactly 1 tick (on-ledger) — ledger test pins WAIT/TRAVEL/REPAIR; troops clamp on transport loss (rearm required to refill); FleetPanel shows hull, strengths, composition + every control with cost AND resulting strength, disabled with reason when unaffordable/unavailable; 153 tests |
| C7 | Automatic combat | B | ✅ | `COMBAT` table (stance multipliers, variance 0.9–1.1, ground defense, hull damage, garrison fraction); `engine/combat.ts`: effective-strength orbital exchange (orbit won iff A'>D'), loss fraction = D'/(A'+D') × stance.taken, deterministic class-wise ship losses (largest fractional remainder, interceptor-first ties), troops lost with their transports, hull × (1−0.5×frac), invasion only with surviving transports vs garrison+bastion+dev (lands iff I≥G), cautious 25% post-orbit withdrawal; `ATTACK` on the time ledger (exactly 1 year, won or lost); BattleReport stored on state + 100%-factual modal (result, strengths, per-class losses, casualties, hull, defense after, captured-or-held); travel dialog gains the core §6 outcome estimate (favorable/even/unfavorable/unknown); stance picker with documented multipliers in tooltips; 1,000 battles × 3 stances statistical bands + all gate tests; 176 tests |
| C8 | Conquest, occupation, rivals v1, win/lose | B | ✅ | Gate M1. `OCC`+`RIVAL` tables in balance.ts; `engine/occupation.ts` (garrisoned→stability+10 & integration ∝ stability; under-garrisoned→stability−20 & no integration; stability 0→rebellion to previous owner/unclaimed; integration 100→'integrated' final; homeworld starts integrated); `engine/rivals.ts` v1 (one action/rival/year: expand into adjacent unclaimed/independent when defense ≥ 1.5× target, else reinforce weakest toward 4+2·dev; never touches player or rival worlds; all expansions logged); `engine/victory.ts` (victory = all surviving inhabited worlds owned AND ≥ 60% integrated incl. homeworld; defeat order = total wipe → no ships+no shipyard (no recovery) → deadline > 120; victory evaluated before the deadline); VictoryDefeatScreen with factual stats; PlanetPanel occupation readout (integration/garrison vs recommended/stability); defense-0 worlds are conquerable (gate now blocks only uninhabited stars); `tests/campaign-sim.ts` cruise profile (TRAVEL+ATTACK + mechanical shipyard upkeep only) wins the fixture — Tier-0 floor proven (PLAN P2); `totalShips` moved to fleets.ts; 200 tests |
| C9 | Specializations & development | C | ✅ | `DEV` table in balance.ts (cap 5; transparent per-level costs 20/40/60/80c + 10/20/30/40m); `engine/economy.ts`: development stage (core §4 step 2) auto-advances player worlds one level/year, canonical order, after income, blocked when short (no negatives), capped at 5; `SPECIALIZE` action — free, instant (0 ticks, off-ledger, no RNG), player worlds only, changes next-year income per the table; PlanetPanel: one-click spec picker (production preview + implemented-only notes in tooltips) + transparent "auto development" cost row; map spec badges (i/m/e/f/b); **deferred to C11/C34** (not advertised in UI): industrial build discount + fortress defense bonus from the PLAN §8 "special" column; cruise profile re-verified: fixture win now at tick 42 (7/7 battles) — Tier-0 floor intact; 209 tests |
| C10 | Occupation depth | C | ⬜ | |
| C11 | Rivals v2 + rival fleets | C | ⬜ | |
| C12 | Balance pass + campaign simulator | C | ⬜ | Gate M2 |
| C13 | Support fleets: creation & state machine | D | ⬜ | |
| C14 | Support missions | D | ⬜ | Gate M3 |
| C15 | Supernova instability pipeline | E | ⬜ | |
| C16 | Evacuation & detonation | E | ⬜ | Gate M4 |
| C17 | Title screen & new-game setup | F | ⬜ | |
| C18 | Thematic skin pass | F | ⬜ | Gate SPEC #2 |
| C19 | Dialogue variety engine + M.O.R.T. | G | ⬜ | Gate SPEC #3; funny pass #1 |
| C20 | Tutorial engine | H | ⬜ | |
| C21 | Tutorial scenario | H | ⬜ | |
| C22 | The ten lessons | H | ⬜ | |
| C23 | Tutorial QA + enable | H | ⬜ | Gate SPEC #4 |
| C24 | Hint engine + Solicit Unwanted Advice | I | ⬜ | Gate SPEC #5 |
| C25 | B.I.N.G.O. complete | J | ⬜ | |
| C26 | Handbook advisor complete | J | ⬜ | Gate SPEC #6; funny pass #2 |
| C27 | World personality data | K | ⬜ | |
| C28 | Post-conquest quirk decisions | K | ⬜ | |
| C29 | Narrative events | K | ⬜ | Gate SPEC #7 |
| C30 | The Mostly Reliable Galactic Handbook | L | ⬜ | Gate SPEC #8 |
| C31 | Map visual personality | L | ⬜ | |
| C32 | Combat presentation | L | ⬜ | |
| C33 | Catastrophe & final UX | L | ⬜ | Gate M5 |
| C34 | Balance refinement + dialogue variety final pass | M | ⬜ | Gate SPEC #10; funny pass #3 |
| C35 | Save polish | M | ⬜ | |
| C36 | Deployment & family integration | M | ⬜ | Gate M6 |

## Open decisions (PLAN §18) — all resolved 2026-10-25

- [x] Core spec version: **v2.0 is canonical** (confirmed).
- [x] Deployment: **subdirectory `mgonzalvez.github.io/empire-apparently`** (confirmed; repo `mgonzalvez/empire-apparently`).
- [x] Mandate **120 years** / victory integration **60%** defaults accepted (tunable later in `balance.ts`).
