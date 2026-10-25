import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/data/balance';
import { createFixtureGalaxy } from '../src/engine/galaxy';
import { newGame, runYears } from '../src/engine/simulation';
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
