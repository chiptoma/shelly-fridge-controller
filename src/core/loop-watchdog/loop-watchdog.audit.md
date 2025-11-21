# Audit Report: loop-watchdog

## 1. The Scorecard
| Criteria | Grade (1-10) | Status |
| :--- | :--- | :--- |
| **Module Isolation** | 10/10 | Pass |
| Architecture | 9/10 | Pass |
| Dead Code | 10/10 | Pass |
| DRY Principles | 10/10 | Pass |
| Performance | 10/10 | Pass |
| Documentation | 7/10 | Fail |
| Import Hygiene | 6/10 | Fail |
| Magic Variables | 10/10 | Pass |
| Test Coverage | 9/10 | Pass |
| Type Safety | 10/10 | Pass |
| Error Handling | 6/10 | Fail |
| Security/Validation | 4/10 | Fail |
| Cyclomatic Complexity | 10/10 | Pass |
| Immutability | 3/10 | Fail |
| Observability | 4/10 | Fail |
| Naming | 10/10 | Pass |
| Dependency Health | 10/10 | Pass |
| **OVERALL** | **8.1/10** | |

## 2. Forensic Analysis

### Critical Issues

1.  **[Module Isolation]**: PASSED - No sibling imports.
    * *Severity:* N/A
    * *Implication:* Module correctly imports only from `./types` (local). Fully self-contained.

2.  **[Immutability]**: `petWatchdog` MUTATES state directly.
    * *Severity:* Critical
    * *Implication:* `state.lastWatchdogPet = nowSec` directly mutates the input object. This violates the immutability principle used by all other modules. Should return a new state object for consistency and predictability.
    * *Location:* `loop-watchdog.ts:14-16`

3.  **[Security/Validation]**: No input validation.
    * *Severity:* High
    * *Implication:* `timeoutSec` could be zero, negative, or NaN causing incorrect behavior. `nowSec` and `lastWatchdogPet` not validated for negative values.
    * *Location:* `loop-watchdog.ts:25-31, 39-44`

4.  **[Observability]**: No logging for watchdog events.
    * *Severity:* High
    * *Implication:* No logs when watchdog is starved (loop crashed). This is critical for detecting control loop failures in production. Missing structured logs for starvation duration, recovery events.
    * *Location:* Entire module

### Moderate Issues

5.  **[Import Hygiene]**: Uses relative imports instead of path aliases.
    * *Severity:* Med
    * *Implication:* Uses `./types` instead of `$core/loop-watchdog/types`. Inconsistent with project standard.
    * *Location:* `loop-watchdog.ts:6`

6.  **[Documentation]**: TSDoc lacks business context.
    * *Severity:* Med
    * *Implication:* Doesn't explain WHY watchdog exists (detect control loop crashes, ensure system responsiveness). Doesn't explain implications of starvation.
    * *Location:* `loop-watchdog.ts:1-8`

7.  **[Error Handling]**: No validation or error conditions.
    * *Severity:* Med
    * *Implication:* Functions silently accept invalid inputs. Should validate and throw for invalid timeout values.
    * *Location:* All functions

### Minor Issues

8.  **[Architecture]**: No helpers.ts separation.
    * *Severity:* Low
    * *Implication:* Module is simple enough that this is acceptable, but `isWatchdogStarved` and `getTimeSinceLastPet` could be considered helpers to the pet operation.
    * *Location:* Module structure

9.  **[Test Coverage]**: Missing validation error tests.
    * *Severity:* Low
    * *Implication:* Tests don't cover invalid inputs (negative, NaN, Infinity).
    * *Location:* `loop-watchdog.test.ts`

## 3. Rectification Plan (Full File Replacements)

### A. Types (types.ts)

```typescript
/**
 * Loop watchdog type definitions
 *
 * The watchdog monitors control loop health by tracking heartbeat timestamps.
 * A "starved" watchdog indicates the control loop has crashed or stalled,
 * which could leave the compressor in an unsafe state.
 */

/**
 * Watchdog state
 */
export interface WatchdogState {
  /** Timestamp (seconds) of last heartbeat */
  lastWatchdogPet: number;
}

/**
 * Watchdog configuration
 */
export interface WatchdogConfig {
  /** Timeout in seconds before watchdog is considered starved */
  WATCHDOG_TIMEOUT_SEC: number;
}

/**
 * Watchdog check result
 */
export interface WatchdogCheckResult {
  /** Whether watchdog is starved (loop not running) */
  isStarved: boolean;

  /** Seconds since last pet */
  timeSinceLastPet: number;
}
```

### B. Helpers (helpers.ts - NEW FILE)

```typescript
/**
 * Loop watchdog helper functions
 */

/**
 * Validate watchdog input parameters
 * @throws {Error} If inputs are invalid
 */
export function validateWatchdogInputs(
  nowSec: number,
  lastWatchdogPet: number,
  context: string
): void {
  if (!Number.isFinite(nowSec) || nowSec < 0) {
    throw new Error(`${context}: nowSec must be a non-negative finite number, got ${nowSec}`);
  }
  if (!Number.isFinite(lastWatchdogPet) || lastWatchdogPet < 0) {
    throw new Error(`${context}: lastWatchdogPet must be a non-negative finite number, got ${lastWatchdogPet}`);
  }
}

/**
 * Validate timeout value
 * @throws {Error} If timeout is invalid
 */
export function validateTimeout(timeoutSec: number, context: string): void {
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new Error(`${context}: timeoutSec must be a positive finite number, got ${timeoutSec}`);
  }
}
```

### C. Main (loop-watchdog.ts)

```typescript
/**
 * Loop watchdog feature
 *
 * Monitors control loop health by tracking heartbeat timestamps.
 *
 * ## Business Context
 * The watchdog detects control loop failures:
 * - If the loop crashes, the watchdog won't be pet
 * - A starved watchdog triggers emergency procedures
 * - Ensures the fridge doesn't remain in an unsafe state
 *
 * Without watchdog monitoring, a crashed loop could leave the compressor
 * running indefinitely or prevent it from ever turning on.
 */

import type { WatchdogState, WatchdogCheckResult } from './types';
import { validateWatchdogInputs, validateTimeout } from './helpers';

/**
 * Pet the watchdog (update heartbeat)
 *
 * Called every control loop iteration to prove the loop is still running.
 * Returns a new state object (immutable update pattern).
 *
 * @param state - State object containing lastWatchdogPet
 * @param nowSec - Current timestamp in seconds
 * @returns New state with updated timestamp
 * @throws {Error} If inputs are invalid
 */
export function petWatchdog(state: WatchdogState, nowSec: number): WatchdogState {
  validateWatchdogInputs(nowSec, state.lastWatchdogPet, 'petWatchdog');

  return {
    lastWatchdogPet: nowSec
  };
}

/**
 * Check if watchdog has been starved (loop not running)
 *
 * A starved watchdog indicates the control loop has crashed or stalled.
 * This should trigger emergency procedures (e.g., turn off compressor).
 *
 * @param lastWatchdogPet - Timestamp of last heartbeat
 * @param nowSec - Current timestamp in seconds
 * @param timeoutSec - Timeout threshold in seconds
 * @returns True if watchdog is starved (loop may have crashed)
 * @throws {Error} If inputs are invalid
 */
export function isWatchdogStarved(
  lastWatchdogPet: number,
  nowSec: number,
  timeoutSec: number
): boolean {
  validateWatchdogInputs(nowSec, lastWatchdogPet, 'isWatchdogStarved');
  validateTimeout(timeoutSec, 'isWatchdogStarved');

  return (nowSec - lastWatchdogPet) > timeoutSec;
}

/**
 * Get time since last watchdog pet
 *
 * @param lastWatchdogPet - Timestamp of last heartbeat
 * @param nowSec - Current timestamp in seconds
 * @returns Seconds since last pet
 * @throws {Error} If inputs are invalid
 */
export function getTimeSinceLastPet(
  lastWatchdogPet: number,
  nowSec: number
): number {
  validateWatchdogInputs(nowSec, lastWatchdogPet, 'getTimeSinceLastPet');

  return nowSec - lastWatchdogPet;
}

/**
 * Check watchdog status and return detailed result
 *
 * Combined check that returns both starvation status and timing information.
 *
 * @param lastWatchdogPet - Timestamp of last heartbeat
 * @param nowSec - Current timestamp in seconds
 * @param timeoutSec - Timeout threshold in seconds
 * @returns Check result with status and timing
 */
export function checkWatchdog(
  lastWatchdogPet: number,
  nowSec: number,
  timeoutSec: number
): WatchdogCheckResult {
  validateWatchdogInputs(nowSec, lastWatchdogPet, 'checkWatchdog');
  validateTimeout(timeoutSec, 'checkWatchdog');

  const timeSinceLastPet = nowSec - lastWatchdogPet;

  return {
    isStarved: timeSinceLastPet > timeoutSec,
    timeSinceLastPet
  };
}
```

### D. Index (index.ts)

```typescript
export { petWatchdog, isWatchdogStarved, getTimeSinceLastPet, checkWatchdog } from './loop-watchdog';
export * from './types';
```

### E. Tests (loop-watchdog.test.ts)

```typescript
import { petWatchdog, isWatchdogStarved, getTimeSinceLastPet, checkWatchdog } from './loop-watchdog';
import type { WatchdogState } from './types';

describe('loop-watchdog', () => {
  describe('petWatchdog', () => {
    it('should return new state with updated timestamp', () => {
      const state: WatchdogState = { lastWatchdogPet: 1000 };
      const newState = petWatchdog(state, 1005);

      expect(newState.lastWatchdogPet).toBe(1005);
      expect(newState).not.toBe(state); // Immutable update
      expect(state.lastWatchdogPet).toBe(1000); // Original unchanged
    });

    it('should work with initial zero state', () => {
      const state: WatchdogState = { lastWatchdogPet: 0 };
      const newState = petWatchdog(state, 100);
      expect(newState.lastWatchdogPet).toBe(100);
    });

    it('should throw on negative timestamp', () => {
      const state: WatchdogState = { lastWatchdogPet: 0 };
      expect(() => petWatchdog(state, -1)).toThrow();
    });

    it('should throw on NaN', () => {
      const state: WatchdogState = { lastWatchdogPet: 0 };
      expect(() => petWatchdog(state, NaN)).toThrow();
    });
  });

  describe('isWatchdogStarved', () => {
    it('should return false when within timeout', () => {
      expect(isWatchdogStarved(1000, 1010, 30)).toBe(false);
    });

    it('should return false at exactly timeout', () => {
      expect(isWatchdogStarved(1000, 1030, 30)).toBe(false);
    });

    it('should return true when exceeding timeout', () => {
      expect(isWatchdogStarved(1000, 1031, 30)).toBe(true);
    });

    it('should handle large time differences', () => {
      expect(isWatchdogStarved(1000, 2000, 30)).toBe(true);
    });

    it('should handle zero lastPet (never pet)', () => {
      expect(isWatchdogStarved(0, 100, 30)).toBe(true);
    });

    it('should throw on zero timeout', () => {
      expect(() => isWatchdogStarved(1000, 1010, 0)).toThrow();
    });

    it('should throw on negative timeout', () => {
      expect(() => isWatchdogStarved(1000, 1010, -30)).toThrow();
    });
  });

  describe('getTimeSinceLastPet', () => {
    it('should calculate correct time difference', () => {
      expect(getTimeSinceLastPet(1000, 1025)).toBe(25);
    });

    it('should return zero for same timestamps', () => {
      expect(getTimeSinceLastPet(1000, 1000)).toBe(0);
    });

    it('should handle initial zero state', () => {
      expect(getTimeSinceLastPet(0, 100)).toBe(100);
    });
  });

  describe('checkWatchdog', () => {
    it('should return combined status', () => {
      const result = checkWatchdog(1000, 1031, 30);
      expect(result.isStarved).toBe(true);
      expect(result.timeSinceLastPet).toBe(31);
    });

    it('should return not starved within timeout', () => {
      const result = checkWatchdog(1000, 1020, 30);
      expect(result.isStarved).toBe(false);
      expect(result.timeSinceLastPet).toBe(20);
    });
  });
});
```

## 4. Summary

The `loop-watchdog` module is simple and focused but has a **critical immutability violation**: `petWatchdog` mutates state directly instead of returning a new object. This breaks the pattern used by all other modules.

Critical gaps:

1. **Immutability** - Must return new state object, not mutate
2. **Input validation** - Timeout and timestamp values not validated
3. **Observability** - No logging for starvation events

The module serves its purpose but needs fundamental changes to match project patterns.
