import { describe, expect, it } from 'vitest';
import {
  bandForDistance,
  distance,
  inTransitPosition,
  planTravel,
} from '../src/engine/movement';
import { MAX_JUMP_RANGE, MOVE } from '../src/data/balance';
import {
  TIME_ADVANCING_ACTIONS,
  dispatchSim,
  newGame,
  totalShips,
} from '../src/engine/simulation';
import { empireIncome } from '../src/engine/economy';
import type { GameState } from '../src/engine/types';

const SEED = 42;
const SHIPS = totalShips(newGame(SEED).flagship); // 3 at start

/**
 * Coordinate-synthetic setups: travel measures straight-line map distance,
 * so placing two systems at known coordinates pins the band exactly.
 */
function rig(fromX: number, fromY: number, toX: number, toY: number): GameState {
  const g = newGame(SEED);
  const [a, b] = [g.galaxy.systems[4], g.galaxy.systems[5]];
  a.x = fromX;
  a.y = fromY;
  b.x = toX;
  b.y = toY;
  g.flagship.systemId = a.id;
  g.flagship.travel = null;
  return g;
}

describe('distance bands (balance.ts is the source of truth)', () => {
  it('bands are selected at their documented boundaries', () => {
    expect(bandForDistance(0)?.name).toBe('close');
    expect(bandForDistance(MOVE.bands[0].maxDistance)?.name).toBe('close');
    expect(bandForDistance(MOVE.bands[0].maxDistance + 0.1)?.name).toBe('medium');
    expect(bandForDistance(MOVE.bands[1].maxDistance)?.name).toBe('medium');
    expect(bandForDistance(MOVE.bands[1].maxDistance + 0.1)?.name).toBe('far');
    expect(bandForDistance(MOVE.bands[2].maxDistance)?.name).toBe('far');
    expect(bandForDistance(MOVE.bands[2].maxDistance + 0.1)).toBeNull();
    expect(MAX_JUMP_RANGE).toBe(MOVE.bands[MOVE.bands.length - 1].maxDistance);
  });

  it('distance is straight-line map distance, 1-decimal', () => {
    expect(distance({ x: 10, y: 10 }, { x: 40, y: 10 })).toBe(30);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('travel quote (shown = simulated)', () => {
  it('cost and time match the balance.ts formulas exactly', () => {
    for (const [dx, bandIdx] of [
      [25, 0],
      [50, 1],
      [75, 2],
    ] as const) {
      const g = rig(10, 10, 10 + dx, 10);
      const q = planTravel(g, g.galaxy.systems[5].id);
      const band = MOVE.bands[bandIdx];
      expect(q.ok, `distance ${dx}`).toBe(true);
      expect(q.distance).toBe(dx);
      expect(q.bandName).toBe(band.name);
      expect(q.years).toBe(band.years);
      expect(q.fuelCost).toBe(SHIPS * band.fuelPerShip);
    }
  });

  it('known defenders are reported only for explored destinations', () => {
    const g = rig(10, 10, 30, 10);
    const dest = g.galaxy.systems[5];
    dest.explored = true;
    dest.defense = 9;
    dest.ownerId = 'ind-1';
    const known = planTravel(g, dest.id);
    expect(known.defendersKnown).toBe(true);
    expect(known.defense).toBe(9);
    expect(known.ownerId).toBe('ind-1');

    dest.explored = false;
    const unknown = planTravel(g, dest.id);
    expect(unknown.defendersKnown).toBe(false);
    expect(unknown.defense).toBeNull();
  });

  it('rejects same-system travel', () => {
    const g = rig(10, 10, 30, 10);
    const q = planTravel(g, g.galaxy.systems[4].id);
    expect(q.ok).toBe(false);
    expect(q.reason).toMatch(/already at/);
  });
});

describe('out of range (core §6: clear max jump range, no teleportation)', () => {
  it('quotes are rejected with the distance and the max jump', () => {
    const g = rig(10, 10, 10 + MAX_JUMP_RANGE + 5, 10);
    const q = planTravel(g, g.galaxy.systems[5].id);
    expect(q.ok).toBe(false);
    expect(q.reason).toContain('Out of range');
    expect(q.reason).toContain(String(MAX_JUMP_RANGE));
  });

  it('dispatch refuses to move time or spend fuel when out of range', () => {
    const g = rig(10, 10, 10 + MAX_JUMP_RANGE + 5, 10);
    const next = dispatchSim(g, { type: 'TRAVEL', destinationId: g.galaxy.systems[5].id });
    expect(next).toBe(g);
  });

  it('no route in any generated galaxy exceeds the stated max jump', () => {
    for (let seed = 0; seed < 20; seed++) {
      const g = newGame(seed);
      for (const dest of g.galaxy.systems) {
        const q = planTravel(g, dest.id);
        if (q.ok) {
          expect(q.distance, `seed ${seed} → ${dest.id}`).toBeLessThanOrEqual(
            MAX_JUMP_RANGE,
          );
        } else if (q.reason?.includes('Out of range')) {
          expect(q.reason).toContain(String(MAX_JUMP_RANGE));
        }
      }
    }
  });
});

describe('fuel gate', () => {
  it('fuel below cost blocks travel with a clear reason', () => {
    const g = rig(10, 10, 30, 10);
    const cost = SHIPS * MOVE.bands[0].fuelPerShip;
    g.empire.fuel = cost - 1;
    const q = planTravel(g, g.galaxy.systems[5].id);
    expect(q.ok).toBe(false);
    expect(q.reason).toContain('Insufficient fuel');
    expect(q.reason).toContain(String(cost));

    const next = dispatchSim(g, { type: 'TRAVEL', destinationId: g.galaxy.systems[5].id });
    expect(next).toBe(g);
    expect(next.empire.fuel).toBe(cost - 1);
  });

  it('fuel exactly equal to cost is allowed', () => {
    const g = rig(10, 10, 30, 10);
    const cost = SHIPS * MOVE.bands[0].fuelPerShip;
    g.empire.fuel = cost;
    const income = empireIncome(g.galaxy.systems).fuel;
    const next = dispatchSim(g, { type: 'TRAVEL', destinationId: g.galaxy.systems[5].id });
    expect(next.empire.fuel).toBe(income); // cost - cost + one year of production
    expect(next.flagship.systemId).toBe(g.galaxy.systems[5].id);
  });
});

describe('voyage lifecycle (core §4: every elapsed year simulated in sequence)', () => {
  it('a 1-year voyage departs AND arrives in the departure action', () => {
    const g = rig(10, 10, 35, 10); // 25 → close, 1 year
    const destId = g.galaxy.systems[5].id;
    const fuelBefore = g.empire.fuel;
    const income = empireIncome(g.galaxy.systems).fuel; // C5: the year also produces
    const next = dispatchSim(g, { type: 'TRAVEL', destinationId: destId });
    expect(next.tick).toBe(1);
    expect(next.empire.fuel).toBe(fuelBefore - SHIPS * MOVE.bands[0].fuelPerShip + income);
    expect(next.flagship.travel).toBeNull();
    expect(next.flagship.systemId).toBe(destId);
    expect(next.flagship.orders).toEqual({ type: 'hold', targetId: null });
  });

  it('a 2-year voyage is visible in transit, and arrives on its exact tick', () => {
    const g = rig(10, 10, 60, 10); // 50 → medium, 2 years
    const destId = g.galaxy.systems[5].id;

    const departed = dispatchSim(g, { type: 'TRAVEL', destinationId: destId });
    // Departure year consumed; voyage still under way…
    expect(departed.tick).toBe(1);
    expect(departed.flagship.travel).not.toBeNull();
    expect(departed.flagship.travel?.departTick).toBe(0);
    expect(departed.flagship.travel?.arriveTick).toBe(2);
    // …and the ship is at the origin system (map interpolates from there).
    expect(departed.flagship.systemId).toBe(g.galaxy.systems[4].id);
    // …but NOT arrived (tick 1 < arrival tick 2).
    expect(departed.flagship.travel).not.toBeNull();

    const arrived = dispatchSim(departed, { type: 'WAIT' });
    expect(arrived.tick).toBe(2);
    expect(arrived.flagship.travel).toBeNull();
    expect(arrived.flagship.systemId).toBe(destId);
    // Fuel was paid once, at departure — not per year. (C5: each of the two
    // elapsed years also produced income.)
    const income = empireIncome(g.galaxy.systems).fuel;
    expect(arrived.empire.fuel).toBe(
      g.empire.fuel - SHIPS * MOVE.bands[1].fuelPerShip + 2 * income,
    );
    expect(arrived.log.some((e) => e.text.includes('arrives at'))).toBe(true);
  });

  it('arriving reveals an unexplored destination', () => {
    const g = rig(10, 10, 35, 10);
    const dest = g.galaxy.systems[5];
    dest.explored = false;
    const next = dispatchSim(g, { type: 'TRAVEL', destinationId: dest.id });
    expect(next.galaxy.systems.find((s) => s.id === dest.id)?.explored).toBe(true);
    expect(next.log.some((e) => e.text.startsWith('Reconnaissance:'))).toBe(true);
  });

  it('an in-transit flagship cannot set a new course', () => {
    const g = rig(10, 10, 60, 10);
    const departed = dispatchSim(g, { type: 'TRAVEL', destinationId: g.galaxy.systems[5].id });
    const other = g.galaxy.systems[6];
    // (other may be far — the in-transit check must fire first.)
    other.x = 20;
    other.y = 10;
    const q = planTravel(departed, other.id);
    expect(q.ok).toBe(false);
    expect(q.inTransit).toBe(true);
    expect(q.reason).toMatch(/in transit/);
    expect(dispatchSim(departed, { type: 'TRAVEL', destinationId: other.id })).toBe(departed);
  });

  it('TRAVEL is a time-advancing action (core §4 ledger)', () => {
    expect(TIME_ADVANCING_ACTIONS.has('TRAVEL')).toBe(true);
  });

  it('voyages are deterministic', () => {
    const a = rig(10, 10, 60, 10);
    const b = rig(10, 10, 60, 10);
    const ta = dispatchSim(a, { type: 'TRAVEL', destinationId: a.galaxy.systems[5].id });
    const tb = dispatchSim(b, { type: 'TRAVEL', destinationId: b.galaxy.systems[5].id });
    expect(JSON.stringify(ta)).toBe(JSON.stringify(tb));
    expect(JSON.stringify(dispatchSim(ta, { type: 'WAIT' }))).toBe(
      JSON.stringify(dispatchSim(tb, { type: 'WAIT' })),
    );
  });
});

describe('in-transit position (map rendering input)', () => {
  it('interpolates 0→1 across the voyage, clamped', () => {
    const g = rig(10, 10, 60, 10);
    const departed = dispatchSim(g, { type: 'TRAVEL', destinationId: g.galaxy.systems[5].id });
    const from = departed.galaxy.systems[4];
    const to = departed.galaxy.systems[5];
    expect(inTransitPosition(departed.flagship, from, to, 1)).toEqual({
      x: 35,
      y: 10,
      progress: 0.5,
    });
    expect(inTransitPosition(departed.flagship, from, to, 0)!.progress).toBe(0);
    expect(inTransitPosition(departed.flagship, from, to, 99)!.progress).toBe(1);
    const docked = dispatchSim(departed, { type: 'WAIT' });
    expect(inTransitPosition(docked.flagship, from, to, 2)).toBeNull();
  });
});
