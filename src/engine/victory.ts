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

import { CAMPAIGN, EMPIRE_SCORE } from '../data/balance';
import { isShipyard, totalShips } from './fleets';
import type { GameState } from './types';

/**
 * Mandate progress (C18) — the ONE source of truth shared by the win/lose
 * rule and the on-screen objective readout: what is shown is what is
 * simulated. Victory (core §12, PLAN §4): every surviving inhabitable
 * system is player-controlled AND at least CAMPAIGN.victoryIntegration
 * (60%) are aligned (integrated, the homeworld from the start).
 */
export interface AlignmentProgress {
  /** Surviving inhabited worlds (destroyed excluded) — the mandate's denominator. */
  total: number;
  /** Worlds under player authority. */
  owned: number;
  /** Aligned: player-controlled AND (integrated OR the homeworld). */
  aligned: number;
  /** True exactly when the campaign is in a winning position. */
  complete: boolean;
}

export function alignmentProgress(g: GameState): AlignmentProgress {
  const inhabited = g.galaxy.systems.filter((s) => s.planet !== null && !s.destroyed);
  const owned = inhabited.filter((s) => s.ownerId === 'player').length;
  const aligned = inhabited.filter(
    (s) =>
      s.ownerId === 'player' &&
      (s.occupation === 'integrated' || s.id === g.galaxy.homeworldId),
  ).length;
  const complete =
    inhabited.length > 0 &&
    owned === inhabited.length &&
    aligned / inhabited.length >= CAMPAIGN.victoryIntegration;
  return { total: inhabited.length, owned, aligned, complete };
}

/**
 * Final empire score (C18; core §12). A transparent weighted sum of the
 * stats the end screen already shows — weights live in balance.ts (⚠ v1),
 * floored at 0. Display-only: never consulted by the sim.
 */
export function empireScore(g: GameState): number {
  const { aligned } = alignmentProgress(g);
  const raw =
    g.stats.conquests * EMPIRE_SCORE.perConquest +
    aligned * EMPIRE_SCORE.perAlignedWorld +
    g.stats.supernovas * EMPIRE_SCORE.perSurvivedSupernova +
    g.stats.fleetsLost * EMPIRE_SCORE.perFleetLost +
    g.tick * EMPIRE_SCORE.perYearServed;
  return Math.max(0, raw);
}

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

  const prog = alignmentProgress(d);
  if (prog.complete) {
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
