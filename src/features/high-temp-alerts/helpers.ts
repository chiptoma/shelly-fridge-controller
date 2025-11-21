/**
 * Helper functions for high temperature alert logic
 */

import type { SingleAlertState } from './types';

/**
 * Update a single temperature alert state
 * @param temperature - Current temperature reading
 * @param now - Current timestamp in seconds
 * @param state - Current alert state
 * @param threshold - Temperature threshold in °C
 * @param delaySec - Delay before firing in seconds
 * @returns Updated alert state and whether it just fired
 */
export function updateSingleAlert(
  temperature: number | null,
  now: number,
  state: SingleAlertState,
  threshold: number,
  delaySec: number
): { state: SingleAlertState; justFired: boolean } {
  // Reset tracking if temperature is null
  if (temperature === null) {
    return {
      state: { startTime: 0, fired: false },
      justFired: false,
    };
  }

  // Temperature below threshold - reset tracking
  if (temperature < threshold) {
    return {
      state: { startTime: 0, fired: false },
      justFired: false,
    };
  }

  // Temperature at or above threshold
  // Start tracking if not already
  if (state.startTime === 0) {
    return {
      state: { startTime: now, fired: false },
      justFired: false,
    };
  }

  // Check if delay has elapsed and alert hasn't fired yet
  if (!state.fired && (now - state.startTime) >= delaySec) {
    return {
      state: { startTime: state.startTime, fired: true },
      justFired: true,
    };
  }

  // Continue tracking
  return {
    state: { startTime: state.startTime, fired: state.fired },
    justFired: false,
  };
}
