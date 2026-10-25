# EMPIRE, APPARENTLY
## Creative Direction and Interactive Tutorial Specification — Version 4.0

### Project identity

**Title:** Empire, Apparently

**Tagline:** You appear to be in charge. This has surprised everyone.

**Genre:** Single-player, humorous galactic conquest and exploration strategy game.

**Format:** Static, client-side browser game for GitHub Pages.

**Core experience:** Explore a strange galaxy, build and command a flagship, conquer eccentric civilizations, automate the boring parts of empire management, and survive the consequences.

Use the existing Galactic Dominion specification (see `SPEC-CORE.md`) for core simulation and technology requirements. This document takes precedence for thematic identity, humor, dialogue, advisors, tutorials, and narrative presentation.

## 1. Narrative foundation

The previous Supreme Administrator has disappeared.

Through a procedural accident, the player has been appointed head of the Office of Provisional Imperial Coordination.

The player's official task is to achieve Universal Administrative Alignment, an impressive phrase meaning that every remaining inhabited world must recognize the player's authority.

The galaxy is populated by peculiar civilizations, inept institutions, misplaced bureaucrats, optimistic defense contractors, and creatures who have developed rather elaborate philosophical objections to being conquered.

The game is satirical but not cynical about the player.

The player should feel clever for succeeding in a universe that is fundamentally ridiculous.

## 2. Narrative voice

Aim for:

- Understated, dry humor.
- Cosmic absurdity.
- Satirical institutions and governmental procedures.
- Occasionally profound observations about insignificant matters.
- Straight-faced descriptions of impossible situations.
- Warm eccentricity beneath the sarcasm.

Avoid:

- Reproducing recognizable copyrighted characters, dialogue, or fictional corporate branding.
- Imitating individual authors' exact prose.
- Excessive fourth-wall breaking.
- Internet memes.
- Mean-spirited jokes at the player's expense.
- Constant forced humor.
- Lengthy monologues that slow down gameplay.

Prefer short, exceptionally well-written observations over large volumes of generic jokes.

## 3. Three selectable advisors

Implement these advisors as original game characters:

**M.O.R.T.**
A profoundly pessimistic but competent robot.

**B.I.N.G.O.**
An impossibly cheerful governmental customer-service system.

**The Mostly Reliable Galactic Handbook**
A pompous, witty, encyclopedia-like advisory computer.

Each advisor provides different dialogue for the same semantic game events.

Their selection must not affect mechanics, random outcomes, or difficulty.

Include distinct portrait illustrations, interface accents, and dialogue presentation for each.

Allow switching advisors from the main interface.

## 4. Dialogue architecture

Create a data-driven dialogue system.

Each dialogue entry should contain:

- Unique identifier
- Event trigger
- Advisor identifier
- Eligibility conditions
- Dialogue text
- Optional variables
- Priority
- Cooldown
- Display frequency limit

Separate dialogue generation from game rules.

For example, a combat victory event might contain:

```ts
{
  type: "combat.victory",
  planetName: "Form 27-B",
  losses: 2,
  captured: true
}
```

All three advisors receive the same event and produce different commentary.

Keep the factual battle report independent of humorous narration.

Add at least five dialogue variants per advisor for commonly repeated events, after the basic system works.

Prevent repetition by tracking recently displayed dialogue IDs.

Do not require live LLM inference or external APIs.

## 5. Interactive tutorial chapter

**Title: Chapter One — An Administrative Misunderstanding**

Build a real playable tutorial, not a slideshow.

Target length: 6–8 minutes.

Create a deterministic tutorial scenario with a small set of nearby systems.

The tutorial must teach:

1. Selection and inspection of the homeworld.
2. Galaxy map navigation.
3. Fleet travel and confirmation.
4. Reconnaissance.
5. Fleet reinforcement.
6. Automatic combat.
7. Conquest and planetary integration.
8. Support fleet delegation.
9. Stellar anomaly warnings.
10. The campaign objective and optional hints.

Each tutorial step requires:

- A short advisor introduction.
- One clearly stated objective.
- Highlighted controls.
- A verifiable success condition.
- A short completion response.
- Safe skip and resume behavior.

Do not advance a tutorial step simply because the player clicked the suggested control.

Advance only when the authoritative game state confirms the intended outcome.

Do not trap the player if they take a different valid action.

Provide recovery guidance when an expected tutorial action cannot be completed.

The tutorial should transition into a normal campaign without discarding the player's accomplishments.

### Tutorial scenario safeguards

Ensure the scripted tutorial is winnable.

Provide enough Credits, ships, travel range, and transports for the introduction.

Do not allow rival attacks or supernovas to make the tutorial impossible.

The stellar anomaly lesson should be scripted and safe, demonstrating the warning system without destroying a valuable starting planet.

Support fleet instruction must provide an operational support fleet. If the normal game unlocks support fleets later, grant one as a temporary tutorial resource and explain how it is obtained during regular play.

Tutorial milestones should survive save/load.

## 6. Hint system

Implement a contextual hint engine driven by actual game state.

Examples:

- No invasion transports available.
- Selected destination outside travel range.
- Insufficient Credits for an intended purchase.
- Flagship at a disadvantage against known defenders.
- Occupied planet at risk of rebellion.
- Support fleet idle.
- Star approaching critical instability.
- Attractive nearby expansion target.

Each hint includes:

- Factual advice.
- Advisor-specific commentary.
- Optional action or relevant panel.
- Priority and cooldown.

High-priority warnings must never be hidden by optional joke-frequency settings.

Provide Off, Occasional, Normal, and Frequent hint settings.

Provide a permanent button labeled **Solicit Unwanted Advice**.

This button must provide useful, context-sensitive guidance when possible, not simply select a random joke.

## 7. The Mostly Reliable Galactic Handbook

Implement a searchable in-game reference guide.

Entries should be structured as:

- Topic
- Humorous introduction
- Accurate gameplay explanation
- Optional footnote
- Unlock condition

The Handbook should explain genuine mechanics clearly.

Example:

**Planetary Integration**

"Integration is the process by which a recently conquered civilization discovers that its new rulers intend to remain."

Gameplay explanation:
"Occupied worlds gradually become integrated. Stable worlds integrate faster, while insufficient defenses can cause rebellion."

Include entries for exploration, economy, fleets, combat, support missions, conquest, occupation, rivals, and supernovas.

## 8. Procedural world personality

Create a curated library of planetary cultures, government styles, quirks, and descriptions.

Avoid generating every planet from unrelated random words.

Use compatible thematic combinations.

Every quirk should have exactly one primary transparent mechanical effect.

Examples include:

- Excessive Paperwork
- Compulsory Optimism
- Dubious Cartography
- Sacred Office Furniture
- Chronic Committee Formation
- Unnecessarily Heroic Architecture

Keep mechanics lightweight.

A planet should require no more than one optional strategic management decision after conquest.

## 9. Narrative event design

Events should be:

- Brief.
- Funny.
- Mechanically clear.
- Connected to current game state.
- Usually resolved with no more than two choices.

Include an immediate and readable consequences preview.

Avoid events that repeatedly interrupt travel or overwhelm the player.

Event text must never conceal a catastrophic consequence behind a joke.

Store event selection and outcomes in deterministic simulation state.

## 10. Opening presentation

The title screen should display:

EMPIRE, APPARENTLY

"You appear to be in charge. This has surprised everyone."

Main actions:

- New Administrative Disaster (new game)
- Resume Previous Mistake (continue)
- Instructional Misfortune (tutorial)
- Options
- The Mostly Reliable Galactic Handbook

Use conventional labels as tooltips or accessibility text so humorous wording remains understandable.

During new-game setup, offer advisor selection and tutorial enable/disable.

Do not introduce unnecessary setup screens.

## 11. Quality bar

Evaluate the personality system using these questions:

- Is the writing actually funny, or merely random?
- Does each advisor have a consistent identity?
- Can every joke be understood without outside references?
- Is the game state always clear?
- Does the tutorial teach through actual play?
- Do planetary quirks create memorable places?
- Are popups rare enough to remain enjoyable?
- Does humor reinforce rather than delay the next strategic decision?

If a joke conflicts with gameplay clarity, gameplay clarity wins.

If a new mechanic adds more administration than meaningful decisions, simplify or remove it.

## 12. Implementation priority

Build and verify in this order:

1. Functional strategic game loop.
2. New title screen and thematic identity.
3. One complete advisor: M.O.R.T.
4. Scripted interactive tutorial.
5. Contextual hint engine.
6. Remaining two advisors.
7. Planet quirks and narrative events.
8. Galactic Handbook.
9. Visual personality and animation.
10. Dialogue variety and balance refinement.

Preserve playable builds at every stage.

Do not attempt to implement all dialogue and tutorial content before core mechanics are functional.

## Final directive

Empire, Apparently must be a genuinely entertaining strategy game with a distinctive comic universe, not a conventional empire simulator decorated with jokes.

Make conquering worlds enjoyable, make exploration surprising, make advisors memorable, and make management almost effortless.

The player should finish a session thinking about the absurd civilization they encountered and the unfortunate planetary catastrophe they narrowly escaped—not the five production sliders they spent the evening adjusting.
