import { describe, expect, it } from 'vitest';
import { CAMPAIGN, EMPIRE_SCORE } from '../src/data/balance';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import { newGame, runYears } from '../src/engine/simulation';
import { alignmentProgress, empireScore, evaluateWinLose } from '../src/engine/victory';
import type { GameState, System } from '../src/engine/types';

const SEED = 4242;

function fixtureState(): GameState {
  const s = newGame(SEED);
  s.galaxy = createFixtureGalaxy();
  return s;
}

/** All inhabited fixture worlds player-owned, with the given number of
 *  extra integrated worlds (the homeworld always counts). The remaining
 *  occupied worlds are UNGARRISONED so they decline but cannot integrate
 *  during the test tick — keeping the integration count stable. */
function aligned(s: GameState, extraIntegrated: number): void {
  let integrated = 0;
  for (const t of s.galaxy.systems) {
    if (t.planet === null) continue;
    t.ownerId = 'player';
    if (t.id === s.galaxy.homeworldId || integrated < extraIntegrated) {
      t.occupation = 'integrated';
      t.planet.integration = 100;
      if (t.id !== s.galaxy.homeworldId) integrated++;
    } else {
      t.occupation = 'occupied';
      t.planet.integration = 0;
      t.planet.garrison = 0; // no integration growth this tick
      t.planet.stability = 100;
    }
  }
}

describe('victory & defeat (C8)', () => {
  it('wins when all inhabited worlds are owned and ≥ 60% integrated', () => {
    let s = fixtureState();
    aligned(s, 4); // 5/7 = 71.4% ≥ 60%
    expect(s.status).toBe('active');
    s = runYears(s, 1);
    expect(s.status).toBe('victory');
  });

  it('does NOT win below the 60% integration threshold', () => {
    let s = fixtureState();
    aligned(s, 2); // 3/7 = 42.9% < 60%
    s = runYears(s, 1);
    expect(s.status).toBe('active');
  });

  it('does NOT win while an inhabited world is not player-controlled', () => {
    let s = fixtureState();
    aligned(s, 5); // 6/7 would be ≥ 60%, but one world stays rival-owned
    const t = s.galaxy.systems.find((x) => x.id === 'S03')!;
    t.ownerId = 'rival-0';
    t.occupation = 'none';
    s = runYears(s, 1);
    expect(s.status).toBe('active');
  });

  it('victory is evaluated before the deadline (win on the final year)', () => {
    let s = fixtureState();
    aligned(s, 4);
    s.tick = CAMPAIGN.deadlineYears; // year 120 — the last allowed year
    s = runYears(s, 1);
    expect(s.status).toBe('victory');
  });

  it('defeats on the deadline when the campaign is unfinished', () => {
    let s = fixtureState();
    s.tick = CAMPAIGN.deadlineYears;
    // Only the homeworld is held; no victory possible this tick.
    for (const t of s.galaxy.systems) {
      if (t.id !== s.galaxy.homeworldId) t.ownerId = t.ownerId === 'player' ? 'rival-0' : t.ownerId;
    }
    s = runYears(s, 1);
    expect(s.status).toBe('defeat');
    expect(s.defeatReason).toBe('deadline');
  });

  it('defeats when no ships and no shipyard remain (no recovery path)', () => {
    let s = fixtureState();
    // The player holds exactly ONE small non-shipyard world.
    const only: System = s.galaxy.systems.find((x) => x.id === 'S01')!;
    for (const t of s.galaxy.systems) {
      if (t.id === only.id) continue;
      if (t.ownerId === 'player') t.ownerId = 'rival-0';
    }
    only.ownerId = 'player';
    only.occupation = 'none';
    // S01: quarry, dev 1, not a fortress → not a shipyard.
    expect(only.planet!.specialization).not.toBe('fortress');
    s.flagship.ships = { interceptor: 0, cruiser: 0, transport: 0 };
    s = runYears(s, 1);
    expect(s.status).toBe('defeat');
    expect(s.defeatReason).toBe('unrecoverable');
  });

  it('a 0-ship flagship with a shipyard held is still recoverable (not a defeat)', () => {
    let s = fixtureState();
    s.flagship.ships = { interceptor: 0, cruiser: 0, transport: 0 };
    // The homeworld (dev 3) is a shipyard.
    s = runYears(s, 3);
    expect(s.status).toBe('active');
  });

  it('total wipe still defeats immediately', () => {
    let s = fixtureState();
    for (const t of s.galaxy.systems) if (t.ownerId === 'player') t.ownerId = 'rival-0';
    s = runYears(s, 1);
    expect(s.status).toBe('defeat');
    expect(s.defeatReason).toBe('total');
  });
});

describe('C18 — mandate progress readout & empire score', () => {
  function ownedAnd(s: GameState, owned: boolean, integrated: boolean): void {
    for (const t of s.galaxy.systems) {
      if (!t.planet) continue;
      t.ownerId = owned ? 'player' : t.id === s.galaxy.homeworldId ? 'player' : 'rival-0';
      t.occupation = integrated
        ? 'integrated'
        : t.id === s.galaxy.homeworldId
          ? 'integrated'
          : 'occupied';
    }
  }

  function engineVerdict(s: GameState): boolean {
    const d = structuredClone(s);
    evaluateWinLose(d);
    return d.status === 'victory';
  }

  it('alignmentProgress matches the win/lose rule exactly (shown = simulated)', () => {
    const cases: Array<[boolean, boolean, string]> = [
      [false, true, 'start: only the homeworld is aligned'],
      [true, true, 'all owned, all integrated — victory'],
      [true, false, 'all owned, only the homeworld integrated — 60% gate fails'],
      [false, true, 'not everything is under authority — ownership fails'],
    ];
    for (const [owned, integrated, label] of cases) {
      const s = fixtureState();
      ownedAnd(s, owned, integrated);
      const prog = alignmentProgress(s);
      expect(prog.complete, label).toBe(engineVerdict(s));
    }
  });

  it('destroyed systems are excluded from the mandate denominator (core §12)', () => {
    const s = fixtureState();
    ownedAnd(s, true, true);
    const totalBefore = alignmentProgress(s).total;
    const neutral = s.galaxy.systems.find(
      (t) => t.planet && t.ownerId !== 'rival-0' && !t.destroyed,
    )!;
    neutral.destroyed = true;
    neutral.planet = null;
    const prog = alignmentProgress(s);
    expect(prog.total).toBe(totalBefore - 1);
    expect(engineVerdict(s)).toBe(true); // the remnant does not block victory
  });

  it('the empire score is the transparent formula from balance.ts, floored at 0', () => {
    const s = fixtureState();
    s.stats.conquests = 3;
    s.stats.fleetsLost = 2;
    s.stats.supernovas = 1;
    s.tick = 40;
    const { aligned } = alignmentProgress(s); // homeworld only, at tick 0 baseline
    const expected =
      3 * EMPIRE_SCORE.perConquest +
      aligned * EMPIRE_SCORE.perAlignedWorld +
      1 * EMPIRE_SCORE.perSurvivedSupernova +
      2 * EMPIRE_SCORE.perFleetLost +
      40 * EMPIRE_SCORE.perYearServed;
    expect(empireScore(s)).toBe(Math.max(0, expected));

    // A short, bleed-heavy campaign floors at zero — never negative.
    const f = fixtureState();
    f.stats.fleetsLost = 10;
    f.tick = 150;
    expect(empireScore(f)).toBe(0);
  });
});
