/**
 * Fleet panel (C6; core §6 "Fleet statistics", "Fleet construction"):
 * composition, derived combat & invasion strength (always displayed), hull,
 * and the shipyard controls — costs AND resulting strength shown
 * immediately. No queue management: builds are instant, repair is one year.
 */

import type { GameState, ShipClass, SupportMission } from '../engine/types';
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
  totalShips,
} from '../engine/fleets';
import { STATE_LABEL, SUPPORT_COST, canAssignMission, canCommission, reinforceBoardingCost } from '../engine/support';
import { SUPPORT } from '../data/balance';
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

interface MissionOption {
  value: string;
  label: string;
}

/**
 * Assignable (mission, target) pairs for a fleet, in a stable order. Each
 * is gated by the SAME canAssignMission the engine uses — a control is only
 * offered when it works (core §19, no fake controls).
 */
function missionOptions(game: GameState, fleetId: string): MissionOption[] {
  if (!game.supports.some((f) => f.id === fleetId)) return [];
  const out: MissionOption[] = [];
  for (const s of game.galaxy.systems) {
    if (s.destroyed) continue;
    if (!s.explored) {
      const g = canAssignMission(game, fleetId, 'scout', s.id);
      if (g.ok) out.push({ value: `scout:${s.id}`, label: `Scout — ${s.name}` });
    }
    if (s.ownerId === 'player' && s.planet) {
      const patrol = canAssignMission(game, fleetId, 'patrol', s.id);
      if (patrol.ok) out.push({ value: `patrol:${s.id}`, label: `Patrol — ${s.name}` });
      const defend = canAssignMission(game, fleetId, 'defend', s.id);
      if (defend.ok) out.push({ value: `defend:${s.id}`, label: `Defend — ${s.name}` });
      if (s.occupation === 'occupied') {
        const reinforce = canAssignMission(game, fleetId, 'reinforce', s.id);
        if (reinforce.ok) {
          const cost = reinforceBoardingCost(game.supports.find((f) => f.id === fleetId)!);
          out.push({
            value: `reinforce:${s.id}`,
            label: `Reinforce — ${s.name}${cost > 0 ? ` (${cost}C)` : ''}`,
          });
        }
      }
    }
  }
  return out;
}

export function FleetPanel({ game }: { game: GameState }) {
  const f = game.flagship;
  const yard = isShipyard(game, f.systemId);
  const here = game.galaxy.systems.find((s) => s.id === f.systemId);

  const buildGate = (ship: ShipClass) => canBuild(game, ship);
  const repairGate = canRepair(game);
  const rearmGate = canRearm(game);
  const commissionGate = canCommission(game);

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

      <div className="yard">
        <p className="muted yard-title">
          Support fleets ({game.supports.length}/{SUPPORT.maxFleets}) — autonomous, simple state machines.
        </p>
        {game.supports.map((sf) => {
          const sys = game.galaxy.systems.find((s) => s.id === sf.systemId);
          const opts = missionOptions(game, sf.id);
          return (
            <div className="row fleet-row" key={sf.id}>
              <span className="label">
                {sf.name} — {STATE_LABEL[sf.supportState ?? 'idle']}
              </span>
              <span className={`value${sf.hull < SUPPORT.criticalHull ? ' warn' : ''}`}>
                {sf.travel ? `en route to ${game.galaxy.systems.find((s) => s.id === sf.travel!.toId)?.name ?? '?'} (yr ${sf.travel.arriveTick})` : sys?.name ?? '?'} · {totalShips(sf)} ships · hull {sf.hull}%
              </span>
              <select
                className="mission-select"
                aria-label={`Mission for ${sf.name}`}
                value={sf.mission ? `${sf.mission.type}:${sf.mission.targetId}` : ''}
                disabled={game.status !== 'active'}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') dispatch({ type: 'ASSIGN_MISSION', fleetId: sf.id, mission: null, targetId: null });
                  else {
                    const [mission, targetId] = v.split(':');
                    dispatch({ type: 'ASSIGN_MISSION', fleetId: sf.id, mission: mission as SupportMission, targetId });
                  }
                }}
              >
                <option value="">— patrol home —</option>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        {game.supports.length === 0 && (
          <p className="muted">None yet. Unassigned fleets patrol home — no decisions required.</p>
        )}
        {yard && game.supports.length < SUPPORT.maxFleets && (
          <button
            type="button"
            className="yard-btn"
            disabled={!commissionGate.ok || game.status !== 'active'}
            title={commissionGate.ok ? undefined : commissionGate.reason ?? undefined}
            onClick={() => dispatch({ type: 'COMMISSION' })}
          >
            <span>
              Commission support fleet — {SUPPORT_COST.credits}C / {SUPPORT_COST.materials}M
            </span>
            <span className="yard-after">2 interceptors + 1 transport, real ships</span>
          </button>
        )}
        {yard && game.supports.length >= SUPPORT.maxFleets && (
          <p className="muted">Fleet cap reached ({SUPPORT.maxFleets}).</p>
        )}
        {!yard && game.supports.length < SUPPORT.maxFleets && (
          <p className="muted">Support fleets are commissioned at a shipyard.</p>
        )}
      </div>
    </section>
  );
}
