/**
 * Freeze protection logic
 * Prevents evaporator from freezing by locking compressor off when too cold
 */

import type { TemperatureReading } from '$types/common';
import type { FreezeState, FreezeConfig } from './types';
import { shouldEngageFreezeLock, shouldReleaseFreezeLock } from './helpers';

/**
 * Update freeze protection state based on current conditions
 * @param evapTemp - Current evaporator temperature
 * @param now - Current timestamp in seconds
 * @param freezeState - Current freeze protection state
 * @param config - Configuration object
 * @returns Updated freeze state
 */
export function updateFreezeProtection(
  evapTemp: TemperatureReading,
  now: number,
  freezeState: FreezeState,
  config: FreezeConfig
): FreezeState {
  const newState = Object.assign({}, freezeState);

  // Check for freeze lock engagement
  if (shouldEngageFreezeLock(evapTemp, freezeState, config)) {
    newState.locked = true;
    newState.lockCount = (freezeState.lockCount || 0) + 1;
    newState.unlockTime = 0;
    return newState;
  }

  // Check for freeze lock release
  const releaseDecision = shouldReleaseFreezeLock(evapTemp, now, freezeState, config);

  if (releaseDecision.release) {
    newState.locked = false;
    newState.unlockTime = 0;
  } else if (releaseDecision.startRecovery) {
    newState.unlockTime = now;
  } else if (releaseDecision.cancelRecovery) {
    newState.unlockTime = 0;
  }

  return newState;
}
