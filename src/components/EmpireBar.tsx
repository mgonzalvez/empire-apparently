/**
 * Empire bar (C5 resources; C18 objective readout): year, global resources
 * with per-year income (core §5 economic interface: totals + income per
 * galactic year), the mandate objective, flagship summary.
 * The income figure comes from the same `empireIncome` the engine applies,
 * and the objective figure from the same `alignmentProgress` the win/lose
 * rule uses — what is shown is what the sim does.
 */

import type { GameState } from '../engine/types';
import { totalShips } from '../engine/fleets';
import { empireIncome } from '../engine/economy';
import { alignmentProgress } from '../engine/victory';

export function EmpireBar({ game }: { game: GameState }) {
  const f = game.flagship;
  const income = empireIncome(game.galaxy.systems, 'player');
  const prog = alignmentProgress(game);
  return (
    <header className="empire-bar">
      <div className="empire-year">Year {game.tick}</div>
      <div
        className="empire-resources"
        title="Three global resources. Parentheses = income per galactic year."
      >
        <span title="Credits — the general budget (build, repair, evacuate)">
          Credits {Math.floor(game.empire.credits)} (+{income.credits})
        </span>
        <span title="Materials — shipbuilding">
          Materials {Math.floor(game.empire.materials)} (+{income.materials})
        </span>
        <span title="Fuel — spent when the flagship sets course">
          Fuel {Math.floor(game.empire.fuel)} (+{income.fuel})
        </span>
      </div>
      <div
        className="empire-objective"
        title="Victory: every surviving inhabited world under your authority, at least 60% of them aligned (integrated; the homeworld counts from the start)."
      >
        Universal Administrative Alignment: {prog.aligned}/{prog.total} worlds
        {prog.owned < prog.total && (
          <span className="muted"> · {prog.owned}/{prog.total} under authority</span>
        )}
      </div>
      <div className="empire-fleet">
        {f.travel
          ? `${f.name} — in transit, arrives Y${f.travel.arriveTick}`
          : `${f.name} · ${totalShips(f)} ships`}
      </div>
    </header>
  );
}
