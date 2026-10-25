/**
 * Core entity types for the Empire, Apparently simulation (PLAN §5).
 * The engine is pure TypeScript — no React, DOM, storage, or clocks.
 * Every type here must be JSON-serializable (save format, PLAN §7).
 */

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
  /** Map units (float, 2 decimals). */
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
