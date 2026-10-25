import { describe, expect, it } from 'vitest';
import {
  STAGE_ORDER,
  TIME_ADVANCING_ACTIONS,
  dispatchSim,
  newGame,
  runTick,
} from '../src/engine/simulation';
import type { GameState } from '../src/engine/types';

const SEED = 42;

const advance = (g: GameState, n: number): GameState => {
  let s = g;
  for (let i = 0; i < n; i++) s = dispatchSim(s, { type: 'WAIT' });
  return s;
};

describe('newGame — starting conditions (core §3)', () => {
  it('starts with the documented core state', () => {
    const g = newGame(SEED);
    expect(g.v).toBe(1);
    expect(g.tick).toBe(0);
    expect(g.status).toBe('active');
    expect(g.defeatReason).toBeNull();
    expect(g.empire).toEqual({ credits: 100, materials: 100, fuel: 100 });
    expect(g.flagship.systemId).toBe(g.galaxy.homeworldId);
    expect(g.flagship.ships).toEqual({ interceptor: 2, cruiser: 0, transport: 1 });
    expect(g.flagship.hull).toBe(100);
    expect(g.supports).toEqual([]);
    expect(g.rivals).toEqual([]);
    expect(g.galaxy.systems).toHaveLength(20);
    expect(g.log.length).toBeGreaterThanOrEqual(1);
    // Two independent, serialized RNG streams (PLAN §7).
    expect(g.rng).toHaveLength(4);
    expect(g.narrRng).toHaveLength(4);
    expect(g.rng).not.toEqual(g.narrRng);
    // Default campaign uses low supernova frequency (core §10).
    expect(g.settings.supernovaFreq).toBe('low');
  });

  it('honors the supernova frequency option', () => {
    const zero = newGame(SEED, { supernovaFrequency: 'zero' });
    expect(zero.galaxy.systems.some((s) => s.supernovaCandidate)).toBe(false);
    expect(zero.settings.supernovaFreq).toBe('zero');
  });

  it('the homeworld exists for the UI to open on', () => {
    const g = newGame(SEED);
    expect(g.galaxy.systems.find((s) => s.id === g.galaxy.homeworldId)).toBeDefined();
    expect(g.flagship.systemId).toBe(g.galaxy.homeworldId);
  });
});

describe('state serializability (PLAN §7)', () => {
  it('new-game state round-trips through JSON', () => {
    const g = newGame(SEED);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });

  it('state after several years round-trips through JSON', () => {
    const g = advance(newGame(SEED), 5);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
  });
});

describe('time advancement (core §4)', () => {
  it('only listed actions advance time', () => {
    expect([...TIME_ADVANCING_ACTIONS].sort()).toEqual(['WAIT']);
  });

  it('WAIT advances exactly one galactic year by default', () => {
    const g = newGame(SEED);
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.tick).toBe(1);
    expect(g.tick).toBe(0); // original untouched — pure dispatch
  });

  it('successive WAITs accumulate years', () => {
    expect(advance(newGame(SEED), 10).tick).toBe(10);
  });

  it('unlisted actions cannot advance time', () => {
    const g = newGame(SEED);
    const next = dispatchSim(g, { type: 'TRAVEL' } as never);
    expect(next).toBe(g);
  });

  it('a draw-free C3 tick preserves the sim RNG exactly (no stage consumes it yet)', () => {
    const g = newGame(SEED);
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.rng).toEqual(g.rng);
  });

  it('stage draws persist into the serialized sim RNG', () => {
    const g = newGame(SEED);
    const next = runTick(g, {
      stages: {
        resources: (_d, rng) => {
          rng.next();
        },
      },
    });
    expect(next.rng).not.toEqual(g.rng);
  });

  it('the narration RNG is untouched by C3 ticks (separate stream)', () => {
    const g = newGame(SEED);
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.narrRng).toEqual(g.narrRng);
  });
});

describe('tick pipeline (core §4 fixed order)', () => {
  it('runs the seven stages in canonical order', () => {
    const seen: string[] = [];
    runTick(newGame(SEED), { trace: (s) => seen.push(s) });
    expect(seen).toEqual([
      'resources',
      'development',
      'occupation',
      'fleets',
      'rivals',
      'stars',
      'winLose',
    ]);
    expect(STAGE_ORDER).toHaveLength(7);
  });

  it('a later stage observes the results of an earlier stage', () => {
    let observed: number | null = null;
    runTick(newGame(SEED), {
      stages: {
        resources: (d) => {
          d.stats.conquests = 77; // earlier stage writes…
        },
        development: (_d, _rng, _year) => {
          // …and a later stage reads it, mid-pipeline.
          observed = _d.stats.conquests;
        },
      },
    });
    expect(observed).toBe(77);
  });

  it('the win/lose stage evaluates the galaxy after all other stages ran', () => {
    const g = newGame(SEED);
    // The player holds exactly one system; take it away (as combat would).
    for (const s of g.galaxy.systems) {
      if (s.ownerId === 'player') s.ownerId = null;
    }
    const next = dispatchSim(g, { type: 'WAIT' });
    expect(next.status).toBe('defeat');
    expect(next.defeatReason).toBe('total');
    expect(next.log.at(-1)?.kind).toBe('warning');
  });

  it('a finished campaign is frozen — further ticks are no-ops', () => {
    const g = newGame(SEED);
    for (const s of g.galaxy.systems) {
      if (s.ownerId === 'player') s.ownerId = null;
    }
    const dead = dispatchSim(g, { type: 'WAIT' });
    expect(dead.status).toBe('defeat');
    expect(dispatchSim(dead, { type: 'WAIT' })).toBe(dead);
  });
});

describe('determinism (PLAN §7)', () => {
  it('same seed → identical state after 10 years, twice', () => {
    expect(JSON.stringify(advance(newGame(7), 10))).toBe(
      JSON.stringify(advance(newGame(7), 10)),
    );
  });

  it('different seeds → different states', () => {
    expect(JSON.stringify(advance(newGame(1), 3))).not.toBe(
      JSON.stringify(advance(newGame(2), 3)),
    );
  });
});
