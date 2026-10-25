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
}

export type FactionKind = 'player' | 'rival' | 'independent';

export interface Faction {
  id: string;
  name: string;
  kind: FactionKind;
  /** UI color token (see data/names.ts FACTION_COLORS). */
  color: string;
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

export interface Fleet {
  id: string;
  name: string;
  /** Current location (core §6). C4 adds travel status on top. */
  systemId: string;
  /** Ship quantities by class (core §6). */
  ships: FleetShips;
  /** Hull condition 0..100 (core §6; C6 repair/refit). */
  hull: number;
  orders: { type: FleetOrderType; targetId: string | null };
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

/**
 * The only mutable game state (PLAN §7). Everything is JSON-serializable —
 * RNGs are stored as serializable state, never objects.
 */
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
  /** Deterministic narrative-event state (C29). */
  narrative: { resolvedIds: string[]; cooldowns: Record<string, number> };
  /** Present while the tutorial runs (C20–C23). */
  tutorial: { step: number; completedSteps: number[]; scenario: string } | null;
  dialogue: {
    advisor: AdvisorId;
    recentIds: string[];
    shown: Record<string, Record<string, number>>;
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
  /** Append-only event log; newest entries last. */
  log: LogEntry[];
}
