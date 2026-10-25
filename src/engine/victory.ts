/**
 * Victory & defeat (C8; core §12, PLAN §4/§8) — core §4 year-step 7.
 *
 * Victory: every surviving inhabitable system (a planet, not destroyed) is
 * player-controlled AND at least CAMPAIGN.victoryIntegration (60%) of them
 * are integrated (the homeworld counts from the start).
 *
 * Defeat (checked in this order):
 *  1. total — the player holds no system at all
 *  2. unrecoverable — no ships AND no player shipyard (the rebuild path is
 *     gone; a 0-ship flagship CAN still rebuild if a shipyard is held)
 *  3. deadline — year > CAMPAIGN.deadlineYears (120) with no victory
 * Victory is evaluated before the deadline, so a campaign that completes on
 * the final year still wins.
 */

import { CAMPAIGN } from '../data/balance';
import { isShipyard, totalShips } from './fleets';
import type { GameState } from './types';

export function evaluateWinLose(d: GameState): void {
  if (d.status !== 'active') return;

  const playerSystems = d.galaxy.systems.filter((s) => s.ownerId === 'player');

  if (playerSystems.length === 0) {
    d.status = 'defeat';
    d.defeatReason = 'total';
    d.log.push({
      tick: d.tick,
      kind: 'warning',
      text: 'The empire no longer holds a single system. The Republic thanks you for your service.',
    });
    return;
  }

  const noShips = totalShips(d.flagship) === 0;
  if (noShips && !playerSystems.some((s) => isShipyard(d, s.id))) {
    d.status = 'defeat';
    d.defeatReason = 'unrecoverable';
    d.log.push({
      tick: d.tick,
      kind: 'warning',
      text: 'No ships, no shipyards. There is nothing left to administer.',
    });
    return;
  }

  const inhabitable = d.galaxy.systems.filter((s) => s.planet !== null && !s.destroyed);
  const allOwned =
    inhabitable.length > 0 && inhabitable.every((s) => s.ownerId === 'player');
  const integrated = inhabitable.filter(
    (s) =>
      s.ownerId === 'player' &&
      (s.occupation === 'integrated' || s.id === d.galaxy.homeworldId),
  ).length;

  if (allOwned && integrated / inhabitable.length >= CAMPAIGN.victoryIntegration) {
    d.status = 'victory';
    d.log.push({
      tick: d.tick,
      kind: 'event',
      text: `Universal Administrative Alignment achieved. The Republic is quietly, permanently pleased.`,
    });
    return;
  }

  if (d.tick > CAMPAIGN.deadlineYears) {
    d.status = 'defeat';
    d.defeatReason = 'deadline';
    d.log.push({
      tick: d.tick,
      kind: 'warning',
      text: `Year ${CAMPAIGN.deadlineYears} is over. The mandate expires with it.`,
    });
  }
}
