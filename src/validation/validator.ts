import type { FridgeUserConfig } from '$types';
import type { ValidationResult } from './types';

export function validateConfig(config: FridgeUserConfig): ValidationResult {
  const errors: { field: string; message: string }[] = [];
  const warnings: { field: string; message: string }[] = [];

  // Sensor IDs
  if (config.AIR_SENSOR_ID < 0 || config.AIR_SENSOR_ID > 255) {
    errors.push({ field: 'AIR_SENSOR_ID', message: 'Must be between 0 and 255' });
  }
  if (config.EVAP_SENSOR_ID < 0 || config.EVAP_SENSOR_ID > 255) {
    errors.push({ field: 'EVAP_SENSOR_ID', message: 'Must be between 0 and 255' });
  }
  if (config.AIR_SENSOR_ID === config.EVAP_SENSOR_ID) {
    errors.push({ field: 'AIR_SENSOR_ID', message: 'Must be different from EVAP_SENSOR_ID' });
  }

  // Temperature Settings
  if (config.SETPOINT_C < 1 || config.SETPOINT_C > 10) {
    errors.push({ field: 'SETPOINT_C', message: 'Must be between 1 and 10 C' });
  }
  if (config.HYSTERESIS_C <= 0.3 || config.HYSTERESIS_C > 5) {
    errors.push({ field: 'HYSTERESIS_C', message: 'Must be between 0.3 and 5.0 C' });
  }

  // Timing
  if (config.MIN_ON_SEC < 120) {
    errors.push({ field: 'MIN_ON_SEC', message: 'Must be at least 120 seconds' });
  }
  if (config.MIN_OFF_SEC < 180) {
    errors.push({ field: 'MIN_OFF_SEC', message: 'Must be at least 180 seconds' });
  }
  if (config.MIN_ON_SEC + config.MIN_OFF_SEC < 240) {
    errors.push({ field: 'MIN_ON_SEC+MIN_OFF_SEC', message: 'Total cycle time must be at least 240 seconds' });
  }

  // Freeze Protection
  if (config.FREEZE_PROTECTION_START_C < -30 || config.FREEZE_PROTECTION_START_C > -5) {
    errors.push({ field: 'FREEZE_PROTECTION_START_C', message: 'Must be between -30 and -5 C' });
  }
  if (config.FREEZE_PROTECTION_STOP_C < -8 || config.FREEZE_PROTECTION_STOP_C > 5) {
    errors.push({ field: 'FREEZE_PROTECTION_STOP_C', message: 'Must be between -8 and 5 C' });
  }
  if (config.FREEZE_PROTECTION_STOP_C <= config.FREEZE_PROTECTION_START_C) {
    errors.push({ field: 'FREEZE_PROTECTION_STOP_C', message: 'Must be greater than FREEZE_PROTECTION_START_C' });
  }

  // Alerts
  if (config.HIGH_TEMP_INSTANT_THRESHOLD_C < 5 || config.HIGH_TEMP_INSTANT_THRESHOLD_C > 20) {
    errors.push({ field: 'HIGH_TEMP_INSTANT_THRESHOLD_C', message: 'Must be between 5 and 20 C' });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
