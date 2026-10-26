/**
 * C19 — dialogue variety engine (PLAN §10 guarantees, all testable):
 *  - cycling property: no line repeats before its pool is exhausted
 *  - first lines are unique per campaign and never return after first use
 *  - the 20-ID recent window is a soft filter (a line is never blocked
 *    solely to avoid a repeat)
 *  - maxPerCampaign caps hard
 *  - interpolation drops unknown tokens
 *  - MECHANICAL NEUTRALITY: identical sim-state hash under different
 *    advisors (the one rule that matters — P5, SPEC §3)
 */

import { describe, expect, it } from 'vitest';
import { dispatchSim, newGame } from '../src/engine/simulation';
import { applyNarration, pickLine, interpolate } from '../src/engine/dialogue';
import { Rng } from '../src/engine/random';
import { MORT_LINES } from '../src/data/dialogue/pools';
import type { GameState, SimEvent, SimEventType } from '../src/engine/types';

function baseState(advisor: 'mort' | 'bingo' | 'handbook' = 'mort'): GameState {
  return newGame(1234, { advisor });
}

/** Push one event and narrate it; returns the pick's lineId (or null). */
function narrateEvent(d: GameState, rng: Rng, type: SimEventType, payload?: SimEvent['payload']): string | null {
  d.events.push({ seq: d.dialogue.seq, tick: d.tick, type, ...(payload !== undefined ? { payload } : {}) });
  d.dialogue.seq += 1;
  applyNarration(d, rng);
  return d.lastDialogue?.lineId ?? null;
}

/** M.O.R.T. rotation/late pool size for an event at an early tick. */
function earlyPoolSize(type: SimEventType): number {
  return MORT_LINES.filter(
    (l) => l.event === type && l.advisor === 'mort' && l.kind !== 'late',
  ).length;
}

describe('cycling property (PLAN §10)', () => {
  it('no line repeats before its pool is exhausted', () => {
    const d = baseState();
    const rng = new Rng([1, 2, 3, 4]);
    const picks: string[] = [];
    const total = earlyPoolSize('combat.victory'); // first + rotation (late gated out early)
    for (let i = 0; i < 25; i++) {
      picks.push(narrateEvent(d, rng, 'combat.victory', { planetName: 'Testis' })!);
    }
    // The first `total` picks are all distinct (the whole early pool).
    expect(new Set(picks.slice(0, total)).size).toBe(total);
    // The first (signature) line never returns after its single use.
    const firstLine = MORT_LINES.find((l) => l.event === 'combat.victory' && l.kind === 'first')!.id;
    expect(picks[0]).toBe(firstLine);
    expect(picks.slice(1)).not.toContain(firstLine);
  });

  it('least-shown-first: the two rotation lines alternate evenly', () => {
    const d = baseState();
    const rng = new Rng([9, 8, 7, 6]);
    const picks: string[] = [];
    for (let i = 0; i < 12; i++) picks.push(narrateEvent(d, rng, 'combat.victory')!);
    const [r1, r2] = picks.slice(1); // after the first line
    expect(new Set([r1, r2]).size).toBe(2);
    // Even cycling: neither line is ahead by more than one.
    const count = (id: string) => picks.filter((p) => p === id).length;
    expect(Math.abs(count(r1) - count(r2))).toBeLessThanOrEqual(1);
  });
});

describe('recent window (PLAN §10 step 3)', () => {
  it('prefers lines outside the window, but never blocks a line entirely', () => {
    const d = baseState();
    const rng = new Rng([4, 4, 4, 4]);
    const lines = MORT_LINES.filter((l) => l.event === 'combat.defeat' && l.advisor === 'mort');
    // First occurrence consumes the first line.
    narrateEvent(d, rng, 'combat.defeat', { planetName: 'X', shipsLost: 5 });
    // Now force every remaining candidate into the recent window.
    const rotations = lines.filter((l) => l.kind === 'rotation').map((l) => l.id);
    d.dialogue.recentIds = [
      ...rotations,
      ...Array.from({ length: Math.max(0, 20 - rotations.length) }, (_, i) => `pad-${i}`),
    ];
    const pick = pickLine(d, { seq: 99, tick: d.tick, type: 'combat.defeat', payload: { shipsLost: 5 } }, rng);
    // All candidates are in the window → the least-recent one is still allowed.
    expect(pick).not.toBeNull();
    expect(pick!.kind).toBe('rotation');
  });

  it('a line outside the window wins over one inside it', () => {
    const d = baseState();
    const rng = new Rng([2, 2, 2, 2]);
    const lines = MORT_LINES.filter((l) => l.event === 'combat.defeat' && l.advisor === 'mort');
    const [r1, r2] = lines.filter((l) => l.kind === 'rotation');
    narrateEvent(d, rng, 'combat.defeat', { planetName: 'X', shipsLost: 5 }); // first line shown
    d.dialogue.recentIds = [r1.id]; // r1 recently shown; r2 is outside
    const pick = pickLine(d, { seq: 99, tick: d.tick, type: 'combat.defeat', payload: { shipsLost: 5 } }, rng);
    expect(pick!.id).toBe(r2.id);
  });
});

describe('caps & interpolation', () => {
  it('maxPerCampaign is a hard cap (the "tired of winning" late lines fire once)', () => {
    const d = baseState();
    d.tick = 70; // past the late gate
    const rng = new Rng([5, 5, 5, 5]);
    const lateLine = MORT_LINES.find((l) => l.event === 'travel.depart' && l.kind === 'late')!;
    const rotations = MORT_LINES.filter((l) => l.event === 'travel.depart' && l.advisor === 'mort' && l.kind !== 'late');
    // Make the rotations "already shown" so the unseen late line is least-shown.
    const shown = (d.dialogue.shown['travel.depart'] ??= {});
    for (const r of rotations) shown[r.id] = 9;
    // Past tick 70 the late gate is open regardless of occurrence count.
    const first = narrateEvent(d, rng, 'travel.depart')!;
    expect(first).toBe(lateLine.id);
    for (let i = 0; i < 10; i++) narrateEvent(d, rng, 'travel.depart');
    const shownLate = d.dialogue.shown['travel.depart'][lateLine.id];
    expect(shownLate).toBe(1); // never a second time
  });

  it('interpolation fills known vars and drops unknown tokens', () => {
    const ev: SimEvent = {
      seq: 1,
      tick: 3,
      type: 'rival.expansion',
      payload: { planetName: 'Olla', factionName: 'The Syndicate' },
    };
    const out = interpolate('{factionName} annexed {planetName}.', ev);
    expect(out).toBe('The Syndicate annexed Olla.');
    expect(interpolate('no vars here {missing}', ev)).toBe('no vars here ');
  });
});

describe('mechanical neutrality (SPEC §3, PLAN §10)', () => {
  /** Sim projection: everything EXCEPT narration-only fields. */
  function simProjection(s: GameState): Record<string, unknown> {
    const c = structuredClone(s) as unknown as Record<string, unknown>;
    delete c.narrRng; // narration RNG may diverge per advisor — it never feeds the sim
    delete c.dialogue;
    delete c.lastDialogue;
    // settings.advisor is the narration record (SPEC §3: mechanically neutral);
    // the other settings (supernovaFreq) are sim and stay in the projection.
    const settings = c.settings as Record<string, unknown> | undefined;
    if (settings) delete settings.advisor;
    return c;
  }

  it('the same actions under different advisors produce identical sim state', () => {
    let a = baseState('mort');
    let b = baseState('handbook');
    // The nearest inhabited non-homeworld system (always within range).
    const home = a.galaxy.systems.find((t) => t.id === a.galaxy.homeworldId)!;
    const dest = a.galaxy.systems
      .filter((t) => t.id !== home.id && t.planet !== null)
      .sort(
        (x, y) =>
          Math.hypot(x.x - home.x, x.y - home.y) -
          Math.hypot(y.x - home.x, y.y - home.y),
      )[0];
    a = dispatchSim(a, { type: 'TRAVEL', destinationId: dest.id });
    b = dispatchSim(b, { type: 'TRAVEL', destinationId: dest.id });
    a = dispatchSim(a, { type: 'WAIT' });
    b = dispatchSim(b, { type: 'WAIT' });
    a = dispatchSim(a, { type: 'BUILD', ship: 'interceptor' });
    b = dispatchSim(b, { type: 'BUILD', ship: 'interceptor' });
    a = dispatchSim(a, { type: 'WAIT' });
    b = dispatchSim(b, { type: 'WAIT' });

    expect(simProjection(a)).toEqual(simProjection(b)); // galaxy, rng, log, events, stats…
    expect(a.lastBattle).toEqual(b.lastBattle); // the factual report is advisor-free
    // The narration is where they differ — and ONLY there.
    if (a.lastDialogue && b.lastDialogue) {
      expect(a.lastDialogue.advisor).toBe('mort');
      expect(b.lastDialogue.advisor).toBe('handbook');
      expect(a.lastDialogue.lineId.startsWith('mort.')).toBe(true);
      expect(b.lastDialogue.lineId.startsWith('handbook.')).toBe(true);
    }
  });

  it('the advisor greets the moment the mandate begins (campaign.start)', () => {
    const g = newGame(777);
    expect(g.events.length).toBe(1);
    expect(g.events[0].type).toBe('campaign.start');
    expect(g.lastDialogue).not.toBeNull();
    expect(g.lastDialogue!.event).toBe('campaign.start');
    expect(g.lastDialogue!.advisor).toBe('mort');
    expect(g.lastDialogue!.text.length).toBeGreaterThan(0);
    // Every selectable advisor has a greeting — the bar speaks for all three.
    const bingo = newGame(777, { advisor: 'bingo' });
    expect(bingo.lastDialogue!.lineId.startsWith('bingo.')).toBe(true);
    const book = newGame(777, { advisor: 'handbook' });
    expect(book.lastDialogue!.lineId.startsWith('handbook.')).toBe(true);
  });

  it('SET_ADVISOR: the switch is a typed fact, the new advisor answers, and nothing else moves', () => {
    let a = baseState('mort');
    a = dispatchSim(a, { type: 'WAIT' });
    const before = simProjection(a);
    const beforeEvents = a.events.length;
    a = dispatchSim(a, { type: 'SET_ADVISOR', advisor: 'bingo' });
    expect(a.dialogue.advisor).toBe('bingo');
    expect(a.settings.advisor).toBe('bingo');
    // The journal records exactly one new typed fact…
    expect(a.events.length).toBe(beforeEvents + 1);
    expect(a.events[a.events.length - 1].type).toBe('advisor.switched');
    // …and with that excluded, everything is byte-identical.
    const stripped = structuredClone(a) as GameState;
    stripped.events.pop();
    expect(simProjection(stripped)).toEqual(before);
    // The new advisor takes the floor immediately — the click gets a reply.
    expect(a.lastDialogue).not.toBeNull();
    expect(a.lastDialogue!.event).toBe('advisor.switched');
    expect(a.lastDialogue!.lineId.startsWith('bingo.')).toBe(true);
    // Switching to the same advisor is a true no-op: same reference, no
    // journal entry, no RNG churn.
    const same = dispatchSim(a, { type: 'SET_ADVISOR', advisor: 'bingo' });
    expect(same).toBe(a);
    expect(same.events.length).toBe(beforeEvents + 1);
    expect(same.narrRng).toEqual(a.narrRng);
  });

  it('picks are deterministic: same state, same narrRng, same line', () => {
    const mk = () => baseState('mort');
    const s1 = mk();
    const s2 = mk();
    const r1 = new Rng([7, 7, 7, 7]);
    const r2 = new Rng([7, 7, 7, 7]);
    for (let i = 0; i < 15; i++) {
      const p1 = narrateEvent(s1, r1, 'travel.arrive');
      const p2 = narrateEvent(s2, r2, 'travel.arrive');
      expect(p1).toBe(p2);
    }
  });
});
