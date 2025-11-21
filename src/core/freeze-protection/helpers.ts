/**
 * Freeze protection helper functions
 *
 * Internal logic for evaporator freeze protection.
 * Prevents ice buildup that can damage equipment and reduce efficiency.
 */

import type { TemperatureReading } from '$types/common';
import type { FreezeState, FreezeConfig, ReleaseDecision } from './types';

/**
 * Validate freeze protection configuration
 * @throws {Error} If configuration is invalid
 */
export function validateFreezeConfig(config: FreezeConfig): void {
  if (config.FREEZE_PROTECTION_START_C >= config.FREEZE_PROTECTION_STOP_C) {
    throw new Error(
      `Invalid freeze config: START_C (${config.FREEZE_PROTECTION_START_C}) must be less than STOP_C (${config.FREEZE_PROTECTION_STOP_C})`
    );
  }
  if (config.FREEZE_LOCK_HYSTERESIS_C < 0 || config.FREEZE_RECOVERY_HYSTERESIS_C < 0) {
    throw new Error('Hysteresis values must be non-negative');
  }
  if (config.FREEZE_RECOVERY_DELAY_SEC <= 0) {
    throw new Error('Recovery delay must be positive');
  }
}

/**
 * Check if freeze lock should be engaged
 * @param evapTemp - Current evaporator temperature
 * @param freezeState - Current freeze protection state
 * @param config - Configuration object
 * @returns True if freeze lock should be engaged
 */
export function shouldEngageFreezeLock(
  evapTemp: TemperatureReading,
  freezeState: FreezeState,
  config: FreezeConfig
): boolean {
  // Don't engage if already locked
  if (freezeState.locked) {
    return false;
  }

  // Can't determine without sensor
  if (evapTemp === null) {
    return false;
  }

  // Engage lock if temp drops below threshold (with hysteresis)
  return evapTemp <= (config.FREEZE_PROTECTION_START_C - config.FREEZE_LOCK_HYSTERESIS_C);
}

/**
 * Check if freeze lock should be released
 * @param evapTemp - Current evaporator temperature
 * @param now - Current timestamp in seconds
 * @param freezeState - Current freeze protection state
 * @param config - Configuration object
 * @returns Result object with release decision and state updates
 */
export function shouldReleaseFreezeLock(
  evapTemp: TemperatureReading,
  now: number,
  freezeState: FreezeState,
  config: FreezeConfig
): ReleaseDecision {
  // Not locked, nothing to release
  if (!freezeState.locked) {
    return { release: false, startRecovery: false, cancelRecovery: false };
  }

  // Can't determine without sensor
  if (evapTemp === null) {
    return { release: false, startRecovery: false, cancelRecovery: false };
  }

  const tempAboveThreshold = evapTemp >= (config.FREEZE_PROTECTION_STOP_C + config.FREEZE_RECOVERY_HYSTERESIS_C);

  // If temp dropped again during recovery, cancel recovery
  if (evapTemp < config.FREEZE_PROTECTION_STOP_C && freezeState.unlockTime !== 0) {
    return { release: false, startRecovery: false, cancelRecovery: true };
  }

  // If temp is above threshold but recovery hasn't started, start it
  if (tempAboveThreshold && freezeState.unlockTime === 0) {
    return { release: false, startRecovery: true, cancelRecovery: false };
  }

  // If recovery is in progress, check if delay has elapsed
  if (tempAboveThreshold && freezeState.unlockTime !== 0) {
    const recoveryComplete = (now - freezeState.unlockTime) >= config.FREEZE_RECOVERY_DELAY_SEC;
    return { release: recoveryComplete, startRecovery: false, cancelRecovery: false };
  }

  // Default: stay locked
  return { release: false, startRecovery: false, cancelRecovery: false };
}
