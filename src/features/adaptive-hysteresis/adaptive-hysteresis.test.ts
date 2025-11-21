/**
 * Unit tests for adaptive hysteresis
 */

import { calculateAdaptiveShift } from './adaptive-hysteresis';
import type { FridgeConfig } from '$types/config';

const createMockConfig = (overrides?: Partial<FridgeConfig>): FridgeConfig => ({
  ADAPTIVE_HIGH_DUTY_PCT: 70,
  ADAPTIVE_LOW_DUTY_PCT: 30,
  ADAPTIVE_MAX_SHIFT_C: 1.0,
  ADAPTIVE_MIN_SHIFT_C: 0,
  ADAPTIVE_SHIFT_STEP_C: 0.1,
  ...overrides,
} as FridgeConfig);

describe('calculateAdaptiveShift', () => {
  describe('high duty cycle (widen hysteresis)', () => {
    it('should increase shift when duty exceeds high threshold', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(75, 0.3, config);

      expect(result.changed).toBe(true);
      expect(result.newShift).toBe(0.4);
    });

    it('should not exceed maximum shift', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(80, 0.95, config);

      expect(result.changed).toBe(true);
      expect(result.newShift).toBe(1.0);
    });

    it('should not change when already at maximum', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(80, 1.0, config);

      expect(result.changed).toBe(false);
      expect(result.newShift).toBe(1.0);
    });
  });

  describe('low duty cycle (tighten hysteresis)', () => {
    it('should decrease shift when duty below low threshold', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(25, 0.5, config);

      expect(result.changed).toBe(true);
      expect(result.newShift).toBe(0.4);
    });

    it('should not go below minimum shift', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(20, 0.05, config);

      expect(result.changed).toBe(true);
      expect(result.newShift).toBe(0);
    });

    it('should not change when already at minimum', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(20, 0, config);

      expect(result.changed).toBe(false);
      expect(result.newShift).toBe(0);
    });
  });

  describe('normal duty cycle (no change)', () => {
    it('should not change when duty is in normal range', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(50, 0.5, config);

      expect(result.changed).toBe(false);
      expect(result.newShift).toBe(0.5);
    });

    it('should not change at exactly high threshold', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(70, 0.5, config);

      expect(result.changed).toBe(false);
    });

    it('should not change at exactly low threshold', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(30, 0.5, config);

      expect(result.changed).toBe(false);
    });
  });

  describe('edge cases and validation', () => {
    it('should handle NaN duty percent', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(NaN, 0.5, config);

      expect(result.changed).toBe(false);
      expect(result.newShift).toBe(0.5);
    });

    it('should handle NaN current shift', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(50, NaN, config);

      expect(result.changed).toBe(false);
      expect(result.newShift).toBeNaN();
    });

    it('should handle Infinity values', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(Infinity, 0.5, config);

      expect(result.changed).toBe(false);
    });

    it('should round to avoid float drift', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(75, 0.1 + 0.1 + 0.1, config);

      expect(result.newShift).toBe(0.4);
    });

    it('should handle zero duty percent', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(0, 0.5, config);

      expect(result.changed).toBe(true);
      expect(result.newShift).toBe(0.4);
    });

    it('should handle 100% duty percent', () => {
      const config = createMockConfig();
      const result = calculateAdaptiveShift(100, 0.5, config);

      expect(result.changed).toBe(true);
      expect(result.newShift).toBe(0.6);
    });
  });
});
