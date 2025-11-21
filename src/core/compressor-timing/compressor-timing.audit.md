# Audit Report: compressor-timing

## 1. The Scorecard
| Criteria | Grade (1-10) | Status |
| :--- | :--- | :--- |
| **Module Isolation** | 10/10 | Pass |
| Architecture | 9/10 | Pass |
| Dead Code | 10/10 | Pass |
| DRY Principles | 8/10 | Pass |
| Performance | 10/10 | Pass |
| Documentation | 7/10 | Fail |
| Import Hygiene | 6/10 | Fail |
| Magic Variables | 9/10 | Pass |
| Test Coverage | 9/10 | Pass |
| Type Safety | 10/10 | Pass |
| Error Handling | 6/10 | Fail |
| Security/Validation | 4/10 | Fail |
| Cyclomatic Complexity | 10/10 | Pass |
| Immutability | 9/10 | Pass |
| Observability | 4/10 | Fail |
| Naming | 10/10 | Pass |
| Dependency Health | 10/10 | Pass |
| **OVERALL** | **8.3/10** | |

## 2. Forensic Analysis

### Critical Issues

1.  **[Module Isolation]**: PASSED - No sibling module imports detected.
    * *Severity:* N/A
    * *Implication:* Module correctly imports only from `./types` (local) and has no external dependencies. Fully self-contained.

2.  **[Security/Validation]**: No input validation on timing parameters.
    * *Severity:* Critical
    * *Implication:* Functions accept any number values without validation. Negative timestamps, NaN, Infinity, or negative timing values would cause incorrect behavior. This is a safety-critical module protecting compressor hardware from damage.
    * *Location:* `compressor-timing.ts:17-40, 51-74, 85-111`

3.  **[Error Handling]**: No error handling or boundary condition checks.
    * *Severity:* High
    * *Implication:* The module silently accepts invalid inputs and returns potentially incorrect results. No custom errors for invalid states. For hardware protection logic, this is unacceptable.
    * *Location:* All functions

4.  **[Observability]**: Zero logging or telemetry in the module.
    * *Severity:* High
    * *Implication:* When timing constraints block a state change, there's no observability. Debugging timing issues in production would be impossible. No structured logs, no context passing.
    * *Location:* Entire module

### Moderate Issues

5.  **[Import Hygiene]**: No path aliases used; imports use relative paths.
    * *Severity:* Med
    * *Implication:* Uses `./types` instead of `$core/compressor-timing/types` or `@/core/compressor-timing/types`. Inconsistent with enterprise import standards.
    * *Location:* `compressor-timing.ts:6`

6.  **[Documentation]**: TSDoc explains parameters but lacks business context.
    * *Severity:* Med
    * *Implication:* Documentation describes *what* parameters are, but not *why* MIN_ON/MIN_OFF constraints exist (compressor motor protection, oil return, pressure equalization). The business logic/safety rationale is missing.
    * *Location:* `compressor-timing.ts:8-16, 42-50, 76-84`

7.  **[DRY Principles]**: Repeated pattern in checkMinOn and checkMinOff.
    * *Severity:* Med
    * *Implication:* Both functions follow identical structure: check guard conditions, calculate elapsed time, compare to threshold. Could be abstracted to generic timing check function.
    * *Location:* `compressor-timing.ts:17-40, 51-74`

8.  **[Immutability]**: Uses `Object.assign` which is less idiomatic.
    * *Severity:* Low
    * *Implication:* The pattern `Object.assign({...}, minOnCheck)` mutates the first argument. Using spread syntax `{...minOnCheck, allow: false}` would be cleaner and more idiomatic.
    * *Location:* `compressor-timing.ts:97-100, 104-107`

### Minor Issues

9.  **[Magic Variables]**: String literals 'MIN_ON' and 'MIN_OFF' as const.
    * *Severity:* Low
    * *Implication:* While used as `as const`, these should ideally be defined in a constants enum for better type safety and discoverability.
    * *Location:* `compressor-timing.ts:99, 106`

10. **[Architecture]**: Module lacks `helpers.ts` separation.
    * *Severity:* Low
    * *Implication:* The functions `checkMinOn` and `checkMinOff` could be considered helpers to the main `applyTimingConstraints` function. Current structure is acceptable but doesn't follow the expected pattern.
    * *Location:* Module structure

## 3. Rectification Plan (Full File Replacements)

### A. Global Updates (src/types/timing-errors.ts)

```typescript
/**
 * Timing module error types
 * Custom errors for compressor timing constraint violations
 */

/**
 * Error thrown when timing input parameters are invalid
 */
export class TimingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimingValidationError';
  }
}

/**
 * Error thrown when timing constraint is violated
 */
export class TimingConstraintError extends Error {
  constructor(
    public readonly constraint: 'MIN_ON' | 'MIN_OFF',
    public readonly remainingSec: number
  ) {
    super(`Timing constraint ${constraint} not satisfied. ${remainingSec}s remaining.`);
    this.name = 'TimingConstraintError';
  }
}
```

### B. Configuration Constants (types.ts)

```typescript
/**
 * Compressor timing type definitions
 *
 * These types support the MIN_ON/MIN_OFF safety constraints that protect
 * the compressor from damage caused by short-cycling.
 */

/**
 * Constraint type identifiers
 */
export const TIMING_CONSTRAINTS = {
  MIN_ON: 'MIN_ON',
  MIN_OFF: 'MIN_OFF'
} as const;

export type TimingConstraintType = typeof TIMING_CONSTRAINTS[keyof typeof TIMING_CONSTRAINTS];

/**
 * Result of timing constraint check
 *
 * Used to communicate whether a compressor state change is allowed
 * based on MIN_ON/MIN_OFF safety constraints.
 */
export interface TimingCheckResult {
  /** Whether the timing constraint allows the state change */
  allow: boolean;

  /** Remaining seconds until constraint is satisfied */
  remainingSec?: number;

  /** Timestamp when compressor can be turned OFF */
  canTurnOffAt?: number;

  /** Timestamp when compressor can be turned ON */
  canTurnOnAt?: number;

  /** Which constraint is blocking */
  reason?: TimingConstraintType;
}

/**
 * Timing state for compressor
 *
 * Tracks timestamps of last state transitions for constraint enforcement.
 */
export interface TimingState {
  /** Timestamp (seconds) when compressor was last turned ON */
  lastOnTime: number;

  /** Timestamp (seconds) when compressor was last turned OFF */
  lastOffTime: number;
}

/**
 * Timing configuration
 *
 * These values protect the compressor:
 * - MIN_ON_SEC: Prevents short-cycling that causes oil starvation
 * - MIN_OFF_SEC: Allows refrigerant pressures to equalize
 */
export interface TimingConfig {
  /** Minimum ON time in seconds (prevents oil starvation) */
  MIN_ON_SEC: number;

  /** Minimum OFF time in seconds (allows pressure equalization) */
  MIN_OFF_SEC: number;
}
```

### C. Helpers (helpers.ts - NEW FILE)

```typescript
/**
 * Compressor timing helper functions
 * Internal logic for timing constraint enforcement
 */

import type { TimingCheckResult } from './types';

/**
 * Generic timing constraint checker
 * Abstracts common pattern from checkMinOn and checkMinOff
 *
 * @internal
 */
export function checkTimingConstraint(
  shouldEnforce: boolean,
  elapsedTime: number,
  requiredTime: number,
  timestampField: 'canTurnOffAt' | 'canTurnOnAt',
  referenceTime: number
): TimingCheckResult {
  if (!shouldEnforce) {
    return { allow: true };
  }

  if (elapsedTime >= requiredTime) {
    return { allow: true };
  }

  return {
    allow: false,
    remainingSec: requiredTime - elapsedTime,
    [timestampField]: referenceTime + requiredTime
  };
}

/**
 * Validate timing input parameters
 * Ensures timestamps and durations are valid numbers
 *
 * @throws {Error} If inputs are invalid
 */
export function validateTimingInputs(
  now: number,
  lastTime: number,
  minDuration: number,
  context: string
): void {
  if (!Number.isFinite(now) || now < 0) {
    throw new Error(`${context}: now must be a non-negative finite number, got ${now}`);
  }
  if (!Number.isFinite(lastTime) || lastTime < 0) {
    throw new Error(`${context}: lastTime must be a non-negative finite number, got ${lastTime}`);
  }
  if (!Number.isFinite(minDuration) || minDuration <= 0) {
    throw new Error(`${context}: minDuration must be a positive finite number, got ${minDuration}`);
  }
}
```

### D. Main (compressor-timing.ts)

```typescript
/**
 * Compressor timing safety logic
 *
 * Enforces MIN_ON and MIN_OFF constraints to protect compressor from damage.
 *
 * ## Business Context
 * Compressors can be damaged by "short-cycling" - rapid ON/OFF transitions:
 * - **MIN_ON** ensures oil circulates back to lubricate compressor internals
 * - **MIN_OFF** allows high/low pressure sides to equalize before restart
 *
 * These constraints take precedence over thermostat decisions.
 */

import type { TimingCheckResult, TimingState, TimingConfig } from './types';
import { TIMING_CONSTRAINTS } from './types';
import { checkTimingConstraint, validateTimingInputs } from './helpers';

/**
 * Check if MIN_ON constraint is satisfied
 *
 * Prevents turning OFF a compressor that hasn't run long enough.
 * This ensures proper oil circulation to lubricate the compressor,
 * preventing mechanical wear and potential seizure.
 *
 * @param relayOn - Current relay state (true = compressor running)
 * @param wantCool - Desired cooling state from thermostat
 * @param now - Current timestamp in seconds (Unix epoch)
 * @param lastOnTime - Timestamp when compressor was last turned ON
 * @param minOnSec - Minimum ON time in seconds (typically 180s)
 * @returns Result with allow flag and optional metadata
 * @throws {Error} If inputs are invalid (negative, NaN, etc.)
 */
export function checkMinOn(
  relayOn: boolean,
  wantCool: boolean,
  now: number,
  lastOnTime: number,
  minOnSec: number
): TimingCheckResult {
  validateTimingInputs(now, lastOnTime, minOnSec, 'checkMinOn');

  const shouldEnforce = relayOn && !wantCool;
  const onTime = now - lastOnTime;

  return checkTimingConstraint(
    shouldEnforce,
    onTime,
    minOnSec,
    'canTurnOffAt',
    lastOnTime
  );
}

/**
 * Check if MIN_OFF constraint is satisfied
 *
 * Prevents turning ON a compressor that hasn't been off long enough.
 * This allows high/low pressure sides to equalize, preventing
 * startup damage from excessive head pressure.
 *
 * @param relayOn - Current relay state (true = compressor running)
 * @param wantCool - Desired cooling state from thermostat
 * @param now - Current timestamp in seconds (Unix epoch)
 * @param lastOffTime - Timestamp when compressor was last turned OFF
 * @param minOffSec - Minimum OFF time in seconds (typically 300s)
 * @returns Result with allow flag and optional metadata
 * @throws {Error} If inputs are invalid (negative, NaN, etc.)
 */
export function checkMinOff(
  relayOn: boolean,
  wantCool: boolean,
  now: number,
  lastOffTime: number,
  minOffSec: number
): TimingCheckResult {
  validateTimingInputs(now, lastOffTime, minOffSec, 'checkMinOff');

  const shouldEnforce = !relayOn && wantCool;
  const offTime = now - lastOffTime;

  return checkTimingConstraint(
    shouldEnforce,
    offTime,
    minOffSec,
    'canTurnOnAt',
    lastOffTime
  );
}

/**
 * Apply both MIN_ON and MIN_OFF timing constraints
 *
 * Main entry point for timing constraint checks. Both constraints
 * must be satisfied for a state change to be allowed.
 *
 * @param relayOn - Current relay state
 * @param wantCool - Desired cooling state
 * @param now - Current timestamp in seconds
 * @param state - Controller state with timing information
 * @param config - Configuration with MIN_ON and MIN_OFF values
 * @returns Result with final allow decision and metadata
 */
export function applyTimingConstraints(
  relayOn: boolean,
  wantCool: boolean,
  now: number,
  state: TimingState,
  config: TimingConfig
): TimingCheckResult {
  const minOnCheck = checkMinOn(relayOn, wantCool, now, state.lastOnTime, config.MIN_ON_SEC);
  const minOffCheck = checkMinOff(relayOn, wantCool, now, state.lastOffTime, config.MIN_OFF_SEC);

  if (!minOnCheck.allow) {
    return {
      ...minOnCheck,
      allow: false,
      reason: TIMING_CONSTRAINTS.MIN_ON
    };
  }

  if (!minOffCheck.allow) {
    return {
      ...minOffCheck,
      allow: false,
      reason: TIMING_CONSTRAINTS.MIN_OFF
    };
  }

  return { allow: true };
}
```

### E. Index (index.ts)

```typescript
export { checkMinOn, checkMinOff, applyTimingConstraints } from './compressor-timing';
export * from './types';
```

### F. Tests (compressor-timing.test.ts)

```typescript
import { checkMinOn, checkMinOff, applyTimingConstraints } from './compressor-timing';
import { TIMING_CONSTRAINTS } from './types';
import type { TimingState, TimingConfig } from './types';

describe('compressor-timing', () => {
  describe('checkMinOn', () => {
    it('should allow when relay is off', () => {
      const result = checkMinOn(false, false, 1000, 900, 180);
      expect(result.allow).toBe(true);
    });

    it('should allow when wanting to cool (not trying to turn off)', () => {
      const result = checkMinOn(true, true, 1000, 900, 180);
      expect(result.allow).toBe(true);
    });

    it('should allow when min on time has passed', () => {
      const result = checkMinOn(true, false, 1000, 800, 180);
      expect(result.allow).toBe(true);
    });

    it('should block when min on time has not passed', () => {
      const result = checkMinOn(true, false, 1000, 900, 180);
      expect(result.allow).toBe(false);
      expect(result.remainingSec).toBe(80);
      expect(result.canTurnOffAt).toBe(1080);
    });

    it('should allow at exactly min on time', () => {
      const result = checkMinOn(true, false, 1000, 820, 180);
      expect(result.allow).toBe(true);
    });

    // Edge cases
    it('should handle zero lastOnTime (never turned on)', () => {
      const result = checkMinOn(true, false, 1000, 0, 180);
      expect(result.allow).toBe(true);
    });

    // Validation tests
    it('should throw on negative timestamp', () => {
      expect(() => checkMinOn(true, false, -1, 0, 180)).toThrow();
    });

    it('should throw on NaN values', () => {
      expect(() => checkMinOn(true, false, NaN, 0, 180)).toThrow();
    });

    it('should throw on Infinity', () => {
      expect(() => checkMinOn(true, false, Infinity, 0, 180)).toThrow();
    });

    it('should throw on zero duration', () => {
      expect(() => checkMinOn(true, false, 1000, 900, 0)).toThrow();
    });

    it('should throw on negative duration', () => {
      expect(() => checkMinOn(true, false, 1000, 900, -180)).toThrow();
    });
  });

  describe('checkMinOff', () => {
    it('should allow when relay is on', () => {
      const result = checkMinOff(true, true, 1000, 900, 300);
      expect(result.allow).toBe(true);
    });

    it('should allow when not wanting to cool (not trying to turn on)', () => {
      const result = checkMinOff(false, false, 1000, 900, 300);
      expect(result.allow).toBe(true);
    });

    it('should allow when min off time has passed', () => {
      const result = checkMinOff(false, true, 1000, 600, 300);
      expect(result.allow).toBe(true);
    });

    it('should block when min off time has not passed', () => {
      const result = checkMinOff(false, true, 1000, 800, 300);
      expect(result.allow).toBe(false);
      expect(result.remainingSec).toBe(100);
      expect(result.canTurnOnAt).toBe(1100);
    });

    it('should allow at exactly min off time', () => {
      const result = checkMinOff(false, true, 1000, 700, 300);
      expect(result.allow).toBe(true);
    });

    // Edge cases
    it('should handle zero lastOffTime (never turned off)', () => {
      const result = checkMinOff(false, true, 1000, 0, 300);
      expect(result.allow).toBe(true);
    });
  });

  describe('applyTimingConstraints', () => {
    const defaultConfig: TimingConfig = {
      MIN_ON_SEC: 180,
      MIN_OFF_SEC: 300
    };

    it('should allow when no constraints violated', () => {
      const state: TimingState = { lastOnTime: 0, lastOffTime: 0 };
      const result = applyTimingConstraints(false, true, 1000, state, defaultConfig);
      expect(result.allow).toBe(true);
    });

    it('should block with MIN_ON reason', () => {
      const state: TimingState = { lastOnTime: 900, lastOffTime: 0 };
      const result = applyTimingConstraints(true, false, 1000, state, defaultConfig);
      expect(result.allow).toBe(false);
      expect(result.reason).toBe(TIMING_CONSTRAINTS.MIN_ON);
    });

    it('should block with MIN_OFF reason', () => {
      const state: TimingState = { lastOnTime: 0, lastOffTime: 800 };
      const result = applyTimingConstraints(false, true, 1000, state, defaultConfig);
      expect(result.allow).toBe(false);
      expect(result.reason).toBe(TIMING_CONSTRAINTS.MIN_OFF);
    });

    it('should allow state change when constraints satisfied', () => {
      const state: TimingState = { lastOnTime: 700, lastOffTime: 500 };
      const result = applyTimingConstraints(true, false, 1000, state, defaultConfig);
      expect(result.allow).toBe(true);
    });

    it('should preserve metadata from failed check', () => {
      const state: TimingState = { lastOnTime: 900, lastOffTime: 0 };
      const result = applyTimingConstraints(true, false, 1000, state, defaultConfig);
      expect(result.remainingSec).toBe(80);
      expect(result.canTurnOffAt).toBe(1080);
    });

    it('should prioritize MIN_ON when both would fail', () => {
      const state: TimingState = { lastOnTime: 950, lastOffTime: 950 };
      const result = applyTimingConstraints(true, false, 1000, state, defaultConfig);
      expect(result.reason).toBe(TIMING_CONSTRAINTS.MIN_ON);
    });
  });
});
```

## 4. Summary

The `compressor-timing` module has **excellent fundamentals**: clean architecture, good type safety, readable code, and solid test coverage. **Module isolation is perfect** with no sibling imports.

However, for a **safety-critical module protecting hardware**, critical gaps exist:

1. **Input validation** - Must validate timing parameters for hardware protection
2. **Error handling** - Need custom errors for constraint violations
3. **Observability** - Zero logging makes debugging impossible

The module correctly serves its purpose but requires hardening for production reliability.
