import { describe, expect, it } from 'vitest';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import {
  integrationEstimate,
  isGarrisoned,
  isThreatened,
  occupationStatus,
  recommendedGarrison,
} from '../src/engine/occupation';
import { dispatchSim, newGame, runYears } from '../src/engine/simulation';
import type { GameState, System } from '../src/engine/types';

const SEED = 4242;

function fixtureState(): GameState {
  const s = newGame(SEED);
  s.galaxy = createFixtureGalaxy();
  return s;
}

/** A player-occupied world under the player's control (bypasses combat). */
function occupy(s: GameState, systemId: string, garrison: number): System {
  const t = s.galaxy.systems.find((x) => x.id === systemId)!;
  t.previousOwnerId = t.ownerId; // the old owner, if any
  t.ownerId = 'player';
  t.occupation = 'occupied';
  t.planet!.garrison = garrison;
  t.planet!.stability = 100;
  t.planet!.integration = 0;
  return t;
}

describe('occupation (C8)', () => {
  it('recommended garrison = development, +1 while a rival is grid-adjacent (C10)', () => {
    const s = fixtureState();
    const g = s.galaxy;
    const of = (id: string) => g.systems.find((x) => x.id === id)!;
    // S00 (dev 2): neighbors S01 (unclaimed) and S04 (player) → base only.
    expect(recommendedGarrison(of('S00').planet!, of('S00'), g)).toBe(2);
    // S05 (dev 1): grid-adjacent to S06 (rival-0) → +1.
    expect(recommendedGarrison(of('S05').planet!, of('S05'), g)).toBe(2);
    // S02 (dev 3): grid-adjacent to S03 and S06 (rival-0) → 3 + 1 (bonus once).
    expect(recommendedGarrison(of('S02').planet!, of('S02'), g)).toBe(4);
    // Threat is live: when the adjacent rival world is no longer rival-owned,
    // the bonus disappears.
    of('S06').ownerId = 'ind-1';
    expect(isThreatened(of('S05'), g)).toBe(false);
    expect(recommendedGarrison(of('S05').planet!, of('S05'), g)).toBe(1);
  });

  it('occupationStatus derives Stable / Unstable / Rebellion Imminent', () => {
    expect(occupationStatus(true, 100)).toBe('stable');
    expect(occupationStatus(true, 5)).toBe('stable'); // garrisoned always wins
    expect(occupationStatus(false, 80)).toBe('unstable');
    expect(occupationStatus(false, 39)).toBe('imminent');
    expect(occupationStatus(false, 40)).toBe('unstable'); // 40 is not below 40
  });

  it('isGarrisoned: unthreatened worlds settle with any garrison; threatened ones need ≥ 1', () => {
    const s = fixtureState();
    const g = s.galaxy;
    const of = (id: string) => g.systems.find((x) => x.id === id)!;
    expect(isGarrisoned(of('S00').planet!, of('S00'), g)).toBe(true); // no rival next door
    expect(isGarrisoned(of('S05').planet!, of('S05'), g)).toBe(false); // threatened, garrison 0
    of('S05').planet!.garrison = 1;
    expect(isGarrisoned(of('S05').planet!, of('S05'), g)).toBe(true);
  });

  it('a garrisoned world integrates over ticks (100 stability → ~2 years)', () => {
    let s = fixtureState();
    occupy(s, 'S01', 5); // recommended = dev 1
    expect(s.galaxy.systems.find((x) => x.id === 'S01')!.planet!.development).toBe(1);
    s = runYears(s, 1);
    // stability 100 → +50 integration
    expect(s.galaxy.systems.find((x) => x.id === 'S01')!.planet!.integration).toBe(50);
    expect(s.galaxy.systems.find((x) => x.id === 'S01')!.occupation).toBe('occupied');
    s = runYears(s, 1);
    const after = s.galaxy.systems.find((x) => x.id === 'S01')!;
    expect(after.occupation).toBe('integrated');
    expect(after.planet!.integration).toBe(100);
    expect(after.planet!.stability).toBe(100);
    expect(s.log.some((l) => l.text.includes('S01') || l.text.includes(after.planet!.name))).toBe(true);
  });

  it('integration rate is proportional to stability', () => {
    let s = fixtureState();
    const t = occupy(s, 'S02', 5);
    t.planet!.stability = 50;
    s = runYears(s, 1);
    // stability 50→60, then +60×0.5 = 30
    let w = s.galaxy.systems.find((x) => x.id === 'S02')!;
    expect(w.planet!.stability).toBe(60);
    expect(w.planet!.integration).toBe(30);
    s = runYears(s, 1);
    w = s.galaxy.systems.find((x) => x.id === 'S02')!;
    // 60→70, +35 → 65
    expect(w.planet!.stability).toBe(70);
    expect(w.planet!.integration).toBe(65);
  });

  it('an under-garrisoned world declines and rebels to its previous faction', () => {
    let s = fixtureState();
    // Isolate occupation: rivals stay (threat is live) but cannot expand.
    s.galaxy.systems.find((x) => x.id === 'S06')!.defense = 0;
    s.galaxy.systems.find((x) => x.id === 'S03')!.defense = 0;
    // S05 is ind-1's → previous owner is the independent faction.
    occupy(s, 'S05', 0); // threatened, garrison 0 → under-garrisoned
    s = runYears(s, 5);
    const after = s.galaxy.systems.find((x) => x.id === 'S05')!;
    expect(after.ownerId).toBe('ind-1');
    expect(after.occupation).toBe('none');
    expect(after.planet!.garrison).toBe(0);
    expect(after.planet!.stability).toBe(100);
    expect(after.planet!.integration).toBe(0);
    expect(s.log.some((l) => l.kind === 'warning' && l.text.includes('rebels'))).toBe(true);
  });

  it('an under-garrisoned world with no previous owner secedes to unclaimed', () => {
    let s = fixtureState();
    s.galaxy.systems.find((x) => x.id === 'S06')!.defense = 0;
    s.galaxy.systems.find((x) => x.id === 'S03')!.defense = 0;
    occupy(s, 'S01', 0); // neutral, threatened (S06 diagonal) → previousOwnerId null
    s = runYears(s, 5);
    const after = s.galaxy.systems.find((x) => x.id === 'S01')!;
    expect(after.ownerId).toBeNull();
    expect(after.occupation).toBe('none');
  });

  it('an integrated world never rebels, even ungarrisoned', () => {
    let s = fixtureState();
    const t = occupy(s, 'S00', 0);
    t.occupation = 'integrated';
    t.planet!.integration = 100;
    s = runYears(s, 8);
    const after = s.galaxy.systems.find((x) => x.id === 'S00')!;
    expect(after.ownerId).toBe('player');
    expect(after.occupation).toBe('integrated');
  });

  it('the homeworld starts fully integrated', () => {
    const s = newGame(SEED);
    const home = s.galaxy.systems.find((x) => x.id === s.galaxy.homeworldId)!;
    expect(home.occupation).toBe('integrated');
    expect(home.planet!.integration).toBe(100);
    expect(home.planet!.garrison).toBe(0);
  });

  it('rival expansions do not trigger occupation (only player worlds settle)', () => {
    let s = fixtureState();
    // S06 (rival-0, defense 6) takes S05 (ind-1, defense 4) on tick 1.
    sys2(s, 'S01').ownerId = 'player'; // shield S01 so S05 is the pick
    sys2(s, 'S07').ownerId = 'player'; // keep S03 from spending the action on S07
    const t = s.galaxy.systems.find((x) => x.id === 'S05')!;
    t.planet!.garrison = 4;
    s = runYears(s, 1);
    const after = s.galaxy.systems.find((x) => x.id === 'S05')!;
    expect(after.ownerId).toBe('rival-0');
    expect(after.planet!.garrison).toBe(0); // dispersed
    expect(after.occupation).toBe('none');
  });

function sys2(s: GameState, id: string) {
  return s.galaxy.systems.find((x) => x.id === id)!;
}
});

describe('occupation depth (C10)', () => {
  const of = (s: GameState, id: string) => s.galaxy.systems.find((x) => x.id === id)!;

  it('auto top-up saves a below-line world with zero player input (flagship docked)', () => {
    let s = fixtureState();
    s.empire = { credits: 0, materials: 0, fuel: 0 }; // freeze development
    // S01 (threatened, rec 2): garrison 0, stability 100; flagship docked with 5 troops.
    occupy(s, 'S01', 0);
    s.flagship.systemId = 'S01';
    s.flagship.travel = null;
    s.flagship.troops = 5;
    // t1-t3: 80/60/40 · t4: 40 is not below 40 → 20 · t5: 20 < 40 → top-up
    // to the recommended garrison, then the world is garrisoned again: 20 → 30.
    // (The world earns income, so it may develop — recommend is live, not hardcoded.)
    s = runYears(s, 5);
    const rec = recommendedGarrison(of(s, 'S01').planet!, of(s, 'S01'), s.galaxy);
    expect(of(s, 'S01').planet!.garrison).toBe(rec);
    expect(s.flagship.troops).toBe(5 - rec);
    expect(of(s, 'S01').planet!.stability).toBe(30);
    expect(of(s, 'S01').ownerId).toBe('player'); // no rebellion
    expect(s.log.some((l) => l.text.includes('topped up'))).toBe(true);
    // And it recovers fully.
    s = runYears(s, 4);
    expect(of(s, 'S01').occupation).toBe('integrated');
  });

  it('no auto top-up when the flagship is absent — the world declines', () => {
    let s = fixtureState();
    occupy(s, 'S01', 0); // flagship stays at the homeworld (S04)
    s = runYears(s, 3);
    expect(of(s, 'S01').planet!.garrison).toBe(0);
    expect(of(s, 'S01').planet!.stability).toBe(40);
    expect(s.log.some((l) => l.text.includes('topped up'))).toBe(false);
  });

  it('REINFORCE is instant, fills to recommended, and needs a docked flagship with troops', () => {
    let s = fixtureState();
    occupy(s, 'S01', 0); // rec 2 (dev 1 + threat); flagship at S13 (nowhere in the fixture)
    s.flagship.troops = 4;
    expect(dispatchSim(s, { type: 'REINFORCE', systemId: 'S01' })).toBe(s); // not docked

    s.flagship.systemId = 'S01';
    s.flagship.travel = null;
    const n1 = dispatchSim(s, { type: 'REINFORCE', systemId: 'S01' });
    expect(n1).not.toBe(s);
    expect(n1.tick).toBe(s.tick); // instant: 0 ticks
    expect(n1.rng).toEqual(s.rng); // no RNG
    expect(of(n1, 'S01').planet!.garrison).toBe(2); // filled to recommended
    expect(n1.flagship.troops).toBe(2);
    expect(n1.log.some((l) => l.text.includes('reinforced the garrison'))).toBe(true);

    expect(dispatchSim(n1, { type: 'REINFORCE', systemId: 'S01' })).toBe(n1); // already at recommended

    const s2 = fixtureState();
    occupy(s2, 'S01', 0);
    s2.flagship.systemId = 'S01';
    s2.flagship.travel = null;
    s2.flagship.troops = 0;
    expect(dispatchSim(s2, { type: 'REINFORCE', systemId: 'S01' })).toBe(s2); // no troops

    const s3 = fixtureState();
    s3.flagship.systemId = 'S02'; // S02 is neutral — not an occupation
    s3.flagship.travel = null;
    s3.flagship.troops = 5;
    expect(dispatchSim(s3, { type: 'REINFORCE', systemId: 'S02' })).toBe(s3);
  });

  it('reinforce is strictly better under rival pressure (threatened world)', () => {
    // S05: dev 1, grid-adjacent to rival-0 → threatened, rec 2. A capture
    // that left garrison 0 (troop-starved) is on the decline track.
    // Two identical lines from tick 0.
    const mk = (): GameState => {
      const s = fixtureState();
      // Rival stays (threat is live) but cannot expand (defense 0).
      of(s, 'S06').defense = 0;
      of(s, 'S03').defense = 0;
      const t = s.galaxy.systems.find((x) => x.id === 'S05')!;
      t.previousOwnerId = t.ownerId; // ind-1
      t.ownerId = 'player';
      t.occupation = 'occupied';
      t.planet!.garrison = 0; // < required under threat
      t.planet!.stability = 100;
      t.planet!.integration = 0;
      s.flagship.systemId = 'S05';
      s.flagship.travel = null;
      s.flagship.troops = 4;
      return s;
    };

    // Line B: reinforce at tick 0, then the flagship leaves (no auto help).
    let b = dispatchSim(mk(), { type: 'REINFORCE', systemId: 'S05' });
    expect(of(b, 'S05').planet!.garrison).toBe(2);
    b.flagship.systemId = 'S04';
    b.flagship.travel = null;

    // Line A: nothing (flagship absent — the Tier-0 top-up cannot reach it).
    let a = mk();
    a.flagship.systemId = 'S04';
    a.flagship.travel = null;

    // B is garrisoned from the start: +50/yr → integrated by tick 2.
    b = runYears(b, 2);
    expect(of(b, 'S05').occupation).toBe('integrated');
    expect(of(b, 'S05').planet!.stability).toBe(100);

    // A is still player-owned at tick 2 but already 40 points down, no integration.
    a = runYears(a, 2);
    expect(of(a, 'S05').ownerId).toBe('player');
    expect(of(a, 'S05').planet!.stability).toBe(60);
    expect(of(a, 'S05').planet!.integration).toBe(0);
    expect(of(a, 'S05').occupation).toBe('occupied');

    // ...and with no input at all, A rebels by tick 5. B never was at risk.
    a = runYears(a, 3);
    expect(of(a, 'S05').ownerId).toBe('ind-1');
  });

  it('integration estimate matches the actual outcome (within 1 year)', () => {
    let s = fixtureState();
    // S02 (dev 3, rival-adjacent → rec 4): garrison 4, stability 50, integration 0.
    const t = occupy(s, 'S02', 4);
    t.planet!.stability = 50;
    const rec = recommendedGarrison(t.planet!, t, s.galaxy);
    expect(rec).toBe(4);
    const est = integrationEstimate(t.planet!, true);
    // t1: 60 → +30 · t2: 70 → +35 (65) · t3: 80 → +40 (→100) = 3 years.
    expect(est).toBe(3);
    s = runYears(s, 2);
    expect(of(s, 'S02').occupation).toBe('occupied'); // not yet
    s = runYears(s, 1);
    expect(of(s, 'S02').occupation).toBe('integrated'); // exactly the estimate
  });

  it('the estimate is null while under-garrisoned', () => {
    const s = fixtureState();
    const t = of(s, 'S01');
    expect(integrationEstimate(t.planet!, false)).toBeNull();
  });

  it('capture assigns the recommended garrison from surviving troops (combat → occupation)', () => {
    const s = newGame(4242);
    s.galaxy = createFixtureGalaxy();
    s.flagship.systemId = 'S05'; // ind-1, dev 1, rival-adjacent → rec 2
    s.flagship.travel = null;
    s.flagship.ships = { interceptor: 7, cruiser: 0, transport: 1 }; // A = 15 vs D = 4
    s.flagship.troops = 10;
    s.flagship.hull = 100;
    const next = dispatchSim(s, { type: 'ATTACK', targetId: 'S05', stance: 'aggressive' });
    const t = of(next, 'S05');
    expect(t.ownerId).toBe('player');
    expect(t.planet!.garrison).toBe(2); // exactly the recommended level
    // Surviving troops split between garrison and fleet (nothing created).
    expect(t.planet!.garrison + next.flagship.troops).toBeLessThanOrEqual(10);
  });

  it('all fallbacks with zero player input: a troop-starved capture still settles (top-up + rearm loop)', () => {
    // A capture that left garrison 0 on a threatened world, flagship away
    // and empty-handed: it declines. Then the player simply returns with
    // troops — the Tier-0 top-up does the rest, no command required.
    let s = fixtureState();
    s.empire = { credits: 0, materials: 0, fuel: 0 }; // freeze development
    occupy(s, 'S01', 0); // threatened (S06 adjacent)
    s.flagship.systemId = 'S04'; // absent for the first three years…
    s.flagship.travel = null;
    s.flagship.troops = 0;
    s = runYears(s, 3);
    expect(of(s, 'S01').planet!.stability).toBe(40); // declining, not yet lost
    // …then the flagship returns with troops.
    s.flagship.systemId = 'S01';
    s.flagship.troops = 3;
    s = runYears(s, 1); // t4: 40 is not below 40 → 20
    s = runYears(s, 1); // t5: 20 < 40 → auto top-up to recommended → garrisoned → 30
    const rec = recommendedGarrison(of(s, 'S01').planet!, of(s, 'S01'), s.galaxy);
    expect(of(s, 'S01').planet!.garrison).toBe(rec);
    expect(s.flagship.troops).toBe(3 - rec);
    expect(of(s, 'S01').ownerId).toBe('player');
  });
});
