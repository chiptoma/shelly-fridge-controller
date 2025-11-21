/**
 * High temperature alert types
 */

/**
 * State for a single temperature alert
 */
export interface SingleAlertState {
  /** Timestamp when temperature first exceeded threshold (0 if not tracking) */
  startTime: number;
  /** Whether alert has been fired for current exceedance */
  fired: boolean;
}

/**
 * Combined state for all high temperature alerts
 */
export interface HighTempAlertState {
  /** Instant (critical) high temperature alert state */
  instant: SingleAlertState;
  /** Sustained high temperature alert state */
  sustained: SingleAlertState;
  /** Whether any alert just fired this cycle */
  justFired: boolean;
}

/**
 * Configuration for high temperature alerts
 * Maps to FridgeConfig properties
 */
export interface HighTempAlertConfig {
  /** Temperature threshold for instant alert (°C) */
  HIGH_TEMP_INSTANT_THRESHOLD_C: number;
  /** Delay before instant alert fires (seconds) */
  HIGH_TEMP_INSTANT_DELAY_SEC: number;
  /** Temperature threshold for sustained alert (°C) */
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: number;
  /** Delay before sustained alert fires (seconds) */
  HIGH_TEMP_SUSTAINED_DELAY_SEC: number;
}
