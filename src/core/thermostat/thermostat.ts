/**
 * Thermostat decision logic with freeze protection override
 */

import type { TemperatureReading } from '$types/common';
import type { ThermostatState } from './types';

/**
 * Decide whether compressor should be cooling
 * @param airTemp - Current air temperature (smoothed or raw)
 * @param relayOn - Current relay state
 * @param state - Thermostat state
 * @returns True if compressor should be ON
 */
export function decideCooling(
  airTemp: TemperatureReading,
  relayOn: boolean,
  state: ThermostatState
): boolean {
  // Freeze protection override: always turn OFF if locked
  if (state.freezeLocked) {
    return false;
  }

  // Null sensor: maintain current state (safe mode)
  if (airTemp === null) {
    return relayOn;
  }

  // Hysteresis control with dynamic thresholds
  if (relayOn) {
    // Currently ON: turn OFF when temp drops to or below lower threshold
    return airTemp > state.dynOffBelow;
  } else {
    // Currently OFF: turn ON when temp rises to or above upper threshold
    return airTemp >= state.dynOnAbove;
  }
}

/**
 * Calculate initial thermostat thresholds from configuration
 * @param setpoint - Target temperature in °C
 * @param hysteresis - Hysteresis band in °C
 * @returns Object with onAbove and offBelow thresholds
 */
export function calculateThresholds(
  setpoint: number,
  hysteresis: number
): { onAbove: number; offBelow: number } {
  return {
    onAbove: setpoint + hysteresis,
    offBelow: setpoint - hysteresis
  };
}
