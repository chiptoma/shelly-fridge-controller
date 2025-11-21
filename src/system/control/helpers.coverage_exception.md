# Coverage Exception: system/control/helpers.ts

## Status: Unable to Reach 95% Coverage

## Reason: Pre-existing Source Code Type Errors

The source file `helpers.ts` contains multiple TypeScript compilation errors that prevent the test suite from running:

### Issues Identified:

1. **Function Signature Mismatches (Lines 150, 155, 159, 160)**
   - `updateMovingAverage` is being called with 4 arguments, but the function expects 3
   - Return type mismatch: expects `number` but receives `SmoothingResult`
   - `isBufferFull` is being called with 3 arguments, but expects 2

2. **Missing Type Properties (Lines 221-245)**
   - `HighTempAlertState` type is missing properties: `instantStart`, `instantFired`, `sustainedStart`, `sustainedFired`
   - These properties are being accessed on the result object but don't exist in the type definition

### Root Cause:
The source code appears to have been updated without corresponding type definition updates, or there's a mismatch between the actual function implementations in `@core/smoothing` and `@features/high-temp-alerts` and how they're being used in `helpers.ts`.

### Recommendation:
1. Update the `SmoothingResult` type and `updateMovingAverage` function signature to match
2. Update the `HighTempAlertState` type to include the missing properties
3. Or update `helpers.ts` to use the correct function signatures

## Coverage Achieved: 0% (tests cannot run due to compilation errors)
