/**
 * Tests for time utility functions
 */

import { now, nowMs } from './time';

describe('Time Utilities', () => {
  describe('now', () => {
    it('should return current Unix timestamp in seconds', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = now();
      const after = Math.floor(Date.now() / 1000);

      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('should return an integer', () => {
      const result = now();
      expect(Number.isInteger(result)).toBe(true);
    });

    it('should be consistent with Date.now()', () => {
      const dateNowSec = Math.floor(Date.now() / 1000);
      const result = now();
      expect(Math.abs(result - dateNowSec)).toBeLessThanOrEqual(1);
    });

    it('should return positive number', () => {
      const result = now();
      expect(result).toBeGreaterThan(0);
    });

    it('should return reasonable Unix timestamp (after year 2020)', () => {
      const result = now();
      const year2020 = 1577836800; // Jan 1, 2020
      expect(result).toBeGreaterThan(year2020);
    });
  });

  describe('nowMs', () => {
    it('should return current timestamp in milliseconds', () => {
      const before = Date.now();
      const result = nowMs();
      const after = Date.now();

      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('should be approximately 1000x now()', () => {
      const seconds = now();
      const milliseconds = nowMs();
      const ratio = milliseconds / seconds;

      expect(ratio).toBeGreaterThanOrEqual(999);
      expect(ratio).toBeLessThanOrEqual(1001);
    });

    it('should return positive number', () => {
      const result = nowMs();
      expect(result).toBeGreaterThan(0);
    });

    it('should return reasonable timestamp (after year 2020)', () => {
      const result = nowMs();
      const year2020Ms = 1577836800000; // Jan 1, 2020 in ms
      expect(result).toBeGreaterThan(year2020Ms);
    });

    it('should be consistent with Date.now()', () => {
      const dateNow = Date.now();
      const result = nowMs();
      expect(Math.abs(result - dateNow)).toBeLessThanOrEqual(10);
    });
  });
});
