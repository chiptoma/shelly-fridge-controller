/**
 * Thermostat helper functions
 */

import type { ThermostatConfig, ThermostatState } from './types';

/**
 * Validate thermostat configuration
 * @throws {Error} If configuration is invalid
 */
export function validateThermostatConfig(config: ThermostatConfig): void {
  if (!Number.isFinite(config.SETPOINT_C)) {
    throw new Error(`SETPOINT_C must be a finite number, got ${config.SETPOINT_C}`);
  }
  if (!Number.isFinite(config.HYSTERESIS_C) || config.HYSTERESIS_C < 0) {
    throw new Error(`HYSTERESIS_C must be a non-negative finite number, got ${config.HYSTERESIS_C}`);
  }
}

/**
 * Validate thermostat state thresholds
 * @throws {Error} If thresholds are invalid
 */
export function validateThermostatState(state: ThermostatState): void {
  if (state.dynOnAbove <= state.dynOffBelow) {
    throw new Error(
      `Invalid thresholds: dynOnAbove (${state.dynOnAbove}) must be greater than dynOffBelow (${state.dynOffBelow})`
    );
  }
}

/**
 * Validate temperature value
 */
export function validateTemperature(temp: number | null, context: string): void {
  if (temp !== null && !Number.isFinite(temp)) {
    throw new Error(`${context}: temperature must be finite or null, got ${temp}`);
  }
}
