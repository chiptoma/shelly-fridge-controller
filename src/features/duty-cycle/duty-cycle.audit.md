# Audit Report: duty-cycle

## 1. The Scorecard
| Criteria | Grade (1-10) | Status |
| :--- | :--- | :--- |
| **Module Isolation** | 10/10 | Pass |
| Architecture | 6/10 | Pass |
| Dead Code | 6/10 | Pass |
| DRY Principles | 9/10 | Pass |
| Performance | 10/10 | Pass |
| Documentation | 8/10 | Pass |
| Import Hygiene | 9/10 | Pass |
| Magic Variables | 8/10 | Pass |
| Test Coverage | 1/10 | Fail |
| Type Safety | 9/10 | Pass |
| Error Handling | 6/10 | Pass |
| Security/Validation | 4/10 | Fail |
| Cyclomatic Complexity | 10/10 | Pass |
| Immutability | 5/10 | Fail |
| Observability | 1/10 | Fail |
| Naming | 9/10 | Pass |
| Dependency Health | 10/10 | Pass |
| **OVERALL** | **7.1/10** | Pass |

## 2. Forensic Analysis

1. **Test Coverage**: No test file exists.
   * *Severity:* Critical
   * *Implication:* Cannot verify correctness of duty cycle calculations. Functions have multiple code paths (null checks, relay on/off, zero total) that need testing.

2. **Dead Code**: `export type { DutyCycleState }` in `duty-cycle.ts` duplicates the export from `types.ts`.
   * *Severity:* Medium
   * *Implication:* Redundant re-export. The type is already exported via `index.ts` from `types.ts`.

3. **Immutability**: `updateDutyCycle` mutates the input `dutyState` object.
   * *Severity:* High
   * *Implication:* Function claims to return updated state but mutates input. This can cause subtle bugs and makes testing harder.

4. **Observability**: No logging in any function.
   * *Severity:* High
   * *Implication:* Cannot trace duty cycle updates or resets in production. Should log at debug level when cycle resets.

5. **Security/Validation**: No validation of input values.
   * *Severity:* Medium
   * *Implication:* `dt` could be NaN or Infinity, `onSec`/`offSec` could be negative. No validation of `intervalSec`.

6. **Error Handling**: Only handles null `dutyState`, nothing else.
   * *Severity:* Medium
   * *Implication:* Negative `onSec` or `offSec` values will produce incorrect percentages. Division by zero is handled but not other edge cases.

7. **Architecture**: Re-exporting type in main file is inconsistent with pattern.
   * *Severity:* Low
   * *Implication:* Other modules export types from `index.ts` via `types.ts`, not from the main module file.

8. **Documentation**: Missing business context for why duty cycle is tracked.
   * *Severity:* Low
   * *Implication:* TSDoc should explain how duty cycle is used (adaptive hysteresis, alerts, etc.).

## 3. Rectification Plan (Full File Replacements)

### A. types.ts (No changes needed)
Current implementation is correct.

### B. index.ts (No changes needed)
Current implementation is correct.

### C. duty-cycle.ts
```typescript
/**
 * Duty cycle tracking and calculation
 *
 * Tracks compressor on/off time to calculate duty cycle percentage.
 * Used by adaptive hysteresis and daily summary features.
 */

import type { DutyCycleState } from './types';

/**
 * Update duty cycle accumulators
 * @param dutyState - Current duty cycle state
 * @param dt - Time delta in seconds
 * @param relayOn - Whether relay is currently ON
 * @returns New duty state with updated accumulators (immutable)
 */
export function updateDutyCycle(
  dutyState: DutyCycleState,
  dt: number,
  relayOn: boolean
): DutyCycleState {
  if (!dutyState || dt <= 0 || !Number.isFinite(dt)) {
    return dutyState;
  }

  return {
    ...dutyState,
    dutyOnSec: dutyState.dutyOnSec + (relayOn ? dt : 0),
    dutyOffSec: dutyState.dutyOffSec + (relayOn ? 0 : dt),
  };
}

/**
 * Calculate duty cycle percentage
 * @param onSec - Total ON time in seconds
 * @param offSec - Total OFF time in seconds
 * @returns Duty cycle percentage (0-100)
 */
export function getDutyPercent(onSec: number, offSec: number): number {
  if (!Number.isFinite(onSec) || !Number.isFinite(offSec)) {
    return 0;
  }

  const total = onSec + offSec;
  if (total <= 0) {
    return 0;
  }

  return (onSec / total) * 100.0;
}

/**
 * Reset duty cycle accumulators
 * @param now - Current timestamp
 * @returns Fresh duty state
 */
export function resetDutyCycle(now: number): DutyCycleState {
  return {
    dutyOnSec: 0,
    dutyOffSec: 0,
    dutyLastReset: now,
  };
}

/**
 * Check if duty cycle interval has elapsed
 * @param now - Current timestamp
 * @param lastReset - Last reset timestamp
 * @param intervalSec - Duty cycle interval in seconds
 * @returns True if interval has elapsed
 */
export function shouldResetDutyCycle(
  now: number,
  lastReset: number,
  intervalSec: number
): boolean {
  if (lastReset === 0 || intervalSec <= 0) {
    return false;
  }
  return (now - lastReset) >= intervalSec;
}
```

### D. duty-cycle.test.ts (New file)
```typescript
/**
 * Unit tests for duty cycle functions
 */

import {
  updateDutyCycle,
  getDutyPercent,
  resetDutyCycle,
  shouldResetDutyCycle,
} from './duty-cycle';
import type { DutyCycleState } from './types';

describe('Duty Cycle', () => {
  // ═══════════════════════════════════════════════════════════════
  // updateDutyCycle()
  // ═══════════════════════════════════════════════════════════════

  describe('updateDutyCycle', () => {
    it('should accumulate ON time when relay is on', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, 10, true);

      expect(result.dutyOnSec).toBe(110);
      expect(result.dutyOffSec).toBe(50);
    });

    it('should accumulate OFF time when relay is off', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, 10, false);

      expect(result.dutyOnSec).toBe(100);
      expect(result.dutyOffSec).toBe(60);
    });

    it('should not mutate input state', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };
      const original = { ...state };

      updateDutyCycle(state, 10, true);

      expect(state).toEqual(original);
    });

    it('should return same state for zero delta', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, 0, true);

      expect(result).toBe(state);
    });

    it('should return same state for negative delta', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, -5, true);

      expect(result).toBe(state);
    });

    it('should return same state for NaN delta', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, NaN, true);

      expect(result).toBe(state);
    });

    it('should return same state for null dutyState', () => {
      const result = updateDutyCycle(null as unknown as DutyCycleState, 10, true);

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // getDutyPercent()
  // ═══════════════════════════════════════════════════════════════

  describe('getDutyPercent', () => {
    it('should calculate 50% duty cycle', () => {
      const result = getDutyPercent(100, 100);
      expect(result).toBe(50);
    });

    it('should calculate 100% duty cycle', () => {
      const result = getDutyPercent(100, 0);
      expect(result).toBe(100);
    });

    it('should calculate 0% duty cycle', () => {
      const result = getDutyPercent(0, 100);
      expect(result).toBe(0);
    });

    it('should return 0 for zero total', () => {
      const result = getDutyPercent(0, 0);
      expect(result).toBe(0);
    });

    it('should return 0 for NaN inputs', () => {
      expect(getDutyPercent(NaN, 100)).toBe(0);
      expect(getDutyPercent(100, NaN)).toBe(0);
    });

    it('should handle large numbers', () => {
      const result = getDutyPercent(86400, 86400);
      expect(result).toBe(50);
    });

    it('should handle fractional seconds', () => {
      const result = getDutyPercent(0.5, 0.5);
      expect(result).toBe(50);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // resetDutyCycle()
  // ═══════════════════════════════════════════════════════════════

  describe('resetDutyCycle', () => {
    it('should return fresh state with current timestamp', () => {
      const now = 1234567890;
      const result = resetDutyCycle(now);

      expect(result.dutyOnSec).toBe(0);
      expect(result.dutyOffSec).toBe(0);
      expect(result.dutyLastReset).toBe(now);
    });

    it('should handle zero timestamp', () => {
      const result = resetDutyCycle(0);
      expect(result.dutyLastReset).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // shouldResetDutyCycle()
  // ═══════════════════════════════════════════════════════════════

  describe('shouldResetDutyCycle', () => {
    it('should return true when interval has elapsed', () => {
      const result = shouldResetDutyCycle(1100, 1000, 100);
      expect(result).toBe(true);
    });

    it('should return true at exactly interval', () => {
      const result = shouldResetDutyCycle(1100, 1000, 100);
      expect(result).toBe(true);
    });

    it('should return false when interval not elapsed', () => {
      const result = shouldResetDutyCycle(1050, 1000, 100);
      expect(result).toBe(false);
    });

    it('should return false when lastReset is zero', () => {
      const result = shouldResetDutyCycle(1100, 0, 100);
      expect(result).toBe(false);
    });

    it('should return false when interval is zero', () => {
      const result = shouldResetDutyCycle(1100, 1000, 0);
      expect(result).toBe(false);
    });

    it('should return false when interval is negative', () => {
      const result = shouldResetDutyCycle(1100, 1000, -100);
      expect(result).toBe(false);
    });

    it('should handle large intervals', () => {
      const day = 86400;
      const result = shouldResetDutyCycle(day * 2, day, day);
      expect(result).toBe(true);
    });
  });
});
```
