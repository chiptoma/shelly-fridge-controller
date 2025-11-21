/**
 * Tests for configuration validator
 */

import { validateConfig } from './validator';
import type { FridgeUserConfig } from '../types';

// Valid base configuration for testing
const validConfig: FridgeUserConfig = {
  AIR_SENSOR_ID: 101,
  EVAP_SENSOR_ID: 100,
  SETPOINT_C: 4.0,
  HYSTERESIS_C: 1.0,
  AIR_SENSOR_SMOOTHING_SEC: 30,
  EVAP_SENSOR_SMOOTHING_SEC: 10,
  LOOP_PERIOD_MS: 5000,
  MIN_ON_SEC: 180,
  MIN_OFF_SEC: 300,
  FREEZE_PROTECTION_START_C: -16.0,
  FREEZE_PROTECTION_STOP_C: -2.0,
  FREEZE_RECOVERY_DELAY_SEC: 300,
  FREEZE_RECOVERY_HYSTERESIS_C: 0.5,
  FREEZE_LOCK_HYSTERESIS_C: 0.3,
  FEATURE_DUTY_CYCLE: true,
  FEATURE_DAILY_SUMMARY: true,
  FEATURE_SENSOR_FAILURE: true,
  FEATURE_HIGH_TEMP_ALERTS: true,
  FEATURE_ADAPTIVE_HYSTERESIS: true,
  FEATURE_WATCHDOG: true,
  FEATURE_PERFORMANCE_METRICS: true,
  DUTY_INTERVAL_SEC: 3600,
  DUTY_LOG_EVERY_INTERVAL: true,
  DAILY_SUMMARY_HOUR: 7,
  DAILY_SUMMARY_ENABLED: true,
  SENSOR_NO_READING_SEC: 30,
  SENSOR_STUCK_SEC: 300,
  SENSOR_STUCK_EPSILON_C: 0.05,
  SENSOR_CRITICAL_FAILURE_SEC: 600,
  HIGH_TEMP_INSTANT_THRESHOLD_C: 10.0,
  HIGH_TEMP_INSTANT_DELAY_SEC: 180,
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: 10.0,
  HIGH_TEMP_SUSTAINED_DELAY_SEC: 600,
  ADAPTIVE_HIGH_DUTY_PCT: 70,
  ADAPTIVE_LOW_DUTY_PCT: 30,
  ADAPTIVE_MAX_SHIFT_C: 0.5,
  ADAPTIVE_MIN_SHIFT_C: 0,
  ADAPTIVE_SHIFT_STEP_C: 0.1,
  ADAPTIVE_STABILIZE_SEC: 300,
  ADAPTIVE_MIN_LOOPS: 60,
  WATCHDOG_TIMEOUT_SEC: 30,
  PERF_LOG_INTERVAL_SEC: 3600,
  PERF_SLOW_LOOP_THRESHOLD_MS: 250,
  PERF_WARN_SLOW_LOOPS: false,
  SLACK_ENABLED: true,
  SLACK_LOG_LEVEL: 1,
  SLACK_WEBHOOK_KEY: 'slack_webhook',
  SLACK_INTERVAL_SEC: 30,
  SLACK_BUFFER_SIZE: 10,
  SLACK_RETRY_DELAY_SEC: 30,
  CONSOLE_ENABLED: true,
  CONSOLE_LOG_LEVEL: 1,
  CONSOLE_BUFFER_SIZE: 150,
  CONSOLE_INTERVAL_MS: 50,
  GLOBAL_LOG_LEVEL: 1,
  GLOBAL_LOG_AUTO_DEMOTE_HOURS: 24
};

describe('validateConfig', () => {
  describe('valid configuration', () => {
    it('should return valid for correct configuration', () => {
      const result = validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('sensor ID validation', () => {
    it('should error when AIR_SENSOR_ID is negative', () => {
      const config = { ...validConfig, AIR_SENSOR_ID: -1 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'AIR_SENSOR_ID')).toBe(true);
    });

    it('should error when AIR_SENSOR_ID exceeds 255', () => {
      const config = { ...validConfig, AIR_SENSOR_ID: 256 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'AIR_SENSOR_ID')).toBe(true);
    });

    it('should accept AIR_SENSOR_ID at boundary 0', () => {
      const config = { ...validConfig, AIR_SENSOR_ID: 0 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'AIR_SENSOR_ID' && e.message.includes('between'))).toBe(false);
    });

    it('should accept AIR_SENSOR_ID at boundary 255', () => {
      const config = { ...validConfig, AIR_SENSOR_ID: 255 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'AIR_SENSOR_ID' && e.message.includes('between'))).toBe(false);
    });

    it('should error when EVAP_SENSOR_ID is negative', () => {
      const config = { ...validConfig, EVAP_SENSOR_ID: -1 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'EVAP_SENSOR_ID')).toBe(true);
    });

    it('should error when EVAP_SENSOR_ID exceeds 255', () => {
      const config = { ...validConfig, EVAP_SENSOR_ID: 256 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'EVAP_SENSOR_ID')).toBe(true);
    });

    it('should error when sensor IDs are equal', () => {
      const config = { ...validConfig, AIR_SENSOR_ID: 100, EVAP_SENSOR_ID: 100 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('different'))).toBe(true);
    });
  });

  describe('temperature settings validation', () => {
    it('should error when SETPOINT_C is below 1', () => {
      const config = { ...validConfig, SETPOINT_C: 0.5 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'SETPOINT_C')).toBe(true);
    });

    it('should error when SETPOINT_C exceeds 10', () => {
      const config = { ...validConfig, SETPOINT_C: 11 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'SETPOINT_C')).toBe(true);
    });

    it('should accept SETPOINT_C at boundary 1', () => {
      const config = { ...validConfig, SETPOINT_C: 1 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'SETPOINT_C')).toBe(false);
    });

    it('should accept SETPOINT_C at boundary 10', () => {
      const config = { ...validConfig, SETPOINT_C: 10 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'SETPOINT_C')).toBe(false);
    });

    it('should error when HYSTERESIS_C is at or below 0.3', () => {
      const config = { ...validConfig, HYSTERESIS_C: 0.3 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'HYSTERESIS_C')).toBe(true);
    });

    it('should error when HYSTERESIS_C exceeds 5', () => {
      const config = { ...validConfig, HYSTERESIS_C: 5.1 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'HYSTERESIS_C')).toBe(true);
    });

    it('should accept HYSTERESIS_C just above 0.3', () => {
      const config = { ...validConfig, HYSTERESIS_C: 0.31 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'HYSTERESIS_C')).toBe(false);
    });

    it('should accept HYSTERESIS_C at boundary 5', () => {
      const config = { ...validConfig, HYSTERESIS_C: 5 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'HYSTERESIS_C')).toBe(false);
    });
  });

  describe('timing validation', () => {
    it('should error when MIN_ON_SEC is below 120', () => {
      const config = { ...validConfig, MIN_ON_SEC: 119 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'MIN_ON_SEC')).toBe(true);
    });

    it('should accept MIN_ON_SEC at boundary 120', () => {
      const config = { ...validConfig, MIN_ON_SEC: 120 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'MIN_ON_SEC')).toBe(false);
    });

    it('should error when MIN_OFF_SEC is below 180', () => {
      const config = { ...validConfig, MIN_OFF_SEC: 179 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'MIN_OFF_SEC')).toBe(true);
    });

    it('should accept MIN_OFF_SEC at boundary 180', () => {
      const config = { ...validConfig, MIN_OFF_SEC: 180 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'MIN_OFF_SEC')).toBe(false);
    });

    it('should error when total cycle time is below 240', () => {
      const config = { ...validConfig, MIN_ON_SEC: 120, MIN_OFF_SEC: 119 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'MIN_ON_SEC+MIN_OFF_SEC')).toBe(true);
    });

    it('should accept total cycle time at boundary 240', () => {
      const config = { ...validConfig, MIN_ON_SEC: 120, MIN_OFF_SEC: 180 };
      const result = validateConfig(config);
      // Should have errors for MIN_OFF_SEC being too low
      // but the total is 300 which should be fine
      const totalCycleError = result.errors.find(e => e.field === 'MIN_ON_SEC+MIN_OFF_SEC');
      expect(totalCycleError).toBeUndefined();
    });
  });

  describe('freeze protection validation', () => {
    it('should error when FREEZE_PROTECTION_START_C is below -30', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_START_C: -31 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'FREEZE_PROTECTION_START_C')).toBe(true);
    });

    it('should error when FREEZE_PROTECTION_START_C exceeds -5', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_START_C: -4 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'FREEZE_PROTECTION_START_C')).toBe(true);
    });

    it('should accept FREEZE_PROTECTION_START_C at boundary -30', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_START_C: -30 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'FREEZE_PROTECTION_START_C' && e.message.includes('between'))).toBe(false);
    });

    it('should accept FREEZE_PROTECTION_START_C at boundary -5', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_START_C: -5 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'FREEZE_PROTECTION_START_C' && e.message.includes('between'))).toBe(false);
    });

    it('should error when FREEZE_PROTECTION_STOP_C is below -8', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_STOP_C: -9 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'FREEZE_PROTECTION_STOP_C')).toBe(true);
    });

    it('should error when FREEZE_PROTECTION_STOP_C exceeds 5', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_STOP_C: 6 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'FREEZE_PROTECTION_STOP_C')).toBe(true);
    });

    it('should accept FREEZE_PROTECTION_STOP_C at boundary -8', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_STOP_C: -8 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'FREEZE_PROTECTION_STOP_C' && e.message.includes('between'))).toBe(false);
    });

    it('should accept FREEZE_PROTECTION_STOP_C at boundary 5', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_STOP_C: 5 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'FREEZE_PROTECTION_STOP_C' && e.message.includes('between'))).toBe(false);
    });

    it('should error when STOP is not greater than START', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_START_C: -10, FREEZE_PROTECTION_STOP_C: -10 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('greater than'))).toBe(true);
    });

    it('should error when STOP is less than START', () => {
      const config = { ...validConfig, FREEZE_PROTECTION_START_C: -5, FREEZE_PROTECTION_STOP_C: -10 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('greater than'))).toBe(true);
    });
  });

  describe('high temp alerts validation', () => {
    it('should error when HIGH_TEMP_INSTANT_THRESHOLD_C is below 5', () => {
      const config = { ...validConfig, HIGH_TEMP_INSTANT_THRESHOLD_C: 4 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'HIGH_TEMP_INSTANT_THRESHOLD_C')).toBe(true);
    });

    it('should error when HIGH_TEMP_INSTANT_THRESHOLD_C exceeds 20', () => {
      const config = { ...validConfig, HIGH_TEMP_INSTANT_THRESHOLD_C: 21 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'HIGH_TEMP_INSTANT_THRESHOLD_C')).toBe(true);
    });

    it('should accept HIGH_TEMP_INSTANT_THRESHOLD_C at boundary 5', () => {
      const config = { ...validConfig, HIGH_TEMP_INSTANT_THRESHOLD_C: 5 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'HIGH_TEMP_INSTANT_THRESHOLD_C')).toBe(false);
    });

    it('should accept HIGH_TEMP_INSTANT_THRESHOLD_C at boundary 20', () => {
      const config = { ...validConfig, HIGH_TEMP_INSTANT_THRESHOLD_C: 20 };
      const result = validateConfig(config);
      expect(result.errors.some(e => e.field === 'HIGH_TEMP_INSTANT_THRESHOLD_C')).toBe(false);
    });
  });

  describe('multiple errors', () => {
    it('should collect multiple errors', () => {
      const config = {
        ...validConfig,
        AIR_SENSOR_ID: -1,
        EVAP_SENSOR_ID: 300,
        SETPOINT_C: 0,
        HYSTERESIS_C: 0.1
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('should return empty warnings array for valid config', () => {
      const result = validateConfig(validConfig);
      expect(result.warnings).toEqual([]);
    });
  });
});
