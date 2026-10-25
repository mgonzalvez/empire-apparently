/**
 * Main game screen (C3 shell): empire bar, map, system panel, event log,
 * and the one control that exists yet — waiting a year.
 */

import { dispatch, useStore } from '../state/gameStore';
import { totalShips } from '../engine/simulation';
import type { Fleet, System } from '../engine/types';
import { EmpireBar } from './EmpireBar';
import { EventLog } from './EventLog';
import { GalaxyMap } from './GalaxyMap';
import { PlanetPanel } from './PlanetPanel';

export function GameScreen() {
  const { game, selectedSystemId } = useStore();
  if (!game) return null;

  const factionById = new Map(game.galaxy.factions.map((f) => [f.id, f]));
  const colorFor = (s: System): string | null =>
    s.ownerId ? (factionById.get(s.ownerId)?.color ?? null) : null;
  const ownerName = (s: System): string =>
    s.ownerId ? (factionById.get(s.ownerId)?.name ?? 'Unknown') : 'Unclaimed';

  const shipsBySystem = new Map<string, number>();
  for (const f of [game.flagship, ...game.supports]) {
    shipsBySystem.set(f.systemId, (shipsBySystem.get(f.systemId) ?? 0) + totalShips(f));
  }
  const fleetAt = (id: string): Fleet | null =>
    game.flagship.systemId === id
      ? game.flagship
      : game.supports.find((f) => f.systemId === id) ?? null;

  const selected =
    game.galaxy.systems.find((s) => s.id === selectedSystemId) ?? null;

  return (
    <div className="game-root">
      <EmpireBar game={game} />
      <div className="game-main">
        <div className="game-left">
          <div className="map-wrap">
            <GalaxyMap
              systems={game.galaxy.systems}
              homeworldId={game.galaxy.homeworldId}
              selectedId={selectedSystemId}
              colorFor={colorFor}
              shipsBySystem={shipsBySystem}
              onSelect={(id) => dispatch({ type: 'SELECT_SYSTEM', systemId: id })}
            />
          </div>
          <div className="advance-row">
            <button
              type="button"
              disabled={game.status !== 'active'}
              onClick={() => dispatch({ type: 'WAIT' })}
            >
              Wait one year ▸
            </button>
            <span className="muted advance-note">
              Waiting is a strategy. Travel arrives next.
            </span>
          </div>
        </div>
        <div className="game-right">
          <PlanetPanel
            system={selected}
            ownerName={selected ? ownerName(selected) : ''}
            fleet={selected ? fleetAt(selected.id) : null}
          />
          <EventLog log={game.log} />
        </div>
      </div>

      {game.status !== 'active' && (
        <div className="campaign-end">
          <div className="campaign-end-card">
            <h2>
              {game.status === 'victory'
                ? 'Mandate fulfilled.'
                : 'Appointment rescinded.'}
            </h2>
            <p>
              {game.status === 'defeat' && game.defeatReason === 'total'
                ? 'The empire is gone. The Republic thanks you for your service.'
                : 'The campaign has ended.'}
            </p>
            <button type="button" onClick={() => dispatch({ type: 'MENU' })}>
              Return to title
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
