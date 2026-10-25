import type { Specialization, StarClass } from '../engine/types';

/**
 * Name pools (PLAN §5). All names are original (SPEC §2 — no recognizable
 * copyrighted characters or branding). Pools are larger than any single
 * campaign draws so names never repeat within a galaxy.
 */

export const PLAYER_FACTION_NAME = 'The Provisional Authority';

/** Homeworld names — deliberately administrative and provisional. */
export const HOMENAMES = [
  'Kettle Green',
  'Provisional Prime',
  'The Spare Capital',
  'Civic Center Station',
  'First Floor',
  'Municipal Reserve',
  'The Good Porch',
  'Interim Hold',
] as const;

/** Star system names. Pool must be >= 20. */
export const SYSTEM_NAMES = [
  'Loose Change',
  'The Annex',
  'Bureau Nine',
  'Quiet Harbor',
  'The Overlook',
  'Milestone',
  'Sundial Reach',
  'The Waiting Room',
  "Ferryman's Rest",
  'Cold Ledger',
  'The Margins',
  'Steady Light',
  'The Long Hall',
  'Copper Verge',
  'The Drafting Room',
  'Slow Tide',
  'The Archive',
  'Bellwether',
  'The Quiet Part',
  'Iron Orchard',
  'The Switchboard',
  'Pale Meridian',
  'The Last Form',
  'Unclaimed Aisle',
] as const;

/** Planet names. Pool must be >= 18. */
export const PLANET_NAMES = [
  'Oatfield',
  'The Greenhouse',
  'Rustvale',
  'Milltown',
  'The Terrace',
  'Saltmere',
  'Brickhill',
  'The Atrium',
  'Low Orchard',
  'The Foundry',
  'Cinder Flat',
  'Wheatline',
  'The Docks',
  'Hearthmoor',
  'The Cellar',
  'Glassfield',
  'Vellum Downs',
  'Lantern Rise',
  'The Quiet Farm',
  'Ashpool',
  'The Model Home',
  'Kiln Street',
  'The Upper Flat',
  'Pigeon Hollow',
] as const;

/** Rival faction names — draw 3. */
export const RIVAL_NAMES = [
  'The Polite Expansion',
  'Ministry of Neighbors',
  'The Patient Fleet',
  'Bureau of Arrival',
  'The Courteous Conquest',
  'Directorate Next Door',
] as const;

/** Independent faction names — draw 7. */
export const INDEPENDENT_NAMES = [
  'The Free Hold',
  'Independent Post',
  'The Self-Governed',
  'Local Affairs',
  'The Unaffiliated',
  'Municipal Freedom',
  'The Open Ledger',
  'Sovereign Porch',
  'The Quiet Republic',
  'Civic Autonomy',
  'The Unbothered',
  'Home Rule',
] as const;

/** Map ownership colors (UI tokens, not mechanics). */
export const FACTION_COLORS = {
  player: '#4c6ef5',
  rivals: ['#e03131', '#e8590c', '#9c36b5'],
  independents: [
    '#2f9e44',
    '#0ca678',
    '#1098ad',
    '#66a80f',
    '#f08c00',
    '#37b24d',
    '#12b886',
  ],
  neutral: '#868e96',
} as const;

/** Star-class colors (UI tokens, not mechanics). */
export const STAR_COLORS: Record<StarClass, string> = {
  red: '#ff6b57',
  yellow: '#ffd75e',
  white: '#dfe6f3',
  blue: '#74a4fc',
  binary: '#b197fc',
};

/**
 * Specialization display labels + one-line notes (UI copy only). Notes
 * describe ONLY implemented effects — the PLAN §8 "special" column items
 * that aren't built yet (industrial build discount, fortress defense bonus)
 * are deferred to C11/C34 and must not be advertised (core §19).
 */
export const SPEC_LABEL: Record<Specialization, string> = {
  industrial: 'Industrial',
  mining: 'Mining',
  economic: 'Economic',
  fortress: 'Fortress',
  balanced: 'Balanced',
};

export const SPEC_NOTE: Record<Specialization, string> = {
  industrial: 'Materials-heavy production.',
  mining: 'Extra fuel and materials.',
  economic: 'Credit-rich production.',
  fortress: 'Counts as a shipyard at any development level.',
  balanced: 'Even production across the board.',
};

/** Single-letter map badge (UI only, C9). */
export const SPEC_BADGE: Record<Specialization, string> = {
  industrial: 'i',
  mining: 'm',
  economic: 'e',
  fortress: 'f',
  balanced: 'b',
};
