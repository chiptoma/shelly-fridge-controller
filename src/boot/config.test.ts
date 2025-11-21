/**
 * Tests for configuration module
 */

import CONFIG, { USER_CONFIG, APP_CONSTANTS } from './config';

describe('Configuration', () => {
  describe('USER_CONFIG', () => {
    describe('sensor configuration', () => {
      it('should have valid AIR_SENSOR_ID', () => {
        expect(USER_CONFIG.AIR_SENSOR_ID).toBeGreaterThanOrEqual(0);
        expect(USER_CONFIG.AIR_SENSOR_ID).toBeLessThanOrEqual(255);
      });

      it('should have valid EVAP_SENSOR_ID', () => {
        expect(USER_CONFIG.EVAP_SENSOR_ID).toBeGreaterThanOrEqual(0);
        expect(USER_CONFIG.EVAP_SENSOR_ID).toBeLessThanOrEqual(255);
      });

      it('should have different sensor IDs', () => {
        expect(USER_CONFIG.AIR_SENSOR_ID).not.toBe(USER_CONFIG.EVAP_SENSOR_ID);
      });
    });

    describe('temperature settings', () => {
      it('should have valid SETPOINT_C', () => {
        expect(USER_CONFIG.SETPOINT_C).toBeGreaterThanOrEqual(1);
        expect(USER_CONFIG.SETPOINT_C).toBeLessThanOrEqual(10);
      });

      it('should have valid HYSTERESIS_C', () => {
        expect(USER_CONFIG.HYSTERESIS_C).toBeGreaterThan(0.3);
        expect(USER_CONFIG.HYSTERESIS_C).toBeLessThanOrEqual(5);
      });

      it('should have reasonable smoothing windows', () => {
        expect(USER_CONFIG.AIR_SENSOR_SMOOTHING_SEC).toBeGreaterThanOrEqual(5);
        expect(USER_CONFIG.AIR_SENSOR_SMOOTHING_SEC).toBeLessThanOrEqual(300);
        expect(USER_CONFIG.EVAP_SENSOR_SMOOTHING_SEC).toBeGreaterThanOrEqual(5);
        expect(USER_CONFIG.EVAP_SENSOR_SMOOTHING_SEC).toBeLessThanOrEqual(300);
      });
    });

    describe('timing settings', () => {
      it('should have valid LOOP_PERIOD_MS', () => {
        expect(USER_CONFIG.LOOP_PERIOD_MS).toBeGreaterThanOrEqual(2000);
        expect(USER_CONFIG.LOOP_PERIOD_MS).toBeLessThanOrEqual(15000);
      });

      it('should have valid MIN_ON_SEC', () => {
        expect(USER_CONFIG.MIN_ON_SEC).toBeGreaterThanOrEqual(120);
      });

      it('should have valid MIN_OFF_SEC', () => {
        expect(USER_CONFIG.MIN_OFF_SEC).toBeGreaterThanOrEqual(180);
      });

      it('should have sufficient total cycle time', () => {
        expect(USER_CONFIG.MIN_ON_SEC + USER_CONFIG.MIN_OFF_SEC).toBeGreaterThanOrEqual(240);
      });
    });

    describe('freeze protection settings', () => {
      it('should have valid FREEZE_PROTECTION_START_C', () => {
        expect(USER_CONFIG.FREEZE_PROTECTION_START_C).toBeGreaterThanOrEqual(-30);
        expect(USER_CONFIG.FREEZE_PROTECTION_START_C).toBeLessThanOrEqual(-5);
      });

      it('should have valid FREEZE_PROTECTION_STOP_C', () => {
        expect(USER_CONFIG.FREEZE_PROTECTION_STOP_C).toBeGreaterThanOrEqual(-8);
        expect(USER_CONFIG.FREEZE_PROTECTION_STOP_C).toBeLessThanOrEqual(5);
      });

      it('should have STOP > START for freeze protection', () => {
        expect(USER_CONFIG.FREEZE_PROTECTION_STOP_C).toBeGreaterThan(USER_CONFIG.FREEZE_PROTECTION_START_C);
      });

      it('should have valid FREEZE_RECOVERY_DELAY_SEC', () => {
        expect(USER_CONFIG.FREEZE_RECOVERY_DELAY_SEC).toBeGreaterThanOrEqual(120);
        expect(USER_CONFIG.FREEZE_RECOVERY_DELAY_SEC).toBeLessThanOrEqual(900);
      });

      it('should have valid hysteresis values', () => {
        expect(USER_CONFIG.FREEZE_RECOVERY_HYSTERESIS_C).toBeGreaterThan(0);
        expect(USER_CONFIG.FREEZE_RECOVERY_HYSTERESIS_C).toBeLessThanOrEqual(5);
        expect(USER_CONFIG.FREEZE_LOCK_HYSTERESIS_C).toBeGreaterThan(0);
        expect(USER_CONFIG.FREEZE_LOCK_HYSTERESIS_C).toBeLessThanOrEqual(5);
      });
    });

    describe('feature flags', () => {
      it('should have boolean feature flags', () => {
        expect(typeof USER_CONFIG.FEATURE_DUTY_CYCLE).toBe('boolean');
        expect(typeof USER_CONFIG.FEATURE_DAILY_SUMMARY).toBe('boolean');
        expect(typeof USER_CONFIG.FEATURE_SENSOR_FAILURE).toBe('boolean');
        expect(typeof USER_CONFIG.FEATURE_HIGH_TEMP_ALERTS).toBe('boolean');
        expect(typeof USER_CONFIG.FEATURE_ADAPTIVE_HYSTERESIS).toBe('boolean');
        expect(typeof USER_CONFIG.FEATURE_WATCHDOG).toBe('boolean');
        expect(typeof USER_CONFIG.FEATURE_PERFORMANCE_METRICS).toBe('boolean');
      });
    });

    describe('duty cycle settings', () => {
      it('should have valid DUTY_INTERVAL_SEC', () => {
        expect(USER_CONFIG.DUTY_INTERVAL_SEC).toBeGreaterThanOrEqual(300);
        expect(USER_CONFIG.DUTY_INTERVAL_SEC).toBeLessThanOrEqual(86400);
      });

      it('should have boolean DUTY_LOG_EVERY_INTERVAL', () => {
        expect(typeof USER_CONFIG.DUTY_LOG_EVERY_INTERVAL).toBe('boolean');
      });
    });

    describe('daily summary settings', () => {
      it('should have valid DAILY_SUMMARY_HOUR', () => {
        expect(USER_CONFIG.DAILY_SUMMARY_HOUR).toBeGreaterThanOrEqual(0);
        expect(USER_CONFIG.DAILY_SUMMARY_HOUR).toBeLessThanOrEqual(23);
      });

      it('should have boolean DAILY_SUMMARY_ENABLED', () => {
        expect(typeof USER_CONFIG.DAILY_SUMMARY_ENABLED).toBe('boolean');
      });
    });

    describe('sensor health settings', () => {
      it('should have valid SENSOR_NO_READING_SEC', () => {
        expect(USER_CONFIG.SENSOR_NO_READING_SEC).toBeGreaterThanOrEqual(5);
        expect(USER_CONFIG.SENSOR_NO_READING_SEC).toBeLessThanOrEqual(120);
      });

      it('should have valid SENSOR_STUCK_SEC', () => {
        expect(USER_CONFIG.SENSOR_STUCK_SEC).toBeGreaterThanOrEqual(60);
        expect(USER_CONFIG.SENSOR_STUCK_SEC).toBeLessThanOrEqual(3600);
      });

      it('should have valid SENSOR_STUCK_EPSILON_C', () => {
        expect(USER_CONFIG.SENSOR_STUCK_EPSILON_C).toBeGreaterThan(0);
        expect(USER_CONFIG.SENSOR_STUCK_EPSILON_C).toBeLessThanOrEqual(0.5);
      });

      it('should have valid SENSOR_CRITICAL_FAILURE_SEC', () => {
        expect(USER_CONFIG.SENSOR_CRITICAL_FAILURE_SEC).toBeGreaterThanOrEqual(60);
        expect(USER_CONFIG.SENSOR_CRITICAL_FAILURE_SEC).toBeLessThanOrEqual(3600);
      });
    });

    describe('high temp alert settings', () => {
      it('should have valid instant threshold', () => {
        expect(USER_CONFIG.HIGH_TEMP_INSTANT_THRESHOLD_C).toBeGreaterThanOrEqual(5);
        expect(USER_CONFIG.HIGH_TEMP_INSTANT_THRESHOLD_C).toBeLessThanOrEqual(20);
      });

      it('should have valid instant delay', () => {
        expect(USER_CONFIG.HIGH_TEMP_INSTANT_DELAY_SEC).toBeGreaterThanOrEqual(60);
        expect(USER_CONFIG.HIGH_TEMP_INSTANT_DELAY_SEC).toBeLessThanOrEqual(900);
      });

      it('should have valid sustained threshold', () => {
        expect(USER_CONFIG.HIGH_TEMP_SUSTAINED_THRESHOLD_C).toBeGreaterThanOrEqual(5);
        expect(USER_CONFIG.HIGH_TEMP_SUSTAINED_THRESHOLD_C).toBeLessThanOrEqual(20);
      });

      it('should have valid sustained delay', () => {
        expect(USER_CONFIG.HIGH_TEMP_SUSTAINED_DELAY_SEC).toBeGreaterThanOrEqual(300);
        expect(USER_CONFIG.HIGH_TEMP_SUSTAINED_DELAY_SEC).toBeLessThanOrEqual(3600);
      });
    });

    describe('adaptive hysteresis settings', () => {
      it('should have valid duty percentages', () => {
        expect(USER_CONFIG.ADAPTIVE_LOW_DUTY_PCT).toBeGreaterThanOrEqual(0);
        expect(USER_CONFIG.ADAPTIVE_LOW_DUTY_PCT).toBeLessThanOrEqual(100);
        expect(USER_CONFIG.ADAPTIVE_HIGH_DUTY_PCT).toBeGreaterThanOrEqual(0);
        expect(USER_CONFIG.ADAPTIVE_HIGH_DUTY_PCT).toBeLessThanOrEqual(100);
        expect(USER_CONFIG.ADAPTIVE_HIGH_DUTY_PCT).toBeGreaterThan(USER_CONFIG.ADAPTIVE_LOW_DUTY_PCT);
      });

      it('should have valid max shift', () => {
        expect(USER_CONFIG.ADAPTIVE_MAX_SHIFT_C).toBeGreaterThanOrEqual(0.1);
        expect(USER_CONFIG.ADAPTIVE_MAX_SHIFT_C).toBeLessThanOrEqual(1.0);
      });
    });

    describe('watchdog settings', () => {
      it('should have valid WATCHDOG_TIMEOUT_SEC', () => {
        expect(USER_CONFIG.WATCHDOG_TIMEOUT_SEC).toBeGreaterThanOrEqual(5);
        expect(USER_CONFIG.WATCHDOG_TIMEOUT_SEC).toBeLessThanOrEqual(120);
      });
    });

    describe('performance metrics settings', () => {
      it('should have valid PERF_LOG_INTERVAL_SEC', () => {
        expect(USER_CONFIG.PERF_LOG_INTERVAL_SEC).toBeGreaterThanOrEqual(60);
        expect(USER_CONFIG.PERF_LOG_INTERVAL_SEC).toBeLessThanOrEqual(86400);
      });

      it('should have valid PERF_SLOW_LOOP_THRESHOLD_MS', () => {
        expect(USER_CONFIG.PERF_SLOW_LOOP_THRESHOLD_MS).toBeGreaterThanOrEqual(50);
        expect(USER_CONFIG.PERF_SLOW_LOOP_THRESHOLD_MS).toBeLessThanOrEqual(2000);
      });

      it('should have boolean PERF_WARN_SLOW_LOOPS', () => {
        expect(typeof USER_CONFIG.PERF_WARN_SLOW_LOOPS).toBe('boolean');
      });
    });

    describe('slack settings', () => {
      it('should have boolean SLACK_ENABLED', () => {
        expect(typeof USER_CONFIG.SLACK_ENABLED).toBe('boolean');
      });

      it('should have valid SLACK_LOG_LEVEL', () => {
        expect(USER_CONFIG.SLACK_LOG_LEVEL).toBeGreaterThanOrEqual(0);
        expect(USER_CONFIG.SLACK_LOG_LEVEL).toBeLessThanOrEqual(3);
      });

      it('should have non-empty SLACK_WEBHOOK_KEY', () => {
        expect(USER_CONFIG.SLACK_WEBHOOK_KEY.length).toBeGreaterThan(0);
      });

      it('should have valid SLACK_INTERVAL_SEC', () => {
        expect(USER_CONFIG.SLACK_INTERVAL_SEC).toBeGreaterThanOrEqual(1);
      });

      it('should have valid SLACK_BUFFER_SIZE', () => {
        expect(USER_CONFIG.SLACK_BUFFER_SIZE).toBeGreaterThanOrEqual(1);
        expect(USER_CONFIG.SLACK_BUFFER_SIZE).toBeLessThanOrEqual(100);
      });

      it('should have valid SLACK_RETRY_DELAY_SEC', () => {
        expect(USER_CONFIG.SLACK_RETRY_DELAY_SEC).toBeGreaterThanOrEqual(5);
        expect(USER_CONFIG.SLACK_RETRY_DELAY_SEC).toBeLessThanOrEqual(600);
      });
    });

    describe('console settings', () => {
      it('should have boolean CONSOLE_ENABLED', () => {
        expect(typeof USER_CONFIG.CONSOLE_ENABLED).toBe('boolean');
      });

      it('should have valid CONSOLE_LOG_LEVEL', () => {
        expect(USER_CONFIG.CONSOLE_LOG_LEVEL).toBeGreaterThanOrEqual(0);
        expect(USER_CONFIG.CONSOLE_LOG_LEVEL).toBeLessThanOrEqual(3);
      });

      it('should have valid CONSOLE_BUFFER_SIZE', () => {
        expect(USER_CONFIG.CONSOLE_BUFFER_SIZE).toBeGreaterThanOrEqual(50);
        expect(USER_CONFIG.CONSOLE_BUFFER_SIZE).toBeLessThanOrEqual(500);
      });

      it('should have valid CONSOLE_INTERVAL_MS', () => {
        expect(USER_CONFIG.CONSOLE_INTERVAL_MS).toBeGreaterThanOrEqual(10);
        expect(USER_CONFIG.CONSOLE_INTERVAL_MS).toBeLessThanOrEqual(200);
      });
    });

    describe('global logging settings', () => {
      it('should have valid GLOBAL_LOG_LEVEL', () => {
        expect(USER_CONFIG.GLOBAL_LOG_LEVEL).toBeGreaterThanOrEqual(0);
        expect(USER_CONFIG.GLOBAL_LOG_LEVEL).toBeLessThanOrEqual(3);
      });

      it('should have valid GLOBAL_LOG_AUTO_DEMOTE_HOURS', () => {
        expect(USER_CONFIG.GLOBAL_LOG_AUTO_DEMOTE_HOURS).toBeGreaterThanOrEqual(1);
        expect(USER_CONFIG.GLOBAL_LOG_AUTO_DEMOTE_HOURS).toBeLessThanOrEqual(720);
      });
    });
  });

  describe('APP_CONSTANTS', () => {
    describe('log levels', () => {
      it('should have all log levels defined', () => {
        expect(APP_CONSTANTS.LOG_LEVELS.DEBUG).toBe(0);
        expect(APP_CONSTANTS.LOG_LEVELS.INFO).toBe(1);
        expect(APP_CONSTANTS.LOG_LEVELS.WARNING).toBe(2);
        expect(APP_CONSTANTS.LOG_LEVELS.CRITICAL).toBe(3);
      });

      it('should have log levels in ascending order', () => {
        expect(APP_CONSTANTS.LOG_LEVELS.DEBUG).toBeLessThan(APP_CONSTANTS.LOG_LEVELS.INFO);
        expect(APP_CONSTANTS.LOG_LEVELS.INFO).toBeLessThan(APP_CONSTANTS.LOG_LEVELS.WARNING);
        expect(APP_CONSTANTS.LOG_LEVELS.WARNING).toBeLessThan(APP_CONSTANTS.LOG_LEVELS.CRITICAL);
      });
    });

    describe('hardware constants', () => {
      it('should have valid RELAY_ID', () => {
        expect(APP_CONSTANTS.RELAY_ID).toBe(0);
      });

      it('should have correct component names', () => {
        expect(APP_CONSTANTS.COMPONENT_SWITCH).toBe('switch');
        expect(APP_CONSTANTS.METHOD_SWITCH_SET).toBe('Switch.Set');
      });
    });

    describe('validation constants', () => {
      it('should have valid MIN_TOTAL_CYCLE_TIME_SEC', () => {
        expect(APP_CONSTANTS.MIN_TOTAL_CYCLE_TIME_SEC).toBe(240);
      });

      it('should have valid MIN_FREEZE_GAP_WARNING_C', () => {
        expect(APP_CONSTANTS.MIN_FREEZE_GAP_WARNING_C).toBe(3.0);
      });

      it('should have valid MIN_CONTROL_LOOPS_PER_OFF', () => {
        expect(APP_CONSTANTS.MIN_CONTROL_LOOPS_PER_OFF).toBe(3);
      });

      it('should have valid MIN_SENSOR_EPSILON_C', () => {
        expect(APP_CONSTANTS.MIN_SENSOR_EPSILON_C).toBe(0.0001);
      });
    });

    describe('timing constants', () => {
      it('should have valid RELAY_RESPONSE_TIMEOUT_SEC', () => {
        expect(APP_CONSTANTS.RELAY_RESPONSE_TIMEOUT_SEC).toBeGreaterThanOrEqual(0.5);
        expect(APP_CONSTANTS.RELAY_RESPONSE_TIMEOUT_SEC).toBeLessThanOrEqual(10);
      });

      it('should have valid MAX_CONSECUTIVE_ERRORS', () => {
        expect(APP_CONSTANTS.MAX_CONSECUTIVE_ERRORS).toBeGreaterThanOrEqual(1);
        expect(APP_CONSTANTS.MAX_CONSECUTIVE_ERRORS).toBeLessThanOrEqual(20);
      });
    });

    describe('initial values', () => {
      it('should have INITIAL_LOOP_TIME_MIN as Infinity', () => {
        expect(APP_CONSTANTS.INITIAL_LOOP_TIME_MIN).toBe(Infinity);
      });
    });
  });

  describe('Combined CONFIG', () => {
    it('should contain all USER_CONFIG properties', () => {
      Object.keys(USER_CONFIG).forEach(key => {
        expect(CONFIG).toHaveProperty(key);
        expect((CONFIG as any)[key]).toBe((USER_CONFIG as any)[key]);
      });
    });

    it('should contain all APP_CONSTANTS properties', () => {
      Object.keys(APP_CONSTANTS).forEach(key => {
        expect(CONFIG).toHaveProperty(key);
        expect((CONFIG as any)[key]).toEqual((APP_CONSTANTS as any)[key]);
      });
    });

    it('should be a valid FridgeConfig', () => {
      // Check that CONFIG has expected structure
      expect(CONFIG.AIR_SENSOR_ID).toBeDefined();
      expect(CONFIG.SETPOINT_C).toBeDefined();
      expect(CONFIG.LOG_LEVELS).toBeDefined();
      expect(CONFIG.RELAY_ID).toBeDefined();
    });
  });
});
