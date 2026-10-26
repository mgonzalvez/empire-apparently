/**
 * The DialogueLine schema (PLAN §10) + the three advisor pools (C19).
 *
 * Pools: M.O.R.T. complete (~45 lines, first/rotation/late; the six most
 * frequent events carry the deepest pools). B.I.N.G.O. and the Handbook are
 * functional-minimal (15 each) — C25/C26 expand them to full pools against
 * their voice guides. Selection is `engine/dialogue.ts`; the pools are pure
 * data (no functions in the pools except the few declared `eligibility`
 * guards, which are sim-readers only — they never mutate).
 */

import type {
  AdvisorId,
  GameState,
  SimEvent,
  SimEventType,
} from '../../engine/types';

export interface DialogueLine {
  id: string; // "mort.combat.victory.r3"
  event: SimEventType;
  advisor: AdvisorId;
  kind: 'first' | 'rotation' | 'late';
  /** Tick-window eligibility (PLAN §10). */
  stage?: 'early' | 'mid' | 'late';
  /** Extra gating, e.g. losses > 3. Sim-reader only, never mutates. */
  eligibility?: (ev: SimEvent, s: GameState) => boolean;
  /** Supports {planetName} {factionName} {shipsLost} {troopsLost} {years} {population}. */
  text: string;
  /** Documentation of pool role (first > late > rotation); selection uses `kind`. */
  priority: number;
  cooldownTicks: number;
  maxPerCampaign?: number;
}

// ── M.O.R.T. — complete (C19) ───────────────────────────────────────────
// Voice (advisors.ts guide): dry, pessimistic, precise; short sentences;
// quantifies doom; secretly proud; never exclaims, never jokes at the
// player's expense; reports bad news as if filing it.

const MORT: DialogueLine[] = [
  // travel.depart (f 1, r 2, l 1)
  L('mort.travel.depart.f1', 'travel.depart', 'first',
    'The flagship departs. The average voyage ends in exactly one surprise. This one may hit that average.'),
  L('mort.travel.depart.r1', 'travel.depart', 'rotation',
    'Another departure. The galaxy does not send farewell messages. Neither do I.'),
  L('mort.travel.depart.r2', 'travel.depart', 'rotation',
    'Course set, fuel spent. The stars, as always, decline to comment.'),
  L('mort.travel.depart.l1', 'travel.depart', 'late',
    'You still enjoy the departures. The statistics do not.', { maxPerCampaign: 1 }),

  // travel.arrive (f 1, r 2, l 1)
  L('mort.travel.arrive.f1', 'travel.arrive', 'first',
    'Arrival confirmed. The destination is as advertised, which is rarer than it should be.'),
  L('mort.travel.arrive.r1', 'travel.arrive', 'rotation',
    'We are here. The map now knows what we know. We will regret some of it.'),
  L('mort.travel.arrive.r2', 'travel.arrive', 'rotation',
    'Docking complete. The local situation was stable. It usually is, right up until we arrive.'),
  L('mort.travel.arrive.l1', 'travel.arrive', 'late',
    'Another system charted. The inventory of places we have stood is one longer.', { maxPerCampaign: 1 }),

  // combat.victory (f 1, r 2, l 1)
  L('mort.combat.victory.f1', 'combat.victory', 'first',
    'Victory. The word sits poorly on the damage report, but the report is done.'),
  L('mort.combat.victory.r1', 'combat.victory', 'rotation',
    'The orbit is ours. The accounting department thanks you for the paperwork.'),
  L('mort.combat.victory.r2', 'combat.victory', 'rotation',
    'They defended. We arrived in greater number. The argument is over.'),
  L('mort.combat.victory.l1', 'combat.victory', 'late',
    'Victory again. I have recalculated my life expectancy and it has not improved.', { maxPerCampaign: 1 }),

  // planet.captured (f 1, r 2, l 1)
  L('mort.planet.captured.f1', 'planet.captured', 'first',
    'A new world. The annexation form is already printing. The form is two hundred pages. I love it.'),
  L('mort.planet.captured.r1', 'planet.captured', 'rotation',
    'Captured, filed. The empire grows by one and the paperwork grows by ten.'),
  L('mort.planet.captured.r2', 'planet.captured', 'rotation',
    'Another name added to the list of places we are in charge of. The list is my favorite document.'),
  L('mort.planet.captured.l1', 'planet.captured', 'late',
    'You keep capturing worlds. The worlds keep having opinions. Neither side intends to stop.', { maxPerCampaign: 1 }),

  // occupation.unstable (r 2, l 1)
  L('mort.occupation.unstable.r1', 'occupation.unstable', 'rotation',
    'A garrison shortfall at {planetName}. The decline is by design, not by accident.'),
  L('mort.occupation.unstable.r2', 'occupation.unstable', 'rotation',
    '{planetName} is drifting. Drift, left alone, becomes a resignation.'),
  L('mort.occupation.unstable.l1', 'occupation.unstable', 'late',
    'The worlds still rebel. They have had years to learn. They have learned nothing. I approve of their consistency.',
    { maxPerCampaign: 1 }),

  // ship.built (f 1, r 1)
  L('mort.ship.built.f1', 'ship.built', 'first',
    'New hulls. The dockyard works because money works. Both will stop.'),
  L('mort.ship.built.r1', 'ship.built', 'rotation',
    'Ships added. The margin of safety is, for one year, wider.'),

  // combat.defeat (f 1, r 2)
  L('mort.combat.defeat.f1', 'combat.defeat', 'first',
    'The defense held. It was permitted to. Do not thank them.'),
  L('mort.combat.defeat.r1', 'combat.defeat', 'rotation',
    'We attacked. The numbers disagreed. The numbers win; they always win.',
    { eligibility: (ev) => (ev.payload?.shipsLost ?? 0) >= 2 }),
  L('mort.combat.defeat.r2', 'combat.defeat', 'rotation',
    'The orbit remains theirs. It has, I note, a view.'),

  // recon.reveal (r 1)
  L('mort.recon.reveal.r1', 'recon.reveal', 'rotation',
    'Charted. The map has one fewer blank and one more liability.'),

  // combat.withdraw (r 1)
  L('mort.combat.withdraw.r1', 'combat.withdraw', 'rotation',
    'Withdrawal executed. The cautious fleet lives to fight, and occasionally to file reports.'),

  // invasion.success (r 1)
  L('mort.invasion.success.r1', 'invasion.success', 'rotation',
    'The ground is ours. Integration will begin. Integration is a polite word for waiting.'),

  // invasion.failure (r 1)
  L('mort.invasion.failure.r1', 'invasion.failure', 'rotation',
    'The orbit is ours; the ground is not. The planet has no opinion of us and will maintain that.'),

  // planet.integrated (f 1, r 1)
  L('mort.planet.integrated.f1', 'planet.integrated', 'first',
    'Integration complete. They have accepted us. Acceptance, unlike integration, is not on a schedule.'),
  L('mort.planet.integrated.r1', 'planet.integrated', 'rotation',
    'One world, fully aligned. The compliance office is, for once, quiet.'),

  // occupation.rebellion (f 1, r 1)
  L('mort.occupation.rebellion.f1', 'occupation.rebellion', 'first',
    'A rebellion. The garrison was thin; the patience was thinner. The world has seceded. The file is closed. The file is always closed.'),
  L('mort.occupation.rebellion.r1', 'occupation.rebellion', 'rotation',
    '{planetName} has voted with its feet. The vote was unanimous and armed.'),

  // fleet.repaired (r 1)
  L('mort.fleet.repaired.r1', 'fleet.repaired', 'rotation',
    'Hull restored. The old damage report is history; the new one is a blank page, which is frightening.'),

  // support.report (f 1, r 1)
  L('mort.support.report.f1', 'support.report', 'first',
    'The support fleet reports. It was sent away to be less of a problem. It remains a problem, but a farther one.'),
  L('mort.support.report.r1', 'support.report', 'rotation',
    'Mission logged. The machine did what machines do: exactly what it was told.'),

  // supernova.anomalous (r 1)
  L('mort.supernova.anomalous.r1', 'supernova.anomalous', 'rotation',
    'Stellar anomaly logged. The star is behaving incorrectly. Stars are not fired; they simply go out.'),

  // supernova.critical (f 1, r 1)
  L('mort.supernova.critical.f1', 'supernova.critical', 'first',
    'A star has reached the critical stage. It has a window, a range, and no intention of waiting. Evacuation is the only arithmetic that matters.'),
  L('mort.supernova.critical.r1', 'supernova.critical', 'rotation',
    "The star at {planetName} is going. The window is a range; the range is a courtesy."),

  // supernova.detonation (r 2)
  L('mort.supernova.detonation.r1', 'supernova.detonation', 'rotation',
    'The star went. The planet is a remnant, the remnant is a fact, and the fact is final.'),
  L('mort.supernova.detonation.r2', 'supernova.detonation', 'rotation',
    "Another detonation. The galaxy's calendar has cleared a date."),

  // evacuation.done (f 1, r 1)
  L('mort.evacuation.done.f1', 'evacuation.done', 'first',
    'The evacuation is complete. Some number of people are alive who would not have been. I have counted them. I count everything.'),
  L('mort.evacuation.done.r1', 'evacuation.done', 'rotation',
    'The people moved; the star, eventually, agreed to wait. The margin was smaller than the optimists wanted.',
    { eligibility: (ev) => (ev.payload?.population ?? 0) >= 10 }),

  // rival.expansion (r 2)
  L('mort.rival.expansion.r1', 'rival.expansion', 'rotation',
    'The neighbors are also growing. Growth, it turns out, is a regional trend.'),
  L('mort.rival.expansion.r2', 'rival.expansion', 'rotation',
    '{factionName} annexed {planetName}. The map is changing shape without our permission.'),

  // rival.attack (f 1, r 1)
  L('mort.rival.attack.f1', 'rival.attack', 'first',
    'A rival flotilla has taken one of our worlds. The garrison was thin; the flotilla was not. Next time the arithmetic should be different. It is never different.'),
  L('mort.rival.attack.r1', 'rival.attack', 'rotation',
    '{factionName} struck {planetName}. The world has changed hands. The hands are not ours.'),

  // Greeting layer (C19.5): the bar speaks the moment a campaign begins,
  // and answers advisor switches without waiting for a sim event.
  L('mort.campaign.start.r1', 'campaign.start', 'rotation',
    'The mandate is accepted. I have reviewed the galaxy. It is large, it is hostile, and it is now entirely your responsibility. Shall we begin?'),
  L('mort.advisor.switched.r1', 'advisor.switched', 'rotation',
    'Reporting for duty. The galaxy, as ever, did not wait for the change.'),
];

// ── B.I.N.G.O. — functional-minimal (C19; full pool C25) ────────────────
// Voice (advisors.ts guide): relentlessly cheerful, customer-service
// cadence; addresses the player as "sir/madam"; treats catastrophes as
// service opportunities; no malice, ever.

const BINGO: DialogueLine[] = [
  Lb('bingo.travel.depart.f1', 'travel.depart', 'first',
    'Wonderful news, sir — the flagship is on its way! Departures are just arrivals wearing a waiting room.'),
  Lb('bingo.combat.victory.f1', 'combat.victory', 'first',
    'Splendid! A victory! I have already flagged the day as a success on the shared calendar.'),
  Lb('bingo.planet.captured.f1', 'planet.captured', 'first',
    'Good news on all fronts: the world is yours, the paperwork is already queued, and I have a commemorative folder.'),
  Lb('bingo.travel.arrive.r1', 'travel.arrive', 'rotation',
    "You've arrived! Punctuality is the courtesy of empires. The locals have been notified, which is a term for 'will be surprised.'"),
  Lb('bingo.combat.defeat.r1', 'combat.defeat', 'rotation',
    "A setback! No, no — a 'data point.' Even the best campaigns include a chapter where the door is closed. We are noting the door."),
  Lb('bingo.ship.built.r1', 'ship.built', 'rotation',
    'New ships! They come in hulls of three, much like surprises — only sturdier.'),
  Lb('bingo.occupation.unstable.r1', 'occupation.unstable', 'rotation',
    'Just a small flag at {planetName} — a stability observation! Consider it a wellness check with a garrison.'),
  Lb('bingo.planet.integrated.r1', 'planet.integrated', 'rotation',
    'A world, fully integrated! The forms are signed, the signatures are dry, and I am, for once, out of pens.'),
  Lb('bingo.occupation.rebellion.r1', 'occupation.rebellion', 'rotation',
    "There has been a 'realignment' at {planetName}. The world has decided to be its own project. We respect the initiative and dispute the facts."),
  Lb('bingo.fleet.repaired.r1', 'fleet.repaired', 'rotation',
    'The flagship is at one hundred percent again! Hulls, like moods, recover surprisingly well with time and credits.'),
  Lb('bingo.support.report.r1', 'support.report', 'rotation',
    'Your support fleet has filed a report! Mission accomplished, or at least "missioned." Either way: a file was produced.'),
  Lb('bingo.supernova.critical.r1', 'supernova.critical', 'rotation',
    'An alert! A star has entered its "critical" window — astronomy\'s term for "soon, and we advise you to begin." Evacuation is available; yes, it is a button.'),
  Lb('bingo.evacuation.done.r1', 'evacuation.done', 'rotation',
    'The evacuation is complete! The people are safe, the star has been handled, and the after-action smile is on file.'),
  Lb('bingo.rival.expansion.r1', 'rival.expansion', 'rotation',
    'The neighbors have been expanding, too! It is a growth district, sir — everyone is annexing; it is very communal.'),
  Lb('bingo.rival.attack.r1', 'rival.attack', 'rotation',
    'A "territory update" at {planetName}. A rival flotilla has moved in. I have flagged the loss, the grief, and the invoice.'),
  Lb('bingo.campaign.start.r1', 'campaign.start', 'rotation',
    'Welcome, sir! Your appointment is confirmed, your galaxy is assigned, and your paperwork is pre-sorted. Shall we begin? Oh — we begin.'),
  Lb('bingo.advisor.switched.r1', 'advisor.switched', 'rotation',
    'Right back with you! Same galaxy, same problems, fresh enthusiasm. You are in good hands — specifically, mine.'),
];

// ── The Mostly Reliable Galactic Handbook — functional-minimal (C19;
// full pool C26) ─────────────────────────────────────────────────────────
// Voice (advisors.ts guide): pompous, encyclopedic, third-person
// self-reference ("The Handbook notes..."), wry footnotes, corrects the
// reader's assumptions, measured cadence.

const HANDBOOK: DialogueLine[] = [
  Lh('handbook.travel.depart.f1', 'travel.depart', 'first',
    'The Handbook notes that all expeditions begin with a departure, a fact the uninitiated occasionally omit. The voyage proceeds. The galaxy, per standing policy, does not expedite.'),
  Lh('handbook.combat.victory.f1', 'combat.victory', 'first',
    'The Handbook records a victory. The reader should resist the common assumption that victory is routine; it is merely logged more frequently than defeat.'),
  Lh('handbook.planet.captured.f1', 'planet.captured', 'first',
    'A world has been annexed. The Handbook observes that the annexation form precedes the annexation, as in all bureaucracies of consequence.'),
  Lh('handbook.travel.arrive.r1', 'travel.arrive', 'rotation',
    'Arrival. The Handbook reminds the reader that the destination was never in doubt; only the schedule was a matter of debate.'),
  Lh('handbook.combat.defeat.r1', 'combat.defeat', 'rotation',
    'The defense held. The Handbook files this under "expected outcomes, unfortunate," and notes that the door was, in fact, closed.'),
  Lh('handbook.ship.built.r1', 'ship.built', 'rotation',
    'New hulls, commissioned. The Handbook observes that the dockyard converts credits into pride at a fixed and ungenerous rate.'),
  Lh('handbook.occupation.unstable.r1', 'occupation.unstable', 'rotation',
    'A stability observation at {planetName}. The Handbook notes that instability is not a policy; it is a schedule, and the schedule is behind.'),
  Lh('handbook.planet.integrated.r1', 'planet.integrated', 'rotation',
    'Integration, complete. The Handbook records that the world has, in the formal sense, accepted the new administration. The informal sense is pending, as usual.'),
  Lh('handbook.occupation.rebellion.r1', 'occupation.rebellion', 'rotation',
    'A rebellion at {planetName}. The Handbook notes, with some satisfaction, that the garrison arithmetic was ignored — as it always is.'),
  Lh('handbook.fleet.repaired.r1', 'fleet.repaired', 'rotation',
    'Hull restoration, complete. The Handbook observes that the flagship, like all institutions, endures maintenance better than it endures criticism.'),
  Lh('handbook.support.report.r1', 'support.report', 'rotation',
    'A support fleet has filed its report. The Handbook notes that the machine performed its function precisely, which is the entire definition of a machine.'),
  Lh('handbook.supernova.critical.r1', 'supernova.critical', 'rotation',
    'A star has entered the critical window. The Handbook defines "window" as a range, and "range" as the courtesy extended to those who did not read this entry.'),
  Lh('handbook.evacuation.done.r1', 'evacuation.done', 'rotation',
    'The evacuation has concluded. The Handbook records that a portion of the population was preserved, and that the star, despite its reputation, kept its appointment.'),
  Lh('handbook.rival.expansion.r1', 'rival.expansion', 'rotation',
    'A rival faction has expanded. The Handbook notes that empires, like gardens, require pruning — the rivals are pruning themselves, aggressively.'),
  Lh('handbook.rival.attack.r1', 'rival.attack', 'rotation',
    'A rival flotilla has taken {planetName}. The Handbook observes that the loss was arithmetically telegraphed. The reader will note that the telegraph was, in fact, visible.'),
  Lh('handbook.campaign.start.r1', 'campaign.start', 'rotation',
    'The Handbook records the acceptance of the mandate. The galaxy has been assigned to the Reader. The Reader should note that "assigned" is doing a great deal of work in that sentence.'),
  Lh('handbook.advisor.switched.r1', 'advisor.switched', 'rotation',
    'The Handbook takes the floor. Its commentary is available at any time, requested or otherwise. The Reader will continue; the galaxy, as ever, will not wait.'),
];

export const MORT_LINES = MORT;
export const BINGO_LINES = BINGO;
export const HANDBOOK_LINES = HANDBOOK;

// ── pool builders (advisor-fixed; keeps the tables readable) ────────────

function L(
  id: string,
  event: SimEventType,
  kind: DialogueLine['kind'],
  text: string,
  extra: Partial<DialogueLine> = {},
): DialogueLine {
  return {
    id,
    event,
    advisor: 'mort',
    kind,
    text,
    priority: kind === 'first' ? 100 : kind === 'late' ? 50 : 10,
    cooldownTicks: 0,
    ...extra,
  };
}

function Lb(
  id: string,
  event: SimEventType,
  kind: DialogueLine['kind'],
  text: string,
  extra: Partial<DialogueLine> = {},
): DialogueLine {
  return {
    id,
    event,
    advisor: 'bingo',
    kind,
    text,
    priority: kind === 'first' ? 100 : kind === 'late' ? 50 : 10,
    cooldownTicks: 0,
    ...extra,
  };
}

function Lh(
  id: string,
  event: SimEventType,
  kind: DialogueLine['kind'],
  text: string,
  extra: Partial<DialogueLine> = {},
): DialogueLine {
  return {
    id,
    event,
    advisor: 'handbook',
    kind,
    text,
    priority: kind === 'first' ? 100 : kind === 'late' ? 50 : 10,
    cooldownTicks: 0,
    ...extra,
  };
}
