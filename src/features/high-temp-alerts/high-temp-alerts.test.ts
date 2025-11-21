/**
 * Unit tests for high temperature alerts
 */

import {
  updateHighTempAlerts,
  initHighTempAlertState,
  isInstantAlertActive,
  isSustainedAlertActive,
} from './high-temp-alerts';
import type { HighTempAlertState, HighTempAlertConfig } from './types';

const createMockConfig = (): HighTempAlertConfig => ({
  HIGH_TEMP_INSTANT_THRESHOLD_C: 10.0,
  HIGH_TEMP_INSTANT_DELAY_SEC: 60,
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: 8.0,
  HIGH_TEMP_SUSTAINED_DELAY_SEC: 300,
});

describe('High Temperature Alerts', () => {
  // ═══════════════════════════════════════════════════════════════
  // initHighTempAlertState()
  // ═══════════════════════════════════════════════════════════════

  describe('initHighTempAlertState', () => {
    it('should return fresh state with all tracking reset', () => {
      const state = initHighTempAlertState();

      expect(state.instant.startTime).toBe(0);
      expect(state.instant.fired).toBe(false);
      expect(state.sustained.startTime).toBe(0);
      expect(state.sustained.fired).toBe(false);
      expect(state.justFired).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // updateHighTempAlerts() - Instant Alert
  // ═══════════════════════════════════════════════════════════════

  describe('instant alert', () => {
    it('should start tracking when temp exceeds threshold', () => {
      const config = createMockConfig();
      const state = initHighTempAlertState();
      const now = 1000;

      const result = updateHighTempAlerts(10.5, now, state, config);

      expect(result.instant.startTime).toBe(now);
      expect(result.instant.fired).toBe(false);
      expect(result.justFired).toBe(false);
    });

    it('should fire alert after delay elapses', () => {
      const config = createMockConfig();
      const state: HighTempAlertState = {
        instant: { startTime: 1000, fired: false },
        sustained: { startTime: 0, fired: false },
        justFired: false,
      };

      const result = updateHighTempAlerts(10.5, 1060, state, config);

      expect(result.instant.fired).toBe(true);
      expect(result.justFired).toBe(true);
    });

    it('should not fire again once already fired', () => {
      const config = createMockConfig();
      const state: HighTempAlertState = {
        instant: { startTime: 1000, fired: true },
        sustained: { startTime: 0, fired: false },
        justFired: false,
      };

      const result = updateHighTempAlerts(10.5, 1100, state, config);

      expect(result.instant.fired).toBe(true);
      expect(result.justFired).toBe(false);
    });

    it('should reset when temp drops below threshold', () => {
      const config = createMockConfig();
      const state: HighTempAlertState = {
        instant: { startTime: 1000, fired: true },
        sustained: { startTime: 0, fired: false },
        justFired: false,
      };

      const result = updateHighTempAlerts(9.0, 1100, state, config);

      expect(result.instant.startTime).toBe(0);
      expect(result.instant.fired).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // updateHighTempAlerts() - Sustained Alert
  // ═══════════════════════════════════════════════════════════════

  describe('sustained alert', () => {
    it('should track independently from instant alert', () => {
      const config = createMockConfig();
      const state = initHighTempAlertState();

      // 8.5°C exceeds sustained (8.0) but not instant (10.0)
      const result = updateHighTempAlerts(8.5, 1000, state, config);

      expect(result.sustained.startTime).toBe(1000);
      expect(result.instant.startTime).toBe(0);
    });

    it('should fire after its own delay', () => {
      const config = createMockConfig();
      const state: HighTempAlertState = {
        instant: { startTime: 0, fired: false },
        sustained: { startTime: 1000, fired: false },
        justFired: false,
      };

      const result = updateHighTempAlerts(8.5, 1300, state, config);

      expect(result.sustained.fired).toBe(true);
      expect(result.justFired).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Null temperature handling
  // ═══════════════════════════════════════════════════════════════

  describe('null temperature', () => {
    it('should reset all tracking on null temperature', () => {
      const config = createMockConfig();
      const state: HighTempAlertState = {
        instant: { startTime: 1000, fired: true },
        sustained: { startTime: 1000, fired: true },
        justFired: false,
      };

      const result = updateHighTempAlerts(null, 1100, state, config);

      expect(result.instant.startTime).toBe(0);
      expect(result.instant.fired).toBe(false);
      expect(result.sustained.startTime).toBe(0);
      expect(result.sustained.fired).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Both alerts firing
  // ═══════════════════════════════════════════════════════════════

  describe('both alerts', () => {
    it('should set justFired when either alert fires', () => {
      const config = createMockConfig();

      // Instant fires
      const state1: HighTempAlertState = {
        instant: { startTime: 1000, fired: false },
        sustained: { startTime: 0, fired: false },
        justFired: false,
      };
      const result1 = updateHighTempAlerts(10.5, 1060, state1, config);
      expect(result1.justFired).toBe(true);

      // Sustained fires
      const state2: HighTempAlertState = {
        instant: { startTime: 0, fired: false },
        sustained: { startTime: 1000, fired: false },
        justFired: false,
      };
      const result2 = updateHighTempAlerts(8.5, 1300, state2, config);
      expect(result2.justFired).toBe(true);
    });

    it('should track both when temp exceeds both thresholds', () => {
      const config = createMockConfig();
      const state = initHighTempAlertState();

      const result = updateHighTempAlerts(12.0, 1000, state, config);

      expect(result.instant.startTime).toBe(1000);
      expect(result.sustained.startTime).toBe(1000);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Helper functions
  // ═══════════════════════════════════════════════════════════════

  describe('isInstantAlertActive', () => {
    it('should return true when instant alert is fired', () => {
      const state: HighTempAlertState = {
        instant: { startTime: 1000, fired: true },
        sustained: { startTime: 0, fired: false },
        justFired: false,
      };

      expect(isInstantAlertActive(state)).toBe(true);
    });

    it('should return false when instant alert not fired', () => {
      const state = initHighTempAlertState();
      expect(isInstantAlertActive(state)).toBe(false);
    });
  });

  describe('isSustainedAlertActive', () => {
    it('should return true when sustained alert is fired', () => {
      const state: HighTempAlertState = {
        instant: { startTime: 0, fired: false },
        sustained: { startTime: 1000, fired: true },
        justFired: false,
      };

      expect(isSustainedAlertActive(state)).toBe(true);
    });
  });
});
