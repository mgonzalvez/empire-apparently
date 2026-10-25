import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/data/balance';
import {
  canBuild,
  canRearm,
  canRepair,
  clampTroops,
  combatStrength,
  hullFactor,
  invasionStrength,
  isShipyard,
  maxTroops,
  rearmCost,
} from '../src/engine/fleets';
import { TIME_ADVANCING_ACTIONS, dispatchSim, newGame } from '../src/engine/simulation';
import { developmentCost, empireIncome } from '../src/engine/economy';
import type { Fleet, GameState, ShipClass } from '../src/engine/types';

const SEED = 42;

/** Move the flagship (state surgery — tests only; travel does this for real). */
const dockAt = (g: GameState, systemId: string): GameState => {
  g.flagship.systemId = systemId;
  g.flagship.travel = null;
  return g;
};

const homeworld = (g: GameState) =>
  g.galaxy.systems.find((s) => s.id === g.galaxy.homeworldId)!;

describe('derived strengths (PLAN §8: derived, always displayed)', () => {
  it('combat strength = class weights × hull factor, floored', () => {
    const w = FLEET.combatWeight;
    const f = (n: { i?: number; c?: number; t?: number }, hull: number): number =>
      combatStrength({
        id: 'x',
        name: 'x',
        systemId: 'S00',
        ships: { interceptor: n.i ?? 0, cruiser: n.c ?? 0, transport: n.t ?? 0 },
        hull,
        troops: 0,
        orders: { type: 'hold' as const, targetId: null },
        travel: null,
      });
    expect(f({ i: 2, t: 1 }, 100)).toBe(2 * w.interceptor + w.transport);
    expect(f({ c: 1 }, 100)).toBe(w.cruiser);
    expect(f({ c: 1 }, 0)).toBe(Math.floor(w.cruiser * 0.5));
    expect(f({ i: 1 }, 50)).toBe(Math.floor(w.interceptor * 0.75));
  });

  it('hull factor is 1 at full hull and 0.5 at a wreck', () => {
    expect(hullFactor(100)).toBe(1);
    expect(hullFactor(0)).toBe(0.5);
    expect(hullFactor(50)).toBe(0.75);
  });

  it('invasion strength = troops aboard; capacity follows transports', () => {
    const mk = (t: number, troops: number): Fleet => ({
      id: 'x',
      name: 'x',
      systemId: 'S00',
      ships: { interceptor: 0, cruiser: 0, transport: t },
      hull: 100,
      troops,
      orders: { type: 'hold', targetId: null },
      travel: null,
    });
    expect(invasionStrength(mk(2, 20))).toBe(20);
    expect(maxTroops(mk(0, 10))).toBe(0);
    expect(maxTroops(mk(3, 5))).toBe(3 * FLEET.troopsPerTransport);
  });

  it('clampTroops drops troops below capacity (lost transports, C7)', () => {
    const mk = (): Fleet => ({
      id: 'x',
      name: 'x',
      systemId: 'S00',
      ships: { interceptor: 0, cruiser: 0, transport: 2 },
      hull: 100,
      troops: 20,
      orders: { type: 'hold', targetId: null },
      travel: null,
    });
    const f = mk();
    f.ships.transport = 0;
    clampTroops(f);
    expect(f.troops).toBe(0);
    f.ships.transport = 1;
    clampTroops(f); // capacity grows, troops do NOT auto-refill (rearm does)
    expect(f.troops).toBe(0);
  });
});

describe('shipyard rule (Fortress spec OR development ≥ 3, player worlds)', () => {
  it('the homeworld (dev 3) is always a shipyard', () => {
    const g = newGame(SEED);
    expect(isShipyard(g, g.galaxy.homeworldId)).toBe(true);
  });

  it('a low-dev non-fortress world is not a shipyard', () => {
    const g = newGame(SEED);
    const low = g.galaxy.systems.find(
      (s) => s.planet && s.planet.development < FLEET.shipyardMinDev &&
        s.planet.specialization !== 'fortress',
    )!;
    low.ownerId = 'player';
    expect(isShipyard(g, low.id)).toBe(false);
  });

  it('a Fortress world IS a shipyard at any development', () => {
    const g = newGame(SEED);
    const s = g.galaxy.systems.find((x) => x.planet !== null)!;
    s.planet!.specialization = 'fortress';
    s.planet!.development = 1;
    s.ownerId = 'player';
    expect(isShipyard(g, s.id)).toBe(true);
  });

  it('development ≥ 3 makes a shipyard at any specialization', () => {
    const g = newGame(SEED);
    const s = g.galaxy.systems.find((x) => x.planet !== null)!;
    s.planet!.specialization = 'economic';
    s.planet!.development = FLEET.shipyardMinDev;
    s.ownerId = 'player';
    expect(isShipyard(g, s.id)).toBe(true);
  });

  it('a RIVAL shipyard is no shipyard for the player', () => {
    const g = newGame(SEED);
    const s = g.galaxy.systems.find((x) => x.planet !== null)!;
    s.planet!.development = 5;
    s.ownerId = 'rival-0';
    expect(isShipyard(g, s.id)).toBe(false);
  });

  it('uninhabited systems are never shipyards', () => {
    const g = newGame(SEED);
    const empty = g.galaxy.systems.find((s) => s.planet === null)!;
    empty.ownerId = 'player';
    expect(isShipyard(g, empty.id)).toBe(false);
  });
});

describe('construction (acceptance: instant, 0 ticks, gated)', () => {
  for (const ship of ['interceptor', 'cruiser', 'transport'] as ShipClass[]) {
    it(`building a ${ship} costs exactly the balance table, and passes no time`, () => {
      const g = newGame(SEED);
      dockAt(g, g.galaxy.homeworldId);
      const cost = FLEET.cost[ship];
      const before = { ...g.empire };
      const next = dispatchSim(g, { type: 'BUILD', ship });
      expect(next).not.toBe(g); // state changed…
      expect(next.tick).toBe(g.tick); // …but the clock did not move
      expect(next.empire.credits).toBe(before.credits - cost.credits);
      expect(next.empire.materials).toBe(before.materials - cost.materials);
      expect(next.flagship.ships[ship]).toBe(g.flagship.ships[ship] + 1);
      expect(next.flagship.hull).toBe(g.flagship.hull);
    });
  }

  it('building outside a shipyard is a no-op (state reference unchanged)', () => {
    const g = newGame(SEED);
    const low = g.galaxy.systems.find(
      (s) => s.planet && s.planet.development < FLEET.shipyardMinDev &&
        s.planet.specialization !== 'fortress',
    )!;
    low.ownerId = 'player';
    dockAt(g, low.id);
    expect(canBuild(g, 'interceptor').ok).toBe(false);
    expect(dispatchSim(g, { type: 'BUILD', ship: 'interceptor' })).toBe(g);
  });

  it('insufficient credits or materials blocks the build', () => {
    const g = newGame(SEED);
    dockAt(g, g.galaxy.homeworldId);
    g.empire.credits = FLEET.cost.cruiser.credits - 1;
    expect(canBuild(g, 'cruiser').ok).toBe(false);
    expect(dispatchSim(g, { type: 'BUILD', ship: 'cruiser' })).toBe(g);

    const g2 = newGame(SEED);
    dockAt(g2, g2.galaxy.homeworldId);
    g2.empire.materials = FLEET.cost.cruiser.materials - 1;
    expect(dispatchSim(g2, { type: 'BUILD', ship: 'cruiser' })).toBe(g2);
  });
});

describe('repair (acceptance: exactly 1 tick, gated)', () => {
  it('a damaged hull is restored for the tabled cost, in exactly one year', () => {
    const g = newGame(SEED);
    g.flagship.hull = 40;
    const income = empireIncome(g.galaxy.systems).credits; // the repair year also produces
    // C9: the homeworld (dev 3 by generation invariant) auto-develops to
    // dev 4 during that same year, paying its transparent cost.
    const home = g.galaxy.systems.find((s) => s.id === g.galaxy.homeworldId)!;
    const devSpend = developmentCost(home.planet!.development)!;
    const next = dispatchSim(g, { type: 'REPAIR' });
    expect(next).not.toBe(g);
    expect(next.tick).toBe(g.tick + 1); // exactly one tick
    expect(next.flagship.hull).toBe(100);
    expect(next.empire.credits).toBe(
      g.empire.credits - FLEET.repairCost.credits + income - devSpend.credits,
    );
  });

  it('an intact hull refuses repair', () => {
    const g = newGame(SEED);
    expect(canRepair(g).ok).toBe(false);
    expect(dispatchSim(g, { type: 'REPAIR' })).toBe(g);
  });

  it('insufficient credits refuse repair', () => {
    const g = newGame(SEED);
    g.flagship.hull = 10;
    g.empire.credits = FLEET.repairCost.credits - 1;
    expect(canRepair(g).ok).toBe(false);
    expect(dispatchSim(g, { type: 'REPAIR' })).toBe(g);
    expect(g.empire.credits).toBe(FLEET.repairCost.credits - 1);
  });

  it('REPAIR is on the time-advancing ledger', () => {
    expect(TIME_ADVANCING_ACTIONS.has('REPAIR')).toBe(true);
    expect(TIME_ADVANCING_ACTIONS.has('BUILD')).toBe(false);
    expect(TIME_ADVANCING_ACTIONS.has('REARM')).toBe(false);
  });
});

describe('rearm (refill invasion personnel)', () => {
  it('refills to capacity for the per-troop rate, passing no time', () => {
    const g = newGame(SEED);
    dockAt(g, g.galaxy.homeworldId);
    g.flagship.troops = 4;
    const expected = (maxTroops(g.flagship) - 4) * FLEET.rearmCostPerTroop;
    const next = dispatchSim(g, { type: 'REARM' });
    expect(next.tick).toBe(g.tick);
    expect(next.flagship.troops).toBe(maxTroops(g.flagship));
    expect(next.empire.credits).toBe(g.empire.credits - expected);
  });

  it('is refused at full strength, off-shipyard, or short of credits', () => {
    const g = newGame(SEED);
    dockAt(g, g.galaxy.homeworldId);
    expect(dispatchSim(g, { type: 'REARM' })).toBe(g); // full

    const g2 = newGame(SEED);
    g2.flagship.troops = 0;
    const low = g2.galaxy.systems.find(
      (s) => s.planet && s.planet.development < FLEET.shipyardMinDev &&
        s.planet.specialization !== 'fortress',
    )!;
    low.ownerId = 'player';
    dockAt(g2, low.id);
    expect(canRearm(g2).ok).toBe(false); // no shipyard
    expect(dispatchSim(g2, { type: 'REARM' })).toBe(g2);

    const g3 = newGame(SEED);
    dockAt(g3, g3.galaxy.homeworldId);
    g3.flagship.troops = 0;
    g3.empire.credits = 0;
    expect(canRearm(g3).ok).toBe(false); // no credits
    expect(dispatchSim(g3, { type: 'REARM' })).toBe(g3);
  });

  it('rearmCost is the per-troop rate × missing troops', () => {
    const g = newGame(SEED);
    g.flagship.troops = maxTroops(g.flagship) - 3;
    expect(rearmCost(g.flagship)).toBe(3 * FLEET.rearmCostPerTroop);
    g.flagship.troops = maxTroops(g.flagship);
    expect(rearmCost(g.flagship)).toBe(0);
  });
});

describe('integration & determinism', () => {
  it('building changes the displayed strengths the player sees (same source)', () => {
    // FleetPanel renders combatStrength(state.flagship); the engine logs the
    // same function after a build — assert the log and the derived value agree.
    const g = newGame(SEED);
    const next = dispatchSim(g, { type: 'BUILD', ship: 'interceptor' });
    const logged = next.log.at(-1)?.text.match(/combat strength (\d+)/);
    expect(logged).not.toBeNull();
    expect(Number(logged![1])).toBe(combatStrength(next.flagship));
  });

  it('an identical action sequence from the same seed is reproducible', () => {
    const run = (seed: number): GameState => {
      let g = newGame(seed);
      dockAt(g, g.galaxy.homeworldId);
      g = dispatchSim(g, { type: 'BUILD', ship: 'cruiser' });
      g = dispatchSim(g, { type: 'BUILD', ship: 'transport' });
      g.flagship.hull = 55;
      g = dispatchSim(g, { type: 'REPAIR' });
      g.flagship.troops = 0;
      g = dispatchSim(g, { type: 'REARM' });
      return g;
    };
    expect(JSON.stringify(run(7))).toBe(JSON.stringify(run(7)));
  });

  it('the new-game flagship starts at full condition', () => {
    const g = newGame(SEED);
    expect(g.flagship.hull).toBe(100);
    expect(g.flagship.troops).toBe(maxTroops(g.flagship));
    expect(homeworld(g).planet?.development).toBeGreaterThanOrEqual(FLEET.shipyardMinDev);
  });
});
