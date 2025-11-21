/**
 * Thermostat type definitions
 */

/**
 * Thermostat state
 */
export interface ThermostatState {
  /** Whether freeze protection is currently locking compressor off */
  freezeLocked: boolean;

  /** Dynamic upper threshold - turn ON when temp rises to or above this */
  dynOnAbove: number;

  /** Dynamic lower threshold - turn OFF when temp drops to or below this */
  dynOffBelow: number;
}

/**
 * Thermostat configuration
 */
export interface ThermostatConfig {
  /** Target temperature setpoint in °C */
  SETPOINT_C: number;

  /** Hysteresis around setpoint in °C */
  HYSTERESIS_C: number;
}
