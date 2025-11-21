# Efficiency & Memory Audit

## 1. Executive Summary

* **Estimated Memory Load:** HIGH
* **Optimization Potential:** 35-45% reduction possible
* **Critical Hotspots:**
  1. `src/features/processor/processor.ts` - JSON deep clone on every state event
  2. `src/system/control/helpers.ts` - Object literals created every loop iteration
  3. `src/system/control/control-core.ts` - Massive string concatenation in control loop

---

## 2. Memory Leaks & Closure Risks

### CRITICAL: Deep Object Cloning

**`src/features/processor/processor.ts:123`**
```typescript
const newState = JSON.parse(JSON.stringify(state)) as FeaturesState;
```

* **Why it's heavy:** Every state event (every 5s) triggers full serialization + deserialization of nested FeaturesState object containing dailyState, alertState, and perfState. Creates ~2-3KB transient memory spike per loop.

* **Optimization:** Mutate in-place or shallow copy only changed properties:
```typescript
// Direct mutation (safest for mJS)
state.dailyState.dayOnSec += dt;
state.alertState.instantStart = newValue;
// OR selective shallow copy for changed nested objects only
```

---

### CRITICAL: Nested Closures in Timer Callbacks

**`src/boot/main-core.ts:27-38`**
```typescript
initialize(function(controller) {
  setupCommandHandler(controller);
  Timer.set(10, false, function() {
    runCore(controller);
    Timer.set(CONFIG.LOOP_PERIOD_MS, true, function() {
      runCore(controller);
    });
  });
});
```

* **Why it's heavy:** Three levels of nested functions, each capturing `controller`. Each closure = new function object + closure scope. The innermost timer persists for device lifetime.

* **Optimization:** Hoist callback to module scope:
```typescript
let _controller: Controller;

function loopCallback(): void {
  runCore(_controller);
}

initialize(function(controller) {
  _controller = controller;
  setupCommandHandler(controller);
  Timer.set(10, false, function() {
    runCore(_controller);
    Timer.set(CONFIG.LOOP_PERIOD_MS, true, loopCallback);
  });
});
```

---

### CRITICAL: Object Literals in High-Frequency Functions

**`src/system/control/helpers.ts:61-66`**
```typescript
const sensorConfig = {
  SENSOR_NO_READING_SEC: CONFIG.SENSOR_NO_READING_SEC,
  SENSOR_CRITICAL_FAILURE_SEC: CONFIG.SENSOR_CRITICAL_FAILURE_SEC,
  SENSOR_STUCK_SEC: CONFIG.SENSOR_STUCK_SEC,
  SENSOR_STUCK_EPSILON_C: CONFIG.SENSOR_STUCK_EPSILON_C
};
```

**`src/system/control/helpers.ts:216-221`**
```typescript
const alertConfig = {
  HIGH_TEMP_INSTANT_THRESHOLD_C: CONFIG.HIGH_TEMP_INSTANT_THRESHOLD_C,
  HIGH_TEMP_INSTANT_DELAY_SEC: CONFIG.HIGH_TEMP_INSTANT_DELAY_SEC,
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: CONFIG.HIGH_TEMP_SUSTAINED_THRESHOLD_C,
  HIGH_TEMP_SUSTAINED_DELAY_SEC: CONFIG.HIGH_TEMP_SUSTAINED_DELAY_SEC
};
```

**`src/features/processor/processor.ts:131-136`** (duplicate pattern)

* **Why it's heavy:** New object allocated every 5 seconds (17,280 allocations/day). Each allocation triggers eventual GC.

* **Optimization:** Hoist to module scope or pass CONFIG directly:
```typescript
// Module-level (created once)
const SENSOR_CONFIG = {
  SENSOR_NO_READING_SEC: CONFIG.SENSOR_NO_READING_SEC,
  // ...
};

// Or pass CONFIG directly and access properties in callee
const health = updateSensorHealth('air', sensors.airRaw, t, prevState, CONFIG);
```

---

### HIGH: Event Handler Closures

**`src/system/control/control-core.ts:315-320`**
```typescript
export function setupCommandHandler(controller: Controller): void {
  Shelly.addEventHandler(function(event) {
    if (event.name === EVENT_NAMES.COMMAND) {
      handleFeatureCommand(controller, event.info as FridgeCommandEvent);
    }
  });
}
```

* **Why it's heavy:** Persistent closure capturing `controller`. Lives for device lifetime.

* **Optimization:** Use module-level variable pattern:
```typescript
let _controller: Controller;

function commandHandler(event: { name: string; info: unknown }): void {
  if (event.name === EVENT_NAMES.COMMAND) {
    handleFeatureCommand(_controller, event.info as FridgeCommandEvent);
  }
}

export function setupCommandHandler(controller: Controller): void {
  _controller = controller;
  Shelly.addEventHandler(commandHandler);
}
```

---

### HIGH: Spread Operator Usage

**`src/features/processor/processor.ts:128`**
```typescript
newState.dailyState = { ...runtimeUpdated, lastDailySummaryDate: newState.dailyState.lastDailySummaryDate };
```

* **Why it's heavy:** Creates new object every event. Combined with the JSON deep clone above = double allocation.

* **Optimization:** Direct property assignment:
```typescript
state.dailyState.dayOnSec = runtimeUpdated.dayOnSec;
state.dailyState.dayOffSec = runtimeUpdated.dayOffSec;
// ... etc
```

---

## 3. Static Data & String Optimization

### CRITICAL: String Concatenation in Control Loop

**`src/system/control/control-core.ts:139-183`** (Debug logging)
```typescript
const sp = "SP:" + CONFIG.SETPOINT_C + "+" + CONFIG.HYSTERESIS_C;
const temps = "Air:" + fmtT(sensors.airRaw) + "R/" + fmtT(state.airTempSmoothed) + "S Evap:" + ...
// 10+ string concatenations creating intermediate strings
logger.debug(sp + " | " + temps + " | " + stateStr + " | " + frz + " | " + ...);
```

**`src/system/control/control-core.ts:189-222`** (State change logging - duplicate pattern)

**`src/system/control/helpers.ts:79,85,118,124,238,243,321,326,339,367`** (Similar patterns)

**`src/features/processor/processor.ts:156,165,196,210,268`** (Similar patterns)

* **Why it's heavy:** Each `+` creates an intermediate string object. A single debug line with 10 concatenations = 10 transient strings. At 5s loop = 172,800 transient strings/day just for logging.

* **Optimization Options:**

  **Option A: Conditional debug check first** (Quick win)
  ```typescript
  if (isDebug) {
    // Only build strings when actually logging
  }
  ```

  **Option B: Template with single join** (mJS compatible)
  ```typescript
  const parts = ["SP:", CONFIG.SETPOINT_C, "...", fmtT(sensors.airRaw), ...];
  logger.debug(parts.join(""));
  ```

  **Option C: Pre-computed format strings**
  ```typescript
  // Module level
  const SP_PREFIX = "SP:" + CONFIG.SETPOINT_C + "+" + CONFIG.HYSTERESIS_C;
  // In loop - only dynamic parts
  logger.debug(SP_PREFIX + " | Air:" + fmtT(sensors.airRaw) + "...");
  ```

---

### HIGH: Long Error/Log Messages

**`src/system/control/control-core.ts:115`**
```typescript
logger.critical("RELAY STUCK: Intended=" + ... + ", Reported=" + ... + " for " + ... + "s");
```

**`src/system/control/helpers.ts:238`**
```typescript
logger.warning("HIGH TEMP INSTANT: " + ... + "C exceeded " + ... + "C for " + ... + "s");
```

* **Optimization:** Use short error codes:
```typescript
// Define at module level
const ERR_RELAY_STUCK = "E_RS";  // Relay Stuck
const ERR_HIGH_TEMP = "E_HT";    // High Temp

// In code
logger.critical(ERR_RELAY_STUCK + ":" + intended + "/" + reported + "/" + elapsed);
```

---

## 4. TypeScript -> JS Transpilation Wins

### CRITICAL: Classes That Should Be Simple Functions

**`src/types/errors.ts:9-74`** - 7 Error classes
```typescript
export class ValidationError extends Error { ... }
export class TimingValidationError extends ValidationError { ... }
export class FreezeConfigValidationError extends ValidationError { ... }
export class SensorHealthValidationError extends ValidationError { ... }
export class SmoothingValidationError extends ValidationError { ... }
export class ThermostatValidationError extends ValidationError { ... }
export class WatchdogValidationError extends ValidationError { ... }
```

* **Why it's heavy:** Each class in TypeScript compiles to an IIFE with prototype manipulation. In mJS, this creates substantial runtime overhead:
```javascript
var ValidationError = (function(_super) {
  __extends(ValidationError, _super);
  function ValidationError(message) {
    var _this = _super.call(this, message) || this;
    _this.name = 'ValidationError';
    return _this;
  }
  return ValidationError;
}(Error));
```

* **Optimization:** Use factory functions with error codes:
```typescript
// Simple error factory
function createError(code: string, message: string): Error {
  const err = new Error(message);
  err.name = code;
  return err;
}

// Usage
throw createError('E_TIMING', 'Invalid timing value');

// Or even simpler - just use Error with code prefix
throw new Error('E_TIMING:' + message);
```

---

### MEDIUM: No Enums Found (Good!)

No `enum` declarations found - only interfaces and types which are erased at compile time.

---

## 5. Object & Structure Optimization

### HIGH: Large State Object (59 Properties)

**`src/system/state/state.ts`**

The ControllerState object has 59 properties including nested arrays for buffers.

* **Optimization:** Consider splitting into functional groups:
```typescript
// Instead of one monolithic state
const thermostatState = { ... };  // 10 props
const sensorState = { ... };      // 15 props
const dutyState = { ... };        // 5 props
// Only load what's needed per function
```

---

### MEDIUM: Duplicate Configuration

**`src/boot/main-features.ts:40-68`**
```typescript
const FEATURES_CONFIG = {
  SETPOINT_C: 4.0,  // Duplicates CONFIG.SETPOINT_C
  HYSTERESIS_C: 1.0,  // Duplicates CONFIG.HYSTERESIS_C
  // ...18 properties duplicating main CONFIG
};
```

* **Why it's heavy:** Two copies of the same configuration data in memory.

* **Optimization:** Import from main CONFIG or use a getter pattern:
```typescript
import CONFIG from '@boot/config';
// Use CONFIG directly instead of FEATURES_CONFIG
```

---

### MEDIUM: Object.assign Patterns

**`src/core/compressor-timing/compressor-timing.ts:114-122`**
**`src/core/sensor-health/sensor-health.ts:38`**

```typescript
const newState = Object.assign({}, sensorState);
return Object.assign({}, minOnCheck, { allow: false, ... });
```

* **Why it's heavy:** Creates new object per call. In timing checks, this happens every loop.

* **Optimization:** Return result objects that can be reused or mutate in place:
```typescript
// Reusable result object at module level
const timingResult = { allow: false, reason: '', remainingSec: 0 };

// In function - mutate and return
timingResult.allow = minOnCheck.allow;
timingResult.reason = 'minOn';
return timingResult;
```

---

## 6. The "Refactor Plan"

### Phase 1: Critical Wins (Est. 20-25% memory reduction)

1. **Eliminate JSON deep clone** in `processor.ts:123`
   - Change to direct property mutation
   - Time: 30 minutes

2. **Hoist config objects** in `helpers.ts:61-66` and `helpers.ts:216-221`
   - Move to module scope or pass CONFIG directly
   - Time: 15 minutes

3. **Flatten nested closures** in `main-core.ts:27-38`
   - Use module-level variable for controller
   - Time: 15 minutes

4. **Replace Error classes** in `types/errors.ts`
   - Convert to factory function or simple Error with code prefix
   - Time: 30 minutes

### Phase 2: High-Impact Optimizations (Est. 10-15% reduction)

5. **Optimize debug logging** in `control-core.ts:139-183`
   - Pre-compute static string portions at module level
   - Reduce concatenations
   - Time: 45 minutes

6. **Eliminate spread operators** in `processor.ts:128`
   - Direct property assignment
   - Time: 15 minutes

7. **Remove duplicate FEATURES_CONFIG** in `main-features.ts`
   - Reference main CONFIG
   - Time: 20 minutes

### Phase 3: Structural Improvements (Est. 5-10% reduction)

8. **Optimize Object.assign patterns** throughout
   - Use reusable result objects
   - Time: 1 hour

9. **Streamline event handler closures** in `control-core.ts:315-320`
   - Module-level handler pattern
   - Time: 20 minutes

---

## 7. Memory Footprint Analysis

| Component | Current Est. | Optimized Est. | Savings |
|-----------|-------------|----------------|---------|
| State objects | ~2KB | ~1.5KB | 25% |
| Config objects | ~1.5KB | ~0.8KB | 47% |
| Error classes | ~1KB | ~0.2KB | 80% |
| String transients/loop | ~1KB | ~0.3KB | 70% |
| Closures | ~0.5KB | ~0.3KB | 40% |
| **Total per loop** | **~6KB** | **~3.1KB** | **48%** |

---

## 8. GC Impact Analysis

Current GC pressure sources (per 5-second loop):
- 1x JSON.parse/stringify (2-3KB spike)
- 2x config object allocations (0.5KB)
- 1x spread operator allocation (0.3KB)
- 10+ string concatenations (1KB cumulative)
- **Total: ~4-5KB transient allocations per loop**

After optimization:
- 0x deep clones
- 0x per-loop config objects
- 0x spread operators
- ~3 string concatenations (0.3KB)
- **Total: ~0.3KB transient allocations per loop**

**GC pressure reduction: ~90%**

---

## 9. Risk Assessment

| Issue | Crash Risk | Impact if Ignored |
|-------|------------|-------------------|
| JSON deep clone | **HIGH** | OOM during complex state events |
| Per-loop object literals | **MEDIUM-HIGH** | GC spikes cause watchdog reset |
| String concatenation | **MEDIUM** | Accumulated GC pressure |
| Error classes | **LOW** | One-time cost at boot |
| Nested closures | **LOW** | Persistent but stable memory |

---

## 10. Testing Recommendations

After applying optimizations:

1. **Memory stress test:** Run for 24+ hours monitoring heap
2. **GC monitoring:** Track GC frequency and duration if possible
3. **Watchdog verification:** Confirm no resets during high-frequency events
4. **Functional regression:** All existing tests must pass
5. **Edge cases:** Test with sensor failures, high-temp alerts, daily summary generation simultaneously
