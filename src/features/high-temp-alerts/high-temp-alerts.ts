/**
 * High temperature alert logic
 *
 * Monitors air temperature and fires alerts when thresholds are exceeded
 * for configured delay periods. Two alert types:
 * - Instant: Higher threshold, shorter delay (critical situations)
 * - Sustained: Lower threshold, longer delay (prolonged issues)
 */

import type { TemperatureReading } from '$types/common';
import type { HighTempAlertState, HighTempAlertConfig } from './types';
import { updateSingleAlert } from './helpers';

export type { HighTempAlertState, HighTempAlertConfig };

/**
 * Initialize high temperature alert state
 * @returns Fresh alert state with all tracking reset
 */
export function initHighTempAlertState(): HighTempAlertState {
  return {
    instant: { startTime: 0, fired: false },
    sustained: { startTime: 0, fired: false },
    justFired: false,
  };
}

/**
 * Update all high temperature alerts
 *
 * @param airTemp - Current air temperature (smoothed)
 * @param now - Current timestamp in seconds
 * @param alertState - Current alert state
 * @param config - Configuration with thresholds and delays
 * @returns Updated alert state
 *
 * @remarks
 * **Alert Logic**: Each alert tracks independently:
 * 1. When temp exceeds threshold, start tracking time
 * 2. After delay elapses, fire alert (once per exceedance)
 * 3. When temp drops below threshold, reset tracking
 *
 * **justFired Flag**: Set to true when either alert fires this cycle.
 * Caller should check this to trigger notifications.
 *
 * @example
 * ```typescript
 * const newState = updateHighTempAlerts(5.5, now, state, config);
 * if (newState.justFired) {
 *   sendAlertNotification('High temperature detected');
 * }
 * ```
 */
export function updateHighTempAlerts(
  airTemp: TemperatureReading,
  now: number,
  alertState: HighTempAlertState,
  config: HighTempAlertConfig
): HighTempAlertState {
  const instantResult = updateSingleAlert(
    airTemp,
    now,
    alertState.instant,
    config.HIGH_TEMP_INSTANT_THRESHOLD_C,
    config.HIGH_TEMP_INSTANT_DELAY_SEC
  );

  const sustainedResult = updateSingleAlert(
    airTemp,
    now,
    alertState.sustained,
    config.HIGH_TEMP_SUSTAINED_THRESHOLD_C,
    config.HIGH_TEMP_SUSTAINED_DELAY_SEC
  );

  return {
    instant: instantResult.state,
    sustained: sustainedResult.state,
    justFired: instantResult.justFired || sustainedResult.justFired,
  };
}

/**
 * Check if instant alert is currently active
 * @param state - Current alert state
 * @returns True if instant alert has fired and is still tracking
 */
export function isInstantAlertActive(state: HighTempAlertState): boolean {
  return state.instant.fired;
}

/**
 * Check if sustained alert is currently active
 * @param state - Current alert state
 * @returns True if sustained alert has fired and is still tracking
 */
export function isSustainedAlertActive(state: HighTempAlertState): boolean {
  return state.sustained.fired;
}
