/**
 * One system node on the map (C3 base; C31 adds the full visual pass).
 * Unexplored systems render as unknown dots — no names, no planet data
 * (fog of war, core §3).
 */

import type { System } from '../engine/types';
import { SPEC_BADGE, STAR_COLORS } from '../data/names';
import { supernovaState } from '../engine/supernova';

export interface StarSystemProps {
  system: System;
  /** Faction color for the owner (null = unclaimed/neutral). */
  color: string | null;
  isHomeworld: boolean;
  selected: boolean;
  /** Ships currently in this system (flagship + support fleets). */
  ships: number;
  onSelect: (systemId: string) => void;
}

export function StarSystem({
  system: s,
  color,
  isHomeworld,
  selected,
  ships,
  onSelect,
}: StarSystemProps) {
  return (
    <g
      transform={`translate(${s.x} ${s.y})`}
      onClick={() => onSelect(s.id)}
      role="button"
      aria-label={s.explored ? s.name : 'Unknown system'}
      style={{ cursor: 'pointer' }}
    >
      {selected && (
        <circle
          r={5.4}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={0.5}
          strokeDasharray="1.6 1.1"
        />
      )}
      {isHomeworld && s.explored && (
        <circle r={4.4} fill="none" stroke="var(--accent-2)" strokeWidth={0.4} />
      )}

      {s.explored ? (
        <>
          {s.destroyed ? (
            <circle
              r={2.6}
              fill="var(--surface-2)"
              stroke="var(--ink-muted)"
              strokeWidth={0.4}
            />
          ) : (
            <circle
              r={3}
              fill={color ?? 'var(--surface)'}
              stroke={color ?? 'var(--ink-muted)'}
              strokeWidth={0.5}
            />
          )}
          {!s.destroyed && <circle r={1.1} fill={STAR_COLORS[s.starClass]} />}
          {s.planet && !s.destroyed && (
            <g transform="translate(-3.9 -3.9)">
              <circle r={1.9} fill="var(--bg)" stroke="var(--line)" strokeWidth={0.35} />
              <text y={0.8} textAnchor="middle" fontSize={2} fill="var(--ink-muted)">
                {SPEC_BADGE[s.planet.specialization]}
              </text>
            </g>
          )}
          {!s.destroyed && (
            <text
              y={-4.4}
              textAnchor="middle"
              fontSize={supernovaState(s) === 'critical' || supernovaState(s) === 'supernova' ? 4.2 : 3.4}
              fill="var(--warn)"
            >
              {supernovaState(s) === 'critical' || supernovaState(s) === 'supernova' ? '✸' : s.supernovaCandidate ? '✳' : ''}
            </text>
          )}
          <text y={7.6} textAnchor="middle" fontSize={2.9} fill="var(--ink-muted)">
            {s.name}
          </text>
        </>
      ) : (
        <>
          <circle
            r={2.4}
            fill="var(--surface-2)"
            stroke="var(--line)"
            strokeWidth={0.4}
            strokeDasharray="0.9 0.9"
          />
          <text y={0.9} textAnchor="middle" fontSize={2.4} fill="var(--ink-muted)">
            ?
          </text>
        </>
      )}

      {ships > 0 && (
        <g transform="translate(3.8 -3.8)">
          <circle r={1.9} fill="var(--bg)" stroke="var(--accent)" strokeWidth={0.4} />
          <text y={0.8} textAnchor="middle" fontSize={2.1} fill="var(--ink)">
            {ships}
          </text>
        </g>
      )}
    </g>
  );
}
