import { describe, expect, it } from 'vitest';
import { CAMPAIGN, RIVAL } from '../src/data/balance';
import { createFixtureGalaxy, gridNeighbors } from '../src/engine/galaxy';
import { defensiveStrength } from '../src/engine/combat';
import { newGame } from '../src/engine/simulation';
import { playCruise, playProfile } from './campaign-sim';
import type { GameState } from '../src/engine/types';

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

  it('runs a full 20-system campaign without error', () => {
    const r = playCruise(newGame(42));
    // Must terminate cleanly — one way or another.
    expect(['victory', 'defeat']).toContain(r.ended);
    expect(Number.isFinite(r.ticks)).toBe(true);
    for (const res of ['credits', 'materials', 'fuel'] as const) {
      expect(r.game.empire[res]).toBeGreaterThanOrEqual(0);
    }
  });
});

/**
 * C12 (Gate M2, PLAN §14–15): the 100-seed campaign sweep. Two headless
 * profiles over the full 20-system galaxy:
 *  - zero dead ends (no total wipeout, no unrecoverable, no loop abort),
 *  - cruise wins ≥ 50%, engaged wins ≥ cruise,
 *  - p50 winning campaign in the 90–150 tick band,
 *  - rivals hold ≤ 60% of inhabited systems in ≥ 90% of engaged wins,
 *  - decision budget: p95 of threatened player worlds per tick ≤ 3.
 * Deterministic — the sweep is the proof, run to completion every time.
 */
describe('campaign: C12 100-seed sweep (Gate M2)', () => {
  const SEEDS = 100;

  const inhabited = (s: GameState) => s.galaxy.systems.filter((t) => t.planet !== null && !t.destroyed);

  const rivalShare = (s: GameState): number => {
    const all = inhabited(s);
    const rival = new Set(s.galaxy.factions.filter((f) => f.kind === 'rival').map((f) => f.id));
    return all.filter((t) => t.ownerId !== null && rival.has(t.ownerId)).length / all.length;
  };

  /** Decision-budget proxy: player worlds a neighboring flotilla can take next year. */
  const threatenedCount = (s: GameState): number => {
    const rivals = s.galaxy.factions.filter((f) => f.kind === 'rival');
    return s.galaxy.systems.filter((t) => {
      if (t.ownerId !== 'player' || !t.planet) return false;
      return gridNeighbors(s.galaxy.systems, t).some((n) => {
        const f = rivals.find((r) => r.id === n.ownerId);
        return f !== undefined && f.fleet >= RIVAL.attackRatio * defensiveStrength(t);
      });
    }).length;
  };

  it(`100 seeds × 2 profiles: no dead ends, guardrails hold (${SEEDS} seeds)`, () => {
    const cruiseWins: number[] = [];
    const engagedWins: number[] = [];
    const engagedRivalShares: number[] = [];
    const attention: number[] = [];
    let deadEnds = 0;
    let aborted = 0;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const rc = playProfile(newGame(seed), 'cruise');
      const re = playProfile(newGame(seed), 'engaged', CAMPAIGN.deadlineYears + 1, (s) => {
        attention.push(threatenedCount(s));
      });

      for (const r of [rc, re]) {
        if (r.ended === 'aborted') aborted += 1; // no-progress loop
        if (r.ended === 'defeat' && r.game.defeatReason !== 'deadline') deadEnds += 1;
      }
      if (rc.ended === 'victory') cruiseWins.push(rc.ticks);
      if (re.ended === 'victory') {
        engagedWins.push(re.ticks);
        engagedRivalShares.push(rivalShare(re.game));
      }
    }

    // No dead ends, no loops.
    expect(deadEnds).toBe(0);
    expect(aborted).toBe(0);

    // Cruise ≥ 50% (PLAN §15); engaged at least as good (PLAN §14).
    expect(cruiseWins.length).toBeGreaterThanOrEqual(50);
    expect(engagedWins.length).toBeGreaterThanOrEqual(cruiseWins.length);

    // p50 winning campaign in the 90–150 tick band.
    const p50 = (a: number[]) => a[Math.floor(a.length / 2)];
    const sortedEngaged = [...engagedWins].sort((a, b) => a - b);
    expect(p50(sortedEngaged)).toBeGreaterThanOrEqual(90);
    expect(p50(sortedEngaged)).toBeLessThanOrEqual(150);

    // No runaway: rivals ≤ 60% in ≥ 90% of engaged wins.
    const contained = engagedRivalShares.filter((x) => x <= 0.6).length;
    expect(contained / engagedRivalShares.length).toBeGreaterThanOrEqual(0.9);

    // Decision budget: p95 of threatened worlds ≤ 3 (PLAN §15).
    const sortedAttention = [...attention].sort((a, b) => a - b);
    expect(sortedAttention[Math.ceil(sortedAttention.length * 0.95) - 1]).toBeLessThanOrEqual(3);
  }, 600_000);
});
