/**
 * Tests for time helper functions
 */

import { calculateTimeDelta } from './helpers';

describe('calculateTimeDelta', () => {
  describe('normal operation', () => {
    it('should calculate time delta between two timestamps', () => {
      const result = calculateTimeDelta(1000, 995, 5000);
      expect(result).toBe(5);
    });

    it('should handle small deltas', () => {
      const result = calculateTimeDelta(100, 99, 5000);
      expect(result).toBe(1);
    });

    it('should handle large deltas', () => {
      const result = calculateTimeDelta(10000, 1000, 5000);
      expect(result).toBe(9000);
    });

    it('should handle fractional loop periods', () => {
      const result = calculateTimeDelta(100, 99, 2500);
      expect(result).toBe(1);
    });
  });

  describe('initial state (lastTime = 0)', () => {
    it('should return loop period in seconds when lastTime is 0', () => {
      const result = calculateTimeDelta(1000, 0, 5000);
      expect(result).toBe(5);
    });

    it('should return correct value for different loop periods', () => {
      expect(calculateTimeDelta(1000, 0, 2000)).toBe(2);
      expect(calculateTimeDelta(1000, 0, 10000)).toBe(10);
      expect(calculateTimeDelta(1000, 0, 1000)).toBe(1);
    });

    it('should handle fractional loop periods on initial state', () => {
      const result = calculateTimeDelta(1000, 0, 2500);
      expect(result).toBe(2.5);
    });
  });

  describe('clock issues (dt <= 0)', () => {
    it('should return loop period when currentTime equals lastTime', () => {
      const result = calculateTimeDelta(1000, 1000, 5000);
      expect(result).toBe(5);
    });

    it('should return loop period when currentTime is before lastTime (clock skew)', () => {
      const result = calculateTimeDelta(1000, 1005, 5000);
      expect(result).toBe(5);
    });

    it('should return loop period for large negative delta', () => {
      const result = calculateTimeDelta(100, 1000, 5000);
      expect(result).toBe(5);
    });

    it('should use loop period for different values on negative delta', () => {
      expect(calculateTimeDelta(100, 200, 3000)).toBe(3);
      expect(calculateTimeDelta(50, 100, 7000)).toBe(7);
    });
  });

  describe('edge cases', () => {
    it('should handle zero loop period', () => {
      const result = calculateTimeDelta(100, 0, 0);
      expect(result).toBe(0);
    });

    it('should handle very small loop periods', () => {
      const result = calculateTimeDelta(100, 0, 100);
      expect(result).toBe(0.1);
    });

    it('should handle very large timestamps', () => {
      const result = calculateTimeDelta(2000000000, 1999999995, 5000);
      expect(result).toBe(5);
    });

    it('should handle delta of exactly 1', () => {
      const result = calculateTimeDelta(101, 100, 5000);
      expect(result).toBe(1);
    });

    it('should return actual delta even if different from loop period', () => {
      // If dt = 3s but loop period is 5s, return actual dt
      const result = calculateTimeDelta(103, 100, 5000);
      expect(result).toBe(3);
    });
  });
});
