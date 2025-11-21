# Audit Report: smoothing

## 1. The Scorecard
| Criteria | Grade (1-10) | Status |
| :--- | :--- | :--- |
| **Module Isolation** | 10/10 | Pass |
| Architecture | 9/10 | Pass |
| Dead Code | 10/10 | Pass |
| DRY Principles | 7/10 | Fail |
| Performance | 8/10 | Pass |
| Documentation | 7/10 | Fail |
| Import Hygiene | 10/10 | Pass |
| Magic Variables | 10/10 | Pass |
| Test Coverage | 9/10 | Pass |
| Type Safety | 9/10 | Pass |
| Error Handling | 5/10 | Fail |
| Security/Validation | 4/10 | Fail |
| Cyclomatic Complexity | 10/10 | Pass |
| Immutability | 3/10 | Fail |
| Observability | 4/10 | Fail |
| Naming | 10/10 | Pass |
| Dependency Health | 10/10 | Pass |
| **OVERALL** | **7.9/10** | |

## 2. Forensic Analysis

### Critical Issues

1.  **[Module Isolation]**: PASSED - Perfect isolation.
    * *Severity:* N/A
    * *Implication:* Module has ZERO imports. Completely self-contained with no dependencies on any other module.

2.  **[Immutability]**: `updateMovingAverage` MUTATES the buffer array.
    * *Severity:* Critical
    * *Implication:* Uses `buffer.push()` and `buffer.shift()` to modify the input array in place. This violates the immutability principle and makes the function impure. Caller must be aware of mutation side effect.
    * *Location:* `smoothing.ts:23-28`

3.  **[Security/Validation]**: No input validation.
    * *Severity:* High
    * *Implication:* `windowSizeSec` and `loopPeriodMs` could be zero, negative, or produce division by zero. `newValue` could be NaN. No validation leads to undefined behavior.
    * *Location:* `smoothing.ts:14-33, 42-49, 57-62`

4.  **[Observability]**: No logging.
    * *Severity:* High
    * *Implication:* No visibility into smoothing behavior, buffer state, or averaging results. Debugging temperature filtering issues in production would be impossible.
    * *Location:* Entire module

### Moderate Issues

5.  **[DRY Principles]**: `getMaxSamples` calculation repeated.
    * *Severity:* Med
    * *Implication:* The formula `Math.ceil((windowSizeSec * 1000) / loopPeriodMs)` appears in three places. Should call `getMaxSamples` internally.
    * *Location:* `smoothing.ts:20, 47, 61`

6.  **[Documentation]**: TSDoc lacks business context.
    * *Severity:* Med
    * *Implication:* Doesn't explain WHY smoothing is needed (reduce sensor noise, prevent false thermostat triggers). Doesn't explain tradeoffs of window size.
    * *Location:* `smoothing.ts:1-4`

7.  **[Error Handling]**: No error conditions or validation.
    * *Severity:* Med
    * *Implication:* Division by zero if loopPeriodMs = 0. NaN propagation if newValue is NaN. Should validate and throw.
    * *Location:* All functions

8.  **[Performance]**: `buffer.shift()` is O(n).
    * *Severity:* Low
    * *Implication:* Array shift requires moving all elements. For typical buffer sizes (5-30), this is acceptable. For larger buffers, consider circular buffer implementation.
    * *Location:* `smoothing.ts:27`

### Minor Issues

9.  **[Type Safety]**: Buffer is mutable number array.
    * *Severity:* Low
    * *Implication:* Type `number[]` doesn't prevent mutation. Could use readonly array for input, return new array.
    * *Location:* `smoothing.ts:14`

10. **[Architecture]**: Types defined but not used in function signatures.
    * *Severity:* Low
    * *Implication:* `SmoothingConfig` and `SmoothingResult` defined in types.ts but functions don't use them. Should accept/return these types.
    * *Location:* `types.ts:7-28`, `smoothing.ts:14-33`

## 3. Rectification Plan (Full File Replacements)

### A. Types (types.ts)

```typescript
/**
 * Smoothing feature type definitions
 *
 * Temperature smoothing reduces sensor noise using a moving average filter.
 * This prevents false thermostat triggers from momentary temperature spikes.
 */

/**
 * Configuration for smoothing algorithm
 */
export interface SmoothingConfig {
  /** Window size in seconds for moving average */
  windowSizeSec: number;

  /** Control loop period in milliseconds */
  loopPeriodMs: number;
}

/**
 * Smoothing buffer state
 */
export interface SmoothingBufferState {
  /** Circular buffer of temperature readings */
  readonly samples: readonly number[];
}

/**
 * Result of smoothing operation
 */
export interface SmoothingResult {
  /** New buffer state (immutable) */
  buffer: SmoothingBufferState;

  /** Smoothed temperature value */
  value: number;

  /** Number of samples currently in buffer */
  sampleCount: number;

  /** Whether buffer has reached full capacity */
  bufferFull: boolean;
}
```

### B. Helpers (helpers.ts - NEW FILE)

```typescript
/**
 * Smoothing helper functions
 */

import type { SmoothingConfig } from './types';

/**
 * Validate smoothing configuration
 * @throws {Error} If configuration is invalid
 */
export function validateSmoothingConfig(config: SmoothingConfig): void {
  if (!Number.isFinite(config.windowSizeSec) || config.windowSizeSec <= 0) {
    throw new Error(`windowSizeSec must be a positive finite number, got ${config.windowSizeSec}`);
  }
  if (!Number.isFinite(config.loopPeriodMs) || config.loopPeriodMs <= 0) {
    throw new Error(`loopPeriodMs must be a positive finite number, got ${config.loopPeriodMs}`);
  }
}

/**
 * Validate temperature value
 * @throws {Error} If value is not a valid number
 */
export function validateTemperatureValue(value: number, context: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${context}: temperature must be a finite number, got ${value}`);
  }
}
```

### C. Main (smoothing.ts)

```typescript
/**
 * Temperature smoothing logic
 *
 * Implements moving average filter for sensor readings.
 *
 * ## Business Context
 * Raw sensor readings contain noise from:
 * - Electrical interference
 * - Sensor resolution limits
 * - Air currents near sensor
 *
 * Smoothing prevents false thermostat triggers by averaging readings
 * over a time window. Longer windows = more stable but slower response.
 */

import type { SmoothingConfig, SmoothingBufferState, SmoothingResult } from './types';
import { validateSmoothingConfig, validateTemperatureValue } from './helpers';

/**
 * Calculate maximum samples for given configuration
 *
 * @param windowSizeSec - Window size in seconds
 * @param loopPeriodMs - Control loop period in milliseconds
 * @returns Maximum number of samples in buffer
 */
export function getMaxSamples(
  windowSizeSec: number,
  loopPeriodMs: number
): number {
  return Math.ceil((windowSizeSec * 1000) / loopPeriodMs);
}

/**
 * Update moving average buffer with new value (IMMUTABLE)
 *
 * Returns a new buffer and smoothed value without mutating the input.
 *
 * @param buffer - Current buffer state
 * @param newValue - New temperature reading to add
 * @param config - Smoothing configuration
 * @returns Smoothing result with new buffer and value
 * @throws {Error} If inputs are invalid
 */
export function updateMovingAverage(
  buffer: SmoothingBufferState,
  newValue: number,
  config: SmoothingConfig
): SmoothingResult {
  validateSmoothingConfig(config);
  validateTemperatureValue(newValue, 'updateMovingAverage');

  const maxSamples = getMaxSamples(config.windowSizeSec, config.loopPeriodMs);

  // Create new samples array (immutable)
  let newSamples = [...buffer.samples, newValue];

  // Trim from front if exceeding max
  if (newSamples.length > maxSamples) {
    newSamples = newSamples.slice(newSamples.length - maxSamples);
  }

  // Calculate average
  const sum = newSamples.reduce((a, b) => a + b, 0);
  const average = sum / newSamples.length;

  return {
    buffer: { samples: newSamples },
    value: average,
    sampleCount: newSamples.length,
    bufferFull: newSamples.length >= maxSamples
  };
}

/**
 * Check if buffer has reached full capacity
 *
 * @param buffer - Current buffer state
 * @param config - Smoothing configuration
 * @returns True if buffer is full
 */
export function isBufferFull(
  buffer: SmoothingBufferState,
  config: SmoothingConfig
): boolean {
  validateSmoothingConfig(config);
  const maxSamples = getMaxSamples(config.windowSizeSec, config.loopPeriodMs);
  return buffer.samples.length >= maxSamples;
}

/**
 * Create empty buffer state
 *
 * @returns Empty buffer state
 */
export function createEmptyBuffer(): SmoothingBufferState {
  return { samples: [] };
}
```

### D. Index (index.ts)

```typescript
export {
  updateMovingAverage,
  isBufferFull,
  getMaxSamples,
  createEmptyBuffer
} from './smoothing';
export { validateSmoothingConfig } from './helpers';
export * from './types';
```

### E. Tests (smoothing.test.ts)

```typescript
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

  describe('updateMovingAverage (immutable)', () => {
    it('should return new buffer without mutating input', () => {
      const buffer = createEmptyBuffer();
      const result = updateMovingAverage(buffer, 10.0, defaultConfig);

      expect(result.value).toBe(10.0);
      expect(result.buffer.samples).toEqual([10.0]);
      expect(buffer.samples).toEqual([]); // Original unchanged
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
```

## 4. Summary

The `smoothing` module has **perfect isolation** with zero imports, but suffers from a **critical immutability violation**: `updateMovingAverage` mutates the input buffer directly.

Critical gaps:

1. **Immutability** - Must return new buffer, not mutate input
2. **Input validation** - Configuration and values not validated
3. **DRY violation** - maxSamples calculation repeated

The defined types (`SmoothingConfig`, `SmoothingResult`) are not utilized by the functions, which should be refactored to use them properly.
