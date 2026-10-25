# Empire, Apparently — Agent Guidelines

## Project overview

Humorous galactic conquest strategy game (see `README.md`). Static client-side
React/TypeScript/Vite app for GitHub Pages. **Planning is done; work proceeds
chunk-by-chunk in `CHUNKS.md`.**

## Read before working

1. `SPEC.md` (personality source of truth) and `SPEC-CORE.md` (mechanics source of truth).
2. `PLAN.md` — especially §3 (design principles), §6 (time contract), §7 (determinism/save),
   §9 (complexity ladder + fallback table), §10 (dialogue variety engine).
3. `CHUNKS.md` — do one chunk at a time, in order, deps first.
4. `IMPLEMENTATION_STATUS.md` — current state.

## Architecture

| Path | Role |
|---|---|
| `src/engine/` | **Pure TS simulation.** No React/DOM/storage/clocks. `dispatch(state, action) → {state, effects}`. Single serialized PRNG stream for sim (`rng`), second stream for narrative-only picks (`narrRng`). Fixed per-tick pipeline order (PLAN §6). |
| `src/state/` | Thin React binding (`useSyncExternalStore`) + persistence (autosave, export/import, validation, restart-seed). |
| `src/data/balance.ts` | **The only home for tunable numbers.** Documented, versioned. |
| `src/data/` (rest) | All personality content: advisors + voice guides, dialogue pools, quirks, cultures, events, handbook, hints, tutorial scenario/steps. |
| `src/components/` | React UI. Talks to the store, never the engine directly. |
| `src/audio/sfx.ts` | WebAudio synth SFX, mutable. |
| Map | SVG interactive layer over a canvas nebula/particle background. |
| `tests/` | Vitest: one file per engine subsystem, `campaign-sim` (cruise + engaged profiles), `dialogue-variety` audit, tutorial auto-play, save round-trips, determinism replay. |

## Hard rules

1. **Engine purity.** Nothing in `src/engine` may import React, touch the DOM, read storage, or use wall-clock time. Determinism is a feature, not a nicety.
2. **Complexity ladder.** No chunk may add a *required* manual decision. Every new control ships with its automatic fallback (PLAN §9 table) and stays inside the fixed inventory (3 resources / 3 ship classes / 3 stances / 5 specializations / 4 support missions / ≤ 2 event choices / ≤ 1 quirk decision). No sliders, no tech tree, no diplomacy, no worker allocation.
3. **Decision budget.** The UI may present at most 3 "needs attention" items at once; overflow goes to the log/hints.
4. **Clarity beats jokes.** Factual reports (battle, production, warnings, event previews) are always complete and unambiguous. Narration is a separate layer. Event text never hides a catastrophic consequence behind a joke.
5. **Dialogue is data, separated from rules.** Game rules emit semantic events; advisors pick lines via the variety engine (PLAN §10). Advisor choice must never change simulation state (neutrality test exists — keep it green).
6. **No fake controls.** A button/option appears in the UI only when it works (core spec §19).
7. **Original writing only.** No recognizable copyrighted characters, dialogue, or fictional branding; no imitating individual authors' prose (SPEC §2).
8. **Theme pre-paint script** in `index.html` (persists `empire-apparently-theme`) must never be removed.
9. **One chunk at a time.** Each chunk ends with the quality gate below. Never claim a chunk complete without it passing.

## Quality gate (after every chunk)

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Then: update `IMPLEMENTATION_STATUS.md`, `git add -A && git commit`, report what works and what doesn't.

## Local development

```bash
npm install
npm run dev      # Vite dev server (NOT file://)
```

## Deployment

Planned (C36): GitHub Actions build + deploy to `mgonzalvez.github.io` subpath
(default) or `empire.gonzhome.us` subdomain (alternative). `vite.config.ts`
`base` must match whichever is chosen.
