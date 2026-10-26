/**
 * Core entity types for the Empire, Apparently simulation (PLAN §5).
 * The engine is pure TypeScript — no React, DOM, storage, or clocks.
 * Every type here must be JSON-serializable (save format, PLAN §7).
 */

import type { RngState } from './random';

/** Star classification (core §3; classes are our design choice). */
export type StarClass = 'blue' | 'yellow' | 'red' | 'binary' | 'white';

/**
 * Planet illustration types (core §3 "planet illustration type").
 * Each type determines the planet's initial specialization.
 */
export type PlanetType = 'foundry' | 'quarry' | 'market' | 'bastion' | 'garden';

/** Specializations (core §5 — canonical list). */
export type Specialization =
  | 'industrial'
  | 'mining'
  | 'economic'
  | 'fortress'
  | 'balanced';

/** Ship classes (core §6). */
export type ShipClass = 'interceptor' | 'cruiser' | 'transport';

/** The three global empire resources (core §5). */
export interface Resources {
  credits: number;
  materials: number;
  fuel: number;
}

export interface Planet {
  name: string;
  type: PlanetType;
  specialization: Specialization;
  /** 1..5 — auto-advancing, capped, transparent cost (core §5). */
  development: number;
  /** Population in millions (integer). */
  population: number;
  /** 0..100 — meaningful for player occupations; 100 = peaceful at start. */
  stability: number;
  /** 0..100 — integration meter (C8); at 100 the world is 'integrated'. */
  integration: number;
  /** Garrison troops (meaningful for player occupations). */
  garrison: number;
}

export type OccupationState = 'none' | 'occupied' | 'integrated';

export interface System {
  /** "S00".."S19" — fixed canonical order (index order). */
  id: string;
  name: string;
  /** Map units (float, 2 decimals; space ≈ 100×80, see balance.ts). */
  x: number;
  y: number;
  /** Grid cell (topology for adjacency: rival expansion, fairness checks). */
  gx: number;
  gy: number;
  starClass: StarClass;
  /** null = uninhabited star (waypoint / supernova site). */
  planet: Planet | null;
  /** Orbital defense strength. */
  defense: number;
  /** null = independent/neutral (neutral defenses, core §3). */
  ownerId: string | null;
  /** Set when the player captures a world that had a faction (core §9). */
  previousOwnerId: string | null;
  /** Basic information about nearby systems (core §3 starting conditions). */
  explored: boolean;
  /** Player-side occupation state (core §9). */
  occupation: OccupationState;
  /** Supernova remnant — non-colonizable (core §10). */
  destroyed: boolean;
  /** 0..100 (core §10). */
  instability: number;
  /** Seeded at new game; never the homeworld (fairness). */
  supernovaCandidate: boolean;
  /** Per-year instability increment (>0 only for candidates; C15). */
  instabilityRate: number;
  /** Ticks of evacuation remaining (C16; 0 = none). */
  evacuationTicks: number;
}

export type FactionKind = 'player' | 'rival' | 'independent';

// ── Semantic events (C19) ───────────────────────────────────────────────

/**
 * The semantic event catalog (PLAN §10; data lives in `data/dialogue/events.ts`).
 * The engine emits these as it acts — FACTS, not prose. The dialogue layer
 * (`engine/dialogue.ts`) turns them into advisor lines; the factual log is
 * a separate surface (P5). Pruned from the PLAN §10 draft: victory/defeat
 * (the end screen presents them), event.resolved (arrives with C29),
 * rival.defeated (the current rules never eliminate a rival).
 *
 * `campaign.start` and `advisor.switched` are the greeting layer (C19.5): the
 * bar speaks the moment a campaign begins and answers advisor switches
 * without waiting for a sim event.
 */
export type SimEventType =
  | 'campaign.start'
  | 'advisor.switched'
  | 'travel.depart'
  | 'travel.arrive'
  | 'recon.reveal'
  | 'combat.victory'
  | 'combat.defeat'
  | 'combat.withdraw'
  | 'invasion.success'
  | 'invasion.failure'
  | 'planet.captured'
  | 'planet.integrated'
  | 'occupation.unstable'
  | 'occupation.rebellion'
  | 'ship.built'
  | 'fleet.repaired'
  | 'support.report'
  | 'supernova.anomalous'
  | 'supernova.critical'
  | 'supernova.detonation'
  | 'evacuation.done'
  | 'rival.expansion'
  | 'rival.attack';

/**
 * A semantic event the sim emits (C19). `seq` is a monotonic sequence
 * number (narration cursor); `payload` carries factual values for line
 * interpolation ({planetName}, {factionName}, {shipsLost}, {troopsLost},
 * {years}, {population}).
 */
export interface SimEvent {
  seq: number;
  tick: number;
  type: SimEventType;
  payload?: {
    planetName?: string;
    factionName?: string;
    shipsLost?: number;
    troopsLost?: number;
    years?: number;
    population?: number;
    mission?: string;
  };
}

/** The last advisor line (C19) — what the DialogueBar renders. */
export interface DialoguePick {
  tick: number;
  event: SimEventType;
  lineId: string;
  advisor: AdvisorId;
  text: string;
}

export interface Faction {
  id: string;
  name: string;
  kind: FactionKind;
  /** UI color token (see data/names.ts FACTION_COLORS). */
  color: string;
  /** Rival fleet strength (C11): abstract warships — offensive power for
   *  rival attacks, and the counter-part for player support fleets (C13+).
   *  0 for the player and independent factions. */
  fleet: number;
}

export interface Galaxy {
  seed: number;
  /** Fixed order = canonical iteration order (index 0 = "S00"). */
  systems: System[];
  factions: Faction[];
  homeworldId: string;
  /** factionId → system id that is that faction's capital (player = homeworld). */
  capitalIds: Record<string, string>;
}

// ── Fleets (core spec §6) ─────────────────────────────────────────────

export interface FleetShips {
  interceptor: number;
  cruiser: number;
  transport: number;
}

/** Flagship orders (core §6 "current orders"); C4/C7/C11 wire each one. */
export type FleetOrderType = 'hold' | 'travel' | 'attack' | 'reinforce';

/**
 * Support fleet states (core §7: "simple state machines, NOT autonomous
 * agents"). C13 drives Idle/Traveling/Patrolling/Returning; C14 adds the
 * mission states (Scouting/Reinforcing/Defending) and Patrol intercepts.
 */
export type SupportState =
  | 'idle'
  | 'traveling'
  | 'scouting'
  | 'patrolling'
  | 'reinforcing'
  | 'defending'
  | 'returning';

/** Support-fleet missions (C14; core §7) — the fixed inventory of four. */
export type SupportMission = 'scout' | 'patrol' | 'reinforce' | 'defend';

/** An assigned mission: the machine executes it, the player never pilots. */
export interface SupportFleetMission {
  type: SupportMission;
  targetId: string;
}

export interface Fleet {
  id: string;
  name: string;
  /**
   * Current location (core §6). While `travel` is set, this is the ORIGIN
   * system and the map interpolates the ship's position (C4).
   */
  systemId: string;
  /** Ship quantities by class (core §6). */
  ships: FleetShips;
  /** Hull condition 0..100 (core §6; C6 repair/refit). */
  hull: number;
  /** Invasion troops aboard (0..maxTroops; C6 rearm, C7/C8 consume). */
  troops: number;
  orders: { type: FleetOrderType; targetId: string | null };
  /** Active voyage (C4 travel); null while docked. */
  travel: null | {
    fromId: string;
    toId: string;
    departTick: number;
    arriveTick: number;
  };
  /** Support-fleet home system (C13) — undefined for the flagship. */
  homeId?: string;
  /** Support-fleet state machine (C13) — undefined for the flagship. */
  supportState?: SupportState;
  /** Assigned mission (C14) — null = unassigned (patrols home). */
  mission?: SupportFleetMission | null;
}

// ── Log & campaign state ────────────────────────────────────────────────

export type LogKind = 'info' | 'economy' | 'combat' | 'event' | 'warning' | 'advisor';

export interface LogEntry {
  tick: number;
  kind: LogKind;
  text: string;
}

// ── Game state (PLAN §7 save contract, v1) ─────────────────────────────

export type AdvisorId = 'mort' | 'bingo' | 'handbook';
export type HintLevel = 'off' | 'occasional' | 'normal' | 'frequent';
export type ThemeSetting = 'light' | 'dark' | 'system';
export type CampaignStatus = 'active' | 'victory' | 'defeat';
export type DefeatReason = 'total' | 'deadline' | 'unrecoverable' | null;

/** Rival AI state (C8: intent + expansion; C11: per-tick action budget). */
export interface RivalState {
  factionId: string;
}

// ── Combat (C7) ─────────────────────────────────────────────────────

/** Player attack stances (PLAN §8, documented multipliers). */
export type Stance = 'aggressive' | 'balanced' | 'cautious';

export type BattleOutcome =
  | 'captured' // orbit won, invasion landed
  | 'held' // orbit lost
  | 'invasion-failed' // orbit won, ground held
  | 'withdrawn' // orbit won, cautious withdrawal roll
  | 'no-lift'; // orbit won, no surviving transports

/**
 * The last battle, stored so the factual report modal can render it after
 * the action resolves (and survive saves, C35). 100% factual — advisor
 * narration is a separate system (C19) and never lives here.
 */
export interface BattleReport {
  tick: number;
  targetId: string;
  targetName: string;
  stance: Stance;
  outcome: BattleOutcome;
  /** Attacker strength after the stance multiplier (before variance). */
  attackerStrength: number;
  /** Defender's orbital strength at the start of the battle. */
  defenderStrength: number;
  /** Clamped ship-loss fraction (hull degradation input; 3 decimals). */
  lossFraction: number;
  shipsLost: FleetShips;
  shipsAfter: FleetShips;
  hullAfter: number;
  troopsLost: number;
  troopsAfter: number;
  /** Defender's orbital strength after the battle. */
  defenseAfter: number;
  /** Ground garrison set on capture (null otherwise). */
  garrison: number | null;
  captured: boolean;
}

/**
 * The only mutable game state (PLAN §7). Everything is JSON-serializable —
 * RNGs are stored as serializable state, never objects.
 */
/**
 * C20 — one tutorial step (data lives in `data/tutorial/steps.ts`, C22).
 *
 * Verify-only advance (CHUNKS C20): the machine advances a step SOLELY when
 * `verify` — an authoritative, pure state check — returns true. There is no
 * failure state: a wrong action sequence never fails a step, it just doesn't
 * advance it, and a different valid action can never trap the player (the
 * check is on state, never on the path taken). `recovery` is the recovery
 * probe: guidance for when the expected action is currently impossible.
 */
export interface TutorialStep {
  id: string;
  /** Objective — a conventional label (SPEC §10); no jokes in the objective. */
  objective: string;
  /** Conventional label of the control to use (C22 highlights the real one). */
  control: string | null;
  /** Authoritative state check — pure. True = the step is done. */
  verify: (s: GameState) => boolean;
  /** Recovery probe: guidance when the expected action is impossible (null = nothing to say). */
  recovery?: (s: GameState) => string | null;
}

export interface GameState {
  v: 1;
  seed: number;
  /** Galactic-year tick (0 = start; core §4 "discrete galactic-year ticks"). */
  tick: number;
  /** Simulation RNG — every mechanical draw, in pipeline order. */
  rng: RngState;
  /** Narration-only RNG (dialogue variety). Never influences sim outcomes. */
  narrRng: RngState;
  galaxy: Galaxy;
  /** The three global empire resources (core §5). */
  empire: Resources;
  /** The player's primary expeditionary fleet (core §6). */
  flagship: Fleet;
  /** Up to 3 autonomous support fleets (core §7; C13). */
  supports: Fleet[];
  rivals: RivalState[];
  /**
   * C21 — Tutorial scenario: rival actions are frozen for the whole scenario
   * (save-safe plain field; the rivals stage checks it each tick).
   */
  rivalsFrozen: boolean;
  /**
   * C21 — Tutorial scenario: a scripted supernova. The star's instability is
   * pinned to exact ticks (deterministic); transitions and detonation flow
   * through the normal pipeline.
   */
  scriptedSupernova: {
    systemId: string;
    anomalousAt: number;
    criticalAt: number;
    armedAt: number;
  } | null;
  /** Deterministic narrative-event state (C29). */
  narrative: { resolvedIds: string[]; cooldowns: Record<string, number> };
  /**
   * Semantic events the sim has emitted (C19; capped, newest last). Facts —
   * the log is the prose record, this is the typed record the dialogue
   * layer consumes.
   */
  events: SimEvent[];
  /** The advisor's most recent line (C18→C19; narration, never sim). */
  lastDialogue: DialoguePick | null;
  /** Present while the tutorial runs (C20–C23). */
  tutorial: {
    /** C21 scenario id (which deterministic region the tutorial plays on). */
    scenario: string;
    /** Index of the current step (=== steps.length when all complete). */
    step: number;
    /** Milestones in save: indices of completed steps (C23 preserves them). */
    completedSteps: number[];
    /** Skip pauses the tutorial; resume re-activates it at the same step. */
    skipped: boolean;
  } | null;
  dialogue: {
    advisor: AdvisorId;
    recentIds: string[];
    shown: Record<string, Record<string, number>>;
    /** C19: lineId → tick it last showed (cooldowns). */
    lastShown: Record<string, number>;
    /** C19: seq of the last narrated event (narration cursor). */
    lastNarratedSeq: number;
    /** C19: next event seq to assign. */
    seq: number;
  };
  settings: {
    hints: HintLevel;
    supernovaFreq: 'zero' | 'low' | 'normal';
    advisor: AdvisorId;
    sound: boolean;
    theme: ThemeSetting;
  };
  stats: {
    battles: number;
    wins: number;
    losses: number;
    fleetsLost: number;
    supernovas: number;
    conquests: number;
  };
  status: CampaignStatus;
  defeatReason: DefeatReason;
  /** Last resolved battle (report modal input; C19 adds narration beside it). */
  lastBattle: BattleReport | null;
  /** Append-only event log; newest entries last. */
  log: LogEntry[];
}
