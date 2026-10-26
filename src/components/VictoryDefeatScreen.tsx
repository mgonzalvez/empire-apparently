/**
 * Campaign end screen (C8; C18 rewrite per core §12): the full stat set —
 * campaign duration, systems conquered, fleets lost, battles won,
 * supernovas survived, final empire score — plus the mandate's final
 * alignment. Factual throughout (P5); the SFX stinger is a separate layer.
 */

import { useEffect } from 'react';
import { CAMPAIGN } from '../data/balance';
import type { GameState } from '../engine/types';
import { alignmentProgress, empireScore } from '../engine/victory';
import { playSfx } from '../audio/sfx';

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

export function VictoryDefeatScreen({ game, onMenu }: Props) {
  const victory = game.status === 'victory';
  const prog = alignmentProgress(game);

  useEffect(() => {
    playSfx(victory ? 'victory' : 'defeat');
  }, [victory]);

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
          <div>
            <dt>Supernovas survived</dt>
            <dd>{game.stats.supernovas}</dd>
          </div>
          <div>
            <dt>Final alignment</dt>
            <dd>
              {prog.aligned}/{prog.total} worlds
            </dd>
          </div>
        </dl>
        <p className="empire-score" title="A transparent weighted sum of the stats above (see the Mostly Reliable Galactic Handbook, when it ships).">
          Empire score: <strong>{empireScore(game)}</strong>
        </p>
        <button type="button" onClick={onMenu}>
          Return to title
        </button>
      </div>
    </div>
  );
}
