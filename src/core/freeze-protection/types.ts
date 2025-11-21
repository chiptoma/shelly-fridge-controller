/**
 * Freeze protection type definitions
 */

/**
 * Freeze protection state
 */
export interface FreezeState {
  /** Whether freeze lock is currently engaged */
  locked: boolean;

  /** Timestamp (seconds) when recovery started, 0 if not recovering */
  unlockTime: number;

  /** Number of freeze lock events since last reset */
  lockCount?: number;
}

/**
 * Freeze protection configuration
 */
export interface FreezeConfig {
  /** Temperature (°C) below which freeze lock engages */
  FREEZE_PROTECTION_START_C: number;

  /** Hysteresis (°C) for freeze lock engagement */
  FREEZE_LOCK_HYSTERESIS_C: number;

  /** Temperature (°C) above which recovery can start */
  FREEZE_PROTECTION_STOP_C: number;

  /** Hysteresis (°C) for recovery threshold */
  FREEZE_RECOVERY_HYSTERESIS_C: number;

  /** Delay (seconds) after reaching stop temp before releasing lock */
  FREEZE_RECOVERY_DELAY_SEC: number;
}

/**
 * Result of freeze lock release check
 */
export interface ReleaseDecision {
  /** Whether to release the freeze lock */
  release: boolean;

  /** Whether to start the recovery timer */
  startRecovery: boolean;

  /** Whether to cancel ongoing recovery */
  cancelRecovery: boolean;
}
