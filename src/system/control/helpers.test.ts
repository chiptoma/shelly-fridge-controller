/**
 * Tests for control loop helper functions
 */

// Mock Shelly globals using any cast to avoid redeclaration errors
(global as any).Shelly = {
  call: jest.fn(),
  getComponentStatus: jest.fn(),
  getComponentConfig: jest.fn(),
  emitEvent: jest.fn()
};
(global as any).Timer = { set: jest.fn(), clear: jest.fn() };

// Mock config
jest.mock('@boot/config', () => ({
  __esModule: true,
  default: {
    SENSOR_NO_READING_SEC: 30,
    SENSOR_CRITICAL_FAILURE_SEC: 600,
    SENSOR_STUCK_SEC: 300,
    SENSOR_STUCK_EPSILON_C: 0.05,
    AIR_SENSOR_SMOOTHING_SEC: 30,
    EVAP_SENSOR_SMOOTHING_SEC: 10,
    LOOP_PERIOD_MS: 5000,
    FREEZE_PROTECTION_START_C: -16,
    FREEZE_PROTECTION_STOP_C: -2,
    FREEZE_RECOVERY_DELAY_SEC: 300,
    FREEZE_RECOVERY_HYSTERESIS_C: 0.5,
    FREEZE_LOCK_HYSTERESIS_C: 0.3,
    HIGH_TEMP_INSTANT_THRESHOLD_C: 10,
    HIGH_TEMP_INSTANT_DELAY_SEC: 180,
    HIGH_TEMP_SUSTAINED_THRESHOLD_C: 10,
    HIGH_TEMP_SUSTAINED_DELAY_SEC: 600,
    SETPOINT_C: 4.0,
    HYSTERESIS_C: 1.0,
    ADAPTIVE_HIGH_DUTY_PCT: 70,
    ADAPTIVE_LOW_DUTY_PCT: 30,
    ADAPTIVE_MAX_SHIFT_C: 0.5,
    RELAY_ID: 0,
    MIN_ON_SEC: 180,
    MIN_OFF_SEC: 300,
    PERF_SLOW_LOOP_THRESHOLD_MS: 250,
    PERF_WARN_SLOW_LOOPS: false,
    PERF_LOG_INTERVAL_SEC: 3600,
    DAILY_SUMMARY_HOUR: 7
  }
}));

// Mock dependencies
jest.mock('@core/smoothing', () => ({
  updateMovingAverage: jest.fn().mockReturnValue(5.0),
  isBufferFull: jest.fn().mockReturnValue(true)
}));

jest.mock('@core/freeze-protection', () => ({
  updateFreezeProtection: jest.fn().mockReturnValue({
    locked: false,
    lockCount: 0,
    unlockTime: 0
  })
}));

jest.mock('@core/compressor-timing', () => ({
  applyTimingConstraints: jest.fn().mockReturnValue({ allow: true })
}));

jest.mock('@core/sensor-health', () => ({
  updateSensorHealth: jest.fn().mockReturnValue({
    lastReadTime: 1000,
    lastChangeTime: 1000,
    lastRaw: 5.0,
    noReadingFired: false,
    criticalFailure: false,
    stuckFired: false,
    recovered: false,
    unstuck: false,
    offlineDuration: 0,
    stuckDuration: 0
  })
}));

jest.mock('@features/adaptive-hysteresis', () => ({
  calculateAdaptiveShift: jest.fn().mockReturnValue({
    newShift: 0,
    changed: false
  })
}));

jest.mock('@hardware/relay', () => ({
  setRelay: jest.fn()
}));

jest.mock('@features/duty-cycle', () => ({
  getDutyPercent: jest.fn().mockReturnValue(50)
}));

jest.mock('@features/high-temp-alerts', () => ({
  updateHighTempAlerts: jest.fn().mockReturnValue({
    instantStart: 0,
    instantFired: false,
    sustainedStart: 0,
    sustainedFired: false
  })
}));

jest.mock('@features/performance-metrics', () => ({
  trackLoopExecution: jest.fn().mockReturnValue({
    performance: {
      loopCount: 1,
      loopTimeSum: 0.1,
      loopTimeMax: 0.1,
      loopTimeMin: 0.1,
      slowLoopCount: 0
    },
    wasSlow: false,
    loopTime: 0.1
  }),
  formatPerformanceSummary: jest.fn().mockReturnValue('Perf summary')
}));

jest.mock('@features/daily-summary', () => ({
  shouldGenerateSummary: jest.fn().mockReturnValue({
    shouldGenerate: false,
    currentDate: '2024-01-01'
  }),
  calculateSummary: jest.fn().mockReturnValue({}),
  formatDailySummary: jest.fn().mockReturnValue('Daily summary')
}));

jest.mock('@utils/time', () => ({
  now: jest.fn().mockReturnValue(1000)
}));

jest.mock('@logging', () => ({
  fmtTemp: jest.fn().mockReturnValue('5.0C')
}));

import {
  applySensorHealthToState,
  processSensorHealth,
  processSmoothing,
  processFreezeProtection,
  processHighTempAlerts,
  processAdaptiveHysteresis,
  executeRelayChange,
  processPerformanceMetrics,
  processDailySummary
} from './helpers';

import { updateSensorHealth } from '@core/sensor-health';
import { updateMovingAverage, isBufferFull } from '@core/smoothing';
import { updateFreezeProtection } from '@core/freeze-protection';
import { updateHighTempAlerts } from '@features/high-temp-alerts';
import { calculateAdaptiveShift } from '@features/adaptive-hysteresis';
import { applyTimingConstraints } from '@core/compressor-timing';
import { setRelay } from '@hardware/relay';
import { trackLoopExecution } from '@features/performance-metrics';
import { shouldGenerateSummary, calculateSummary } from '@features/daily-summary';
import { now } from '@utils/time';

import type { ControllerState } from '@system/state/types';

describe('Control Helpers', () => {
  let mockLogger: any;
  let mockState: ControllerState;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
      critical: jest.fn()
    };

    mockState = {
      airLastReadTime: 0,
      airLastChangeTime: 0,
      airLastRaw: null,
      airNoReadingFired: false,
      airCriticalFailure: false,
      airStuckFired: false,
      evapLastReadTime: 0,
      evapLastChangeTime: 0,
      evapLastRaw: null,
      evapNoReadingFired: false,
      evapCriticalFailure: false,
      evapStuckFired: false,
      airTempBuffer: [],
      evapTempBuffer: [],
      airTempSmoothed: null,
      evapTempSmoothed: null,
      freezeLocked: false,
      lockCount: 0,
      unlockTime: 0,
      dayFreezeCount: 0,
      instantStart: 0,
      instantFired: false,
      sustainedStart: 0,
      sustainedFired: false,
      dayHighTempCount: 0,
      dynOnAbove: 5.0,
      dynOffBelow: 3.0,
      dutyOnSec: 1800,
      dutyOffSec: 1800,
      intendedOn: false,
      lastStateChangeCommand: 0,
      minOnWaitLogged: false,
      minOffWaitLogged: false,
      consecutiveErrors: 0,
      lastOnTime: 0,
      lastOffTime: 0,
      loopCount: 0,
      loopTimeSum: 0,
      loopTimeMax: 0,
      loopTimeMin: Infinity,
      slowLoopCount: 0,
      lastPerfLog: 0,
      dayOnSec: 0,
      dayOffSec: 0,
      dayAirMin: null,
      dayAirMax: null,
      dayAirSum: 0,
      dayAirCount: 0,
      dayEvapMin: null,
      dayEvapMax: null,
      dayEvapSum: 0,
      dayEvapCount: 0,
      lastDailySummaryDate: ''
    } as any;
  });

  describe('applySensorHealthToState', () => {
    it('should apply air sensor health to state', () => {
      const health = {
        lastReadTime: 100,
        lastChangeTime: 90,
        lastRaw: 5.5,
        noReadingFired: true,
        criticalFailure: false,
        stuckFired: true
      };

      applySensorHealthToState(mockState, 'air', health);

      expect(mockState.airLastReadTime).toBe(100);
      expect(mockState.airLastChangeTime).toBe(90);
      expect(mockState.airLastRaw).toBe(5.5);
      expect(mockState.airNoReadingFired).toBe(true);
      expect(mockState.airCriticalFailure).toBe(false);
      expect(mockState.airStuckFired).toBe(true);
    });

    it('should apply evap sensor health to state', () => {
      const health = {
        lastReadTime: 200,
        lastChangeTime: 180,
        lastRaw: -10.0,
        noReadingFired: false,
        criticalFailure: true,
        stuckFired: false
      };

      applySensorHealthToState(mockState, 'evap', health);

      expect(mockState.evapLastReadTime).toBe(200);
      expect(mockState.evapLastChangeTime).toBe(180);
      expect(mockState.evapLastRaw).toBe(-10.0);
      expect(mockState.evapNoReadingFired).toBe(false);
      expect(mockState.evapCriticalFailure).toBe(true);
      expect(mockState.evapStuckFired).toBe(false);
    });
  });

  describe('processSensorHealth', () => {
    const sensors = { airRaw: 5.0, evapRaw: -10.0, relayOn: false };

    it('should return false for healthy sensors', () => {
      const result = processSensorHealth(mockState, sensors, 1000, mockLogger);
      expect(result).toBe(false);
    });

    it('should log warning when air sensor goes offline', () => {
      (updateSensorHealth as jest.Mock).mockReturnValueOnce({
        lastReadTime: 1000,
        lastChangeTime: 1000,
        lastRaw: 5.0,
        noReadingFired: true,
        criticalFailure: false,
        stuckFired: false,
        recovered: false,
        unstuck: false,
        offlineDuration: 30
      });

      processSensorHealth(mockState, sensors, 1000, mockLogger);
      expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining('Air sensor offline'));
    });

    it('should log info when air sensor recovers', () => {
      (updateSensorHealth as jest.Mock).mockReturnValueOnce({
        lastReadTime: 1000,
        lastChangeTime: 1000,
        lastRaw: 5.0,
        noReadingFired: false,
        criticalFailure: false,
        stuckFired: false,
        recovered: true,
        unstuck: false
      });

      processSensorHealth(mockState, sensors, 1000, mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith('Air sensor recovered');
    });

    it('should log warning when air sensor stuck', () => {
      (updateSensorHealth as jest.Mock).mockReturnValueOnce({
        lastReadTime: 1000,
        lastChangeTime: 700,
        lastRaw: 5.0,
        noReadingFired: false,
        criticalFailure: false,
        stuckFired: true,
        recovered: false,
        unstuck: false,
        stuckDuration: 300
      });

      processSensorHealth(mockState, sensors, 1000, mockLogger);
      expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining('Air sensor stuck'));
    });

    it('should log info when air sensor unstuck', () => {
      (updateSensorHealth as jest.Mock).mockReturnValueOnce({
        lastReadTime: 1000,
        lastChangeTime: 1000,
        lastRaw: 5.0,
        noReadingFired: false,
        criticalFailure: false,
        stuckFired: false,
        recovered: false,
        unstuck: true
      });

      processSensorHealth(mockState, sensors, 1000, mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith('Air sensor unstuck');
    });

    it('should return true and force relay off on critical air sensor failure', () => {
      (updateSensorHealth as jest.Mock).mockReturnValueOnce({
        lastReadTime: 1000,
        lastChangeTime: 1000,
        lastRaw: null,
        noReadingFired: true,
        criticalFailure: true,
        stuckFired: false,
        recovered: false,
        unstuck: false
      });

      const result = processSensorHealth(mockState, sensors, 1000, mockLogger);

      expect(result).toBe(true);
      expect(mockLogger.critical).toHaveBeenCalled();
      expect(mockState.intendedOn).toBe(false);
      expect(setRelay).toHaveBeenCalledWith(false, (global as any).Shelly);
    });

    it('should process evap sensor health', () => {
      processSensorHealth(mockState, sensors, 1000, mockLogger);
      expect(updateSensorHealth).toHaveBeenCalledTimes(2);
    });

    it('should log evap sensor warnings', () => {
      // First call for air (normal)
      (updateSensorHealth as jest.Mock).mockReturnValueOnce({
        lastReadTime: 1000,
        lastChangeTime: 1000,
        lastRaw: 5.0,
        noReadingFired: false,
        criticalFailure: false,
        stuckFired: false
      });
      // Second call for evap (offline)
      (updateSensorHealth as jest.Mock).mockReturnValueOnce({
        lastReadTime: 1000,
        lastChangeTime: 1000,
        lastRaw: -10.0,
        noReadingFired: true,
        criticalFailure: false,
        stuckFired: false,
        recovered: false,
        unstuck: false,
        offlineDuration: 30
      });

      processSensorHealth(mockState, sensors, 1000, mockLogger);
      expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining('Evap sensor offline'));
    });
  });

  describe('processSmoothing', () => {
    it('should return smoothed temperatures', () => {
      const sensors = { airRaw: 5.0, evapRaw: -10.0 };
      const result = processSmoothing(mockState, sensors, false, mockLogger);

      expect(result.airDecision).toBeDefined();
      expect(result.evapDecision).toBeDefined();
    });

    it('should update state with smoothed values', () => {
      (updateMovingAverage as jest.Mock).mockReturnValue(4.5);
      const sensors = { airRaw: 5.0, evapRaw: -10.0 };

      processSmoothing(mockState, sensors, false, mockLogger);

      expect(mockState.airTempSmoothed).toBe(4.5);
      expect(mockState.evapTempSmoothed).toBe(4.5);
    });

    it('should return raw values when buffer not full', () => {
      (isBufferFull as jest.Mock).mockReturnValue(false);
      const sensors = { airRaw: 5.0, evapRaw: -10.0 };

      const result = processSmoothing(mockState, sensors, false, mockLogger);

      expect(result.airDecision).toBe(5.0);
      expect(result.evapDecision).toBe(-10.0);
    });

    it('should log debug info when isDebug true', () => {
      const sensors = { airRaw: 5.0, evapRaw: -10.0 };
      processSmoothing(mockState, sensors, true, mockLogger);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle null sensor values', () => {
      const sensors = { airRaw: null, evapRaw: null };
      processSmoothing(mockState, sensors, false, mockLogger);

      expect(updateMovingAverage).not.toHaveBeenCalled();
    });
  });

  describe('processFreezeProtection', () => {
    it('should update freeze protection state', () => {
      (updateFreezeProtection as jest.Mock).mockReturnValue({
        locked: true,
        lockCount: 1,
        unlockTime: 1300
      });

      processFreezeProtection(mockState, -20.0, 1000, false, mockLogger);

      expect(mockState.freezeLocked).toBe(true);
      expect(mockState.lockCount).toBe(1);
      expect(mockState.unlockTime).toBe(1300);
    });

    it('should increment dayFreezeCount when new lock occurs', () => {
      mockState.lockCount = 0;
      (updateFreezeProtection as jest.Mock).mockReturnValue({
        locked: true,
        lockCount: 1,
        unlockTime: 1300
      });

      processFreezeProtection(mockState, -20.0, 1000, false, mockLogger);

      expect(mockState.dayFreezeCount).toBe(1);
    });

    it('should log debug when freeze protection activates', () => {
      (updateFreezeProtection as jest.Mock).mockReturnValue({
        locked: true,
        lockCount: 1,
        unlockTime: 1300
      });

      processFreezeProtection(mockState, -20.0, 1000, true, mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Freeze protection activated'));
    });
  });

  describe('processHighTempAlerts', () => {
    it('should log warning on instant alert', () => {
      (updateHighTempAlerts as jest.Mock).mockReturnValue({
        instantStart: 800,
        instantFired: true,
        sustainedStart: 0,
        sustainedFired: false
      });

      processHighTempAlerts(mockState, 12.0, 1000, mockLogger);

      expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining('HIGH TEMP INSTANT'));
      expect(mockState.dayHighTempCount).toBe(1);
    });

    it('should log warning on sustained alert', () => {
      (updateHighTempAlerts as jest.Mock).mockReturnValue({
        instantStart: 0,
        instantFired: false,
        sustainedStart: 400,
        sustainedFired: true
      });

      processHighTempAlerts(mockState, 12.0, 1000, mockLogger);

      expect(mockLogger.warning).toHaveBeenCalledWith(expect.stringContaining('HIGH TEMP SUSTAINED'));
      expect(mockState.dayHighTempCount).toBe(1);
    });

    it('should log info on instant alert recovery', () => {
      mockState.instantFired = true;
      (updateHighTempAlerts as jest.Mock).mockReturnValue({
        instantStart: 0,
        instantFired: false,
        sustainedStart: 0,
        sustainedFired: false
      });

      processHighTempAlerts(mockState, 5.0, 1000, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('High temp instant alert recovered');
    });

    it('should log info on sustained alert recovery', () => {
      mockState.sustainedFired = true;
      (updateHighTempAlerts as jest.Mock).mockReturnValue({
        instantStart: 0,
        instantFired: false,
        sustainedStart: 0,
        sustainedFired: false
      });

      processHighTempAlerts(mockState, 5.0, 1000, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('High temp sustained alert recovered');
    });
  });

  describe('processAdaptiveHysteresis', () => {
    it('should update dynamic thresholds when shift changes', () => {
      (calculateAdaptiveShift as jest.Mock).mockReturnValue({
        newShift: 0.2,
        changed: true
      });

      processAdaptiveHysteresis(mockState, false, mockLogger);

      expect(mockState.dynOnAbove).toBe(5.2);
      expect(mockState.dynOffBelow).toBe(2.8);
    });

    it('should not update thresholds when no change', () => {
      mockState.dynOnAbove = 5.0;
      mockState.dynOffBelow = 3.0;
      (calculateAdaptiveShift as jest.Mock).mockReturnValue({
        newShift: 0,
        changed: false
      });

      processAdaptiveHysteresis(mockState, false, mockLogger);

      expect(mockState.dynOnAbove).toBe(5.0);
      expect(mockState.dynOffBelow).toBe(3.0);
    });

    it('should log debug when shift changes', () => {
      (calculateAdaptiveShift as jest.Mock).mockReturnValue({
        newShift: 0.3,
        changed: true
      });

      processAdaptiveHysteresis(mockState, true, mockLogger);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Adaptive'));
    });
  });

  describe('executeRelayChange', () => {
    const sensors = { relayOn: false, airRaw: 5.0, evapRaw: -10.0 };

    it('should not change relay when timing constraints not met', () => {
      (applyTimingConstraints as jest.Mock).mockReturnValue({ allow: false });

      executeRelayChange(mockState, sensors, true, 1000, 5.0, -10.0, mockLogger);

      expect(setRelay).not.toHaveBeenCalled();
    });

    it('should update state and call setRelay when allowed', () => {
      (applyTimingConstraints as jest.Mock).mockReturnValue({ allow: true });

      executeRelayChange(mockState, sensors, true, 1000, 5.0, -10.0, mockLogger);

      expect(mockState.intendedOn).toBe(true);
      expect(mockState.lastStateChangeCommand).toBe(1000);
      expect(setRelay).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should log compressor ON message', () => {
      (applyTimingConstraints as jest.Mock).mockReturnValue({ allow: true });

      executeRelayChange(mockState, sensors, true, 1000, 5.0, -10.0, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Compressor ON'));
    });

    it('should log compressor OFF message', () => {
      (applyTimingConstraints as jest.Mock).mockReturnValue({ allow: true });

      executeRelayChange(mockState, { ...sensors, relayOn: true }, false, 1000, 5.0, -10.0, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Compressor OFF'));
    });
  });

  describe('processPerformanceMetrics', () => {
    it('should update performance state', () => {
      processPerformanceMetrics(mockState, 1000, mockLogger);

      expect(mockState.loopCount).toBe(1);
      expect(trackLoopExecution).toHaveBeenCalled();
    });

    it('should log performance summary at interval', () => {
      mockState.lastPerfLog = 0;
      (now as jest.Mock).mockReturnValue(4000);

      processPerformanceMetrics(mockState, 1000, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('Perf summary');
      expect(mockState.lastPerfLog).toBe(4000);
    });
  });

  describe('processDailySummary', () => {
    it('should not generate summary when not needed', () => {
      (shouldGenerateSummary as jest.Mock).mockReturnValue({
        shouldGenerate: false,
        currentDate: '2024-01-01'
      });

      processDailySummary(mockState, 1000, mockLogger);

      expect(calculateSummary).not.toHaveBeenCalled();
    });

    it('should generate and log summary when needed', () => {
      (shouldGenerateSummary as jest.Mock).mockReturnValue({
        shouldGenerate: true,
        currentDate: '2024-01-02'
      });

      processDailySummary(mockState, 1000, mockLogger);

      expect(calculateSummary).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Daily summary');
    });

    it('should reset daily stats after summary', () => {
      mockState.dayOnSec = 1000;
      mockState.dayOffSec = 2000;
      mockState.dayAirMin = 3.0;
      mockState.dayAirMax = 7.0;
      mockState.dayFreezeCount = 2;
      mockState.dayHighTempCount = 1;

      (shouldGenerateSummary as jest.Mock).mockReturnValue({
        shouldGenerate: true,
        currentDate: '2024-01-02'
      });

      processDailySummary(mockState, 1000, mockLogger);

      expect(mockState.dayOnSec).toBe(0);
      expect(mockState.dayOffSec).toBe(0);
      expect(mockState.dayAirMin).toBeNull();
      expect(mockState.dayAirMax).toBeNull();
      expect(mockState.dayFreezeCount).toBe(0);
      expect(mockState.dayHighTempCount).toBe(0);
      expect(mockState.lastDailySummaryDate).toBe('2024-01-02');
    });
  });
});
