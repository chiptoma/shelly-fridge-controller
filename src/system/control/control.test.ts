/**
 * Tests for control loop implementation
 */

// Mock Shelly globals using any cast to avoid redeclaration errors
(global as any).Shelly = {
  call: jest.fn(),
  getComponentStatus: jest.fn(),
  getComponentConfig: jest.fn(),
  emitEvent: jest.fn()
};
(global as any).Timer = { set: jest.fn(), clear: jest.fn() };
(global as any).MQTT = { publish: jest.fn(), subscribe: jest.fn() };

// Mock all dependencies
jest.mock('@boot/config', () => ({
  __esModule: true,
  default: {
    AIR_SENSOR_ID: 101,
    EVAP_SENSOR_ID: 100,
    RELAY_ID: 0,
    LOOP_PERIOD_MS: 5000,
    FEATURE_SENSOR_FAILURE: true,
    FEATURE_HIGH_TEMP_ALERTS: true,
    FEATURE_ADAPTIVE_HYSTERESIS: true,
    FEATURE_PERFORMANCE_METRICS: true,
    FEATURE_DAILY_SUMMARY: true,
    RELAY_RESPONSE_TIMEOUT_SEC: 2,
    AIR_SENSOR_SMOOTHING_SEC: 30,
    EVAP_SENSOR_SMOOTHING_SEC: 10,
    SETPOINT_C: 4.0,
    HYSTERESIS_C: 1.0,
    PERF_SLOW_LOOP_THRESHOLD_MS: 250,
    PERF_LOG_INTERVAL_SEC: 3600,
    DAILY_SUMMARY_HOUR: 7
  }
}));

jest.mock('@hardware/sensors', () => ({
  readAllSensors: jest.fn()
}));

jest.mock('@utils/time', () => ({
  now: jest.fn(),
  calculateTimeDelta: jest.fn()
}));

jest.mock('@core/thermostat', () => ({
  decideCooling: jest.fn()
}));

jest.mock('@hardware/relay', () => ({
  validateRelayState: jest.fn()
}));

jest.mock('@features/duty-cycle', () => ({
  updateDutyCycle: jest.fn()
}));

jest.mock('@features/daily-summary', () => ({
  updateDailyStats: jest.fn(),
  updateDailyRuntime: jest.fn()
}));

jest.mock('./helpers', () => ({
  processSensorHealth: jest.fn(),
  processSmoothing: jest.fn(),
  processFreezeProtection: jest.fn(),
  processHighTempAlerts: jest.fn(),
  processAdaptiveHysteresis: jest.fn(),
  executeRelayChange: jest.fn(),
  processPerformanceMetrics: jest.fn(),
  processDailySummary: jest.fn()
}));

import { run } from './control';
import { readAllSensors } from '@hardware/sensors';
import { now, calculateTimeDelta } from '@utils/time';
import { decideCooling } from '@core/thermostat';
import { validateRelayState } from '@hardware/relay';
import { updateDutyCycle } from '@features/duty-cycle';
import { updateDailyStats, updateDailyRuntime } from '@features/daily-summary';
import {
  processSensorHealth,
  processSmoothing,
  processFreezeProtection,
  processHighTempAlerts,
  processAdaptiveHysteresis,
  executeRelayChange,
  processPerformanceMetrics,
  processDailySummary
} from './helpers';

import type { Controller } from './types';

describe('Control Loop', () => {
  let mockController: Controller;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
      critical: jest.fn()
    };

    mockController = {
      state: {
        lastLoopTime: 0,
        confirmedOn: false,
        intendedOn: false,
        lastStateChangeCommand: 0,
        consecutiveErrors: 0,
        freezeLocked: false,
        dynOnAbove: 5.0,
        dynOffBelow: 3.0,
        lastWatchdogPet: 0,
        airTempBuffer: [],
        evapTempBuffer: [],
        airTempSmoothed: null,
        evapTempSmoothed: null,
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
        evapStuckFired: false
      } as any,
      logger: mockLogger,
      isDebug: false
    };

    // Default mock implementations
    (now as jest.Mock).mockReturnValue(1000);
    (calculateTimeDelta as jest.Mock).mockReturnValue(5);
    (readAllSensors as jest.Mock).mockReturnValue({
      airRaw: 5.0,
      evapRaw: -10.0,
      relayOn: false
    });
    (processSensorHealth as jest.Mock).mockReturnValue(false);
    (processSmoothing as jest.Mock).mockReturnValue({
      airDecision: 5.0,
      evapDecision: -10.0
    });
    (validateRelayState as jest.Mock).mockReturnValue({
      valid: true,
      waitingForResponse: false
    });
    (decideCooling as jest.Mock).mockReturnValue(false);
  });

  describe('normal operation', () => {
    it('should run complete control loop', () => {
      run(mockController);

      expect(now).toHaveBeenCalled();
      expect(readAllSensors).toHaveBeenCalled();
      expect(calculateTimeDelta).toHaveBeenCalled();
      expect(processSmoothing).toHaveBeenCalled();
      expect(processFreezeProtection).toHaveBeenCalled();
      expect(validateRelayState).toHaveBeenCalled();
      expect(decideCooling).toHaveBeenCalled();
      expect(updateDutyCycle).toHaveBeenCalled();
      expect(updateDailyStats).toHaveBeenCalled();
      expect(updateDailyRuntime).toHaveBeenCalled();
    });

    it('should update lastLoopTime', () => {
      (now as jest.Mock).mockReturnValue(2000);
      run(mockController);
      expect(mockController.state.lastLoopTime).toBe(2000);
    });

    it('should update lastWatchdogPet', () => {
      (now as jest.Mock).mockReturnValue(3000);
      run(mockController);
      expect(mockController.state.lastWatchdogPet).toBe(3000);
    });

    it('should log debug info when isDebug is true', () => {
      mockController.isDebug = true;
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should not log debug info when isDebug is false', () => {
      mockController.isDebug = false;
      run(mockController);
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should log debug info with null air sensor value', () => {
      mockController.isDebug = true;
      (readAllSensors as jest.Mock).mockReturnValue({
        airRaw: null,
        evapRaw: -10.0,
        relayOn: false
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('n/a')
      );
    });

    it('should log debug info with null evap sensor value', () => {
      mockController.isDebug = true;
      (readAllSensors as jest.Mock).mockReturnValue({
        airRaw: 5.0,
        evapRaw: null,
        relayOn: false
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('n/a')
      );
    });

    it('should log debug info with relay ON', () => {
      mockController.isDebug = true;
      (readAllSensors as jest.Mock).mockReturnValue({
        airRaw: 5.0,
        evapRaw: -10.0,
        relayOn: true
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Relay=ON')
      );
    });

    it('should log smoothed temps when buffers are full', () => {
      mockController.isDebug = true;
      (processSmoothing as jest.Mock).mockReturnValue({
        airDecision: 5.5,
        evapDecision: -10.5,
        airBufferFull: true,
        evapBufferFull: true
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('smoothed')
      );
    });

    it('should log raw temps when buffers are not full', () => {
      mockController.isDebug = true;
      (processSmoothing as jest.Mock).mockReturnValue({
        airDecision: 5.0,
        evapDecision: -10.0,
        airBufferFull: false,
        evapBufferFull: false
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('buffer filling')
      );
    });

    it('should handle null airDecision when buffer is full', () => {
      mockController.isDebug = true;
      (processSmoothing as jest.Mock).mockReturnValue({
        airDecision: null,
        evapDecision: -10.0,
        airBufferFull: true,
        evapBufferFull: true
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('n/a')
      );
    });

    it('should handle null evapDecision when buffer is full', () => {
      mockController.isDebug = true;
      (processSmoothing as jest.Mock).mockReturnValue({
        airDecision: 5.0,
        evapDecision: null,
        airBufferFull: true,
        evapBufferFull: true
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('n/a')
      );
    });

    it('should handle null raw sensors when buffers are full with smoothed values', () => {
      mockController.isDebug = true;
      (readAllSensors as jest.Mock).mockReturnValue({
        airRaw: null,
        evapRaw: null,
        relayOn: false
      });
      (processSmoothing as jest.Mock).mockReturnValue({
        airDecision: 5.0,
        evapDecision: -10.0,
        airBufferFull: true,
        evapBufferFull: true
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('n/a')
      );
    });
  });

  describe('sensor health processing', () => {
    it('should process sensor health when feature enabled', () => {
      run(mockController);
      expect(processSensorHealth).toHaveBeenCalled();
    });

    it('should skip normal control on critical sensor failure', () => {
      (processSensorHealth as jest.Mock).mockReturnValue(true);
      run(mockController);

      // Should not proceed to smoothing and other steps
      expect(processSmoothing).not.toHaveBeenCalled();
    });
  });

  describe('relay state validation', () => {
    it('should update confirmedOn based on sensor relay state', () => {
      (readAllSensors as jest.Mock).mockReturnValue({
        airRaw: 5.0,
        evapRaw: -10.0,
        relayOn: true
      });
      run(mockController);
      expect(mockController.state.confirmedOn).toBe(true);
    });

    it('should skip control when waiting for relay response', () => {
      (validateRelayState as jest.Mock).mockReturnValue({
        valid: true,
        waitingForResponse: true
      });
      run(mockController);

      // Should not call decideCooling when waiting
      expect(decideCooling).not.toHaveBeenCalled();
    });

    it('should log critical error when relay stuck', () => {
      (validateRelayState as jest.Mock).mockReturnValue({
        valid: false,
        stuck: true,
        intended: true,
        reported: false,
        elapsed: 10
      });
      run(mockController);

      expect(mockLogger.critical).toHaveBeenCalled();
      expect(mockController.state.consecutiveErrors).toBe(1);
    });

    it('should log critical error when relay stuck OFF->ON', () => {
      (validateRelayState as jest.Mock).mockReturnValue({
        valid: false,
        stuck: true,
        intended: false,
        reported: true,
        elapsed: 15
      });
      run(mockController);

      expect(mockLogger.critical).toHaveBeenCalledWith(
        expect.stringContaining('OFF')
      );
      expect(mockController.state.consecutiveErrors).toBe(1);
    });
  });

  describe('relay state changes', () => {
    it('should execute relay change when cooling decision differs', () => {
      (decideCooling as jest.Mock).mockReturnValue(true);
      (readAllSensors as jest.Mock).mockReturnValue({
        airRaw: 5.0,
        evapRaw: -10.0,
        relayOn: false
      });
      run(mockController);
      expect(executeRelayChange).toHaveBeenCalled();
    });

    it('should not execute relay change when state matches', () => {
      (decideCooling as jest.Mock).mockReturnValue(false);
      (readAllSensors as jest.Mock).mockReturnValue({
        airRaw: 5.0,
        evapRaw: -10.0,
        relayOn: false
      });
      run(mockController);
      expect(executeRelayChange).not.toHaveBeenCalled();
    });
  });

  describe('feature processing', () => {
    it('should process high temp alerts when feature enabled', () => {
      run(mockController);
      expect(processHighTempAlerts).toHaveBeenCalled();
    });

    it('should process adaptive hysteresis when feature enabled', () => {
      run(mockController);
      expect(processAdaptiveHysteresis).toHaveBeenCalled();
    });

    it('should process performance metrics when feature enabled', () => {
      run(mockController);
      expect(processPerformanceMetrics).toHaveBeenCalled();
    });

    it('should process daily summary when feature enabled', () => {
      run(mockController);
      expect(processDailySummary).toHaveBeenCalled();
    });

    it('should log debug message when freeze protection activates', () => {
      mockController.isDebug = true;
      (mockController.state as any).dayFreezeCount = 3;
      (processFreezeProtection as jest.Mock).mockReturnValue(true);
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Freeze protection activated')
      );
    });

    it('should log debug message when adaptive hysteresis adjusts', () => {
      mockController.isDebug = true;
      (processAdaptiveHysteresis as jest.Mock).mockReturnValue({
        dutyPercent: 75.5,
        newShift: 0.25
      });
      run(mockController);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Adaptive: duty=')
      );
    });
  });

  describe('error handling', () => {
    it('should catch and log errors', () => {
      (readAllSensors as jest.Mock).mockImplementation(() => {
        throw new Error('Sensor read failed');
      });
      run(mockController);

      expect(mockLogger.critical).toHaveBeenCalledWith(
        expect.stringContaining('Control loop crashed')
      );
      expect(mockController.state.consecutiveErrors).toBe(1);
    });

    it('should handle non-Error exceptions', () => {
      (readAllSensors as jest.Mock).mockImplementation(() => {
        throw 'String error';
      });
      run(mockController);

      expect(mockLogger.critical).toHaveBeenCalled();
      expect(mockController.state.consecutiveErrors).toBe(1);
    });
  });
});
