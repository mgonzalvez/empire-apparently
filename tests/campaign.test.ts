import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/balance';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import { newGame } from '../src/engine/simulation';
import { playCruise } from './campaign-sim';

/**
 * C8 acceptance (PLAN P2, the Tier-0 floor): a mostly-automatic player —
 * travel + attack + basic upkeep only — wins the 8-system fixture galaxy.
 * The simulation is deterministic, so this single outcome IS the proof.
 */
describe('campaign: cruise profile (Tier-0 floor)', () => {
  it('wins the 8-system fixture within the mandate', () => {
    const s = newGame(4242);
    s.galaxy = createFixtureGalaxy();
    s.flagship.systemId = s.galaxy.homeworldId; // dock at the fixture homeworld
    const r = playCruise(s, CAMPAIGN.deadlineYears + 1);
    expect(r.ended).toBe('victory');
    expect(r.ticks).toBeLessThanOrEqual(CAMPAIGN.deadlineYears);
  });

  it('runs a full 20-system campaign without error (C12 asserts cross-seed wins)', () => {
    const r = playCruise(newGame(42), CAMPAIGN.deadlineYears + 1);
    // Must terminate cleanly — one way or another.
    expect(['victory', 'defeat', 'aborted']).toContain(r.ended);
    expect(Number.isFinite(r.ticks)).toBe(true);
    for (const res of ['credits', 'materials', 'fuel'] as const) {
      expect(r.game.empire[res]).toBeGreaterThanOrEqual(0);
    }
  });
});
