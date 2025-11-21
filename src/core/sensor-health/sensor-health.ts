/**
 * Sensor health monitoring and failure detection
 * Detects offline sensors, stuck sensors, and escalates to critical failures
 */

import type { TemperatureReading } from '$types/common';
import type { SensorHealthState, SensorHealthConfig } from './types';
import { checkNoReading, checkStuckSensor } from './helpers';

/**
 * Update sensor health state (mutates state in place)
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
 * @param sensorState - Sensor health state to mutate
 * @param config - Sensor monitoring configuration
 * @returns The same state object (for convenience)
 */
export function updateSensorHealth(
  _sensorName: string,
  rawValue: TemperatureReading,
  nowSec: number,
  sensorState: SensorHealthState,
  config: SensorHealthConfig
): SensorHealthState {
  // Save old lastRaw before updating (needed for stuck sensor check)
  const oldLastRaw = sensorState.lastRaw;

  // Clear transient flags from previous call
  sensorState.recovered = undefined;
  sensorState.unstuck = undefined;
  sensorState.offlineDuration = undefined;
  sensorState.stuckDuration = undefined;

  // Update reading time if we have valid reading
  if (rawValue !== null) {
    sensorState.lastReadTime = nowSec;

    // Clear offline flags on recovery
    if (sensorState.noReadingFired || sensorState.criticalFailure) {
      sensorState.recovered = true;
      sensorState.noReadingFired = false;
      sensorState.criticalFailure = false;
    }
  }

  // Check for no reading condition
  const noReadingCheck = checkNoReading(
    rawValue,
    nowSec,
    sensorState.lastReadTime,
    config.SENSOR_NO_READING_SEC
  );

  // Fire alert on first detection
  if (noReadingCheck.offline && !sensorState.noReadingFired) {
    sensorState.noReadingFired = true;
    sensorState.offlineDuration = noReadingCheck.duration;
  }

  // Escalate to critical failure if offline too long
  if (noReadingCheck.duration > config.SENSOR_CRITICAL_FAILURE_SEC && !sensorState.criticalFailure) {
    sensorState.criticalFailure = true;
  }

  // Check for stuck sensor (use old lastRaw for comparison)
  const stuckCheck = checkStuckSensor(
    rawValue,
    oldLastRaw,
    nowSec,
    sensorState.lastChangeTime,
    config.SENSOR_STUCK_SEC,
    config.SENSOR_STUCK_EPSILON_C
  );

  if (stuckCheck.changed) {
    // Value changed - update lastChangeTime and lastRaw
    sensorState.lastChangeTime = nowSec;
    sensorState.lastRaw = rawValue;

    // Clear stuck flag on recovery
    if (sensorState.stuckFired) {
      sensorState.unstuck = true;
      sensorState.stuckFired = false;
    }
  } else if (stuckCheck.stuck && !sensorState.stuckFired) {
    // Fire stuck alert on first detection
    sensorState.stuckFired = true;
    sensorState.stuckDuration = stuckCheck.duration;
  }

  return sensorState;
}
