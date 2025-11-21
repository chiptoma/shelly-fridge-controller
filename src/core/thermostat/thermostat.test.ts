import { decideCooling, calculateThresholds } from './thermostat';
import type { ThermostatState } from './types';

describe('thermostat', () => {
  describe('decideCooling', () => {
    const defaultState: ThermostatState = {
      freezeLocked: false,
      dynOnAbove: 5.0,
      dynOffBelow: 3.0
    };

    describe('freeze protection override', () => {
      it('should return false when freeze locked', () => {
        const state = { ...defaultState, freezeLocked: true };
        expect(decideCooling(10.0, true, state)).toBe(false);
        expect(decideCooling(10.0, false, state)).toBe(false);
      });

      it('should apply normal logic when not locked', () => {
        const state = { ...defaultState, freezeLocked: false };
        expect(decideCooling(6.0, false, state)).toBe(true);
      });
    });

    describe('null sensor handling', () => {
      it('should maintain ON state when sensor is null', () => {
        expect(decideCooling(null, true, defaultState)).toBe(true);
      });

      it('should maintain OFF state when sensor is null', () => {
        expect(decideCooling(null, false, defaultState)).toBe(false);
      });
    });

    describe('hysteresis control when ON', () => {
      it('should stay ON when temp is above lower threshold', () => {
        expect(decideCooling(4.0, true, defaultState)).toBe(true);
      });

      it('should turn OFF when temp drops to lower threshold', () => {
        expect(decideCooling(3.0, true, defaultState)).toBe(false);
      });

      it('should turn OFF when temp drops below lower threshold', () => {
        expect(decideCooling(2.5, true, defaultState)).toBe(false);
      });
    });

    describe('hysteresis control when OFF', () => {
      it('should stay OFF when temp is below upper threshold', () => {
        expect(decideCooling(4.0, false, defaultState)).toBe(false);
      });

      it('should turn ON when temp rises to upper threshold', () => {
        expect(decideCooling(5.0, false, defaultState)).toBe(true);
      });

      it('should turn ON when temp rises above upper threshold', () => {
        expect(decideCooling(6.0, false, defaultState)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle temperature at lower boundary when ON', () => {
        // 3.01 should stay on (> 3.0)
        expect(decideCooling(3.01, true, defaultState)).toBe(true);
      });

      it('should handle temperature at upper boundary when OFF', () => {
        // 4.99 should stay off (< 5.0)
        expect(decideCooling(4.99, false, defaultState)).toBe(false);
      });
    });
  });

  describe('calculateThresholds', () => {
    it('should calculate correct thresholds', () => {
      const result = calculateThresholds(4.0, 1.0);
      expect(result.onAbove).toBe(5.0);
      expect(result.offBelow).toBe(3.0);
    });

    it('should handle zero hysteresis', () => {
      const result = calculateThresholds(4.0, 0);
      expect(result.onAbove).toBe(4.0);
      expect(result.offBelow).toBe(4.0);
    });

    it('should handle negative setpoint', () => {
      const result = calculateThresholds(-2.0, 1.0);
      expect(result.onAbove).toBe(-1.0);
      expect(result.offBelow).toBe(-3.0);
    });

    it('should handle fractional values', () => {
      const result = calculateThresholds(4.5, 0.5);
      expect(result.onAbove).toBe(5.0);
      expect(result.offBelow).toBe(4.0);
    });
  });
});
