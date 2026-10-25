/**
 * System/planet detail panel (C3 basic; C10 occupation depth, C27 dossier).
 * Factual only — advisor narration never enters this panel (PLAN §10).
 */

import type { ReactNode } from 'react';
import type { Fleet, System } from '../engine/types';
import { STAR_COLORS } from '../data/names';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

function Row({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={`row${warn ? ' warn' : ''}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

export interface PlanetPanelProps {
  system: System | null;
  /** Owner's display name, or "Unclaimed" — precomputed by the parent. */
  ownerName: string;
  /** Fleet currently in the system (flagship first), if any. */
  fleet: Fleet | null;
  /** Travel controls (C4) — rendered at the bottom of the panel. */
  footer?: ReactNode;
}

export function PlanetPanel({ system, ownerName, fleet, footer }: PlanetPanelProps) {
  if (!system) {
    return (
      <section className="panel planet-panel">
        <h2>No system selected</h2>
        <p className="muted">Choose a system on the map.</p>
      </section>
    );
  }

  const p = system.planet;
  const shipText = fleet
    ? `${fleet.ships.interceptor} interceptor${fleet.ships.interceptor === 1 ? '' : 's'}, ${fleet.ships.cruiser} cruiser${fleet.ships.cruiser === 1 ? '' : 's'}, ${fleet.ships.transport} transport${fleet.ships.transport === 1 ? '' : 's'} — hull ${fleet.hull}%`
    : null;

  return (
    <section className="panel planet-panel">
      <h2>
        {system.explored ? system.name : 'Unknown System'}{' '}
        <span className="star-chip">
          <i style={{ background: STAR_COLORS[system.starClass] }} />
          {system.starClass} star
        </span>
      </h2>

      {!system.explored && (
        <p className="muted">
          Scant information. A fleet needs to arrive before the map learns
          anything.
        </p>
      )}

      {system.explored && (
        <>
          <Row label="Control" value={ownerName} />
          {p ? (
            <>
              <Row label="Planet" value={p.name} />
              <Row label="Type" value={p.type} />
              <Row label="Specialization" value={p.specialization} />
              <Row label="Population" value={`${p.population} M`} />
              <Row label="Development" value={ROMAN[p.development - 1]} />
              <Row label="Orbital defense" value={String(system.defense)} />
            </>
          ) : (
            <p className="muted">
              {system.destroyed
                ? 'Stellar remnant. Non-colonizable.'
                : 'Uninhabited star. Useful as a waypoint.'}
            </p>
          )}
          {system.supernovaCandidate && (
            <Row
              label="Stellar instability"
              value={`${system.instability}/100`}
              warn
            />
          )}
          {shipText && (
            <p className="fleet-line">
              <strong>{fleet!.name}:</strong> {shipText}
            </p>
          )}
        </>
      )}

      {footer && <div className="panel-footer">{footer}</div>}
    </section>
  );
}
