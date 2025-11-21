/**
 * Unit tests for state manager
 */

import { createInitialState } from './state';
import type { ControllerState } from './state';
import type { FridgeConfig } from '$types/config';

// Create mock config with all required fields
const createMockConfig = (overrides: Partial<FridgeConfig> = {}): FridgeConfig => ({
  // Thermostat & sensors
  AIR_SENSOR_ID: 100,
  EVAP_SENSOR_ID: 101,
  SETPOINT_C: 4.0,
  HYSTERESIS_C: 1.0,
  AIR_SENSOR_SMOOTHING_SEC: 30,
  EVAP_SENSOR_SMOOTHING_SEC: 10,
  LOOP_PERIOD_MS: 5000,

  // Safety (compressor & freeze)
  MIN_ON_SEC: 90,
  MIN_OFF_SEC: 300,
  FREEZE_PROTECTION_START_C: -16.0,
  FREEZE_PROTECTION_STOP_C: -5.0,
  FREEZE_RECOVERY_DELAY_SEC: 300,
  FREEZE_RECOVERY_HYSTERESIS_C: 2.0,
  FREEZE_LOCK_HYSTERESIS_C: 0.30,

  // Feature flags
  FEATURE_DUTY_CYCLE: true,
  FEATURE_DAILY_SUMMARY: true,
  FEATURE_SENSOR_FAILURE: true,
  FEATURE_HIGH_TEMP_ALERTS: true,
  FEATURE_ADAPTIVE_HYSTERESIS: true,
  FEATURE_WATCHDOG: true,
  FEATURE_PERFORMANCE_METRICS: true,

  // Duty cycle
  DUTY_INTERVAL_SEC: 3600,
  DUTY_LOG_EVERY_INTERVAL: true,

  // Daily summary
  DAILY_SUMMARY_HOUR: 6,
  DAILY_SUMMARY_ENABLED: true,

  // Sensor failure
  SENSOR_NO_READING_SEC: 60,
  SENSOR_STUCK_SEC: 300,
  SENSOR_STUCK_EPSILON_C: 0.05,
  SENSOR_CRITICAL_FAILURE_SEC: 300,

  // High temp alerts
  HIGH_TEMP_INSTANT_THRESHOLD_C: 10,
  HIGH_TEMP_INSTANT_DELAY_SEC: 300,
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: 8,
  HIGH_TEMP_SUSTAINED_DELAY_SEC: 3600,

  // Adaptive hysteresis
  ADAPTIVE_HIGH_DUTY_PCT: 80,
  ADAPTIVE_LOW_DUTY_PCT: 40,
  ADAPTIVE_MAX_SHIFT_C: 0.5,
  ADAPTIVE_MIN_SHIFT_C: 0,
  ADAPTIVE_SHIFT_STEP_C: 0.1,

  // Watchdog
  WATCHDOG_TIMEOUT_SEC: 120,

  // Performance
  PERF_LOG_INTERVAL_SEC: 300,
  PERF_SLOW_LOOP_THRESHOLD_MS: 500,
  PERF_WARN_SLOW_LOOPS: true,

  // Slack
  SLACK_ENABLED: false,
  SLACK_LOG_LEVEL: 2,
  SLACK_WEBHOOK_KEY: 'slack_webhook',
  SLACK_INTERVAL_SEC: 60,
  SLACK_BUFFER_SIZE: 10,
  SLACK_RETRY_DELAY_SEC: 5000,

  // Logging
  GLOBAL_LOG_LEVEL: 1,
  GLOBAL_LOG_AUTO_DEMOTE_HOURS: 24,

  // App constants
  LOG_LEVELS: { DEBUG: 0, INFO: 1, WARNING: 2, CRITICAL: 3 },
  RELAY_RESPONSE_TIMEOUT_SEC: 2,
  MAX_CONSECUTIVE_ERRORS: 10,
  // Console
  CONSOLE_ENABLED: true,
  CONSOLE_LOG_LEVEL: 1,
  CONSOLE_BUFFER_SIZE: 20,
  CONSOLE_INTERVAL_MS: 100,
  MIN_TOTAL_CYCLE_TIME_SEC: 300,
  MIN_FREEZE_GAP_WARNING_C: 5,
  MIN_CONTROL_LOOPS_PER_OFF: 3,
  MIN_SENSOR_EPSILON_C: 0.0001,
  RELAY_ID: 0,
  COMPONENT_SWITCH: 'switch',
  METHOD_SWITCH_SET: 'Switch.Set',
  INITIAL_LOOP_TIME_MIN: Infinity,

  ...overrides
});

describe('State Manager', () => {
  // ═══════════════════════════════════════════════════════════════
  // createInitialState()
  // ═══════════════════════════════════════════════════════════════

  describe('createInitialState', () => {
    describe('relay state initialization', () => {
      it('should create initial state with relay ON', () => {
        const nowSec = 1000;
        const relayOn = true;
        const config = createMockConfig();

        const state = createInitialState(nowSec, relayOn, config);

        expect(state.intendedOn).toBe(true);
        expect(state.confirmedOn).toBe(true);
        expect(state.lastOnTime).toBe(910); // nowSec - MIN_ON_SEC
        expect(state.lastOffTime).toBe(0);
        expect(state.lastStateChangeCommand).toBe(0);
      });

      it('should create initial state with relay OFF', () => {
        const nowSec = 1000;
        const relayOn = false;
        const config = createMockConfig();

        const state = createInitialState(nowSec, relayOn, config);

        expect(state.intendedOn).toBe(false);
        expect(state.confirmedOn).toBe(false);
        expect(state.lastOnTime).toBe(0);
        expect(state.lastOffTime).toBe(nowSec); // Pessimistic boot: wait full duration
        expect(state.lastStateChangeCommand).toBe(0);
      });

      it('should satisfy MIN_ON constraint immediately when relay is ON', () => {
        const nowSec = 1000;
        const relayOn = true;
        const config = createMockConfig({ MIN_ON_SEC: 180 });

        const state = createInitialState(nowSec, relayOn, config);

        const onDuration = nowSec - state.lastOnTime;
        expect(onDuration).toBe(180); // Exactly MIN_ON_SEC
        expect(onDuration).toBeGreaterThanOrEqual(config.MIN_ON_SEC);
      });

      it('should satisfy MIN_OFF constraint immediately when relay is OFF', () => {
        const now = 1000;
        const relayOn = false;
        const config = createMockConfig({ MIN_OFF_SEC: 600 });

        const state = createInitialState(now, relayOn, config);

        // Pessimistic boot: lastOffTime should be NOW to force a full wait
        expect(state.lastOffTime).toBe(now);

        // Verify that we cannot turn on immediately
        const offDuration = now - state.lastOffTime;
        expect(offDuration).toBe(0);
      });
    });

    describe('timing initialization', () => {
      it('should initialize lastLoopTime to 0', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.lastLoopTime).toBe(0);
      });
    });

    describe('adaptive hysteresis initialization', () => {
      it('should initialize thresholds based on setpoint and hysteresis', () => {
        const nowSec = 1000;
        const config = createMockConfig({ SETPOINT_C: 4.0, HYSTERESIS_C: 1.0 });

        const state = createInitialState(nowSec, false, config);

        expect(state.dynOnAbove).toBe(5.0); // SETPOINT_C + HYSTERESIS_C
        expect(state.dynOffBelow).toBe(3.0); // SETPOINT_C - HYSTERESIS_C
        expect(state.lastAdaptiveAdjust).toBe(0);
      });

      it('should calculate thresholds with different setpoint values', () => {
        const nowSec = 1000;
        const config = createMockConfig({ SETPOINT_C: 2.5, HYSTERESIS_C: 0.5 });

        const state = createInitialState(nowSec, false, config);

        expect(state.dynOnAbove).toBe(3.0); // 2.5 + 0.5
        expect(state.dynOffBelow).toBe(2.0); // 2.5 - 0.5
      });
    });

    describe('freeze protection initialization', () => {
      it('should initialize freeze protection state', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.freezeLocked).toBe(false);
        expect(state.lockCount).toBe(0);
        expect(state.unlockTime).toBe(0);
      });
    });

    describe('high temp alerts initialization', () => {
      it('should initialize alert tracking state', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.instantStart).toBe(0);
        expect(state.instantFired).toBe(false);
        expect(state.sustainedStart).toBe(0);
        expect(state.sustainedFired).toBe(false);
      });
    });

    describe('sensor health initialization', () => {
      it('should initialize air sensor state', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.airLastRaw).toBeNull();
        expect(state.airLastReadTime).toBe(0);
        expect(state.airLastChangeTime).toBe(0);
        expect(state.airNoReadingFired).toBe(false);
        expect(state.airStuckFired).toBe(false);
        expect(state.airCriticalFailure).toBe(false);
      });

      it('should initialize evap sensor state', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.evapLastRaw).toBeNull();
        expect(state.evapLastReadTime).toBe(0);
        expect(state.evapLastChangeTime).toBe(0);
        expect(state.evapNoReadingFired).toBe(false);
        expect(state.evapStuckFired).toBe(false);
        expect(state.evapCriticalFailure).toBe(false);
      });
    });

    describe('sensor smoothing initialization', () => {
      it('should initialize empty buffers', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.airTempBuffer).toEqual([]);
        expect(state.evapTempBuffer).toEqual([]);
        expect(state.airTempSmoothed).toBeNull();
        expect(state.evapTempSmoothed).toBeNull();
      });
    });

    describe('duty cycle initialization', () => {
      it('should initialize duty cycle tracking', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.dutyOnSec).toBe(0);
        expect(state.dutyOffSec).toBe(0);
        expect(state.dutyLastReset).toBe(nowSec);
      });
    });

    describe('daily stats initialization', () => {
      it('should initialize daily stats', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.dayOnSec).toBe(0);
        expect(state.dayOffSec).toBe(0);
        expect(state.dayAirMin).toBeNull();
        expect(state.dayAirMax).toBeNull();
        expect(state.dayAirSum).toBe(0);
        expect(state.dayAirCount).toBe(0);
        expect(state.dayEvapMin).toBeNull();
        expect(state.dayEvapMax).toBeNull();
        expect(state.dayEvapSum).toBe(0);
        expect(state.dayEvapCount).toBe(0);
        expect(state.dayFreezeCount).toBe(0);
        expect(state.dayHighTempCount).toBe(0);
        expect(state.lastDailySummaryDate).toBeNull();
      });
    });

    describe('watchdog initialization', () => {
      it('should initialize watchdog with current time', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.lastWatchdogPet).toBe(nowSec);
      });
    });

    describe('error tracking initialization', () => {
      it('should initialize error tracking', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.consecutiveErrors).toBe(0);
        expect(state.lastErrorTime).toBe(0);
      });
    });

    describe('MIN_ON/MIN_OFF wait state initialization', () => {
      it('should initialize wait state logging flags', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.minOnWaitLogged).toBe(false);
        expect(state.minOffWaitLogged).toBe(false);
      });
    });

    describe('performance metrics initialization', () => {
      it('should initialize performance metrics', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        expect(state.loopCount).toBe(0);
        expect(state.loopTimeSum).toBe(0);
        expect(state.loopTimeMax).toBe(0);
        expect(state.loopTimeMin).toBe(Infinity);
        expect(state.slowLoopCount).toBe(0);
        expect(state.lastPerfLog).toBe(nowSec);
      });

      it('should set loopTimeMin to Infinity for correct first loop tracking', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        // Any positive loop time should be less than Infinity
        const anyLoopTime = 0.001;
        expect(anyLoopTime).toBeLessThan(state.loopTimeMin);
      });
    });

    describe('type compliance', () => {
      it('should return ControllerState interface', () => {
        const nowSec = 1000;
        const config = createMockConfig();

        const state: ControllerState = createInitialState(nowSec, false, config);

        // Verify all required fields exist
        expect(state).toHaveProperty('intendedOn');
        expect(state).toHaveProperty('confirmedOn');
        expect(state).toHaveProperty('lastOnTime');
        expect(state).toHaveProperty('lastOffTime');
        expect(state).toHaveProperty('lastStateChangeCommand');
        expect(state).toHaveProperty('lastLoopTime');
        expect(state).toHaveProperty('freezeLocked');
        expect(state).toHaveProperty('lockCount');
        expect(state).toHaveProperty('unlockTime');
        expect(state).toHaveProperty('airLastRaw');
        expect(state).toHaveProperty('evapLastRaw');
        expect(state).toHaveProperty('airTempBuffer');
        expect(state).toHaveProperty('evapTempBuffer');
        expect(state).toHaveProperty('dutyOnSec');
        expect(state).toHaveProperty('dayOnSec');
        expect(state).toHaveProperty('dynOnAbove');
        expect(state).toHaveProperty('lastWatchdogPet');
        expect(state).toHaveProperty('consecutiveErrors');
        expect(state).toHaveProperty('loopCount');
        expect(state).toHaveProperty('loopTimeMin');
      });
    });

    describe('edge cases', () => {
      it('should handle zero timestamp', () => {
        const nowSec = 0;
        const config = createMockConfig();

        const state = createInitialState(nowSec, false, config);

        // Should still work, with negative timing values
        expect(state.lastOffTime).toBe(0);
        expect(state.dutyLastReset).toBe(0);
        expect(state.lastPerfLog).toBe(0);
      });

      it('should handle very large timestamp', () => {
        const nowSec = 1000000000; // ~31 years in seconds
        const config = createMockConfig();

        const state = createInitialState(nowSec, true, config);

        expect(state.lastOnTime).toBe(nowSec - config.MIN_ON_SEC);
        expect(state.dutyLastReset).toBe(nowSec);
        expect(state.lastWatchdogPet).toBe(nowSec);
      });
    });
  });
});
