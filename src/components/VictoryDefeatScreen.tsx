import { CAMPAIGN } from '../data/balance';
import type { GameState } from '../engine/types';

interface Props {
  game: GameState;
  onMenu: () => void;
}

function reasonLine(reason: 'total' | 'deadline' | 'unrecoverable' | null): string {
  switch (reason) {
    case 'deadline':
      return `The ${CAMPAIGN.deadlineYears}-year mandate expired before alignment was complete.`;
    case 'unrecoverable':
      return 'No ships and no shipyards remain — there is nothing left to rebuild from.';
    default:
      return 'The empire is gone. The Republic thanks you for your service.';
  }
}

/** Campaign end screen (C8): factual stats + restart. */
export function VictoryDefeatScreen({ game, onMenu }: Props) {
  const victory = game.status === 'victory';
  return (
    <div className="campaign-end">
      <div className="campaign-end-card">
        <h2>{victory ? 'Mandate fulfilled.' : 'Appointment rescinded.'}</h2>
        <p>
          {victory
            ? 'Universal Administrative Alignment achieved.'
            : reasonLine(game.defeatReason)}
        </p>
        <dl className="end-screen-stats">
          <div>
            <dt>Years served</dt>
            <dd>{game.tick}</dd>
          </div>
          <div>
            <dt>Systems conquered</dt>
            <dd>{game.stats.conquests}</dd>
          </div>
          <div>
            <dt>Battles won / lost</dt>
            <dd>
              {game.stats.wins} / {game.stats.losses}
            </dd>
          </div>
          <div>
            <dt>Fleets lost</dt>
            <dd>{game.stats.fleetsLost}</dd>
          </div>
        </dl>
        <button type="button" onClick={onMenu}>
          Return to title
        </button>
      </div>
    </div>
  );
}
