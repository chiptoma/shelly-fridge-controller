/**
 * Tests for features event processor
 */

import {
  processStateEvent,
  createInitialFeaturesState,
  FeaturesConfig,
  FeaturesState
} from './processor';
import type { FridgeStateEvent } from '@events/types';

describe('Features Processor', () => {
  const defaultConfig: FeaturesConfig = {
    SETPOINT_C: 4.0,
    HYSTERESIS_C: 1.0,
    ADAPTIVE_LOW_DUTY_PCT: 30,
    ADAPTIVE_HIGH_DUTY_PCT: 70,
    ADAPTIVE_MAX_SHIFT_C: 0.5,
    ADAPTIVE_MIN_SHIFT_C: 0,
    ADAPTIVE_SHIFT_STEP_C: 0.1,
    HIGH_TEMP_INSTANT_THRESHOLD_C: 10.0,
    HIGH_TEMP_INSTANT_DELAY_SEC: 180,
    HIGH_TEMP_SUSTAINED_THRESHOLD_C: 10.0,
    HIGH_TEMP_SUSTAINED_DELAY_SEC: 600,
    PERF_SLOW_LOOP_THRESHOLD_MS: 250,
    PERF_LOG_INTERVAL_SEC: 3600,
    PERF_WARN_SLOW_LOOPS: false,
    DAILY_SUMMARY_HOUR: 7,
    DUTY_INTERVAL_SEC: 3600
  };

  function createStateEvent(overrides: Partial<FridgeStateEvent> = {}): FridgeStateEvent {
    return {
      airTemp: 4.5,
      evapTemp: -8.0,
      airRaw: 4.6,
      evapRaw: -7.9,
      relayOn: false,
      freezeLocked: false,
      dutyOnSec: 0,
      dutyOffSec: 0,
      dt: 5,
      loopStartSec: 1000,
      timestamp: 1000,
      ...overrides
    };
  }

  describe('createInitialFeaturesState', () => {
    it('should create state with correct initial values', () => {
      const state = createInitialFeaturesState(defaultConfig);

      expect(state.currentShift).toBe(0);
      expect(state.dynOnAbove).toBe(5.0); // 4.0 + 1.0
      expect(state.dynOffBelow).toBe(3.0); // 4.0 - 1.0
      expect(state.dailyState.dayOnSec).toBe(0);
      expect(state.alertState.instant.fired).toBe(false);
    });
  });

  describe('processStateEvent', () => {
    let state: FeaturesState;

    beforeEach(() => {
      state = createInitialFeaturesState(defaultConfig);
    });

    describe('daily stats tracking', () => {
      it('should update daily runtime for relay ON', () => {
        const event = createStateEvent({ relayOn: true, dt: 10 });
        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        expect(result.state.dailyState.dayOnSec).toBe(10);
        expect(result.state.dailyState.dayOffSec).toBe(0);
      });

      it('should update daily runtime for relay OFF', () => {
        const event = createStateEvent({ relayOn: false, dt: 10 });
        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        expect(result.state.dailyState.dayOnSec).toBe(0);
        expect(result.state.dailyState.dayOffSec).toBe(10);
      });

      it('should track temperature min/max', () => {
        const event = createStateEvent({ airRaw: 5.0, evapRaw: -10.0 });
        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        expect(result.state.dailyState.dayAirMin).toBe(5.0);
        expect(result.state.dailyState.dayAirMax).toBe(5.0);
        expect(result.state.dailyState.dayEvapMin).toBe(-10.0);
        expect(result.state.dailyState.dayEvapMax).toBe(-10.0);
      });
    });

    describe('high temp alerts', () => {
      it('should not fire alert when temp is below threshold', () => {
        const event = createStateEvent({ airTemp: 8.0 });
        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        expect(result.state.alertState.instant.fired).toBe(false);
        const alertCommands = result.commands.filter(c => c.message?.includes('HIGH TEMP'));
        expect(alertCommands).toHaveLength(0);
      });

      it('should start tracking when temp exceeds threshold', () => {
        const event = createStateEvent({ airTemp: 12.0, timestamp: 1000 });
        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        expect(result.state.alertState.instant.startTime).toBe(1000);
        expect(result.state.alertState.instant.fired).toBe(false);
      });

      it('should fire instant alert after delay', () => {
        // First event starts tracking
        state.alertState.instant.startTime = 1000;
        state.alertState.instant.fired = false;

        // Event after delay
        const event = createStateEvent({
          airTemp: 12.0,
          timestamp: 1000 + 180 + 1 // After 180s delay
        });

        const result = processStateEvent(event, state, defaultConfig, () => 1200);

        expect(result.state.alertState.instant.fired).toBe(true);
        const alertCommand = result.commands.find(c => c.message?.includes('HIGH TEMP INSTANT'));
        expect(alertCommand).toBeDefined();
        expect(alertCommand?.level).toBe(2);
      });

      it('should generate recovery message when alert clears', () => {
        state.alertState.instant.startTime = 0;
        state.alertState.instant.fired = true;

        const event = createStateEvent({ airTemp: 8.0 }); // Below threshold
        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        expect(result.state.alertState.instant.fired).toBe(false);
        const recoveryCommand = result.commands.find(c => c.message?.includes('recovered'));
        expect(recoveryCommand).toBeDefined();
      });

      it('should fire sustained alert after longer delay', () => {
        // Set up sustained tracking
        state.alertState.sustained.startTime = 1000;
        state.alertState.sustained.fired = false;

        // Event after sustained delay (600s)
        const event = createStateEvent({
          airTemp: 12.0,
          timestamp: 1000 + 600 + 1
        });

        const result = processStateEvent(event, state, defaultConfig, () => 1700);

        expect(result.state.alertState.sustained.fired).toBe(true);
        const alertCommand = result.commands.find(c => c.message?.includes('HIGH TEMP SUSTAINED'));
        expect(alertCommand).toBeDefined();
        expect(alertCommand?.level).toBe(2);
        expect(result.state.dailyState.highTempCount).toBe(1);
      });

      it('should format instant alert message with temperature value', () => {
        // Start with alert already tracking (startTime set)
        state.alertState.instant.startTime = 1000;
        state.alertState.instant.fired = false;

        // Create high temp event that triggers the alert
        const event = createStateEvent({
          airTemp: 15.0, // Above threshold
          timestamp: 1000 + 180 + 1
        });

        const result = processStateEvent(event, state, defaultConfig, () => 1200);

        expect(result.state.alertState.instant.fired).toBe(true);
        const alertCommand = result.commands.find(c => c.message?.includes('HIGH TEMP INSTANT'));
        expect(alertCommand).toBeDefined();
        expect(alertCommand?.message).toContain('15');
      });

      it('should format sustained alert message with temperature value', () => {
        state.alertState.sustained.startTime = 1000;
        state.alertState.sustained.fired = false;

        const event = createStateEvent({
          airTemp: 15.0,
          timestamp: 1000 + 600 + 1
        });

        const result = processStateEvent(event, state, defaultConfig, () => 1700);

        expect(result.state.alertState.sustained.fired).toBe(true);
        const alertCommand = result.commands.find(c => c.message?.includes('HIGH TEMP SUSTAINED'));
        expect(alertCommand).toBeDefined();
        expect(alertCommand?.message).toContain('15');
      });

      it('should generate sustained recovery message', () => {
        state.alertState.sustained.startTime = 0;
        state.alertState.sustained.fired = true;

        const event = createStateEvent({ airTemp: 8.0 });
        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        expect(result.state.alertState.sustained.fired).toBe(false);
        const recoveryCommand = result.commands.find(c => c.message?.includes('sustained alert recovered'));
        expect(recoveryCommand).toBeDefined();
      });
    });

    describe('adaptive hysteresis', () => {
      it('should not adjust when duty is in normal range', () => {
        const event = createStateEvent({
          dutyOnSec: 1800, // 50%
          dutyOffSec: 1800
        });

        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        const hysteresisCommand = result.commands.find(c => c.type === 'adjust_hysteresis');
        expect(hysteresisCommand).toBeUndefined();
      });

      it('should widen hysteresis for high duty cycle', () => {
        const event = createStateEvent({
          dutyOnSec: 2880, // 80%
          dutyOffSec: 720
        });

        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        const hysteresisCommand = result.commands.find(c => c.type === 'adjust_hysteresis');
        expect(hysteresisCommand).toBeDefined();
        expect(hysteresisCommand?.onAbove).toBeGreaterThan(5.0);
      });

      it('should tighten hysteresis for low duty cycle', () => {
        // First widen to create room for tightening
        state.currentShift = 0.3;
        state.dynOnAbove = 5.3;
        state.dynOffBelow = 2.7;

        const event = createStateEvent({
          dutyOnSec: 720, // 20%
          dutyOffSec: 2880
        });

        const result = processStateEvent(event, state, defaultConfig, () => 1001);

        const hysteresisCommand = result.commands.find(c => c.type === 'adjust_hysteresis');
        expect(hysteresisCommand).toBeDefined();
        expect(hysteresisCommand?.onAbove).toBeLessThan(5.3);
      });
    });

    describe('duty cycle logging', () => {
      it('should log duty cycle after interval', () => {
        state.dutyLastReset = 1; // Must be non-zero for shouldResetDutyCycle to work

        const event = createStateEvent({
          dutyOnSec: 1800,
          dutyOffSec: 1800,
          timestamp: 3602 // After 1 hour (3601 - 1 = 3600s)
        });

        const result = processStateEvent(event, state, defaultConfig, () => 3603);

        const dutyCommand = result.commands.find(c => c.message?.includes('Duty cycle:'));
        expect(dutyCommand).toBeDefined();
        expect(result.state.dutyLastReset).toBe(3602);
      });

      it('should not log duty cycle before interval', () => {
        state.dutyLastReset = 1000;

        const event = createStateEvent({
          dutyOnSec: 1800,
          dutyOffSec: 1800,
          timestamp: 2000 // Only 1000s later
        });

        const result = processStateEvent(event, state, defaultConfig, () => 2001);

        const dutyCommand = result.commands.find(c => c.message?.includes('Duty cycle:'));
        expect(dutyCommand).toBeUndefined();
      });
    });

    describe('daily summary', () => {
      it('should generate daily summary at configured hour', () => {
        // Set up state with some accumulated data
        state.dailyState.dayOnSec = 7200;
        state.dailyState.dayOffSec = 3600;
        state.dailyState.dayAirMin = 3.0;
        state.dailyState.dayAirMax = 6.0;
        state.dailyState.dayAirSum = 45.0;
        state.dailyState.dayAirCount = 10;
        state.dailyState.dayEvapMin = -10.0;
        state.dailyState.dayEvapMax = -5.0;
        state.dailyState.dayEvapSum = -75.0;
        state.dailyState.dayEvapCount = 10;
        state.dailyState.freezeCount = 2;
        state.dailyState.highTempCount = 1;
        state.dailyState.lastDailySummaryDate = '2024-01-01';

        // Create timestamp at 7:00 AM local time on a different day
        const date = new Date('2024-01-02T07:00:00');
        const timestamp = date.getTime() / 1000;

        const event = createStateEvent({ timestamp });
        const result = processStateEvent(event, state, defaultConfig, () => timestamp + 1);

        // Should generate summary command
        const summaryCommand = result.commands.find(c => c.type === 'daily_summary');
        expect(summaryCommand).toBeDefined();
        expect(summaryCommand?.summary).toContain('Daily Summary');

        // Should reset daily stats
        expect(result.state.dailyState.dayOnSec).toBe(0);
        expect(result.state.dailyState.dayOffSec).toBe(0);
        expect(result.state.dailyState.dayAirMin).toBeNull();
        expect(result.state.dailyState.dayAirMax).toBeNull();
        expect(result.state.dailyState.freezeCount).toBe(0);
        expect(result.state.dailyState.highTempCount).toBe(0);
      });
    });

    describe('performance metrics', () => {
      it('should track loop execution', () => {
        const event = createStateEvent({ loopStartSec: 1000 });
        const result = processStateEvent(event, state, defaultConfig, () => 1000.1);

        expect(result.state.perfState.loopCount).toBe(1);
      });

      it('should warn on slow loops when enabled', () => {
        const config = { ...defaultConfig, PERF_WARN_SLOW_LOOPS: true };
        const event = createStateEvent({ loopStartSec: 1000 });

        // Simulate slow loop (300ms)
        const result = processStateEvent(event, state, config, () => 1000.3);

        const slowCommand = result.commands.find(c => c.message?.includes('Slow loop'));
        expect(slowCommand).toBeDefined();
      });

      it('should log performance summary after interval', () => {
        state.lastPerfLog = 0;

        const event = createStateEvent({ loopStartSec: 3600, timestamp: 3600 });
        const result = processStateEvent(event, state, defaultConfig, () => 3601);

        const perfCommand = result.commands.find(c => c.message?.includes('loops'));
        expect(perfCommand).toBeDefined();
        expect(result.state.lastPerfLog).toBe(3601);
      });
    });

    describe('state immutability', () => {
      it('should not modify original state', () => {
        const event = createStateEvent({
          relayOn: true,
          dt: 100,
          airRaw: 10.0
        });

        const originalDayOnSec = state.dailyState.dayOnSec;
        processStateEvent(event, state, defaultConfig, () => 1001);

        expect(state.dailyState.dayOnSec).toBe(originalDayOnSec);
      });
    });
  });
});
