/**
 * C19 — dialogue variety AUDIT (PLAN §11, the funny-pass input): one full
 * headless campaign with M.O.R.T. logs every line the variety engine picks;
 * the per-event table is printed for the human funny pass, and the hard
 * properties are asserted:
 *  - M.O.R.T. has a line for every event in the catalog (no silent gaps
 *    in the complete advisor)
 *  - no 'first' line repeats in a campaign
 *  - the campaign actually talks (enough picks to matter)
 *
 * Residual for C34: expand pools where the median repeat distance is short
 * (SPEC §4 "at least 5 variants per advisor for commonly repeated events"
 * becomes the enforced bar at the final pass).
 */

import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/simulation';
import { playProfile } from './campaign-sim';
import { DIALOGUE_EVENT_CATALOG } from '../src/data/dialogue/events';
import { MORT_LINES } from '../src/data/dialogue/pools';
import type { GameState } from '../src/engine/types';

interface Pick {
  tick: number;
  event: string;
  lineId: string;
}

/** Replays the campaign and diffs dialogue.shown to recover every pick. */
function auditCampaign(seed: number): { picks: Pick[]; result: { ended: string; ticks: number } } {
  let s = newGame(seed, { supernovaFrequency: 'normal', advisor: 'mort' });
  const picks: Pick[] = [];
  let prev = structuredClone(s.dialogue.shown);
  const res = playProfile(
    s,
    'engaged',
    undefined,
    (state: GameState) => {
      const now = state.dialogue.shown;
      for (const ev of Object.keys(now)) {
        for (const line of Object.keys(now[ev])) {
          if ((now[ev][line] ?? 0) > (prev[ev]?.[line] ?? 0)) {
            picks.push({ tick: state.tick, event: ev, lineId: line });
          }
        }
      }
      prev = structuredClone(now);
    },
  );
  return { picks, result: { ended: res.ended, ticks: res.ticks } };
}

describe('M.O.R.T. variety audit (C19; funny pass input)', () => {
  it('pool coverage: M.O.R.T. has at least one line for every catalog event', () => {
    for (const type of Object.keys(DIALOGUE_EVENT_CATALOG)) {
      const lines = MORT_LINES.filter((l) => l.event === type);
      expect(lines.length, `M.O.R.T. is silent on ${type}`).toBeGreaterThan(0);
    }
  });

  it('a full campaign: the galaxy talks, first lines stay unique, table printed', () => {
    const { picks, result } = auditCampaign(20261026);

    // The campaign ran to a real end and the advisor spoke often enough
    // for variety to be a real concern (SPEC §11: popups rare, repeats not).
    expect(['victory', 'defeat']).toContain(result.ended);
    expect(picks.length).toBeGreaterThan(50);

    // Every pick is a real M.O.R.T. line.
    const ids = new Set(MORT_LINES.map((l) => l.id));
    for (const p of picks) expect(ids.has(p.lineId)).toBe(true);

    // First lines are unique per campaign.
    const firstIds = new Set(MORT_LINES.filter((l) => l.kind === 'first').map((l) => l.id));
    const firstSeen = picks.filter((p) => firstIds.has(p.lineId)).map((p) => p.lineId);
    expect(new Set(firstSeen).size).toBe(firstSeen.length);

    // The audit table — one row per event, picks in order.
    const byEvent = new Map<string, Pick[]>();
    for (const p of picks) {
      const list = byEvent.get(p.event) ?? [];
      list.push(p);
      byEvent.set(p.event, list);
    }
    console.log(
      `\n[MORT variety audit] campaign ${result.ended} at tick ${result.ticks}, ${picks.length} lines:` +
        `\n${[...byEvent.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .map(
            ([ev, list]) =>
              `  ${ev.padEnd(22)} ${String(list.length).padStart(3)}  ` +
              `[${list.map((p) => p.lineId.split('.').slice(2).join('.')).join(' → ')}]`,
          )
          .join('\n')}\n`,
    );
  });
});
