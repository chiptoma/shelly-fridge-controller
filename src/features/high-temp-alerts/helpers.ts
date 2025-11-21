/**
 * Helper functions for high temperature alert logic
 */

import type { SingleAlertState } from './types';

/**
 * Update a single temperature alert state (mutates in place)
 * @param temperature - Current temperature reading
 * @param now - Current timestamp in seconds
 * @param state - Alert state to mutate
 * @param threshold - Temperature threshold in °C
 * @param delaySec - Delay before firing in seconds
 * @returns Whether alert just fired this cycle
 */
export function updateSingleAlert(
  temperature: number | null,
  now: number,
  state: SingleAlertState,
  threshold: number,
  delaySec: number
): boolean {
  // Reset tracking if temperature is null
  if (temperature === null) {
    state.startTime = 0;
    state.fired = false;
    return false;
  }

  // Temperature below threshold - reset tracking
  if (temperature < threshold) {
    state.startTime = 0;
    state.fired = false;
    return false;
  }

  // Temperature at or above threshold
  // Start tracking if not already
  if (state.startTime === 0) {
    state.startTime = now;
    state.fired = false;
    return false;
  }

  // Check if delay has elapsed and alert hasn't fired yet
  if (!state.fired && (now - state.startTime) >= delaySec) {
    state.fired = true;
    return true;
  }

  // Continue tracking - no changes needed
  return false;
}
