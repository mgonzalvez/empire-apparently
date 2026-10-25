# Implementation Status — Empire, Apparently

Last updated: 2026-10-25 — **Planning complete, implementation not started.**
Next chunk: **C1** (Toolchain & app skeleton).

Rules of this file: updated at the end of every chunk (quality gate, AGENTS.md).
"Done" means the chunk's acceptance criteria passed and are committed.

## Gates

| Gate | Meets | Status |
|---|---|---|
| M1 — Playable conquest loop | Core §17.M1 | ⬜ |
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
| C1 | Toolchain & app skeleton | A | ⬜ | |
| C2 | Seeded galaxy generation | A | ⬜ | |
| C3 | Engine core + UI shell | B | ⬜ | |
| C4 | Travel, fuel, range | B | ⬜ | |
| C5 | Economy base | B | ⬜ | |
| C6 | Flagship & construction | B | ⬜ | |
| C7 | Automatic combat | B | ⬜ | |
| C8 | Conquest, occupation, rivals v1, win/lose | B | ⬜ | Gate M1 |
| C9 | Specializations & development | C | ⬜ | |
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

## Open decisions (PLAN §18)

- [ ] Core spec version: v2.0 (provided) treated as canonical — confirm.
- [ ] Deployment: subdirectory (default) vs subdomain.
- [ ] Mandate 120 years / victory integration 60% defaults — confirm or tune.
