/**
 * Freeze protection logic
 * Prevents evaporator from freezing by locking compressor off when too cold
 */

import type { TemperatureReading } from '$types/common';
import type { FreezeState, FreezeConfig } from './types';
import { shouldEngageFreezeLock, shouldReleaseFreezeLock } from './helpers';

/**
 * Update freeze protection state based on current conditions (MUTABLE)
 *
 * Mutates freezeState in-place for memory efficiency on constrained devices.
 *
 * @param evapTemp - Current evaporator temperature
 * @param now - Current timestamp in seconds
 * @param freezeState - Current freeze protection state (will be mutated)
 * @param config - Configuration object
 * @returns The same state object (for convenience)
 */
export function updateFreezeProtection(
  evapTemp: TemperatureReading,
  now: number,
  freezeState: FreezeState,
  config: FreezeConfig
): FreezeState {
  // Check for freeze lock engagement
  if (shouldEngageFreezeLock(evapTemp, freezeState, config)) {
    freezeState.locked = true;
    freezeState.lockCount = (freezeState.lockCount || 0) + 1;
    freezeState.unlockTime = 0;
    return freezeState;
  }

  // Check for freeze lock release
  const releaseDecision = shouldReleaseFreezeLock(evapTemp, now, freezeState, config);

  if (releaseDecision.release) {
    freezeState.locked = false;
    freezeState.unlockTime = 0;
  } else if (releaseDecision.startRecovery) {
    freezeState.unlockTime = now;
  } else if (releaseDecision.cancelRecovery) {
    freezeState.unlockTime = 0;
  }

  return freezeState;
}
