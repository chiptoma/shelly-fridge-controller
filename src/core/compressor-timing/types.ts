/**
 * Compressor timing type definitions
 *
 * These types support the MIN_ON/MIN_OFF safety constraints that protect
 * the compressor from damage caused by short-cycling.
 */

/**
 * Constraint type identifiers
 */
export const TIMING_CONSTRAINTS = {
  MIN_ON: 'MIN_ON',
  MIN_OFF: 'MIN_OFF'
} as const;

export type TimingConstraintType = typeof TIMING_CONSTRAINTS[keyof typeof TIMING_CONSTRAINTS];

/**
 * Result of timing constraint check
 *
 * Used to communicate whether a compressor state change is allowed
 * based on MIN_ON/MIN_OFF safety constraints.
 */
export interface TimingCheckResult {
  /** Whether the timing constraint allows the state change */
  allow: boolean;

  /** Remaining seconds until constraint is satisfied */
  remainingSec?: number;

  /** Timestamp when compressor can be turned OFF */
  canTurnOffAt?: number;

  /** Timestamp when compressor can be turned ON */
  canTurnOnAt?: number;

  /** Which constraint is blocking */
  reason?: TimingConstraintType;
}

/**
 * Timing state for compressor
 *
 * Tracks timestamps of last state transitions for constraint enforcement.
 */
export interface TimingState {
  /** Timestamp (seconds) when compressor was last turned ON */
  lastOnTime: number;

  /** Timestamp (seconds) when compressor was last turned OFF */
  lastOffTime: number;
}

/**
 * Timing configuration
 *
 * These values protect the compressor:
 * - MIN_ON_SEC: Prevents short-cycling that causes oil starvation
 * - MIN_OFF_SEC: Allows refrigerant pressures to equalize
 */
export interface TimingConfig {
  /** Minimum ON time in seconds (prevents oil starvation) */
  MIN_ON_SEC: number;

  /** Minimum OFF time in seconds (allows pressure equalization) */
  MIN_OFF_SEC: number;
}
