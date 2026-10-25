/**
 * Galaxy map (C3 SVG base): jump routes + all system nodes.
 * Routes connect grid-adjacent systems (topology) and are drawn only where
 * both endpoints are known.
 */

import type { System } from '../engine/types';
import { GALAXY } from '../data/balance';
import { StarSystem } from './StarSystem';

export interface GalaxyMapProps {
  systems: System[];
  homeworldId: string;
  selectedId: string | null;
  /** Faction color of a system's owner (null = unclaimed). */
  colorFor: (system: System) => string | null;
  shipsBySystem: ReadonlyMap<string, number>;
  onSelect: (systemId: string) => void;
}

function routeEdges(systems: System[]): Array<[System, System]> {
  const byCell = new Map<number, System>();
  for (const s of systems) byCell.set(s.gy * 100 + s.gx, s);
  const edges: Array<[System, System]> = [];
  for (const s of systems) {
    const east = byCell.get(s.gy * 100 + s.gx + 1);
    if (east) edges.push([s, east]);
    const south = byCell.get((s.gy + 1) * 100 + s.gx);
    if (south) edges.push([s, south]);
  }
  return edges;
}

const PAD = 7;

export function GalaxyMap({
  systems,
  homeworldId,
  selectedId,
  colorFor,
  shipsBySystem,
  onSelect,
}: GalaxyMapProps) {
  return (
    <svg
      className="star-map"
      viewBox={`${-PAD} ${-PAD} ${GALAXY.mapWidth + PAD * 2} ${GALAXY.mapHeight + PAD * 2}`}
      role="img"
      aria-label="Galaxy map"
    >
      {routeEdges(systems).map(([a, b]) =>
        a.explored && b.explored ? (
          <line
            key={`${a.id}-${b.id}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="var(--line)"
            strokeWidth={0.4}
            strokeDasharray="1.6 1.2"
          />
        ) : null,
      )}
      {systems.map((s) => (
        <StarSystem
          key={s.id}
          system={s}
          color={colorFor(s)}
          isHomeworld={s.id === homeworldId}
          selected={s.id === selectedId}
          ships={shipsBySystem.get(s.id) ?? 0}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}
