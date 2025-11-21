/**
 * High temperature alert logic
 */

import type { TemperatureReading } from '$types/common';

interface AlertState {
  instantStart: number;
  instantFired: boolean;
  sustainedStart: number;
  sustainedFired: boolean;
  justFired?: boolean;
}

interface AlertConfig {
  HIGH_TEMP_INSTANT_THRESHOLD_C: number;
  HIGH_TEMP_INSTANT_DELAY_SEC: number;
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: number;
  HIGH_TEMP_SUSTAINED_DELAY_SEC: number;
}

/**
 * Update instant high temperature alert state
 * @param airTemp - Current air temperature (smoothed)
 * @param now - Current timestamp
 * @param alertState - Current alert state
 * @param config - Configuration object
 * @returns Updated alert state with fired flag
 */
export function updateInstantAlert(
  airTemp: TemperatureReading,
  now: number,
  alertState: AlertState,
  config: AlertConfig
): AlertState {
  const newState = Object.assign({}, alertState);

  if (airTemp === null) {
    newState.instantStart = 0;
    newState.instantFired = false;
    return newState;
  }

  if (airTemp >= config.HIGH_TEMP_INSTANT_THRESHOLD_C) {
    if (newState.instantStart === 0) {
      newState.instantStart = now;
    } else if (!newState.instantFired &&
               (now - newState.instantStart) >= config.HIGH_TEMP_INSTANT_DELAY_SEC) {
      newState.instantFired = true;
      newState.justFired = true; // Signal that alert just fired
    }
  } else {
    newState.instantStart = 0;
    newState.instantFired = false;
  }

  return newState;
}

/**
 * Update sustained high temperature alert state
 * @param airTemp - Current air temperature (smoothed)
 * @param now - Current timestamp
 * @param alertState - Current alert state
 * @param config - Configuration object
 * @returns Updated alert state with fired flag
 */
export function updateSustainedAlert(
  airTemp: TemperatureReading,
  now: number,
  alertState: AlertState,
  config: AlertConfig
): AlertState {
  const newState = Object.assign({}, alertState);

  if (airTemp === null) {
    newState.sustainedStart = 0;
    newState.sustainedFired = false;
    return newState;
  }

  if (airTemp >= config.HIGH_TEMP_SUSTAINED_THRESHOLD_C) {
    if (newState.sustainedStart === 0) {
      newState.sustainedStart = now;
    } else if (!newState.sustainedFired &&
               (now - newState.sustainedStart) >= config.HIGH_TEMP_SUSTAINED_DELAY_SEC) {
      newState.sustainedFired = true;
      newState.justFired = true; // Signal that alert just fired
    }
  } else {
    newState.sustainedStart = 0;
    newState.sustainedFired = false;
  }

  return newState;
}

/**
 * Update all high temperature alerts
 * @param airTemp - Current air temperature (smoothed)
 * @param now - Current timestamp
 * @param alertState - Current alert state
 * @param config - Configuration object
 * @returns Updated alert state
 */
export function updateHighTempAlerts(
  airTemp: TemperatureReading,
  now: number,
  alertState: AlertState,
  config: AlertConfig
): AlertState {
  let newState: AlertState = Object.assign({ justFired: false }, alertState);

  newState = updateInstantAlert(airTemp, now, newState, config);
  const instantJustFired = newState.justFired || false;

  newState = updateSustainedAlert(airTemp, now, newState, config);
  const sustainedJustFired = newState.justFired || false;

  newState.justFired = instantJustFired || sustainedJustFired;

  return newState;
}
