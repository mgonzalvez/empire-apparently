/**
 * Travel dialog (C4; core §6): before confirming, the player sees distance,
 * time required, fuel cost, and known defenders. The quote comes from the
 * same `planTravel` the engine uses — shown = simulated. (The estimated
 * combat outcome lands with C7.)
 */

import { planTravel } from '../engine/movement';
import { estimateOutcome } from '../engine/combat';
import type { GameState } from '../engine/types';

export interface TravelDialogProps {
  game: GameState;
  destinationId: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function TravelDialog({
  game,
  destinationId,
  onClose,
  onConfirm,
}: TravelDialogProps) {
  const dest = game.galaxy.systems.find((s) => s.id === destinationId);
  if (!dest) return null;
  const q = planTravel(game, destinationId);
  const est = estimateOutcome(game, destinationId);
  const EST_TEXT: Record<typeof est, string> = {
    favorable: 'favorable',
    even: 'even',
    unfavorable: 'unfavorable',
    unknown: 'unknown (no intel)',
  };
  const displayName = dest.explored ? dest.name : 'the uncharted system';
  const ownerName = q.ownerId
    ? game.galaxy.factions.find((f) => f.id === q.ownerId)?.name
    : null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Travel to ${displayName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Expedition to {displayName}</h2>

        {q.ok ? (
          <>
            <div className="row">
              <span className="label">Distance</span>
              <span className="value">{q.distance} units</span>
            </div>
            <div className="row">
              <span className="label">Voyage</span>
              <span className="value">
                {q.bandName} — {q.years} year{q.years === 1 ? '' : 's'}
              </span>
            </div>
            <div className="row">
              <span className="label">Fuel</span>
              <span className="value">
                {q.fuelCost} (tank: {Math.floor(game.empire.fuel)})
              </span>
            </div>
            <div className="row">
              <span className="label">Known defenders</span>
              <span className="value">
                {q.defendersKnown
                  ? `${q.defense} — ${ownerName ?? 'unclaimed'}`
                  : 'Unknown'}
              </span>
            </div>
            <div className="row">
              <span className="label">Estimated outcome</span>
              <span className="value">{EST_TEXT[est]}</span>
            </div>
            <p className="muted dialog-note">
              Setting course advances one year; the ship arrives on year{' '}
              {game.tick + (q.years ?? 1)}.
            </p>
            <div className="dialog-actions">
              <button type="button" className="primary" onClick={onConfirm}>
                Set course
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">{q.reason}</p>
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Understood
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
