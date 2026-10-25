/**
 * Empire bar (C5): year, global resources with per-year income (core §5
 * economic interface: totals + income per galactic year), flagship summary.
 * The income figure comes from the same `empireIncome` the engine applies —
 * what is shown is what the sim does.
 */

import type { GameState } from '../engine/types';
import { totalShips } from '../engine/simulation';
import { empireIncome } from '../engine/economy';

export function EmpireBar({ game }: { game: GameState }) {
  const f = game.flagship;
  const income = empireIncome(game.galaxy.systems, 'player');
  return (
    <header className="empire-bar">
      <div className="empire-year">Year {game.tick}</div>
      <div
        className="empire-resources"
        title="Three global resources. Parentheses = income per galactic year."
      >
        <span>C {Math.floor(game.empire.credits)} (+{income.credits})</span>
        <span>M {Math.floor(game.empire.materials)} (+{income.materials})</span>
        <span>F {Math.floor(game.empire.fuel)} (+{income.fuel})</span>
      </div>
      <div className="empire-fleet">
        {f.travel
          ? `${f.name} — in transit, arrives Y${f.travel.arriveTick}`
          : `${f.name} · ${totalShips(f)} ships`}
      </div>
    </header>
  );
}
