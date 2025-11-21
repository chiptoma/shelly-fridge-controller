import { updateMovingAverage, isBufferFull, getMaxSamples } from './smoothing';

describe('smoothing', () => {
  describe('updateMovingAverage', () => {
    it('should add value to empty buffer and return it', () => {
      const buffer: number[] = [];
      const result = updateMovingAverage(buffer, 10.0, 5, 1000);

      expect(result).toBe(10.0);
      expect(buffer).toEqual([10.0]);
    });

    it('should calculate average of multiple values', () => {
      const buffer: number[] = [];

      updateMovingAverage(buffer, 10.0, 5, 1000);
      updateMovingAverage(buffer, 20.0, 5, 1000);
      const result = updateMovingAverage(buffer, 30.0, 5, 1000);

      expect(result).toBe(20.0); // (10 + 20 + 30) / 3
      expect(buffer).toEqual([10.0, 20.0, 30.0]);
    });

    it('should trim buffer when exceeding max samples', () => {
      const buffer: number[] = [];
      const windowSizeSec = 3;
      const loopPeriodMs = 1000;

      // Add 5 values, max samples is 3
      updateMovingAverage(buffer, 1.0, windowSizeSec, loopPeriodMs);
      updateMovingAverage(buffer, 2.0, windowSizeSec, loopPeriodMs);
      updateMovingAverage(buffer, 3.0, windowSizeSec, loopPeriodMs);
      updateMovingAverage(buffer, 4.0, windowSizeSec, loopPeriodMs);
      const result = updateMovingAverage(buffer, 5.0, windowSizeSec, loopPeriodMs);

      expect(buffer).toHaveLength(3);
      expect(buffer).toEqual([3.0, 4.0, 5.0]);
      expect(result).toBe(4.0); // (3 + 4 + 5) / 3
    });

    it('should handle fractional max samples by ceiling', () => {
      const buffer: number[] = [];
      // 2.5 seconds / 1 second = 2.5, ceil = 3
      const windowSizeSec = 2.5;
      const loopPeriodMs = 1000;

      updateMovingAverage(buffer, 1.0, windowSizeSec, loopPeriodMs);
      updateMovingAverage(buffer, 2.0, windowSizeSec, loopPeriodMs);
      updateMovingAverage(buffer, 3.0, windowSizeSec, loopPeriodMs);
      updateMovingAverage(buffer, 4.0, windowSizeSec, loopPeriodMs);

      expect(buffer).toHaveLength(3);
      expect(buffer).toEqual([2.0, 3.0, 4.0]);
    });

    it('should handle different loop periods', () => {
      const buffer: number[] = [];
      // 30 seconds / 5 seconds = 6 samples
      const windowSizeSec = 30;
      const loopPeriodMs = 5000;

      for (let i = 1; i <= 8; i++) {
        updateMovingAverage(buffer, i, windowSizeSec, loopPeriodMs);
      }

      expect(buffer).toHaveLength(6);
      expect(buffer).toEqual([3, 4, 5, 6, 7, 8]);
    });
  });

  describe('isBufferFull', () => {
    it('should return false for empty buffer', () => {
      const buffer: number[] = [];
      expect(isBufferFull(buffer, 3, 1000)).toBe(false);
    });

    it('should return false when buffer is not full', () => {
      const buffer = [1.0, 2.0];
      expect(isBufferFull(buffer, 3, 1000)).toBe(false);
    });

    it('should return true when buffer is exactly full', () => {
      const buffer = [1.0, 2.0, 3.0];
      expect(isBufferFull(buffer, 3, 1000)).toBe(true);
    });

    it('should return true when buffer exceeds capacity', () => {
      const buffer = [1.0, 2.0, 3.0, 4.0];
      expect(isBufferFull(buffer, 3, 1000)).toBe(true);
    });

    it('should handle different configurations', () => {
      const buffer = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
      // 30 seconds / 5 seconds = 6 samples
      expect(isBufferFull(buffer, 30, 5000)).toBe(true);
      expect(isBufferFull(buffer, 35, 5000)).toBe(false); // needs 7
    });
  });

  describe('getMaxSamples', () => {
    it('should calculate correct max samples', () => {
      expect(getMaxSamples(5, 1000)).toBe(5);
      expect(getMaxSamples(30, 5000)).toBe(6);
      expect(getMaxSamples(10, 1000)).toBe(10);
    });

    it('should ceil fractional results', () => {
      expect(getMaxSamples(5, 2000)).toBe(3); // 2.5 -> 3
      expect(getMaxSamples(7, 3000)).toBe(3); // 2.33 -> 3
    });
  });
});
