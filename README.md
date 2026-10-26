# Empire, Apparently

> You appear to be in charge. This has surprised everyone.

Single-player, humorous galactic conquest and exploration strategy game.
Explore a strange galaxy, command a flagship, conquer eccentric civilizations,
automate the boring parts, and survive the consequences.

Static client-side browser game for GitHub Pages.

## Status

**Phases A–F complete (C1–C18) — playable end to end, with a front door.**
From the title screen you start a campaign (seed, advisor, supernova
frequency), then explore a seeded 20-system galaxy, travel, build, fight,
conquer, and integrate worlds, delegate to support fleets, and evacuate
before supernovas — winning the mandate (or losing it: wipe, no recovery
path, or the 150-year deadline). Progress autosaves; the title screen
resumes it exactly. Next: C19 (dialogue variety engine + M.O.R.T. — the
advisor finally speaks). Live status: `IMPLEMENTATION_STATUS.md`.

## Reading order

1. `SPEC.md` — creative direction (theme, humor, advisors, tutorial). Source of truth for personality.
2. `SPEC-CORE.md` — Galactic Dominion core spec (simulation rules, tech requirements). Source of truth for mechanics.
3. `PLAN.md` — integrated plan: decisions, architecture, determinism/save contracts, complexity ladder, dialogue variety engine, QA strategy.
4. `CHUNKS.md` — the 36 implementation units in dependency order. Work happens here.
5. `IMPLEMENTATION_STATUS.md` — what's done, what's next.
6. `AGENTS.md` — repo conventions for agents.

## Design in one paragraph

A turn-based (galactic-year ticks, advanced by actions) 20-system conquest
game with a small fixed mechanical core (3 resources, 3 ship classes,
automatic combat, occupation/integration, support fleets, supernovas) and a
large personality layer (3 advisors with data-driven dialogue, planetary
quirks, narrative events, an in-game Handbook, an interactive tutorial, a
hint engine). The game is winnable at the "cruise" tier — travel, attack,
wait — with optional, never-required depth on top. All balance numbers live in
`src/data/balance.ts`. All simulation is deterministic and headless-testable.

## Run

```bash
npm install
npm run dev        # Vite dev server — use this, not file://
npx vitest run     # simulation tests
npx tsc --noEmit   # type check
npm run build      # production build
```

`python3 -m http.server` in `dist/` works for a quick static check, but the dev
server is the right tool while developing.

## Deployment (planned, C36)

Default: `https://mgonzalvez.github.io/empire-apparently/` via GitHub Actions
(build → deploy to user-site subpath). Alternative: `empire.gonzhome.us`
subdomain. See PLAN §17.
