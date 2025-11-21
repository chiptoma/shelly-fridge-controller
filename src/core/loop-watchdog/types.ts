/**
 * Loop watchdog type definitions
 */

/**
 * Watchdog state
 */
export interface WatchdogState {
  /** Timestamp (seconds) of last heartbeat */
  lastWatchdogPet: number;
}

/**
 * Watchdog configuration
 */
export interface WatchdogConfig {
  /** Timeout in seconds before watchdog is considered starved */
  WATCHDOG_TIMEOUT_SEC: number;
}
