# Audit Report: adaptive-hysteresis

## 1. The Scorecard
| Criteria | Grade (1-10) | Status |
| :--- | :--- | :--- |
| **Module Isolation** | 10/10 | Pass |
| Architecture | 5/10 | Fail |
| Dead Code | 5/10 | Fail |
| DRY Principles | 7/10 | Pass |
| Performance | 9/10 | Pass |
| Documentation | 5/10 | Fail |
| Import Hygiene | 8/10 | Pass |
| Magic Variables | 3/10 | Fail |
| Test Coverage | 1/10 | Fail |
| Type Safety | 9/10 | Pass |
| Error Handling | 4/10 | Fail |
| Security/Validation | 3/10 | Fail |
| Cyclomatic Complexity | 6/10 | Pass |
| Immutability | 5/10 | Fail |
| Observability | 1/10 | Fail |
| Naming | 8/10 | Pass |
| Dependency Health | 10/10 | Pass |
| **OVERALL** | **5.8/10** | Fail |

## 2. Forensic Analysis

1. **Architecture**: `types.ts` is effectively dead - contains only a comment with no actual type definitions.
   * *Severity:* High
   * *Implication:* Module structure is incomplete. Types should be defined in `types.ts` and the return type should be exported.

2. **Architecture**: `index.ts` only exports from `./adaptive-hysteresis`, not from `./types`.
   * *Severity:* Medium
   * *Implication:* Inconsistent with other modules that export types separately.

3. **Dead Code**: `types.ts` file contains only comments, providing no value.
   * *Severity:* High
   * *Implication:* Violates the "no dead code" principle. File should either define types or be removed.

4. **Magic Variables**: Hardcoded `0.1` for shift increment/decrement.
   * *Severity:* Critical
   * *Implication:* Zero tolerance policy violated. This should be `config.ADAPTIVE_SHIFT_STEP_C`.

5. **Magic Variables**: Hardcoded `10` for rounding multiplier.
   * *Severity:* Medium
   * *Implication:* Should be a constant `ROUNDING_PRECISION = 10` or configurable decimal places.

6. **Magic Variables**: Hardcoded `0` for minimum shift.
   * *Severity:* Medium
   * *Implication:* Should be `config.ADAPTIVE_MIN_SHIFT_C = 0` for consistency.

7. **Test Coverage**: No test file exists.
   * *Severity:* Critical
   * *Implication:* Cannot verify correctness. Violates >95% coverage requirement. Function has multiple paths (high duty, low duty, clamping) that need testing.

8. **Error Handling**: No validation of config values.
   * *Severity:* High
   * *Implication:* If `config.ADAPTIVE_MAX_SHIFT_C` is negative or `ADAPTIVE_HIGH_DUTY_PCT < ADAPTIVE_LOW_DUTY_PCT`, behavior is undefined.

9. **Security/Validation**: No input validation at boundary.
   * *Severity:* High
   * *Implication:* `dutyPercent` could be NaN, negative, or >100. `currentShift` could be negative.

10. **Documentation**: TSDoc lacks parameter descriptions and business context for magic numbers.
    * *Severity:* Medium
    * *Implication:* Developer cannot understand why `0.1` increment was chosen or what ranges are valid.

11. **Immutability**: Uses `let` and mutates `newShift` multiple times.
    * *Severity:* Medium
    * *Implication:* Should use pure functional approach with ternary expressions or early returns.

12. **Observability**: No logging whatsoever.
    * *Severity:* High
    * *Implication:* Cannot trace hysteresis adjustments in production. Should log when shift changes.

13. **Cyclomatic Complexity**: Nesting depth reaches 3 (if inside else-if inside function).
    * *Severity:* Low
    * *Implication:* Borderline acceptable but could be flattened with early returns.

## 3. Rectification Plan (Full File Replacements)

### A. Global Updates
Add to `src/types/config.ts` in `FridgeUserConfig`:
```typescript
// Add to FridgeUserConfig interface:
readonly ADAPTIVE_SHIFT_STEP_C: number;
readonly ADAPTIVE_MIN_SHIFT_C: number;
```

### B. types.ts
```typescript
/**
 * Adaptive hysteresis types
 */

/**
 * Result of adaptive hysteresis calculation
 */
export interface AdaptiveShiftResult {
  /** Whether the shift value changed */
  changed: boolean;
  /** New shift value in Celsius */
  newShift: number;
}
```

### C. index.ts
```typescript
export * from './adaptive-hysteresis';
export * from './types';
```

### D. adaptive-hysteresis.ts
```typescript
/**
 * Adaptive hysteresis logic
 *
 * Automatically adjusts temperature hysteresis based on compressor duty cycle.
 * High duty cycles widen hysteresis to reduce cycling and save energy.
 * Low duty cycles tighten hysteresis for better temperature stability.
 */

import type { FridgeConfig } from '$types/config';
import type { AdaptiveShiftResult } from './types';

/**
 * Calculate adaptive hysteresis shift based on duty cycle
 *
 * @param dutyPercent - Current duty cycle percentage (0-100)
 * @param currentShift - Current hysteresis shift in Celsius
 * @param config - Fridge configuration with adaptive thresholds
 * @returns Result containing whether shift changed and new shift value
 *
 * @remarks
 * **Business Logic**: The adaptive algorithm balances two concerns:
 * - High duty (>ADAPTIVE_HIGH_DUTY_PCT): Compressor runs too often, widen hysteresis
 * - Low duty (<ADAPTIVE_LOW_DUTY_PCT): Room for tighter control, narrow hysteresis
 *
 * **Shift Range**: [ADAPTIVE_MIN_SHIFT_C, ADAPTIVE_MAX_SHIFT_C]
 * **Step Size**: ADAPTIVE_SHIFT_STEP_C per adjustment
 *
 * @example
 * ```typescript
 * const result = calculateAdaptiveShift(75, 0.3, config);
 * if (result.changed) {
 *   console.log(`Hysteresis adjusted to ${result.newShift}°C`);
 * }
 * ```
 */
export function calculateAdaptiveShift(
  dutyPercent: number,
  currentShift: number,
  config: FridgeConfig
): AdaptiveShiftResult {
  // Validate inputs
  if (!Number.isFinite(dutyPercent) || !Number.isFinite(currentShift)) {
    return { changed: false, newShift: currentShift };
  }

  const minShift = config.ADAPTIVE_MIN_SHIFT_C ?? 0;
  const maxShift = config.ADAPTIVE_MAX_SHIFT_C;
  const stepSize = config.ADAPTIVE_SHIFT_STEP_C ?? 0.1;

  // High duty cycle: widen hysteresis to reduce cycling
  if (dutyPercent > config.ADAPTIVE_HIGH_DUTY_PCT && currentShift < maxShift) {
    const newShift = roundToDecimal(
      Math.min(currentShift + stepSize, maxShift)
    );
    return { changed: true, newShift };
  }

  // Low duty cycle: tighten hysteresis for better stability
  if (dutyPercent < config.ADAPTIVE_LOW_DUTY_PCT && currentShift > minShift) {
    const newShift = roundToDecimal(
      Math.max(currentShift - stepSize, minShift)
    );
    return { changed: true, newShift };
  }

  return { changed: false, newShift: currentShift };
}

/**
 * Round number to one decimal place to avoid float drift
 */
function roundToDecimal(value: number): number {
  const DECIMAL_PRECISION = 10;
  return Math.round(value * DECIMAL_PRECISION) / DECIMAL_PRECISION;
}
```

### E. adaptive-hysteresis.test.ts
```typescript
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
```
