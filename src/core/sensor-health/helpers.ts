/**
 * Sensor health monitoring helper functions
 */

import type { TemperatureReading } from '$types/common';
import type { NoReadingResult, StuckSensorResult } from './types';

/**
 * Check for sensor no-reading condition
 *
 * Detects when a sensor has stopped providing readings. A sensor is considered
 * offline if it returns null for longer than the configured threshold.
 *
 * @param sensorValue - Current sensor reading (°C), null if no reading
 * @param nowSec - Current timestamp in seconds
 * @param lastReadTimeSec - Timestamp (seconds) of last successful reading
 * @param noReadingSec - Timeout threshold in seconds
 * @returns Detection result with offline status and duration
 */
export function checkNoReading(
  sensorValue: TemperatureReading,
  nowSec: number,
  lastReadTimeSec: number,
  noReadingSec: number
): NoReadingResult {
  // Sensor is providing readings - not offline
  if (sensorValue !== null) {
    return { offline: false, duration: 0 };
  }

  // First reading - grace period before monitoring starts
  if (lastReadTimeSec === 0) {
    return { offline: false, duration: 0 };
  }

  // Calculate how long sensor has been offline
  const duration = nowSec - lastReadTimeSec;
  return {
    offline: duration > noReadingSec,
    duration
  };
}

/**
 * Check for stuck sensor condition
 *
 * Detects when a sensor value remains constant beyond the configured threshold.
 * A sensor is "stuck" if the value doesn't change by more than epsilon for longer
 * than the stuck threshold.
 *
 * @param currentValue - Current raw sensor value (°C), null if no reading
 * @param lastValue - Previous raw sensor value (°C), null if first reading
 * @param nowSec - Current timestamp in seconds
 * @param lastChangeTimeSec - Timestamp (seconds) when value last changed
 * @param stuckSec - Stuck threshold in seconds
 * @param epsilon - Minimum change (°C) to consider "not stuck"
 * @returns Detection result with stuck status, duration, and changed flag
 */
export function checkStuckSensor(
  currentValue: TemperatureReading,
  lastValue: TemperatureReading,
  nowSec: number,
  lastChangeTimeSec: number,
  stuckSec: number,
  epsilon: number
): StuckSensorResult {
  // No reading - not stuck (offline condition handled separately)
  if (currentValue === null) {
    return { stuck: false, duration: 0, changed: false };
  }

  // First reading - initialize tracking
  if (lastValue === null) {
    return { stuck: false, duration: 0, changed: true };
  }

  // Check if value changed beyond epsilon threshold
  const changed = Math.abs(currentValue - lastValue) > epsilon;

  if (changed) {
    // Value changed - not stuck
    return { stuck: false, duration: 0, changed: true };
  }

  // Value hasn't changed - check if stuck threshold exceeded
  const duration = nowSec - lastChangeTimeSec;
  return {
    stuck: duration > stuckSec,
    duration,
    changed: false
  };
}
