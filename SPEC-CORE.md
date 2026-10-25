# GALACTIC DOMINION
## Complete Game Development Specification — Version 2.0

### Your role

You are a senior indie game developer, TypeScript engineer, and experienced strategy game designer.

Your assignment is to build **Galactic Dominion**, a complete, polished, single-player, browser-based galactic conquest game.

The game is loosely inspired by the classic Macintosh *Galactic Empire* (1994), but is NOT intended as a faithful remake.

The goal is to create a modern, streamlined strategy game emphasizing exploration, fleet management, planetary conquest, autonomous empire development, and occasional spectacular galactic disasters.

**Your primary obligation is to deliver a working game, not a collection of disconnected components or a visual mockup.**

---

# 1. Game vision

## Elevator pitch

Command a growing galactic empire from your flagship. Explore distant systems, conquer rival worlds, automate your expanding civilization, and survive stellar catastrophes as you bring the galaxy under one banner.

## Design pillars

**1. Conquest first**

The main source of enjoyment is exploring, preparing fleets, making tactical-strategic decisions, and conquering new worlds.

**2. Automation instead of micromanagement**

The player is an admiral and ruler, not an accountant. Planets develop themselves; support fleets perform assigned missions.

**3. Meaningful decisions**

Every expedition should involve interesting choices about risk, distance, timing, fleet strength, and strategic targets.

**4. Fast, satisfying gameplay**

The game must be easy to understand and playable without long waiting periods, dozens of menus, or extensive tutorials.

**5. Spectacular but fair events**

Supernovas, rebellions, and enemy attacks should create memorable situations with meaningful player responses.

**6. Visual clarity**

Create a beautiful, colorful, illustrated galactic map with excellent readability and immediate feedback.

## Target experience

- Single player, against AI-controlled opponents.
- Approximately 45–60 minutes per normal campaign.
- 20 star systems by default.
- Light-to-medium strategic complexity.
- Fully turn-based in effect, with time advancing through actions.
- Fast automatic combat.
- Accessible to players who enjoy streamlined 4X strategy games.

---

# 2. Technical requirements

Use:

- Vite
- React
- TypeScript
- SVG or HTML5 Canvas for the galaxy map
- CSS for responsive design and animation
- LocalStorage for autosaves
- JSON import/export for portable save files
- Vitest for simulation tests

The application must:

- Run entirely in the browser.
- Be deployable to GitHub Pages.
- Require no backend, database, login, or server-side processing.
- Work offline after its assets have loaded.
- Use local fonts, generated graphics, or appropriately licensed assets.
- Contain no runtime AI calls.
- Load correctly from a GitHub Pages repository subdirectory.
- Remain responsive on desktop and tablet.

Use only necessary dependencies.

Separate simulation logic from React UI components.

All player actions must modify authoritative game state through a small, consistent engine API.

---

# 3. Galaxy generation

Generate a procedurally arranged galaxy with 20 star systems.

Use a seeded random number generator so starting conditions can be reproduced.

Each star system has:

- Unique ID
- Name
- Map coordinates
- Star classification
- Planet illustration type
- Planet specialization
- Development level
- Resource output
- Military defense strength
- Population
- Political affiliation
- Intelligence visibility
- Stellar instability
- Active events

## Planet ownership states

- Unexplored
- Independent
- Rival-controlled
- Occupied
- Integrated
- Destroyed

These can be implemented as ownership and visibility fields rather than mutually exclusive states where appropriate.

## Starting conditions

The player begins with:

- One secure homeworld.
- A modest flagship fleet.
- Basic information about nearby systems.
- Sufficient starting resources to make meaningful decisions.
- At least two viable early expansion targets.

The homeworld must not be destroyed by a random supernova during the opening phase.

Generate fair starting positions, not arbitrary unwinnable scenarios.

## Enemy civilizations

Include two or three simple rival factions in the normal game.

Rivals expand opportunistically, defend their territory, and occasionally challenge the player.

Use simple deterministic strategic rules rather than elaborate artificial intelligence.

Independent systems may contain neutral defenses without belonging to an expanding faction.

A player must be able to finish the game even if rivals conquer neutral worlds first.

---

# 4. Time and action system

Time advances through player actions and fleet movement, not through real-time simulation.

Use discrete galactic-year ticks internally.

Examples of actions that advance time:

- Traveling between systems
- Waiting
- Repairing or refitting a fleet
- Major planetary actions

Simple UI interactions must not advance time.

When an action advances time, simulate every elapsed year in sequence.

During each year:

1. Produce planetary resources.
2. Progress automatic development.
3. Advance occupation stability.
4. Process fleet missions and arrivals.
5. Process rival faction decisions.
6. Advance stellar instability and events.
7. Evaluate victory and defeat.

**All simulation systems must use the same galactic clock.**

Avoid action exploits where repeatedly opening panels, changing settings, or selecting destinations advances production without an appropriate cost.

Use deterministic event ordering and seeded randomness.

---

# 5. Streamlined economy

Replace the original game's five economic sectors with three global empire resources:

### Credits

Used for fleet construction, repairs, maintenance, and major development.

### Materials

Used for constructing ships, reinforcing defenses, and infrastructure.

### Fuel

Consumed by long-distance fleet movement.

## Planet development

Planets produce resources automatically.

The game selects an initial specialization based on planetary characteristics.

Available specializations:

- Industrial — stronger ship construction and materials production
- Mining — stronger fuel and materials production
- Economic — increased credits
- Fortress — improved defenses and fleet support
- Balanced — moderate production across multiple categories

The player may change a specialization with one click.

No worker assignment system.

No production percentage sliders.

No complex building tree.

Planetary development progresses automatically as game time advances, with capped development levels and transparent costs.

Use a small set of well-documented economy formulas.

All balance variables must be centralized in `src/data/balance.ts`.

## Economic interface

Show the player:

- Total resources
- Income per galactic year
- Fleet construction costs
- Travel costs
- Overall empire strength

Avoid requiring the player to inspect each planet every turn.

---

# 6. The flagship fleet

The player commands one primary expeditionary fleet.

The flagship is the main instrument of exploration and conquest.

Use three military ship classes:

### Interceptors

Inexpensive military ships that are useful against enemy fleets.

### Cruisers

Expensive, powerful ships that provide the main combat strength.

### Transports

Carry invasion forces to capture planets.

Simplify logistics by treating fuel as a global resource pool with travel costs based on fleet size and distance.

Do not require players to manually load supply ships.

## Fleet statistics

A fleet has:

- Ship quantities by class
- Combat strength
- Invasion strength
- Hull condition
- Fuel requirement
- Current location
- Travel status
- Current orders

## Travel

Select a destination from the galaxy map.

Before confirming, display:

- Travel distance
- Time required
- Fuel cost
- Known defenders
- Estimated combat outcome, if applicable

Travel advances galactic time.

The flagship cannot travel beyond its operational range.

Use a clear maximum jump-range rule, with no hidden teleportation or arbitrary movement restrictions.

## Fleet construction

Players may reinforce the flagship at controlled shipyard systems.

Provide simple controls:

- Add interceptors
- Add cruisers
- Add transports
- Repair ships
- Refill invasion personnel

Show costs and resulting fleet strength immediately.

Shipbuilding should be a quick decision, not a prolonged queue-management task.

---

# 7. Support fleets

As the empire expands, unlock up to three autonomous support fleets.

Support fleets use actual ships and resources.

They cannot be created for free.

They operate through simple assigned missions.

## Missions

**Scout**

Explore unexplored systems within an assigned region.

**Patrol**

Protect controlled systems and intercept weak hostile forces.

**Reinforce**

Transport occupation troops to systems requiring additional security.

**Defend**

Remain stationed at an important world and assist its defenses.

## Support fleet behavior

- Execute assigned missions automatically as time advances.
- Respect normal travel range and fuel consumption.
- Never invade independent or enemy-controlled planets without explicit player orders.
- Avoid clearly suicidal engagements.
- Return to a safe system when critically damaged, where possible.
- Report significant events through the event log.
- Remain idle when an assignment cannot be completed rather than silently violating game rules.

Support fleets must be simple state machines, NOT autonomous LLM agents.

Examples of fleet states:

- Idle
- Traveling
- Scouting
- Patrolling
- Reinforcing
- Defending
- Returning

Support fleet missions should resolve using the same rules as player-controlled fleets.

---

# 8. Combat

Combat is automatic.

There is no tactical battle screen and no manual movement of individual ships.

## Combat phases

**Phase 1: Orbital battle**

Attacking and defending warships engage.

Resolve losses based on:

- Ship classes
- Relative combat strength
- Defensive bonuses
- Technology or development modifiers
- Seeded randomness

**Phase 2: Planetary invasion**

If the attacker gains orbital superiority and has transports, ground troops attempt to capture the planet.

Ground combat depends on:

- Invasion forces
- Defender strength
- Planetary fortifications
- Combat stance
- Randomness

## Combat stance

Before initiating an attack, the player selects:

- Aggressive — greater offensive power, greater expected casualties.
- Balanced — standard combat.
- Cautious — reduced losses, lower offensive effectiveness, and greater chance of withdrawal.

Combat stances must have documented numerical effects.

Do not represent stances as cosmetic labels.

## Battle presentation

Display a short optional animated sequence with:

- Fleet silhouettes
- Weapon fire
- Shields or explosions
- Battle outcome

Allow immediate skipping.

After combat, display:

- Victory or defeat
- Initial fleet strengths
- Destroyed ships
- Surviving ships
- Invasion casualties
- Planet captured or defended

Include a short narrative summary.

A player should understand why they won or lost.

Avoid long dice-by-dice combat reports.

---

# 9. Occupation and integration

Captured planets do not immediately become productive empire members.

After a successful invasion, the planet enters Occupied status.

The system tracks:

- Remaining garrison
- Resistance
- Stability
- Integration progress

Assign an automatic recommended garrison after conquest, provided enough invasion troops survive.

Support fleets can reinforce vulnerable occupations.

Integration progresses automatically as time advances.

Higher stability produces faster integration.

Insufficient garrisons may cause rebellion.

If a rebellion succeeds, the system becomes independent or reverts to its previous faction.

## Player interaction

Occupation requires minimal management.

The UI shows:

- Stable / Unstable / Rebellion Imminent
- Estimated integration time
- Current garrison
- Reinforce action

Do not introduce a complex social policy or population management system.

---

# 10. Supernova events

Implement rare but dramatic stellar catastrophes.

This is a distinctive feature of Galactic Dominion.

## Stellar stability states

- Stable
- Anomalous
- Critical
- Supernova
- Destroyed

Most stars remain stable throughout a campaign.

A small number may become unstable.

## Warning behavior

When a system becomes Anomalous:

- Display an alert.
- Show the system on the galaxy map.
- Allow scouting to improve the risk assessment.

When a system becomes Critical:

- Provide a stronger warning.
- Display an approximate remaining time window.
- Offer evacuation opportunities.

Warnings should generally provide enough time to act, but not guarantee total safety.

Avoid false precision when the exact explosion time remains uncertain.

## Explosion

When a supernova occurs:

- The planet is destroyed.
- Local military forces are destroyed.
- Production is permanently lost.
- Population remaining on the planet is lost.
- A brief animated stellar explosion appears.
- The system becomes a non-colonizable stellar remnant.
- An event report describes the consequences.

## Evacuation

At a threatened controlled system, the player may order evacuation.

Evacuation:

- Takes time.
- Consumes resources.
- Can preserve part of the population.
- Can withdraw stationed fleets.
- Does not guarantee full recovery of resources or infrastructure.

Make evacuation strategically worthwhile without creating a complicated transport minigame.

## Balance and fairness

- Make supernovas rare.
- Do not allow unavoidable early homeworld destruction.
- Prefer warnings over pure surprise.
- Do not place required victory objectives permanently behind destroyed systems.
- Destroyed systems must be excluded from conquest-victory requirements.
- Permit zero, low, and normal supernova frequency settings.

The default campaign uses low frequency.

---

# 11. Rival factions

Use a lightweight opponent system.

Rivals may:

- Expand into adjacent independent systems.
- Build limited fleets.
- Reinforce their worlds.
- Attack poorly defended neighboring systems.
- Respond to nearby player threats.

Do not build sophisticated diplomacy, trade, espionage negotiations, or political relationship systems.

Rivals should give the player a reason to expand decisively.

## AI behavior

Use a small rule-based decision process.

Each rival faction evaluates opportunities based on:

- Relative military strength
- Distance
- Target value
- Defensive vulnerability
- Current resources

Limit faction actions per simulation tick.

Provide difficulty-dependent behavior and starting bonuses, not hidden arbitrary cheating.

---

# 12. Victory and defeat

## Victory

The player wins when all surviving inhabitable systems are under player control and sufficiently integrated.

Destroyed systems are excluded.

If rival homeworlds are destroyed by stellar events, the remaining galaxy must still permit a valid victory.

## Defeat

The player loses when:

- The homeworld and all recoverable player territories are lost.
- The campaign deadline expires.
- The player has no remaining path to recovery under the defined rules.

Do not declare defeat simply because the flagship is destroyed if the empire can afford to rebuild it.

Provide a clear victory/defeat screen with:

- Campaign duration
- Systems conquered
- Fleets lost
- Battles won
- Supernovas survived
- Final empire score

---

# 13. Visual presentation

Create a vibrant, colorful, illustrated modern 2D sci-fi aesthetic.

The game should resemble a small polished indie strategy title rather than a corporate dashboard.

## Galactic map

Feature:

- Colorful star systems
- Distinct star classifications
- Nebula backgrounds
- Subtle parallax or particle movement
- Planet icons or illustrations
- Clearly indicated ownership
- Animated fleet travel routes
- Strong selected-system highlights
- Supernova warning indicators
- Destroyed star remnants

Use Canvas or SVG to keep performance predictable.

Generated gradients, procedural shapes, and original SVG illustrations are acceptable.

Do not require external art-generation APIs.

## Interface

Desktop layout:

- Top bar: empire resources and date
- Main area: interactive galaxy map
- Right panel: selected planet, intelligence, and available actions
- Fleet controls: compact overlay or panel
- Event log: collapsible bottom section

The galaxy map should occupy the largest portion of the interface.

Use clear icons, restrained gradients, modern typography, and readable color contrast.

### Visual priorities

1. Readable galaxy map.
2. Attractive planetary illustrations.
3. Excellent fleet movement feedback.
4. Clear combat reports.
5. Memorable stellar catastrophe animation.

Avoid elaborate real-time 3D rendering.

---

# 14. User experience

Players must be able to:

- Start a game with one click.
- Understand the starting objective immediately.
- Select a star.
- Inspect its properties.
- Choose a destination.
- Review travel costs.
- Confirm movement.
- Attack or explore.
- Review the outcome.
- Continue expanding.

Provide contextual guidance during the first campaign.

Avoid intrusive tutorials.

Important actions must offer helpful explanations.

Include tooltips for:

- Fleet strength
- Range
- Occupation stability
- Resource production
- Supernova warnings

Never require the player to memorize undocumented mechanics.

---

# 15. Saving

Autosave after major player actions.

Implement:

- Resume game
- New game
- Export save to JSON
- Import save from JSON
- Restart current seed

Save all state needed for deterministic restoration, including the random generator state, active fleet missions, pending events, and economy.

Validate loaded files.

Use a versioned save format.

---

# 16. Suggested file structure

```text
galactic-dominion/
├── src/
│   ├── engine/
│   │   ├── galaxy.ts
│   │   ├── simulation.ts
│   │   ├── economy.ts
│   │   ├── movement.ts
│   │   ├── fleets.ts
│   │   ├── supportAI.ts
│   │   ├── combat.ts
│   │   ├── occupation.ts
│   │   ├── rivals.ts
│   │   ├── supernova.ts
│   │   ├── victory.ts
│   │   └── random.ts
│   ├── components/
│   │   ├── GalaxyMap.tsx
│   │   ├── StarSystem.tsx
│   │   ├── PlanetPanel.tsx
│   │   ├── FleetPanel.tsx
│   │   ├── BattleReport.tsx
│   │   ├── EventLog.tsx
│   │   ├── EmpireBar.tsx
│   │   └── SupernovaEvent.tsx
│   ├── state/
│   │   ├── gameStore.ts
│   │   └── persistence.ts
│   ├── data/
│   │   ├── balance.ts
│   │   └── names.ts
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── public/
├── tests/
├── .github/workflows/
├── GAME_DESIGN.md
├── README.md
├── IMPLEMENTATION_STATUS.md
├── package.json
└── vite.config.ts
```

---

# 17. Implementation milestones

Do not implement every feature simultaneously.

## Milestone 1 — Playable conquest loop

Implement:

- Working application
- Seeded galaxy
- Interactive star map
- Player homeworld
- Flagship fleet
- Travel
- Basic resources
- Automatic combat
- Planet capture
- Simple rival defenses
- Basic victory condition

**Acceptance:** A player can start a game, move between systems, attack, conquer planets, and win a small test galaxy.

Do not begin Milestone 2 until the foundation builds and runs correctly.

## Milestone 2 — Empire simulation

Implement:

- Automated planetary economy
- Fleet reinforcement
- Planet specializations
- Occupation and integration
- Time advancement
- Rival expansion
- Game balance

**Acceptance:** A complete 20-system campaign can be played without manual resource allocation.

## Milestone 3 — Automated support

Implement:

- Support fleet construction
- Mission assignment
- Scout behavior
- Patrol behavior
- Reinforcement behavior
- Support fleet status reporting

**Acceptance:** Support fleets execute missions as time advances without constant player commands and without bypassing resource costs or movement rules.

## Milestone 4 — Stellar catastrophes

Implement:

- Star instability
- Anomaly warnings
- Critical warnings
- Evacuation
- Supernova animation
- Permanent system destruction
- Victory-condition adjustments

**Acceptance:** A warned supernova can occur without corrupting the game or creating an impossible victory condition.

## Milestone 5 — Visual polish

Implement:

- Illustrated planet types
- Richer galaxy visuals
- Fleet travel animations
- Combat reports
- Improved UI transitions
- Tooltips
- Audio, if practical, with mute option
- Save/load
- Campaign statistics

**Acceptance:** The experience is polished, understandable, responsive, and playable without consulting technical documentation.

## Milestone 6 — Deployment

Implement:

- Production build
- Automated tests
- GitHub Pages configuration
- GitHub Actions deployment
- Documentation
- Final manual gameplay checks

**Acceptance:** The production game runs correctly from a GitHub Pages repository URL.

---

# 18. Quality and balance requirements

Create automated tests for:

- Deterministic galaxy generation
- Resource production
- Fleet movement costs
- Fleet range limits
- Fleet construction costs
- Combat casualty calculations
- Ship survival and repair
- Ground invasion resolution
- Occupation progress
- Rebellions
- Support fleet mission behavior
- Rival expansion
- Supernova timing and destruction
- Evacuation outcomes
- Victory/defeat rules
- Save file restoration

Create a simple automated campaign simulator that can execute complete games using a basic rule-based player.

Use it to identify:

- Unwinnable starts
- Excessively long games
- Resource shortages
- Rival runaway expansion
- Infinite loops
- Exploitable economic behavior
- Supernova-related dead ends

The simulation should use the same game engine as the UI.

Tune balance values in one central configuration file.

Do not optimize for a specific win rate until basic gameplay has been validated.

---

# 19. Development constraints

Important:

- No backend.
- No multiplayer.
- No online accounts.
- No real-time tactical combat.
- No enormous technology tree.
- No complicated diplomacy.
- No detailed ship designer.
- No manual planetary labor allocation.
- No unnecessarily large dependency stack.
- No unfinished placeholder controls advertised as working.

Do not invent complicated mechanics merely to increase feature count.

Prefer concise, readable implementation.

Favor reliable, testable code over architectural novelty.

---

# 20. Required developer behavior

Before implementation:

1. Examine the current repository.
2. Read relevant reference material if available.
3. Summarize the architecture.
4. Establish an implementation plan.

Then begin building.

After each milestone:

1. Run available tests.
2. Run TypeScript checks.
3. Run the production build.
4. Fix errors.
5. Update `IMPLEMENTATION_STATUS.md`.
6. Commit working changes when Git is configured.
7. Report what actually works and what remains unfinished.

Do not claim a feature is complete unless it has been implemented and verified.

If reference material is unavailable, proceed with this specification and document reasonable assumptions.

## Final instruction

**Begin implementing Milestone 1 immediately.**

Deliver the smallest complete, enjoyable, playable galactic conquest experience first.

Do not attempt to build the entire game in one uninterrupted coding pass.

The defining quality of Galactic Dominion should be that expanding a colorful, living galactic empire is fun, fast, and strategically satisfying, without burying the player in administrative details.
