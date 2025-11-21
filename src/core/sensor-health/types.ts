/**
 * Sensor health monitoring type definitions
 */

import type { TemperatureReading } from '$types/common';

/**
 * Result of no-reading detection check
 *
 * Indicates whether a sensor has stopped providing readings beyond the
 * configured timeout threshold.
 */
export interface NoReadingResult {
  /** Whether sensor is offline (no reading beyond threshold) */
  offline: boolean;

  /** Duration in seconds since last successful reading */
  duration: number;
}

/**
 * Result of stuck sensor detection check
 *
 * Indicates whether a sensor value has remained constant (within epsilon)
 * beyond the configured stuck threshold.
 */
export interface StuckSensorResult {
  /** Whether sensor is stuck (value unchanged beyond threshold) */
  stuck: boolean;

  /** Duration in seconds since value last changed */
  duration: number;

  /** Whether the value changed on this check (beyond epsilon) */
  changed: boolean;
}

/**
 * Sensor health state for a single sensor
 *
 * Tracks health monitoring state for air or evap temperature sensor including
 * offline detection, stuck sensor detection, and critical failure escalation.
 */
export interface SensorHealthState {
  /** Timestamp (seconds) of last successful sensor reading */
  lastReadTime: number;

  /** Timestamp (seconds) when sensor value last changed (beyond epsilon) */
  lastChangeTime: number;

  /** Last raw temperature reading (°C), null if no reading */
  lastRaw: TemperatureReading;

  /** Whether "no reading" alert has fired */
  noReadingFired: boolean;

  /** Whether sensor has escalated to critical failure state */
  criticalFailure: boolean;

  /** Whether "stuck sensor" alert has fired */
  stuckFired: boolean;

  /** Set to true when sensor recovers from offline state (cleared after alerting) */
  recovered?: boolean;

  /** Duration (seconds) sensor was offline when alert fired */
  offlineDuration?: number;

  /** Set to true when sensor unsticks (value changes after stuck) */
  unstuck?: boolean;

  /** Duration (seconds) sensor was stuck when alert fired */
  stuckDuration?: number;
}

/**
 * Configuration for sensor health monitoring
 *
 * Contains only the configuration fields needed by sensor monitoring functions.
 */
export interface SensorHealthConfig {
  /** Seconds without reading before firing "no reading" alert */
  SENSOR_NO_READING_SEC: number;

  /** Seconds without reading before escalating to critical failure */
  SENSOR_CRITICAL_FAILURE_SEC: number;

  /** Seconds with unchanged value before firing "stuck sensor" alert */
  SENSOR_STUCK_SEC: number;

  /** Minimum temperature change (°C) to consider sensor "not stuck" */
  SENSOR_STUCK_EPSILON_C: number;
}
