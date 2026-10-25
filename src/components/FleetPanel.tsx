/**
 * Fleet panel (C6; core §6 "Fleet statistics", "Fleet construction"):
 * composition, derived combat & invasion strength (always displayed), hull,
 * and the shipyard controls — costs AND resulting strength shown
 * immediately. No queue management: builds are instant, repair is one year.
 */

import type { GameState, ShipClass } from '../engine/types';
import {
  buildCost,
  canBuild,
  canRearm,
  canRepair,
  combatStrength,
  isShipyard,
  invasionStrength,
  maxTroops,
  rearmCost,
  repairCost,
} from '../engine/fleets';
import { dispatch } from '../state/gameStore';

const SHIP_LABEL: Record<ShipClass, string> = {
  interceptor: 'interceptor',
  cruiser: 'cruiser',
  transport: 'transport',
};

/** Preview of a derived strength after a hypothetical +1 ship. */
function strengthAfterBuild(game: GameState, ship: ShipClass): number {
  const preview = {
    ...game.flagship,
    ships: { ...game.flagship.ships, [ship]: game.flagship.ships[ship] + 1 },
  };
  return combatStrength(preview);
}

export function FleetPanel({ game }: { game: GameState }) {
  const f = game.flagship;
  const yard = isShipyard(game, f.systemId);
  const here = game.galaxy.systems.find((s) => s.id === f.systemId);

  const buildGate = (ship: ShipClass) => canBuild(game, ship);
  const repairGate = canRepair(game);
  const rearmGate = canRearm(game);

  return (
    <section className="panel fleet-panel" aria-label="Flagship">
      <h2>
        {f.name}
        <span className="star-chip">at {here?.name ?? 'unknown system'}</span>
      </h2>
      <div className="row">
        <span className="label">Hull</span>
        <span className={`value${f.hull < 100 ? ' warn' : ''}`}>{f.hull}%</span>
      </div>
      <div className="row">
        <span className="label">Combat strength</span>
        <span className="value">{combatStrength(f)}</span>
      </div>
      <div className="row">
        <span className="label">Invasion strength</span>
        <span className="value">
          {invasionStrength(f)} / {maxTroops(f)}
        </span>
      </div>
      <div className="row">
        <span className="label">Ships</span>
        <span className="value">
          {f.ships.interceptor} int · {f.ships.cruiser} cru · {f.ships.transport} trp
        </span>
      </div>

      {yard && (
        <div className="yard">
          <p className="muted yard-title">Shipyard — construction is instant.</p>
          {(['interceptor', 'cruiser', 'transport'] as ShipClass[]).map((ship) => {
            const gate = buildGate(ship);
            const cost = buildCost(ship);
            return (
              <button
                key={ship}
                type="button"
                className="yard-btn"
                disabled={!gate.ok || game.status !== 'active'}
                title={gate.ok ? undefined : gate.reason ?? undefined}
                onClick={() => dispatch({ type: 'BUILD', ship })}
              >
                <span>
                  Add {SHIP_LABEL[ship]} — {cost.credits}C / {cost.materials}M
                </span>
                <span className="yard-after">
                  combat {combatStrength(f)} → {strengthAfterBuild(game, ship)}
                </span>
              </button>
            );
          })}
          {!rearmGate.ok && rearmCost(f) > 0 && (
            <p className="muted">{rearmGate.reason}</p>
          )}
          {rearmCost(f) > 0 && (
            <button
              type="button"
              className="yard-btn"
              disabled={!rearmGate.ok || game.status !== 'active'}
              title={rearmGate.ok ? undefined : rearmGate.reason ?? undefined}
              onClick={() => dispatch({ type: 'REARM' })}
            >
              <span>
                Refill invasion personnel — {rearmCost(f)}C
              </span>
              <span className="yard-after">
                invasion {invasionStrength(f)} → {maxTroops(f)}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="yard">
        <button
          type="button"
          className="yard-btn"
          disabled={!repairGate.ok || game.status !== 'active'}
          title={repairGate.ok ? undefined : repairGate.reason ?? undefined}
          onClick={() => dispatch({ type: 'REPAIR' })}
        >
          <span>
            Repair hull — {repairCost().credits}C, 1 year
          </span>
          <span className="yard-after">
            hull {f.hull}% → 100%
          </span>
        </button>
      </div>

      {!yard && (
        <p className="muted">
          No shipyard here — ships are built at Fortress worlds or development
          III+. Repair works anywhere.
        </p>
      )}
    </section>
  );
}
