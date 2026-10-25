/**
 * Empire bar (C4): year, global resources, flagship summary (+ transit).
 * Resource totals tick up with the economy (C5).
 */

import type { GameState } from '../engine/types';
import { totalShips } from '../engine/simulation';

export function EmpireBar({ game }: { game: GameState }) {
  const f = game.flagship;
  return (
    <header className="empire-bar">
      <div className="empire-year">Year {game.tick}</div>
      <div
        className="empire-resources"
        title="The three global resources. Production arrives with the economy (next chunk)."
      >
        <span>C {Math.floor(game.empire.credits)}</span>
        <span>M {Math.floor(game.empire.materials)}</span>
        <span>F {Math.floor(game.empire.fuel)}</span>
      </div>
      <div className="empire-fleet">
        {f.travel
          ? `${f.name} — in transit, arrives Y${f.travel.arriveTick}`
          : `${f.name} · ${totalShips(f)} ships`}
      </div>
    </header>
  );
}
