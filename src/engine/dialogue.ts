/**
 * Dialogue variety engine (C19; PLAN §10).
 *
 * Pure, narration-only: consumes the sim's semantic events (`d.events`),
 * picks one line for the selected advisor per un-narrated event, and
 * records the pick in `d.dialogue` + `d.lastDialogue`. It draws ONLY from
 * `narrRng` — it never touches the sim RNG, and the sim never reads its
 * output. Advisor choice therefore cannot change the simulation (the
 * neutrality test in tests/dialogue.test.ts pins this).
 *
 * Selection (PLAN §10, deterministic):
 *  1. Candidates = lines for (event, advisor) passing stage/kind gates,
 *     `eligibility`, `maxPerCampaign`, and cooldown.
 *  2. Unseen `first` lines (campaign's first occurrence of the event) win;
 *     otherwise rotation/late ordered by LEAST SHOWN this campaign, ties
 *     broken by narrRng — the full pool cycles evenly before any repeat.
 *  3. The global recent window (last 20 line IDs) is a soft filter: if every
 *     candidate is in the window, the least-recent one is allowed (a line
 *     is never blocked solely to avoid a repeat).
 *  4. Record: push to recentIds, increment shown, apply cooldown.
 *
 * Guarantees (tested): no rotation line repeats before its pool is
 * exhausted (modulo the window edge case); first lines are unique per
 * campaign; the pick is a pure function of (state, narrRng).
 */

import type {
  AdvisorId,
  GameState,
  SimEvent,
  SimEventType,
} from './types';
import { Rng } from './random';
import {
  HANDBOOK_LINES,
  MORT_LINES,
  BINGO_LINES,
  type DialogueLine,
} from '../data/dialogue/pools';

// ── Variety constants (content tuning, not sim balance) ─────────────────

/** Global window of recently shown line IDs (PLAN §10). */
export const RECENT_WINDOW = 20;
/** 'early' stage window: tick < this. */
export const EARLY_MAX_TICK = 40;
/** 'late' kind/stage gate: tick ≥ this OR the event has occurred ≥ times. */
export const LATE_MIN_TICK = 60;
export const LATE_MIN_OCCURRENCES = 8;

const LINES_BY_ADVISOR: Record<AdvisorId, readonly DialogueLine[]> = {
  mort: MORT_LINES,
  bingo: BINGO_LINES,
  handbook: HANDBOOK_LINES,
};

/** How many times this event type has been narrated this campaign. */
export function eventOccurrences(d: GameState, event: SimEventType): number {
  const shown = d.dialogue.shown[event];
  if (!shown) return 0;
  return Object.values(shown).reduce((a, b) => a + b, 0);
}

function stageOk(line: DialogueLine, d: GameState, occurrences: number): boolean {
  if (line.stage === 'early' && d.tick >= EARLY_MAX_TICK) return false;
  if (line.stage === 'late' && d.tick < LATE_MIN_TICK) return false;
  if (
    line.kind === 'late' &&
    d.tick < LATE_MIN_TICK &&
    occurrences < LATE_MIN_OCCURRENCES
  ) {
    return false;
  }
  return true;
}

function shownCount(d: GameState, event: SimEventType, lineId: string): number {
  return d.dialogue.shown[event]?.[lineId] ?? 0;
}

/**
 * Pick the line for one event (PLAN §10 algorithm). Returns the line, or
 * null when the pool for this (event, advisor) is empty. Pure with respect
 * to sim state — the ONLY side effect is on narration fields, applied by
 * `applyNarration` after the pick (so a failed pick changes nothing).
 */
export function pickLine(
  d: GameState,
  ev: SimEvent,
  rng: Rng,
): DialogueLine | null {
  const pool = LINES_BY_ADVISOR[d.dialogue.advisor];
  if (pool.length === 0) return null;
  const occurrences = eventOccurrences(d, ev.type);

  const candidates = pool.filter((l) => {
    if (l.event !== ev.type) return false;
    if (!stageOk(l, d, occurrences)) return false;
    const shown = shownCount(d, ev.type, l.id);
    // first lines: guaranteed on the FIRST occurrence, never again
    if (l.kind === 'first' && (occurrences > 0 || shown > 0)) return false;
    if (l.maxPerCampaign !== undefined && shown >= l.maxPerCampaign) return false;
    const last = d.dialogue.lastShown[l.id];
    if (last !== undefined && d.tick - last < l.cooldownTicks) return false;
    if (l.eligibility && !l.eligibility(ev, d)) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  // 2. Unseen first lines win; else least-shown, narrRng tie-break.
  const firsts = candidates.filter(
    (l) => l.kind === 'first' && shownCount(d, ev.type, l.id) === 0,
  );
  const finalists = firsts.length > 0 ? firsts : candidates;

  const order = new Map<string, number>();
  for (const l of finalists) order.set(l.id, rng.next());
  const sorted = [...finalists].sort((a, b) => {
    const ca = shownCount(d, ev.type, a.id);
    const cb = shownCount(d, ev.type, b.id);
    if (ca !== cb) return ca - cb;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });

  // 3. Recent window: soft filter. If every sorted candidate is in the
  // window, fall back to the full sorted order (least-recent wins).
  const recent = new Set(d.dialogue.recentIds);
  const outside = sorted.filter((l) => !recent.has(l.id));
  const chosen = (outside.length > 0 ? outside : sorted)[0];
  return chosen;
}

/** Interpolate {vars} from the event payload; unknown tokens are dropped. */
export function interpolate(text: string, ev: SimEvent): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = ev.payload?.[key as keyof SimEvent['payload']];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * Narrate every un-narrated event (in seq order). Runs at the end of each
 * tick (runTick) and after each instant action (dispatchSim) — idempotent
 * via the `lastNarratedSeq` cursor. Only the LAST pick is displayed
 * (`d.lastDialogue`); earlier picks still advance their pools, so hidden
 * events cycle their lines honestly.
 */
export function applyNarration(d: GameState, rng: Rng): void {
  let last: GameState['lastDialogue'] = null;
  for (const ev of d.events) {
    if (ev.seq <= d.dialogue.lastNarratedSeq) continue;
    const line = pickLine(d, ev, rng);
    if (line) {
      const event = ev.type;
      const shown = (d.dialogue.shown[event] ??= {});
      shown[line.id] = (shown[line.id] ?? 0) + 1;
      d.dialogue.lastShown[line.id] = d.tick;
      d.dialogue.recentIds.push(line.id);
      if (d.dialogue.recentIds.length > RECENT_WINDOW) {
        d.dialogue.recentIds.splice(0, d.dialogue.recentIds.length - RECENT_WINDOW);
      }
      last = {
        tick: d.tick,
        event: ev.type,
        lineId: line.id,
        advisor: d.dialogue.advisor,
        text: interpolate(line.text, ev),
      };
    }
    d.dialogue.lastNarratedSeq = ev.seq;
  }
  if (last !== null) d.lastDialogue = last;
}
