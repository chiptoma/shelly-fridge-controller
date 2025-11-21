# Loop.ts Structure Analysis Report

**File:** `src/controller/loop.ts`
**Date:** 2025-11-20
**Auditor:** Claude Code

---

## Executive Summary

The `loop.ts` file contains 8 helper functions that orchestrate the control loop. Most are well-designed orchestration functions, but there are **3 issues** requiring attention:

1. **Embedded algorithm** in `processAdaptiveHysteresis`
2. **Duplicated reset logic** in `processDailySummary`
3. **Missing formatting function** for daily summary messages

---

## Helper Function Analysis

### Functions That Should STAY in loop.ts

| Function | Lines | Reason |
|----------|-------|--------|
| `processSmoothing` | 209-239 | Pure orchestration; calls `updateMovingAverage()` from core |
| `processFreezeProtection` | 241-265 | Pure orchestration; calls `updateFreezeProtection()` from core |
| `processHighTempAlerts` | 267-311 | Pure orchestration; calls `updateHighTempAlerts()` from monitoring |
| `executeRelayChange` | 341-379 | Hardware coordination; timing logic already in core |
| `processPerformanceMetrics` | 381-410 | Pure orchestration; calls functions from monitoring |
| `processSensorHealth` | 112-207 | Complex but necessary orchestration with safety logic |

### Functions Requiring Refactoring

#### Issue #1: `processAdaptiveHysteresis` - Embedded Algorithm
**Importance: 7/10**

**Location:** [loop.ts:313-339](src/controller/loop.ts#L313-L339)

**Problem:** Business logic for shift calculation is embedded in controller:
```typescript
// Lines 325-329 - This is domain logic, not orchestration
if (dutyPercent > CONFIG.ADAPTIVE_HIGH_DUTY_PCT) {
  targetShift = Math.min(currentShift + 0.1, CONFIG.ADAPTIVE_MAX_SHIFT_C);
} else if (dutyPercent < CONFIG.ADAPTIVE_LOW_DUTY_PCT) {
  targetShift = Math.max(currentShift - 0.1, -CONFIG.ADAPTIVE_MAX_SHIFT_C);
}
```

**Remediation:** Create new file `src/core/adaptive-hysteresis.ts`:

```typescript
/**
 * Adaptive hysteresis calculation
 */

export interface AdaptiveConfig {
  ADAPTIVE_LOW_DUTY_PCT: number;
  ADAPTIVE_HIGH_DUTY_PCT: number;
  ADAPTIVE_MAX_SHIFT_C: number;
}

export interface AdaptiveState {
  currentShift: number;
}

export interface AdaptiveResult {
  newShift: number;
  changed: boolean;
}

/**
 * Calculate adaptive hysteresis shift based on duty cycle
 */
export function calculateAdaptiveShift(
  dutyPercent: number,
  currentShift: number,
  config: AdaptiveConfig
): AdaptiveResult {
  let targetShift = currentShift;

  if (dutyPercent > config.ADAPTIVE_HIGH_DUTY_PCT) {
    targetShift = Math.min(currentShift + 0.1, config.ADAPTIVE_MAX_SHIFT_C);
  } else if (dutyPercent < config.ADAPTIVE_LOW_DUTY_PCT) {
    targetShift = Math.max(currentShift - 0.1, -config.ADAPTIVE_MAX_SHIFT_C);
  }

  return {
    newShift: targetShift,
    changed: Math.abs(targetShift - currentShift) > 0.001
  };
}
```

Then in loop.ts:
```typescript
import { calculateAdaptiveShift } from '../core/adaptive-hysteresis';

function processAdaptiveHysteresis(state, isDebug, logger) {
  const dutyPercent = getDutyPercent(state.dutyOnSec, state.dutyOffSec);
  const baseOnAbove = CONFIG.SETPOINT_C + CONFIG.HYSTERESIS_C;
  const baseOffBelow = CONFIG.SETPOINT_C - CONFIG.HYSTERESIS_C;
  const currentShift = state.dynOnAbove - baseOnAbove;

  const result = calculateAdaptiveShift(dutyPercent, currentShift, CONFIG);

  if (result.changed) {
    state.dynOnAbove = baseOnAbove + result.newShift;
    state.dynOffBelow = baseOffBelow - result.newShift;

    if (isDebug) {
      logger.debug("Adaptive: duty=" + dutyPercent.toFixed(1) + "%, shift=" + result.newShift.toFixed(2) + "C");
    }
  }
}
```

---

#### Issue #2: `processDailySummary` - Duplicated Reset Logic
**Importance: 6/10**

**Location:** [loop.ts:446-459](src/controller/loop.ts#L446-L459)

**Problem:** Manual reset of 12+ fields duplicates logic from `resetDailyStats()` in [daily-summary.ts:181-208](src/monitoring/daily-summary.ts#L181-L208).

**Current code in loop.ts:**
```typescript
// Reset daily stats
state.dayOnSec = 0;
state.dayOffSec = 0;
state.dayAirMin = null;
state.dayAirMax = null;
state.dayAirSum = 0;
state.dayAirCount = 0;
state.dayEvapMin = null;
state.dayEvapMax = null;
state.dayEvapSum = 0;
state.dayEvapCount = 0;
state.dayFreezeCount = 0;
state.dayHighTempCount = 0;
state.lastDailySummaryDate = check.currentDate;
```

**Remediation:** Use `Object.assign()` with the existing `resetDailyStats()`:

```typescript
import { resetDailyStats } from '../monitoring';

// In processDailySummary:
Object.assign(state, resetDailyStats());
state.lastDailySummaryDate = check.currentDate;
```

---

#### Issue #3: Missing `formatDailySummary()` Function
**Importance: 5/10**

**Location:** [loop.ts:438-442](src/controller/loop.ts#L438-L442)

**Problem:** Complex message formatting embedded in controller:
```typescript
const msg = "Daily Summary (" + check.currentDate + "): " +
  "ON " + summary.onHours.toFixed(1) + "h (" + summary.dutyPct.toFixed(0) + "%), " +
  "Air " + (summary.airMin !== null ? summary.airMin.toFixed(1) : "n/a") + "/" + ...
```

**Remediation:** Add to `src/monitoring/daily-summary.ts`:

```typescript
/**
 * Format daily summary for logging
 */
export function formatDailySummary(summary: DailySummary, date: string): string {
  return "Daily Summary (" + date + "): " +
    "ON " + summary.onHours.toFixed(1) + "h (" + summary.dutyPct.toFixed(0) + "%), " +
    "Air " + (summary.airMin !== null ? summary.airMin.toFixed(1) : "n/a") + "/" +
    (summary.airMax !== null ? summary.airMax.toFixed(1) : "n/a") + "/" +
    (summary.airAvg !== null ? summary.airAvg.toFixed(1) : "n/a") + "C, " +
    "Evap " + (summary.evapMin !== null ? summary.evapMin.toFixed(1) : "n/a") + "/" +
    (summary.evapMax !== null ? summary.evapMax.toFixed(1) : "n/a") + "/" +
    (summary.evapAvg !== null ? summary.evapAvg.toFixed(1) : "n/a") + "C, " +
    "Freeze " + summary.freezeCount + ", HighTemp " + summary.highTempCount;
}
```

---

## Module Dependency Map

```
loop.ts
├── runControlLoop() - Main exported function
│   ├── processSensorHealth()
│   │   ├── sensors/monitor.ts → updateSensorHealth()
│   │   └── hardware/relay.ts → setRelay()
│   ├── processSmoothing()
│   │   └── core/smoothing.ts → updateMovingAverage(), isBufferFull()
│   ├── processFreezeProtection()
│   │   └── core/freeze-protection.ts → updateFreezeProtection()
│   ├── processHighTempAlerts()
│   │   └── monitoring/alerts.ts → updateHighTempAlerts()
│   ├── processAdaptiveHysteresis()
│   │   └── monitoring/duty-cycle.ts → getDutyPercent()
│   ├── executeRelayChange()
│   │   ├── core/timing.ts → applyTimingConstraints()
│   │   └── hardware/relay.ts → setRelay()
│   ├── processPerformanceMetrics()
│   │   └── monitoring/performance.ts → trackLoopExecution(), formatPerformanceSummary()
│   └── processDailySummary()
│       └── monitoring/daily-summary.ts → shouldGenerateSummary(), calculateSummary()
```

---

## Architectural Assessment

### What's Good

1. **Pure functions in domain modules** - Business logic is properly extracted to `src/core/`, `src/monitoring/`, `src/sensors/`
2. **Clear separation** - Hardware abstraction in `src/hardware/`
3. **Consistent pattern** - Most helpers follow: read state → call pure function → update state
4. **Dependency injection** - Functions receive config/state as parameters

### What Needs Improvement

1. **One algorithm not extracted** - Adaptive hysteresis calculation
2. **One DRY violation** - Daily stats reset
3. **Inconsistent formatting** - `formatPerformanceSummary()` exists but `formatDailySummary()` doesn't

---

## Recommended Refactoring Plan

### Phase 1: Extract Adaptive Hysteresis (High Value)
1. Create `src/core/adaptive-hysteresis.ts`
2. Create `src/core/adaptive-hysteresis.test.ts`
3. Update `src/core/index.ts` exports
4. Refactor `processAdaptiveHysteresis()` in loop.ts

### Phase 2: Fix Daily Summary Duplication (Medium Value)
1. Add `formatDailySummary()` to `src/monitoring/daily-summary.ts`
2. Update `src/monitoring/index.ts` exports
3. Refactor `processDailySummary()` to use `resetDailyStats()` and `formatDailySummary()`

### Phase 3: Add Tests (Required)
1. Create `src/controller/loop.test.ts` with comprehensive coverage

---

## Summary

| Issue | Importance | Effort | Action |
|-------|------------|--------|--------|
| Embedded adaptive algorithm | 7/10 | Medium | Extract to `src/core/` |
| Duplicated reset logic | 6/10 | Low | Use existing function |
| Missing format function | 5/10 | Low | Add to `src/monitoring/` |

**Overall structure rating: 8/10** - Well-organized with minor improvements needed.
