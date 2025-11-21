/**
 * Compressor timing type definitions
 */

/**
 * Result of timing constraint check
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

  /** Which constraint is blocking ('MIN_ON' or 'MIN_OFF') */
  reason?: 'MIN_ON' | 'MIN_OFF';
}

/**
 * Timing state for compressor
 */
export interface TimingState {
  /** Timestamp (seconds) when compressor was last turned ON */
  lastOnTime: number;

  /** Timestamp (seconds) when compressor was last turned OFF */
  lastOffTime: number;
}

/**
 * Timing configuration
 */
export interface TimingConfig {
  /** Minimum ON time in seconds */
  MIN_ON_SEC: number;

  /** Minimum OFF time in seconds */
  MIN_OFF_SEC: number;
}
