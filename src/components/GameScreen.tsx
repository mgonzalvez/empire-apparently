/**
 * Main game screen (C4): empire bar, map (with in-transit flagship), system
 * panel with travel planning, event log, and the time-advancing controls.
 */

import { useState } from 'react';
import { dispatch, useStore } from '../state/gameStore';
import { totalShips } from '../engine/simulation';
import { inTransitPosition } from '../engine/movement';
import type { Fleet, System } from '../engine/types';
import { EmpireBar } from './EmpireBar';
import { EventLog } from './EventLog';
import { GalaxyMap } from './GalaxyMap';
import { PlanetPanel } from './PlanetPanel';
import { TravelDialog } from './TravelDialog';

export function GameScreen() {
  const { game, selectedSystemId } = useStore();
  const [dialogTarget, setDialogTarget] = useState<string | null>(null);
  if (!game) return null;

  const factionById = new Map(game.galaxy.factions.map((f) => [f.id, f]));
  const colorFor = (s: System): string | null =>
    s.ownerId ? (factionById.get(s.ownerId)?.color ?? null) : null;
  const ownerName = (s: System): string =>
    s.ownerId ? (factionById.get(s.ownerId)?.name ?? 'Unknown') : 'Unclaimed';

  // Ships docked in each system. An in-transit flagship is "between"
  // systems — it renders as the moving marker, not a badge.
  const inTransit = game.flagship.travel !== null;
  const shipsBySystem = new Map<string, number>();
  for (const f of [game.flagship, ...game.supports]) {
    if (f === game.flagship && inTransit) continue;
    shipsBySystem.set(f.systemId, (shipsBySystem.get(f.systemId) ?? 0) + totalShips(f));
  }
  const fleetAt = (id: string): Fleet | null =>
    game.flagship.systemId === id && !inTransit
      ? game.flagship
      : game.supports.find((f) => f.systemId === id) ?? null;

  let moving: null | { x: number; y: number; from: System; to: System } = null;
  if (game.flagship.travel) {
    const from = game.galaxy.systems.find((s) => s.id === game.flagship.travel!.fromId);
    const to = game.galaxy.systems.find((s) => s.id === game.flagship.travel!.toId);
    const pos = from && to ? inTransitPosition(game.flagship, from, to, game.tick) : null;
    if (from && to && pos) moving = { ...pos, from, to };
  }

  const selected =
    game.galaxy.systems.find((s) => s.id === selectedSystemId) ?? null;

  const travelFooter =
    game.status !== 'active' ? null : game.flagship.travel ? (
      <p className="muted">
        The flagship is in transit — it arrives on year{' '}
        {game.flagship.travel.arriveTick}.
      </p>
    ) : selected && selected.id !== game.flagship.systemId ? (
      <button
        type="button"
        className="secondary"
        onClick={() => setDialogTarget(selected.id)}
      >
        Plan expedition to {selected.explored ? selected.name : 'this system'} ▸
      </button>
    ) : null;

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
              inTransit={moving}
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
              The empire handles itself while you wait.
            </span>
          </div>
        </div>
        <div className="game-right">
          <PlanetPanel
            system={selected}
            ownerName={selected ? ownerName(selected) : ''}
            fleet={selected ? fleetAt(selected.id) : null}
            footer={travelFooter}
          />
          <EventLog log={game.log} />
        </div>
      </div>

      {dialogTarget !== null && (
        <TravelDialog
          game={game}
          destinationId={dialogTarget}
          onClose={() => setDialogTarget(null)}
          onConfirm={() => {
            dispatch({ type: 'TRAVEL', destinationId: dialogTarget });
            setDialogTarget(null);
          }}
        />
      )}

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
