/**
 * Tests for sensor helper functions
 */

import { isValidReading } from './helpers';

describe('isValidReading', () => {
  describe('valid readings', () => {
    it('should return true for normal positive temperature', () => {
      expect(isValidReading(25.5)).toBe(true);
    });

    it('should return true for normal negative temperature', () => {
      expect(isValidReading(-10.0)).toBe(true);
    });

    it('should return true for zero', () => {
      expect(isValidReading(0)).toBe(true);
    });

    it('should return true for integer values', () => {
      expect(isValidReading(20)).toBe(true);
      expect(isValidReading(-5)).toBe(true);
    });

    it('should return true for typical fridge temperatures', () => {
      expect(isValidReading(4.0)).toBe(true);
      expect(isValidReading(3.5)).toBe(true);
      expect(isValidReading(5.2)).toBe(true);
    });

    it('should return true for evaporator temperatures', () => {
      expect(isValidReading(-15.0)).toBe(true);
      expect(isValidReading(-20.5)).toBe(true);
    });
  });

  describe('boundary values (DS18B20 sensor range)', () => {
    it('should return true at lower boundary -55C', () => {
      expect(isValidReading(-55)).toBe(true);
    });

    it('should return true at upper boundary 125C', () => {
      expect(isValidReading(125)).toBe(true);
    });

    it('should return false just below lower boundary', () => {
      expect(isValidReading(-55.1)).toBe(false);
    });

    it('should return false just above upper boundary', () => {
      expect(isValidReading(125.1)).toBe(false);
    });

    it('should return false for extreme low values', () => {
      expect(isValidReading(-100)).toBe(false);
      expect(isValidReading(-1000)).toBe(false);
    });

    it('should return false for extreme high values', () => {
      expect(isValidReading(200)).toBe(false);
      expect(isValidReading(1000)).toBe(false);
    });
  });

  describe('null and undefined', () => {
    it('should return false for null', () => {
      expect(isValidReading(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidReading(undefined as any)).toBe(false);
    });
  });

  describe('NaN and Infinity', () => {
    it('should return false for NaN', () => {
      expect(isValidReading(NaN)).toBe(false);
    });

    it('should return false for positive Infinity', () => {
      expect(isValidReading(Infinity)).toBe(false);
    });

    it('should return false for negative Infinity', () => {
      expect(isValidReading(-Infinity)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle very small decimal values', () => {
      expect(isValidReading(0.001)).toBe(true);
      expect(isValidReading(-0.001)).toBe(true);
    });

    it('should handle negative zero', () => {
      expect(isValidReading(-0)).toBe(true);
    });

    it('should handle values near boundaries', () => {
      expect(isValidReading(-54.9)).toBe(true);
      expect(isValidReading(124.9)).toBe(true);
    });

    it('should handle precise boundary values', () => {
      expect(isValidReading(-55.0)).toBe(true);
      expect(isValidReading(125.0)).toBe(true);
    });
  });
});
