import {
  updateMovingAverage,
  isBufferFull,
  getMaxSamples,
  createEmptyBuffer
} from './smoothing';
import { validateSmoothingConfig } from './helpers';
import type { SmoothingConfig, SmoothingBufferState } from './types';

describe('smoothing', () => {
  const defaultConfig: SmoothingConfig = {
    windowSizeSec: 5,
    loopPeriodMs: 1000
  };

  describe('updateMovingAverage (mutable)', () => {
    it('should mutate buffer in place for memory efficiency', () => {
      const buffer = createEmptyBuffer();
      const result = updateMovingAverage(buffer, 10.0, defaultConfig);

      expect(result.value).toBe(10.0);
      expect(result.buffer.samples).toEqual([10.0]);
      expect(buffer.samples).toEqual([10.0]); // Buffer is mutated in place
      expect(result.buffer).toBe(buffer); // Same reference
    });

    it('should calculate average of multiple values', () => {
      let buffer = createEmptyBuffer();

      let result = updateMovingAverage(buffer, 10.0, defaultConfig);
      buffer = result.buffer;

      result = updateMovingAverage(buffer, 20.0, defaultConfig);
      buffer = result.buffer;

      result = updateMovingAverage(buffer, 30.0, defaultConfig);

      expect(result.value).toBe(20.0); // (10 + 20 + 30) / 3
      expect(result.buffer.samples).toEqual([10.0, 20.0, 30.0]);
    });

    it('should trim buffer when exceeding max samples', () => {
      const config: SmoothingConfig = { windowSizeSec: 3, loopPeriodMs: 1000 };
      let buffer = createEmptyBuffer();

      for (let i = 1; i <= 5; i++) {
        const result = updateMovingAverage(buffer, i, config);
        buffer = result.buffer;
      }

      expect(buffer.samples).toHaveLength(3);
      expect(buffer.samples).toEqual([3.0, 4.0, 5.0]);
    });

    it('should throw on invalid value', () => {
      const buffer = createEmptyBuffer();
      expect(() => updateMovingAverage(buffer, NaN, defaultConfig)).toThrow();
    });

    it('should throw on zero loopPeriodMs', () => {
      const buffer = createEmptyBuffer();
      const badConfig = { windowSizeSec: 5, loopPeriodMs: 0 };
      expect(() => updateMovingAverage(buffer, 10.0, badConfig)).toThrow();
    });

    it('should return bufferFull status', () => {
      const config: SmoothingConfig = { windowSizeSec: 2, loopPeriodMs: 1000 };
      let buffer = createEmptyBuffer();

      let result = updateMovingAverage(buffer, 1.0, config);
      expect(result.bufferFull).toBe(false);
      buffer = result.buffer;

      result = updateMovingAverage(buffer, 2.0, config);
      expect(result.bufferFull).toBe(true);
    });
  });

  describe('validateSmoothingConfig', () => {
    it('should throw on zero windowSizeSec', () => {
      expect(() => validateSmoothingConfig({ windowSizeSec: 0, loopPeriodMs: 1000 })).toThrow();
    });

    it('should throw on negative loopPeriodMs', () => {
      expect(() => validateSmoothingConfig({ windowSizeSec: 5, loopPeriodMs: -1000 })).toThrow();
    });
  });

  describe('isBufferFull', () => {
    it('should return false for empty buffer', () => {
      const buffer = createEmptyBuffer();
      expect(isBufferFull(buffer, { windowSizeSec: 3, loopPeriodMs: 1000 })).toBe(false);
    });

    it('should return true when buffer is full', () => {
      const buffer: SmoothingBufferState = { samples: [1.0, 2.0, 3.0] };
      expect(isBufferFull(buffer, { windowSizeSec: 3, loopPeriodMs: 1000 })).toBe(true);
    });
  });

  describe('getMaxSamples', () => {
    it('should calculate correct max samples', () => {
      expect(getMaxSamples(5, 1000)).toBe(5);
      expect(getMaxSamples(30, 5000)).toBe(6);
    });

    it('should ceil fractional results', () => {
      expect(getMaxSamples(5, 2000)).toBe(3); // 2.5 -> 3
    });
  });
});
