/**
 * Sensor health monitoring and failure detection
 * Detects offline sensors, stuck sensors, and escalates to critical failures
 */

import type { TemperatureReading } from '$types/common';
import type { SensorHealthState, SensorHealthConfig } from './types';
import { checkNoReading, checkStuckSensor } from './helpers';

/**
 * Update sensor health state
 *
 * Main sensor health monitoring function. Updates sensor state based on current
 * reading and detects offline, stuck, and critical failure conditions.
 *
 * This function:
 * 1. Updates lastReadTime if sensor provides valid reading
 * 2. Checks for no-reading condition and fires alert on first detection
 * 3. Escalates to critical failure after SENSOR_CRITICAL_FAILURE_SEC
 * 4. Checks for stuck sensor and fires alert on first detection
 * 5. Clears alerts when sensor recovers
 *
 * @param _sensorName - Name of sensor ('air' or 'evap') - for logging
 * @param rawValue - Current raw sensor value (°C), null if no reading
 * @param nowSec - Current timestamp in seconds
 * @param sensorState - Current sensor health state
 * @param config - Sensor monitoring configuration
 * @returns New sensor health state (immutable update pattern)
 */
export function updateSensorHealth(
  _sensorName: string,
  rawValue: TemperatureReading,
  nowSec: number,
  sensorState: SensorHealthState,
  config: SensorHealthConfig
): SensorHealthState {
  // Create new state object (immutable update pattern)
  const newState = Object.assign({}, sensorState);

  // Save old lastRaw before updating (needed for stuck sensor check)
  const oldLastRaw = sensorState.lastRaw;

  // Update reading time if we have valid reading
  if (rawValue !== null) {
    newState.lastReadTime = nowSec;

    // Clear offline flags on recovery
    if (newState.noReadingFired || newState.criticalFailure) {
      newState.recovered = true;
      newState.noReadingFired = false;
      newState.criticalFailure = false;
    }
  }

  // Check for no reading condition
  const noReadingCheck = checkNoReading(
    rawValue,
    nowSec,
    newState.lastReadTime,
    config.SENSOR_NO_READING_SEC
  );

  // Fire alert on first detection
  if (noReadingCheck.offline && !newState.noReadingFired) {
    newState.noReadingFired = true;
    newState.offlineDuration = noReadingCheck.duration;
  }

  // Escalate to critical failure if offline too long
  if (noReadingCheck.duration > config.SENSOR_CRITICAL_FAILURE_SEC && !newState.criticalFailure) {
    newState.criticalFailure = true;
  }

  // Check for stuck sensor (use old lastRaw for comparison)
  const stuckCheck = checkStuckSensor(
    rawValue,
    oldLastRaw,
    nowSec,
    newState.lastChangeTime,
    config.SENSOR_STUCK_SEC,
    config.SENSOR_STUCK_EPSILON_C
  );

  if (stuckCheck.changed) {
    // Value changed - update lastChangeTime and lastRaw
    newState.lastChangeTime = nowSec;
    newState.lastRaw = rawValue;

    // Clear stuck flag on recovery
    if (newState.stuckFired) {
      newState.unstuck = true;
      newState.stuckFired = false;
    }
  } else if (stuckCheck.stuck && !newState.stuckFired) {
    // Fire stuck alert on first detection
    newState.stuckFired = true;
    newState.stuckDuration = stuckCheck.duration;
  }

  return newState;
}
