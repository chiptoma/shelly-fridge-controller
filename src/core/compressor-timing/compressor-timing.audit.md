# Audit Report: compressor-timing

## 1. The Scorecard

| Criteria | Grade (1-10) | Status |
| :--- | :--- | :--- |
| Architecture | 9/10 | Pass |
| Dead Code | 10/10 | Pass |
| DRY Principles | 9/10 | Pass |
| Performance | 10/10 | Pass |
| Documentation | 8/10 | Pass |
| Import Hygiene | 7/10 | Fail |
| Magic Variables | 9/10 | Pass |
| Testing (>95%) | 8/10 | Pass |
| Type Safety | 10/10 | Pass |
| Error Handling | 6/10 | Fail |
| Security/Input | 5/10 | Fail |
| Complexity | 10/10 | Pass |
| Immutability | 9/10 | Pass |
| Observability | 4/10 | Fail |
| Naming | 10/10 | Pass |
| **OVERALL** | **8.3/10** | |

## 2. Detailed Findings (Pedantic & Strict)

### Critical Issues

1. **[Security/Input Validation]**: No input validation on any function parameters.
   * *Implication:* Functions accept any number values without validation. Negative timestamps, NaN, Infinity, or negative timing values would cause incorrect behavior. This is a safety-critical module protecting compressor hardware.
   * *Location:* `compressor-timing.ts:17-40, 51-74, 85-111`

2. **[Error Handling]**: No error handling or boundary condition checks.
   * *Implication:* The module silently accepts invalid inputs and returns potentially incorrect results. No custom errors for invalid states. For hardware protection logic, this is unacceptable.
   * *Location:* All functions

3. **[Observability]**: Zero logging or telemetry in the module.
   * *Implication:* When timing constraints block a state change, there's no observability. Debugging timing issues in production would be impossible. No structured logs, no context passing.
   * *Location:* Entire module

### Moderate Issues

4. **[Import Hygiene]**: No path aliases used; imports use relative paths.
   * *Implication:* Inconsistent with enterprise import standards. Should use `@/` path aliases for consistency across the codebase.
   * *Location:* `compressor-timing.ts:6`

5. **[Documentation]**: TSDoc explains parameters but lacks business context.
   * *Implication:* Documentation describes *what* parameters are, but not *why* MIN_ON/MIN_OFF constraints exist (compressor motor protection, oil return, etc.). The business logic/safety rationale is missing.
   * *Location:* `compressor-timing.ts:8-16, 42-50, 76-84`

6. **[Testing]**: Good coverage but missing edge cases.
   * *Implication:* Tests don't cover: boundary conditions (0, negative values), NaN/Infinity handling, or simultaneous constraint violations. No test for when both MIN_ON and MIN_OFF would theoretically fail.
   * *Location:* `compressor-timing.test.ts`

7. **[Immutability]**: Uses `Object.assign` which creates mutable objects.
   * *Implication:* The pattern `Object.assign({...}, minOnCheck)` mutates the first argument. While the result is returned correctly, using spread syntax would be cleaner and more idiomatic.
   * *Location:* `compressor-timing.ts:97-100, 104-107`

### Minor Issues

8. **[Architecture]**: Module lacks `helpers.ts` file.
   * *Implication:* While the current structure is clean, the pattern expects a `helpers.ts` for internal logic. The functions `checkMinOn` and `checkMinOff` could be considered helpers to `applyTimingConstraints`.
   * *Location:* Module structure

9. **[DRY Principles]**: Slight repetition in check functions.
   * *Implication:* Both `checkMinOn` and `checkMinOff` follow the same pattern. Could be abstracted to a single generic function with parameters, though current approach is more readable.
   * *Location:* `compressor-timing.ts:17-40, 51-74`

## 3. Rectification Plan (Path to 100%)

### A. Add Input Validation with Zod

```typescript
// compressor-timing.ts - Add at top after imports
import { z } from 'zod';

const TimestampSchema = z.number().nonnegative().finite();
const DurationSchema = z.number().positive().finite();

function validateTimingInputs(
  now: number,
  lastTime: number,
  minDuration: number,
  context: string
): void {
  const result = z.object({
    now: TimestampSchema,
    lastTime: TimestampSchema,
    minDuration: DurationSchema,
  }).safeParse({ now, lastTime, minDuration });

  if (!result.success) {
    throw new TimingValidationError(
      `Invalid timing parameters in ${context}: ${result.error.message}`
    );
  }

  if (lastTime > now) {
    throw new TimingValidationError(
      `${context}: lastTime (${lastTime}) cannot be greater than now (${now})`
    );
  }
}
```

### B. Add Custom Error Types

```typescript
// types.ts - Add custom errors
export class TimingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimingValidationError';
  }
}

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

### C. Add Observability/Logging

```typescript
// compressor-timing.ts - Add logging support
import { createLogger } from '@/logging';

const logger = createLogger('compressor-timing');

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
    logger.debug('MIN_ON constraint blocking state change', {
      relayOn,
      wantCool,
      remainingSec: minOnCheck.remainingSec,
      canTurnOffAt: minOnCheck.canTurnOffAt,
    });
    return {
      ...minOnCheck,
      allow: false,
      reason: 'MIN_ON' as const,
    };
  }

  if (!minOffCheck.allow) {
    logger.debug('MIN_OFF constraint blocking state change', {
      relayOn,
      wantCool,
      remainingSec: minOffCheck.remainingSec,
      canTurnOnAt: minOffCheck.canTurnOnAt,
    });
    return {
      ...minOffCheck,
      allow: false,
      reason: 'MIN_OFF' as const,
    };
  }

  return { allow: true };
}
```

### D. Update Import Paths to Use Aliases

```typescript
// compressor-timing.ts - Change import
import type { TimingCheckResult, TimingState, TimingConfig } from '@/core/compressor-timing/types';
```

### E. Improve TSDoc with Business Context

```typescript
/**
 * Check if MIN_ON constraint is satisfied.
 *
 * **Business Logic:** Compressors require minimum run times to:
 * - Allow refrigerant oil to properly circulate back to the compressor
 * - Prevent short-cycling damage to motor windings
 * - Ensure adequate heat transfer in the evaporator
 *
 * @param relayOn - Current relay state (true = compressor running)
 * @param wantCool - Desired cooling state from thermostat
 * @param now - Current timestamp in seconds (Unix epoch)
 * @param lastOnTime - Timestamp when compressor was last turned ON
 * @param minOnSec - Minimum ON time in seconds (typically 180s for small compressors)
 * @returns Result with allow flag and optional metadata for UI/logging
 * @throws {TimingValidationError} If inputs are invalid (negative, NaN, etc.)
 */
```

### F. Add Missing Test Cases

```typescript
// compressor-timing.test.ts - Add these test cases

describe('edge cases and validation', () => {
  it('should handle zero timestamps correctly', () => {
    const result = checkMinOn(true, false, 0, 0, 180);
    expect(result.allow).toBe(false);
  });

  it('should handle very large timestamps', () => {
    const largeTime = Number.MAX_SAFE_INTEGER - 1000;
    const result = checkMinOn(true, false, largeTime, largeTime - 200, 180);
    expect(result.allow).toBe(true);
  });

  it('should throw on negative timestamp', () => {
    expect(() => checkMinOn(true, false, -1, 0, 180)).toThrow(TimingValidationError);
  });

  it('should throw on NaN values', () => {
    expect(() => checkMinOn(true, false, NaN, 0, 180)).toThrow(TimingValidationError);
  });

  it('should throw on Infinity', () => {
    expect(() => checkMinOn(true, false, Infinity, 0, 180)).toThrow(TimingValidationError);
  });

  it('should throw when lastOnTime > now', () => {
    expect(() => checkMinOn(true, false, 100, 200, 180)).toThrow(TimingValidationError);
  });

  it('should throw on negative duration', () => {
    expect(() => checkMinOn(true, false, 1000, 900, -180)).toThrow(TimingValidationError);
  });

  it('should throw on zero duration', () => {
    expect(() => checkMinOn(true, false, 1000, 900, 0)).toThrow(TimingValidationError);
  });
});

describe('applyTimingConstraints edge cases', () => {
  it('should prioritize MIN_ON over MIN_OFF when both would fail', () => {
    // This scenario shouldn't happen in practice but tests priority
    const state: TimingState = { lastOnTime: 999, lastOffTime: 999 };
    const config: TimingConfig = { MIN_ON_SEC: 180, MIN_OFF_SEC: 300 };
    // When relay is ON and wanting to turn OFF
    const result = applyTimingConstraints(true, false, 1000, state, config);
    expect(result.reason).toBe('MIN_ON');
  });
});
```

### G. Use Spread Syntax Instead of Object.assign

```typescript
// compressor-timing.ts - Replace Object.assign
if (!minOnCheck.allow) {
  return {
    ...minOnCheck,
    allow: false,
    reason: 'MIN_ON' as const,
  };
}

if (!minOffCheck.allow) {
  return {
    ...minOffCheck,
    allow: false,
    reason: 'MIN_OFF' as const,
  };
}
```

### H. Create helpers.ts for Internal Functions (Optional)

If following the module pattern strictly, move `checkMinOn` and `checkMinOff` to `helpers.ts` and only export `applyTimingConstraints` from `compressor-timing.ts`. This would make the public API cleaner:

```typescript
// helpers.ts
export { checkMinOn, checkMinOff };

// compressor-timing.ts
import { checkMinOn, checkMinOff } from './helpers';
export { applyTimingConstraints };

// index.ts
export { applyTimingConstraints } from './compressor-timing';
export * from './types';
// Only export helpers if needed externally
```

## 4. Summary

The `compressor-timing` module has **excellent fundamentals**: clean architecture, good type safety, readable code, and solid basic test coverage. However, for a **safety-critical module protecting hardware**, it falls short on:

1. **Input validation** - Critical for hardware protection
2. **Error handling** - No custom errors or boundary checks
3. **Observability** - Zero logging makes debugging impossible

These issues must be addressed before this module can be considered production-ready for a system that protects physical hardware from damage.
