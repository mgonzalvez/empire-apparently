import { describe, expect, it } from 'vitest';
import { COMBAT } from '../src/data/balance';
import {
  STANCES,
  canAttack,
  distributeLosses,
  estimateOutcome,
  groundDefense,
  resolveBattle,
} from '../src/engine/combat';
import { TIME_ADVANCING_ACTIONS, dispatchSim, newGame } from '../src/engine/simulation';
import type {
  BattleReport,
  Fleet,
  FleetShips,
  GameState,
  Stance,
} from '../src/engine/types';

const N = 1000; // battles per stance (C7 acceptance)

/**
 * Controlled battle rig: real new game, flagship docked on a chosen target
 * with a chosen defense (state surgery — tests only).
 */
function battleAt(
  seed: number,
  stance: Stance,
  opts: { ships: FleetShips; troops?: number; defense?: number; garrison?: number; development?: number } = {
    ships: { interceptor: 5, cruiser: 0, transport: 1 },
  },
): { report: BattleReport; state: GameState; targetId: string } {
  const g = newGame(seed);
  const target = g.galaxy.systems.find((s) => s.ownerId === 'rival-0' && s.planet)!;
  target.defense = opts.defense ?? 11;
  if (target.planet) {
    target.planet.garrison = opts.garrison ?? 0;
    target.planet.development = opts.development ?? 1;
  }
  g.flagship.ships = { ...opts.ships };
  g.flagship.troops = opts.troops ?? 10;
  g.flagship.hull = 100;
  g.flagship.systemId = target.id;
  g.flagship.travel = null;
  const report = resolveBattle(g, target.id, stance);
  return { report, state: g, targetId: target.id };
}

const shipsLostTotal = (r: BattleReport): number =>
  r.shipsLost.interceptor + r.shipsLost.cruiser + r.shipsLost.transport;

const fleetOf = (ships: FleetShips, troops = 10, hull = 100): Fleet => ({
  id: 'x',
  name: 'x',
  systemId: 'S00',
  ships,
  hull,
  troops,
  orders: { type: 'hold', targetId: null },
  travel: null,
});

describe('distributeLosses (deterministic ship losses)', () => {
  it('is zero when there is nothing to lose or no damage', () => {
    expect(distributeLosses(fleetOf({ interceptor: 0, cruiser: 0, transport: 0 }).ships, 1)).toEqual({
      interceptor: 0,
      cruiser: 0,
      transport: 0,
    });
    expect(distributeLosses({ interceptor: 3, cruiser: 1, transport: 1 }, 0)).toEqual({
      interceptor: 0,
      cruiser: 0,
      transport: 0,
    });
  });

  it('never exceeds a class and matches the rounded total', () => {
    const ships = { interceptor: 2, cruiser: 1, transport: 1 };
    for (const frac of [0.1, 0.25, 0.5, 0.75, 1]) {
      const lost = distributeLosses(ships, frac);
      const total = lost.interceptor + lost.cruiser + lost.transport;
      expect(total).toBe(Math.min(4, Math.round(frac * 4)));
      expect(lost.interceptor).toBeLessThanOrEqual(ships.interceptor);
      expect(lost.cruiser).toBeLessThanOrEqual(ships.cruiser);
      expect(lost.transport).toBeLessThanOrEqual(ships.transport);
    }
  });

  it('is deterministic (same input → same split)', () => {
    const a = distributeLosses({ interceptor: 2, cruiser: 1, transport: 1 }, 0.4);
    const b = distributeLosses({ interceptor: 2, cruiser: 1, transport: 1 }, 0.4);
    expect(a).toEqual(b);
  });
});

describe('ground defense (invasion formula)', () => {
  it('is garrison + bastion fortifications + development modifier', () => {
    const { state, targetId } = battleAt(1, 'balanced');
    const t = state.galaxy.systems.find((s) => s.id === targetId)!;
    t.planet!.type = 'bastion';
    t.planet!.garrison = 7;
    t.planet!.development = 4;
    expect(groundDefense(t)).toBe(7 + COMBAT.bastionGroundBonus + 4 * COMBAT.developmentPerLevel);
  });
});

describe('stance effects (acceptance: 1k battles per stance, parity A=D)', () => {
  // A = 5 interceptors + 1 transport = 11; defender D = 11.
  const runStance = (stance: Stance) =>
    Array.from({ length: N }, (_, i) => battleAt(10_000 + i, stance).report);

  const winRate = (rs: BattleReport[]) =>
    rs.filter((r) => r.outcome !== 'held').length / rs.length;
  const meanLossFrac = (rs: BattleReport[]) =>
    rs.reduce((acc, r) => acc + shipsLostTotal(r) / 6, 0) / rs.length;

  it('aggressive: wins everything at parity, lowest losses', () => {
    const rs = runStance('aggressive');
    expect(winRate(rs)).toBeGreaterThan(0.99);
    const ml = meanLossFrac(rs);
    expect(ml).toBeGreaterThan(0.3);
    expect(ml).toBeLessThan(0.44);
  });

  it('balanced: ~50% at parity, ~50% average losses', () => {
    const rs = runStance('balanced');
    const wr = winRate(rs);
    expect(wr).toBeGreaterThan(0.44);
    expect(wr).toBeLessThan(0.56);
    const ml = meanLossFrac(rs);
    expect(ml).toBeGreaterThan(0.44);
    expect(ml).toBeLessThan(0.56);
  });

  it('cautious: loses most orbits at parity, heaviest losses', () => {
    const rs = runStance('cautious');
    const wr = winRate(rs);
    expect(wr).toBeGreaterThan(0);
    expect(wr).toBeLessThan(0.06);
    const ml = meanLossFrac(rs);
    expect(ml).toBeGreaterThan(0.58);
    expect(ml).toBeLessThan(0.72);
  });

  it('the documented multipliers order the outcomes strictly', () => {
    const agg = runStance('aggressive');
    const bal = runStance('balanced');
    const cau = runStance('cautious');
    expect(winRate(agg)).toBeGreaterThan(winRate(bal));
    expect(winRate(bal)).toBeGreaterThan(winRate(cau));
    expect(meanLossFrac(agg)).toBeLessThan(meanLossFrac(bal));
    expect(meanLossFrac(bal)).toBeLessThan(meanLossFrac(cau));
  });
});

describe('cautious withdrawal (acceptance: ~25% after a won orbit)', () => {
  it('fires at ~25% when the orbit is always won', () => {
    // A = 10 interceptors + 1 transport = 21 vs D = 11: always wins the orbit.
    let withdrawn = 0;
    let won = 0;
    for (let i = 0; i < N; i++) {
      const { report } = battleAt(20_000 + i, 'cautious', {
        ships: { interceptor: 10, cruiser: 0, transport: 1 },
        defense: 11,
      });
      if (report.outcome !== 'held') won++;
      if (report.outcome === 'withdrawn') withdrawn++;
    }
    expect(won).toBe(N); // orbit always secured
    const rate = withdrawn / N;
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.3);
  });

  it('never fires for aggressive or balanced', () => {
    for (const stance of STANCES) {
      if (stance === 'cautious') continue;
      const { report } = battleAt(3, stance, {
        ships: { interceptor: 10, cruiser: 0, transport: 1 },
        defense: 11,
      });
      if (report.outcome !== 'held') expect(report.outcome).not.toBe('withdrawn');
    }
  });
});

describe('invasion rules (acceptance: surviving transports + orbital superiority)', () => {
  it('no transports → orbit can be won but never captured (no-lift)', () => {
    for (let i = 0; i < 200; i++) {
      const { report } = battleAt(30_000 + i, 'balanced', {
        ships: { interceptor: 7, cruiser: 0, transport: 0 },
        defense: 11,
      });
      if (report.outcome !== 'held') expect(report.outcome).toBe('no-lift');
      expect(report.captured).toBe(false);
    }
  });

  it('losing the orbit never captures (held)', () => {
    for (let i = 0; i < 200; i++) {
      const { report } = battleAt(40_000 + i, 'balanced', {
        ships: { interceptor: 1, cruiser: 0, transport: 1 },
        defense: 20, // outmatched: A=3 vs D=20
      });
      expect(report.outcome).toBe('held');
      expect(report.captured).toBe(false);
    }
  });

  it('won orbit + surviving transports + weak ground → capture', () => {
    const { report, state, targetId } = battleAt(42, 'balanced', {
      ships: { interceptor: 7, cruiser: 0, transport: 1 }, // A = 15: orbit always won
      defense: 11,
      garrison: 0,
      development: 1,
    });
    expect(report.outcome).toBe('captured');
    expect(report.captured).toBe(true);
    const t = state.galaxy.systems.find((s) => s.id === targetId)!;
    expect(t.ownerId).toBe('player');
    expect(t.previousOwnerId).toBe('rival-0');
    expect(t.occupation).toBe('occupied');
    expect(report.garrison).not.toBeNull();
    expect(t.planet!.garrison).toBe(report.garrison);
    expect(t.planet!.garrison).toBeGreaterThan(0);
    expect(state.stats.conquests).toBe(1);
    expect(state.stats.wins).toBe(1);
    // Garrisoned troops leave the fleet (rearm refills them).
    expect(state.flagship.troops + report.garrison!).toBeLessThanOrEqual(10);
  });

  it('strong ground holds: invasion fails, troops are bled, world not captured', () => {
    const { report, state, targetId } = battleAt(43, 'balanced', {
      ships: { interceptor: 7, cruiser: 0, transport: 1 },
      defense: 11,
      garrison: 50,
    });
    expect(report.outcome).toBe('invasion-failed');
    expect(report.captured).toBe(false);
    expect(report.troopsLost).toBeGreaterThan(0);
    expect(report.troopsAfter).toBeLessThan(10);
    const t = state.galaxy.systems.find((s) => s.id === targetId)!;
    expect(t.ownerId).toBe('rival-0'); // not captured
    expect(t.defense).toBe(3); // orbit won: 11 × 0.25 survive the regime change
    expect(state.stats.losses).toBe(1);
  });

  it('troops are lost with their transports in the orbital phase', () => {
    // Two transports at parity (A=2 vs D=2): every won orbit loses exactly
    // one transport — a deterministic half of the troops go with it.
    let wins = 0;
    for (let i = 0; i < 400; i++) {
      const { report } = battleAt(50_000 + i, 'balanced', {
        ships: { interceptor: 0, cruiser: 0, transport: 2 },
        troops: 10,
        defense: 2,
      });
      if (report.outcome !== 'held') {
        wins++;
        expect(report.shipsLost.transport).toBe(1);
        // Five troops died with the lost transport; the landing may bleed more.
        expect(report.troopsLost).toBeGreaterThanOrEqual(5);
        expect(report.troopsAfter).toBe(10 - report.troopsLost);
        expect(report.troopsAfter).toBeLessThanOrEqual(5);
      }
    }
    expect(wins).toBeGreaterThan(100); // parity: the orbit is often won
  });
});

describe('hull degradation', () => {
  it('degrades by half the reported loss fraction, never below 0', () => {
    const { report, state } = battleAt(99, 'balanced', {
      ships: { interceptor: 2, cruiser: 0, transport: 1 },
      defense: 2,
    });
    expect(report.lossFraction).toBeGreaterThan(0);
    expect(report.lossFraction).toBeLessThanOrEqual(1);
    expect(report.hullAfter).toBe(
      Math.max(0, Math.round(100 * (1 - COMBAT.hullDamageFactor * report.lossFraction))),
    );
    expect(state.flagship.hull).toBe(report.hullAfter);
  });
});

describe('battle report (acceptance: every number the player needs)', () => {
  it('carries complete, consistent facts', () => {
    const { report } = battleAt(7, 'balanced', {
      ships: { interceptor: 3, cruiser: 1, transport: 1 },
      defense: 10,
    });
    expect(typeof report.tick).toBe('number');
    expect(typeof report.attackerStrength).toBe('number');
    expect(report.attackerStrength).toBeGreaterThan(0);
    expect(report.defenderStrength).toBe(10);
    expect(report.stance).toBe('balanced');
    // Ships: lost + after = before, per class.
    expect(report.shipsLost.interceptor + report.shipsAfter.interceptor).toBe(3);
    expect(report.shipsLost.cruiser + report.shipsAfter.cruiser).toBe(1);
    expect(report.shipsLost.transport + report.shipsAfter.transport).toBe(1);
    expect(report.hullAfter).toBeGreaterThanOrEqual(0);
    expect(report.hullAfter).toBeLessThanOrEqual(100);
    expect(report.troopsLost + report.troopsAfter).toBe(10);
    expect(typeof report.defenseAfter).toBe('number');
    expect(report.defenseAfter).toBeGreaterThanOrEqual(0);
    expect(typeof report.captured).toBe('boolean');
  });
});

describe('determinism', () => {
  it('the same seed + same stance is fully reproducible', () => {
    const a = battleAt(123, 'aggressive');
    const b = battleAt(123, 'aggressive');
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    const c = battleAt(123, 'cautious');
    expect(JSON.stringify(c.report)).not.toBe(JSON.stringify(a.report));
  });
});

describe('the ATTACK action (core §4: major planetary actions advance time)', () => {
  const rigDocked = (): { g: GameState; targetId: string } => {
    const g = newGame(42);
    const target = g.galaxy.systems.find((s) => s.ownerId === 'rival-0' && s.planet)!;
    target.defense = 5;
    g.flagship.systemId = target.id;
    g.flagship.travel = null;
    return { g, targetId: target.id };
  };

  it('advances exactly one year and stores the report', () => {
    const { g, targetId } = rigDocked();
    const next = dispatchSim(g, { type: 'ATTACK', targetId, stance: 'balanced' });
    expect(next).not.toBe(g);
    expect(next.tick).toBe(g.tick + 1);
    expect(next.lastBattle).not.toBeNull();
    expect(next.lastBattle!.targetId).toBe(targetId);
    expect(next.log.some((e) => e.kind === 'combat')).toBe(true);
  });

  it('is on the time-advancing ledger', () => {
    expect([...TIME_ADVANCING_ACTIONS].sort()).toEqual([
      'ATTACK',
      'REPAIR',
      'TRAVEL',
      'WAIT',
    ]);
  });

  it('refuses: in transit, wrong system, own system, empty star, no strength', () => {
    const { g, targetId } = rigDocked();
    // wrong system
    const other = g.galaxy.systems.find((s) => s.id !== targetId && s.ownerId !== 'player')!;
    expect(dispatchSim(g, { type: 'ATTACK', targetId: other.id, stance: 'balanced' })).toBe(g);
    // own system
    g.flagship.systemId = g.galaxy.homeworldId;
    expect(
      dispatchSim(g, {
        type: 'ATTACK',
        targetId: g.galaxy.homeworldId,
        stance: 'balanced',
      }),
    ).toBe(g);
    // in transit
    g.flagship.systemId = targetId;
    g.flagship.travel = {
      fromId: targetId,
      toId: g.galaxy.systems[0].id,
      departTick: g.tick,
      arriveTick: g.tick + 2,
    };
    expect(dispatchSim(g, { type: 'ATTACK', targetId, stance: 'balanced' })).toBe(g);
    // empty star (no defense, no garrison)
    g.flagship.travel = null;
    const empty = g.galaxy.systems.find((s) => s.planet === null && s.defense === 1)!;
    empty.defense = 0;
    g.flagship.systemId = empty.id;
    expect(canAttack(g, empty.id).ok).toBe(false);
    expect(dispatchSim(g, { type: 'ATTACK', targetId: empty.id, stance: 'balanced' })).toBe(g);
    // no combat strength
    const { g: g2, targetId: t2 } = rigDocked();
    g2.flagship.ships = { interceptor: 0, cruiser: 0, transport: 0 };
    expect(canAttack(g2, t2).ok).toBe(false);
    expect(dispatchSim(g2, { type: 'ATTACK', targetId: t2, stance: 'balanced' })).toBe(g2);
  });

  it('a lost fleet is recorded (stats.fleetsLost) without ending the campaign', () => {
    const g = newGame(42);
    const target = g.galaxy.systems.find((s) => s.ownerId === 'rival-0' && s.planet)!;
    target.defense = 60; // annihilation: A=3 vs D=60
    g.flagship.systemId = target.id;
    g.flagship.travel = null;
    const next = dispatchSim(g, { type: 'ATTACK', targetId: target.id, stance: 'balanced' });
    expect(next.stats.fleetsLost).toBe(1);
    expect(next.status).toBe('active'); // no-recovery defeat is C8's job
    expect(next.lastBattle!.outcome).toBe('held');
  });
});

describe('travel outcome estimate (core §6 preview)', () => {
  it('bands by strength ratio against known defenders', () => {
    const g = newGame(42);
    const target = g.galaxy.systems.find((s) => s.ownerId !== 'player')!;
    target.explored = true;
    g.flagship.ships = { interceptor: 5, cruiser: 0, transport: 1 }; // A = 11
    target.defense = 8; // 11/8 = 1.375 → even
    expect(estimateOutcome(g, target.id)).toBe('even');
    target.defense = 7; // 1.57 → favorable
    expect(estimateOutcome(g, target.id)).toBe('favorable');
    target.defense = 14; // 0.78 → unfavorable
    expect(estimateOutcome(g, target.id)).toBe('unfavorable');
    target.explored = false;
    expect(estimateOutcome(g, target.id)).toBe('unknown');
  });
});
