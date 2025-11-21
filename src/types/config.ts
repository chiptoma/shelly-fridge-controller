/**
 * Type definition for Fridge Controller configuration
 */

import type { LogLevels } from '@logging';

/**
 * User-configurable settings
 * Everything a user might reasonably tune for behavior, safety, alerts, and observability
 */
export interface FridgeUserConfig {
  // ───────── THERMOSTAT & SENSORS ─────────
  readonly AIR_SENSOR_ID: number;
  readonly EVAP_SENSOR_ID: number;
  readonly SETPOINT_C: number;
  readonly HYSTERESIS_C: number;
  readonly AIR_SENSOR_SMOOTHING_SEC: number;
  readonly EVAP_SENSOR_SMOOTHING_SEC: number;
  readonly LOOP_PERIOD_MS: number;

  // ───────── SAFETY (COMPRESSOR & FREEZE) ─────────
  readonly MIN_ON_SEC: number;
  readonly MIN_OFF_SEC: number;
  readonly FREEZE_PROTECTION_START_C: number;
  readonly FREEZE_PROTECTION_STOP_C: number;
  readonly FREEZE_RECOVERY_DELAY_SEC: number;
  readonly FREEZE_RECOVERY_HYSTERESIS_C: number;
  readonly FREEZE_LOCK_HYSTERESIS_C: number;

  // ───────── FEATURE FLAGS ─────────
  readonly FEATURE_DUTY_CYCLE: boolean;
  readonly FEATURE_DAILY_SUMMARY: boolean;
  readonly FEATURE_SENSOR_FAILURE: boolean;
  readonly FEATURE_HIGH_TEMP_ALERTS: boolean;
  readonly FEATURE_ADAPTIVE_HYSTERESIS: boolean;
  readonly FEATURE_WATCHDOG: boolean;
  readonly FEATURE_PERFORMANCE_METRICS: boolean;

  // ───────── DUTY-CYCLE REPORTING ─────────
  readonly DUTY_INTERVAL_SEC: number;
  readonly DUTY_LOG_EVERY_INTERVAL: boolean;

  // ───────── DAILY SUMMARY ─────────
  readonly DAILY_SUMMARY_HOUR: number;
  readonly DAILY_SUMMARY_ENABLED: boolean;

  // ───────── SENSOR FAILURE DETECTION ─────────
  readonly SENSOR_NO_READING_SEC: number;
  readonly SENSOR_STUCK_SEC: number;
  readonly SENSOR_STUCK_EPSILON_C: number;
  readonly SENSOR_CRITICAL_FAILURE_SEC: number;

  // ───────── HIGH TEMP ALERTS ─────────
  readonly HIGH_TEMP_INSTANT_THRESHOLD_C: number;
  readonly HIGH_TEMP_INSTANT_DELAY_SEC: number;
  readonly HIGH_TEMP_SUSTAINED_THRESHOLD_C: number;
  readonly HIGH_TEMP_SUSTAINED_DELAY_SEC: number;

  // ───────── ADAPTIVE HYSTERESIS ─────────
  readonly ADAPTIVE_HIGH_DUTY_PCT: number;
  readonly ADAPTIVE_LOW_DUTY_PCT: number;
  readonly ADAPTIVE_MAX_SHIFT_C: number;
  readonly ADAPTIVE_MIN_SHIFT_C: number;
  readonly ADAPTIVE_SHIFT_STEP_C: number;
  readonly ADAPTIVE_STABILIZE_SEC: number;
  readonly ADAPTIVE_MIN_LOOPS: number;

  // ───────── WATCHDOG ─────────
  readonly WATCHDOG_TIMEOUT_SEC: number;

  // ───────── PERFORMANCE ─────────
  readonly PERF_LOG_INTERVAL_SEC: number;
  readonly PERF_SLOW_LOOP_THRESHOLD_MS: number;
  readonly PERF_WARN_SLOW_LOOPS: boolean;

  // ───────── SLACK SETTINGS ─────────
  readonly SLACK_ENABLED: boolean;
  readonly SLACK_LOG_LEVEL: number;
  readonly SLACK_WEBHOOK_KEY: string;
  readonly SLACK_INTERVAL_SEC: number;
  readonly SLACK_BUFFER_SIZE: number;
  readonly SLACK_RETRY_DELAY_SEC: number;

  // ───────── CONSOLE SETTINGS ─────────
  readonly CONSOLE_ENABLED: boolean;
  readonly CONSOLE_LOG_LEVEL: number;
  readonly CONSOLE_BUFFER_SIZE: number;
  readonly CONSOLE_INTERVAL_MS: number;

  // ───────── GLOBAL LOGGING SETTINGS ─────────
  readonly GLOBAL_LOG_LEVEL: number;
  readonly GLOBAL_LOG_AUTO_DEMOTE_HOURS: number;
}

/**
 * Application constants
 * Internal engine constants that should rarely change
 */
export interface FridgeAppConstants {
  // ───────── LOGGING CONSTANTS ─────────
  readonly LOG_LEVELS: LogLevels;

  // ───────── APPLICATION CONSTANTS ─────────
  readonly RELAY_RESPONSE_TIMEOUT_SEC: number;
  readonly MAX_CONSECUTIVE_ERRORS: number;

  // ───────── VALIDATION CONSTANTS ─────────
  readonly MIN_TOTAL_CYCLE_TIME_SEC: number;
  readonly MIN_FREEZE_GAP_WARNING_C: number;
  readonly MIN_CONTROL_LOOPS_PER_OFF: number;
  readonly MIN_SENSOR_EPSILON_C: number;

  // ───────── HARDWARE CONSTANTS ─────────
  readonly RELAY_ID: number;
  readonly COMPONENT_SWITCH: string;
  readonly METHOD_SWITCH_SET: string;

  // ───────── PERFORMANCE CONSTANTS ─────────
  readonly INITIAL_LOOP_TIME_MIN: number;
}

/**
 * Complete Fridge Controller configuration
 * Combines user config and app constants
 */
export type FridgeConfig = FridgeUserConfig & FridgeAppConstants;
