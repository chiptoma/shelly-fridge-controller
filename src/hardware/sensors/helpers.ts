/**
 * Sensor helper functions
 */

import type { TemperatureReading } from '$types/common';

/**
 * Validate sensor reading
 * @param value - Sensor value to validate
 * @returns True if value is valid
 */
export function isValidReading(value: TemperatureReading): value is number {
  if (value === null || value === undefined) {
    return false;
  }

  // Check for NaN and Infinity
  if (isNaN(value) || !isFinite(value)) {
    return false;
  }

  // DS18B20 sensor range check (-55C to 125C)
  if (value < -55 || value > 125) {
    return false;
  }

  return true;
}
