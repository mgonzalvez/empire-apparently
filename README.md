# Empire, Apparently

> You appear to be in charge. This has surprised everyone.

Single-player, humorous galactic conquest and exploration strategy game.
Explore a strange galaxy, command a flagship, conquer eccentric civilizations,
automate the boring parts, and survive the consequences.

Static client-side browser game for GitHub Pages.

## Status

**Planning complete — implementation not started.** See
`IMPLEMENTATION_STATUS.md` for live chunk status.

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

## Run (once Phase A / C1 lands)

```bash
npm install
npm run dev        # Vite dev server — use this, not file://
npx vitest run     # simulation tests
npx tsc --noEmit   # type check
npm run build      # production build
```

## Deployment (planned, C36)

Default: `https://mgonzalvez.github.io/empire-apparently/` via GitHub Actions
(build → deploy to user-site subpath). Alternative: `empire.gonzhome.us`
subdomain. See PLAN §17.
