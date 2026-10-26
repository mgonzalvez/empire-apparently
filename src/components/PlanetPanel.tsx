/**
 * System/planet detail panel (C3 basic; C10 occupation depth, C27 dossier).
 * Factual only — advisor narration never enters this panel (PLAN §10).
 */

import type { ReactNode } from 'react';
import type { Fleet, GameState, Specialization, System } from '../engine/types';
import { ECON, GALAXY, OCC, RIVAL } from '../data/balance';
import { SPEC_LABEL, SPEC_NOTE, STAR_COLORS } from '../data/names';
import { developmentCost, devRoman } from '../engine/economy';
import { defensiveStrength } from '../engine/combat';
import { gridNeighbors } from '../engine/galaxy';
import { canEvacuate, criticalWindow, isLocallyScouted, supernovaState } from '../engine/supernova';
import {
  integrationEstimate,
  isGarrisoned,
  occupationStatus,
  recommendedGarrison,
  type OccupationStatus,
} from '../engine/occupation';
import { dispatch } from '../state/gameStore';

const SPECS = Object.keys(SPEC_LABEL) as Specialization[];

const STATUS_LABEL: Record<OccupationStatus, string> = {
  stable: 'Stable',
  unstable: 'Unstable',
  imminent: 'Rebellion imminent',
};

function prodText(spec: Specialization, dev: number): string {
  const base = ECON.productionBySpec[spec];
  return `${base.credits * dev}c / ${base.materials * dev}m / ${base.fuel * dev}f`;
}

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
  /** The live game — occupation readouts + the reinforce control. */
  game: GameState;
  /** Owner's display name, or "Unclaimed" — precomputed by the parent. */
  ownerName: string;
  /** Fleet currently in the system (flagship first), if any. */
  fleet: Fleet | null;
  /** Travel controls (C4) — rendered at the bottom of the panel. */
  footer?: ReactNode;
}

export function PlanetPanel({ system, game, ownerName, fleet, footer }: PlanetPanelProps) {
  if (!system) {
    return (
      <section className="panel planet-panel">
        <h2>No system selected</h2>
        <p className="muted">Choose a system on the map.</p>
      </section>
    );
  }

  const p = system.planet;
  const ownerFaction = game.galaxy.factions.find((f) => f.id === system.ownerId);
  // C11 threat readout: a neighboring rival flotilla that has cleared the
  // attack ratio can take this world next year. Factual, never a surprise.
  const threatFaction =
    system.ownerId === 'player'
      ? gridNeighbors(game.galaxy.systems, system)
          .map((t) => game.galaxy.factions.find((f) => f.id === t.ownerId))
          .find(
            (f) =>
              f &&
              f.kind === 'rival' &&
              f.fleet >= RIVAL.attackRatio * defensiveStrength(system, game),
          ) ?? null
      : null;
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
          {ownerFaction && ownerFaction.kind === 'rival' && ownerFaction.fleet > 0 && (
            <Row
              label="Rival flotilla"
              value={`${ownerFaction.fleet} ships — attacks this world at ${RIVAL.attackRatio}× its defense`}
            />
          )}
          {threatFaction && (
            <Row
              label="Threat"
              value={`${threatFaction.name}'s flotilla can take this world (garrison it, or strike first)`}
              warn
            />
          )}
          {(() => {
            const st = supernovaState(system);
            if (st === 'stable' || st === 'destroyed') return null;
            if (st === 'critical' || st === 'supernova') {
              const [lo, hi] = criticalWindow(system, isLocallyScouted(game, system.id));
              const evacGate = canEvacuate(game, system.id);
              return (
                <>
                  <Row
                    label="Stellar stability"
                    value={
                      st === 'supernova'
                        ? 'SUPERNOVA — the star is about to go'
                        : `CRITICAL — should go within ${lo}–${hi} years`
                    }
                    warn
                  />
                  {system.ownerId === 'player' && (
                    system.evacuationTicks > 0 ? (
                      <Row
                        label="Evacuation"
                        value={`In progress — ${system.evacuationTicks} year${system.evacuationTicks === 1 ? '' : 's'} left`}
                        warn
                      />
                    ) : (
                      <button
                        type="button"
                        className="yard-btn"
                        disabled={!evacGate.ok || game.status !== 'active'}
                        title={evacGate.ok ? undefined : evacGate.reason ?? undefined}
                        onClick={() => dispatch({ type: 'EVACUATE', systemId: system.id })}
                      >
                        <span>
                          Evacuate — {GALAXY.supernova.evacuation.credits}C, {GALAXY.supernova.evacuation.ticks} years
                        </span>
                        <span className="yard-after">
                          preserves ~{Math.round(GALAXY.supernova.evacuation.populationSavedFraction * 100)}% of the people, withdraws stationed fleets
                        </span>
                      </button>
                    )
                  )}
                </>
              );
            }
            return (
              <Row label="Stellar stability" value="Anomalous — under observation" warn />
            );
          })()}
          {p ? (
            <>
              <Row label="Planet" value={p.name} />
              <Row label="Type" value={p.type} />
              <Row label="Population" value={`${p.population} M`} />
              <Row
                label="Development"
                value={
                  p.development >= 5
                    ? `${devRoman(p.development)} (max)`
                    : devRoman(p.development)
                }
              />
              {developmentCost(p.development) && (
                <Row
                  label="Auto development"
                  value={`→ ${devRoman(p.development + 1)}: ${developmentCost(p.development)!.credits}c / ${developmentCost(p.development)!.materials}m per year, automatic`}
                />
              )}
              <Row
                label="Orbital defense"
                value={`${system.defense}${p.garrison > 0 ? ` (+${p.garrison} garrison)` : ''}`}
              />
              {system.ownerId === 'player' ? (
                <div className="spec-picker" role="group" aria-label="Specialization (free, instant)">
                  {SPECS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      className={p.specialization === sp ? 'active' : ''}
                      title={`${SPEC_LABEL[sp]} — ${SPEC_NOTE[sp]} Produces ${prodText(sp, p.development)}/year.`}
                      onClick={() =>
                        dispatch({ type: 'SPECIALIZE', systemId: system.id, specialization: sp })
                      }
                    >
                      {SPEC_LABEL[sp]}
                    </button>
                  ))}
                </div>
              ) : (
                <Row label="Specialization" value={SPEC_LABEL[p.specialization]} />
              )}
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
          {system.ownerId === 'player' && p && system.occupation !== 'none' && (
            system.occupation === 'integrated' ? (
              <Row label="Occupation" value="Integrated" />
            ) : (
              (() => {
                const rec = recommendedGarrison(p, system, game.galaxy);
                const garrisoned = isGarrisoned(p, system, game.galaxy);
                const status = occupationStatus(garrisoned, p.stability);
                const est = integrationEstimate(p, garrisoned);
                const f = game.flagship;
                const docked = f.systemId === system.id && f.travel === null;
                const canReinforce = docked && f.troops > 0 && p.garrison < rec;
                return (
                  <>
                    <Row
                      label="Occupation"
                      value={STATUS_LABEL[status]}
                      warn={status === 'imminent'}
                    />
                    <Row
                      label="Integration"
                      value={
                        est !== null
                          ? `${p.integration}% — ~${est} year${est === 1 ? '' : 's'} at current garrison`
                          : `${p.integration}% — garrison required`
                      }
                      warn={!garrisoned}
                    />
                    <Row
                      label="Garrison"
                      value={`${p.garrison} (recommended ${rec})`}
                      warn={p.garrison < rec}
                    />
                    <Row
                      label="Stability"
                      value={`${p.stability}`}
                      warn={p.stability < OCC.autoTopUpBelowStability}
                    />
                    {canReinforce && (
                      <button
                        type="button"
                        className="reinforce-btn"
                        onClick={() => dispatch({ type: 'REINFORCE', systemId: system.id })}
                      >
                        Reinforce garrison (+{Math.min(rec - p.garrison, f.troops)} from the flagship)
                      </button>
                    )}
                  </>
                );
              })()
            )
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
