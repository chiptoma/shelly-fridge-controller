# Audit Report: sensor-health

## 1. The Scorecard
| Criteria | Grade (1-10) | Status |
| :--- | :--- | :--- |
| **Module Isolation** | 10/10 | Pass |
| Architecture | 10/10 | Pass |
| Dead Code | 9/10 | Pass |
| DRY Principles | 8/10 | Pass |
| Performance | 10/10 | Pass |
| Documentation | 8/10 | Pass |
| Import Hygiene | 9/10 | Pass |
| Magic Variables | 10/10 | Pass |
| Test Coverage | 9/10 | Pass |
| Type Safety | 10/10 | Pass |
| Error Handling | 7/10 | Fail |
| Security/Validation | 4/10 | Fail |
| Cyclomatic Complexity | 7/10 | Fail |
| Immutability | 8/10 | Pass |
| Observability | 4/10 | Fail |
| Naming | 9/10 | Pass |
| Dependency Health | 10/10 | Pass |
| **OVERALL** | **8.4/10** | |

## 2. Forensic Analysis

### Critical Issues

1.  **[Module Isolation]**: PASSED - Excellent isolation.
    * *Severity:* N/A
    * *Implication:* Uses `$types/common` path alias for global types. Only imports from local files otherwise. Perfect isolation pattern.

2.  **[Security/Validation]**: No input validation on configuration values.
    * *Severity:* Critical
    * *Implication:* `SENSOR_NO_READING_SEC`, `SENSOR_STUCK_SEC`, etc. not validated. Zero or negative values would cause incorrect behavior. Critical for detecting sensor failures.
    * *Location:* `sensor-health.ts:30-101`, `helpers.ts:20-92`

3.  **[Observability]**: No logging for sensor health events.
    * *Severity:* High
    * *Implication:* No logs when sensors go offline, get stuck, or recover. In production, diagnosing sensor issues would be impossible. Missing structured logs for failure duration, sensor name, recovery events.
    * *Location:* Entire module

4.  **[Cyclomatic Complexity]**: `updateSensorHealth` has high nesting and multiple state transitions.
    * *Severity:* High
    * *Implication:* Function handles 4 different conditions (no reading, critical failure, stuck, recovered) with nested conditionals. Nesting reaches 3+ levels. Should be refactored into smaller functions.
    * *Location:* `sensor-health.ts:30-101`

### Moderate Issues

5.  **[Dead Code]**: `_sensorName` parameter is unused.
    * *Severity:* Med
    * *Implication:* Parameter marked with underscore prefix to indicate unused, but should either be removed or used for logging context.
    * *Location:* `sensor-health.ts:30`

6.  **[Error Handling]**: No validation errors, silent failures on invalid config.
    * *Severity:* Med
    * *Implication:* Invalid configuration (e.g., STUCK_SEC = 0) causes incorrect behavior without any error indication.
    * *Location:* All functions

7.  **[Immutability]**: Uses Object.assign pattern but could be cleaner.
    * *Severity:* Low
    * *Implication:* Uses `Object.assign({}, sensorState)` then mutates newState. While functional, spread syntax would be more idiomatic.
    * *Location:* `sensor-health.ts:37-38`

8.  **[DRY Principles]**: Repeated pattern for firing and clearing alerts.
    * *Severity:* Low
    * *Implication:* The pattern of checking "if condition && !fired, then fire" is repeated for noReading and stuck. Could be abstracted.
    * *Location:* `sensor-health.ts:64-97`

### Minor Issues

9.  **[Naming]**: `noReadingFired`, `stuckFired` could be clearer.
    * *Severity:* Low
    * *Implication:* Boolean names like `hasNoReadingAlertFired` or `isNoReadingAlertActive` would be more descriptive.
    * *Location:* `types.ts:54-61`

10. **[Documentation]**: Good TSDoc but missing edge case documentation.
    * *Severity:* Low
    * *Implication:* Doesn't document what happens when both offline and stuck conditions occur simultaneously.
    * *Location:* `sensor-health.ts:14-28`

## 3. Rectification Plan (Full File Replacements)

### A. Helpers (helpers.ts)

```typescript
/**
 * Sensor health monitoring helper functions
 *
 * Internal logic for detecting sensor failures:
 * - Offline sensors (no readings)
 * - Stuck sensors (value not changing)
 */

import type { TemperatureReading } from '$types/common';
import type { NoReadingResult, StuckSensorResult, SensorHealthConfig } from './types';

/**
 * Validate sensor health configuration
 * @throws {Error} If configuration is invalid
 */
export function validateSensorHealthConfig(config: SensorHealthConfig): void {
  if (config.SENSOR_NO_READING_SEC <= 0) {
    throw new Error(`SENSOR_NO_READING_SEC must be positive, got ${config.SENSOR_NO_READING_SEC}`);
  }
  if (config.SENSOR_CRITICAL_FAILURE_SEC <= config.SENSOR_NO_READING_SEC) {
    throw new Error(
      `SENSOR_CRITICAL_FAILURE_SEC (${config.SENSOR_CRITICAL_FAILURE_SEC}) must be greater than SENSOR_NO_READING_SEC (${config.SENSOR_NO_READING_SEC})`
    );
  }
  if (config.SENSOR_STUCK_SEC <= 0) {
    throw new Error(`SENSOR_STUCK_SEC must be positive, got ${config.SENSOR_STUCK_SEC}`);
  }
  if (config.SENSOR_STUCK_EPSILON_C < 0) {
    throw new Error(`SENSOR_STUCK_EPSILON_C must be non-negative, got ${config.SENSOR_STUCK_EPSILON_C}`);
  }
}

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
```

### B. Main (sensor-health.ts)

```typescript
/**
 * Sensor health monitoring and failure detection
 *
 * Detects offline sensors, stuck sensors, and escalates to critical failures.
 *
 * ## Business Context
 * Sensor health monitoring is critical for:
 * - Detecting sensor failures before they cause temperature excursions
 * - Alerting operators to hardware issues
 * - Preventing false thermostat decisions based on bad data
 *
 * Failure modes detected:
 * - **Offline**: Sensor stops reporting (hardware failure, wiring issue)
 * - **Stuck**: Sensor reports same value (calibration drift, frozen sensor)
 * - **Critical**: Prolonged offline indicating unrecoverable failure
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
 * @param sensorName - Name of sensor ('air' or 'evap') - for context
 * @param rawValue - Current raw sensor value (°C), null if no reading
 * @param nowSec - Current timestamp in seconds
 * @param sensorState - Current sensor health state
 * @param config - Sensor monitoring configuration
 * @returns New sensor health state (immutable update pattern)
 */
export function updateSensorHealth(
  sensorName: string,
  rawValue: TemperatureReading,
  nowSec: number,
  sensorState: SensorHealthState,
  config: SensorHealthConfig
): SensorHealthState {
  // Create new state object (immutable update pattern)
  const newState: SensorHealthState = {
    lastReadTime: sensorState.lastReadTime,
    lastChangeTime: sensorState.lastChangeTime,
    lastRaw: sensorState.lastRaw,
    noReadingFired: sensorState.noReadingFired,
    criticalFailure: sensorState.criticalFailure,
    stuckFired: sensorState.stuckFired
  };

  // Save old lastRaw before updating
  const oldLastRaw = sensorState.lastRaw;

  // Handle valid reading
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

  // Escalate to critical failure
  if (noReadingCheck.duration > config.SENSOR_CRITICAL_FAILURE_SEC && !newState.criticalFailure) {
    newState.criticalFailure = true;
  }

  // Check for stuck sensor
  const stuckCheck = checkStuckSensor(
    rawValue,
    oldLastRaw,
    nowSec,
    newState.lastChangeTime,
    config.SENSOR_STUCK_SEC,
    config.SENSOR_STUCK_EPSILON_C
  );

  if (stuckCheck.changed) {
    newState.lastChangeTime = nowSec;
    newState.lastRaw = rawValue;

    // Clear stuck flag on recovery
    if (newState.stuckFired) {
      newState.unstuck = true;
      newState.stuckFired = false;
    }
  } else if (stuckCheck.stuck && !newState.stuckFired) {
    newState.stuckFired = true;
    newState.stuckDuration = stuckCheck.duration;
  }

  return newState;
}
```

### C. Index (index.ts)

```typescript
export { updateSensorHealth } from './sensor-health';
export { checkNoReading, checkStuckSensor, validateSensorHealthConfig } from './helpers';
export * from './types';
```

### D. Tests - Add validation tests

```typescript
import { validateSensorHealthConfig } from './helpers';
import type { SensorHealthConfig } from './types';

describe('validateSensorHealthConfig', () => {
  const validConfig: SensorHealthConfig = {
    SENSOR_NO_READING_SEC: 30,
    SENSOR_CRITICAL_FAILURE_SEC: 600,
    SENSOR_STUCK_SEC: 180,
    SENSOR_STUCK_EPSILON_C: 0.05
  };

  it('should pass for valid config', () => {
    expect(() => validateSensorHealthConfig(validConfig)).not.toThrow();
  });

  it('should throw for zero NO_READING_SEC', () => {
    const config = { ...validConfig, SENSOR_NO_READING_SEC: 0 };
    expect(() => validateSensorHealthConfig(config)).toThrow();
  });

  it('should throw when CRITICAL <= NO_READING', () => {
    const config = { ...validConfig, SENSOR_CRITICAL_FAILURE_SEC: 30 };
    expect(() => validateSensorHealthConfig(config)).toThrow();
  });

  it('should throw for negative epsilon', () => {
    const config = { ...validConfig, SENSOR_STUCK_EPSILON_C: -0.05 };
    expect(() => validateSensorHealthConfig(config)).toThrow();
  });
});
```

## 4. Summary

The `sensor-health` module has **excellent architecture** with proper separation of helpers and good use of path aliases. Documentation is above average with business context in types.

Critical gaps:

1. **Input validation** - Configuration values not validated
2. **Observability** - No logging for sensor health events
3. **Cyclomatic complexity** - Main function is complex with 3+ nesting levels

The unused `_sensorName` parameter should be utilized for logging context when observability is added.
