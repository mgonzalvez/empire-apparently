/**
 * Dialogue bar (C19; SPEC §4): the advisor's commentary — a SEPARATE layer
 * from every factual report (P5). It renders the last pick the variety
 * engine made (engine/dialogue.ts) in the advisor's accent; factual
 * surfaces (battle report, log, panels) never contain a line from here.
 */

import type { GameState } from '../engine/types';
import { ADVISORS } from '../data/advisors';

export function DialogueBar({ game }: { game: GameState }) {
  const pick = game.lastDialogue;
  if (!pick) return null;
  const advisor = ADVISORS.find((a) => a.id === pick.advisor);
  return (
    <div
      className="dialogue-bar"
      data-advisor={pick.advisor}
      role="status"
      aria-label={`Advisor commentary from ${advisor?.name ?? pick.advisor}`}
    >
      <span className="dialogue-who">{advisor?.shortName ?? pick.advisor}</span>
      <span className="dialogue-year">Y{pick.tick}</span>
      <span className="dialogue-text">{pick.text}</span>
    </div>
  );
}
