# Byte-Level Memory Audit

**Target Device:** Shelly 1PM (Gen3/Plus)
**Constraint:** ~25KB Heap (Max ~1700 blocks)
**Current Status:** CRITICAL - Used: 1403, Peak: 1577 blocks
**Goal:** Find 300+ blocks of savings

---

## 1. The "Fat" Objects (Object -> Array Conversion)

*These objects are hemorrhaging RAM through verbose key storage.*

| Object Name | Location | Current Cost | Proposed Change | Savings |
|:---|:---|:---|:---|:---|
| `FridgeUserConfig` | `src/boot/config.ts:9-328` | ~120 blocks (52 keys × ~23 bytes avg) | Convert to `const CFG = [...]` with index constants | **~100 blocks** |
| `ControllerState` | `src/system/state/types.ts:2-124` | ~140 blocks (63 properties) | Convert to flat array `ST = []` with bitmask for booleans | **~110 blocks** |
| `APP_CONSTANTS` | `src/boot/config.ts:336-415` | ~25 blocks | Merge into CFG array | **~20 blocks** |
| `FEATURES_CONFIG` | `src/boot/main-features.ts:40-68` | ~50 blocks (17 keys) | **DELETE** - duplicates boot/config.ts values | **~50 blocks** |
| `dailyState` | `src/boot/main-features.ts:74-107` | ~40 blocks (13 properties) | Convert to array `DS = [0,0,null,...]` | **~35 blocks** |

### Critical Key Renames Required

**src/boot/config.ts** - Rename all 52 keys:
```javascript
// BEFORE: ~1200 bytes in key strings
AIR_SENSOR_SMOOTHING_SEC        // 23 bytes
EVAP_SENSOR_SMOOTHING_SEC       // 24 bytes
FREEZE_PROTECTION_START_C       // 26 bytes
HIGH_TEMP_INSTANT_THRESHOLD_C   // 27 bytes
// ... 48 more

// AFTER: ~100 bytes total
const CFG = [
  // Index constants at top of file
  // 0: AIR_SMOOTH, 1: EVAP_SMOOTH, 2: FRZ_START, etc.
  5,    // [0] Air smoothing sec
  5,    // [1] Evap smoothing sec
  -2,   // [2] Freeze protection start C
  10,   // [3] High temp instant threshold C
  // ...
];
```

---

## 2. String Optimization (The "Dictionary" Strategy)

### A. Emoji Log Prefixes (HIGH IMPACT)

**Location:** `src/system/control/control-core.ts:189-222` and `src/logging/logger.ts:80-83`

```javascript
// BEFORE: ~300 bytes created per state change
const sp = "??" " + CONFIG.SETPOINT_C + "±" + CONFIG.HYSTERESIS_C + "C";
const temps = "??" Air:" + fmtT(sensors.airRaw) + "R/" + ...;
const frz = "?? " + (state.freezeLocked ? "ON" : "OFF");

// AFTER: Extract to constants (~60 bytes once)
const E = ["?? ", "?? ", "?? ", "?? ", "?? "]; // 0:target,1:temp,2:freeze,3:sensor,4:duty
```

**Savings: ~240 bytes per state change**

### B. Log Level Tags

**Location:** `src/logging/logger.ts:80-83`

```javascript
// BEFORE: Created every log call
let tag = "[DEBUG]    ";
if (level === logLevels.INFO) tag = "?? [INFO]     ";
if (level === logLevels.WARNING) tag = "?? [WARNING]  ";
if (level === logLevels.CRITICAL) tag = "?? [CRITICAL] ";

// AFTER: Pre-created array
const T = ["[D]", "?? [I]", "?? [W]", "?? [C]"];
```

**Savings: ~40 bytes per log call**

### C. Duplicate Error Strings

| String | Occurrences | Files | Optimization |
|:---|:---|:---|:---|
| `"INIT FAIL: "` | 5 | init.ts | Extract: `const IF="INIT FAIL: ";` |
| `"HIGH TEMP INSTANT: "` | 3 | helpers.ts, main-features.ts | Extract: `const HTI="HTI:";` |
| `"HIGH TEMP SUSTAINED: "` | 3 | helpers.ts, main-features.ts | Extract: `const HTS="HTS:";` |
| `"Air sensor "` | 8+ | multiple | Extract: `const AS="Air ";` |
| `"Evap sensor "` | 8+ | multiple | Extract: `const ES="Evap ";` |
| `"sensor offline for "` | 4 | multiple | Extract: `const SOF=" off ";` |
| `"sensor recovered"` | 4 | multiple | Extract: `const SRC=" ok";` |

**Savings: ~350 bytes**

### D. Validation Error Messages

**Location:** `src/validation/validator.ts:9-52`

```javascript
// BEFORE: 7 variations of "Must be between X and Y"
errors.push({ field: 'AIR_SENSOR_ID', message: 'Must be between 0 and 255' });

// AFTER: Error codes only
errors.push({ f: 'A', c: 1 }); // A=AIR_SENSOR, 1=range_0_255
```

**Savings: ~500 bytes**

---

## 3. Closure Traps (Memory Leaks)

*Every closure captures its scope chain, wasting RAM on every call.*

### CRITICAL Priority

| Location | Issue | Fix | Savings |
|:---|:---|:---|:---|
| `src/logging/slack/slack-sink.ts:181-195` | Two nested callbacks in `sendToSlack` capture 7+ variables | Flatten to single function with explicit params | **~60 blocks** |
| `src/boot/main-features.ts:270-274` | Event handler captures 10+ module variables | Pass state as single object param | **~50 blocks** |
| `src/logging/slack/slack-sink.ts:175-215` | Triple-nested init closures | Flatten initialization chain | **~40 blocks** |

### HIGH Priority

| Location | Issue | Fix | Savings |
|:---|:---|:---|:---|
| `src/logging/console/console-sink.ts:49-62` | `drain()` captures buffer, consoleApi, config | Inline drain logic | **~25 blocks** |
| `src/hardware/relay/relay.ts:32-52` | Callback captures desiredOn, callback | Pre-create relay response handler | **~20 blocks** |
| `src/boot/main-core.ts:43-46` | Timer callback captures _controller | Use direct module reference | **~15 blocks** |

### Example Refactor

```javascript
// BEFORE: slack-sink.ts:181-195 (captures 7 vars per send)
sendToSlack(message,
  function onSuccess() {
    buffer.shift();
    currentRetryDelay = config.retryDelayMs;
    if (buffer.length > 0) processBuffer();
    else retryTimerActive = false;
  },
  function onFailure() {
    message.retries++;
    if (message.retries >= config.maxRetries) buffer.shift();
    // ...
  }
);

// AFTER: Single handler with message index
function handleSlackResult(success, msgIdx) {
  if (success) {
    buffer.splice(msgIdx, 1);
    currentRetryDelay = retryDelayMs;
  } else {
    buffer[msgIdx].retries++;
    if (buffer[msgIdx].retries >= maxRetries) buffer.splice(msgIdx, 1);
  }
  if (buffer.length > 0) processBuffer();
  else retryTimerActive = false;
}
```

---

## 4. Phantom Enums & Constants

### Convert to Numeric Constants

**Location:** `src/boot/config.ts:341-346`

```javascript
// BEFORE: Object with string keys (~25 bytes)
LOG_LEVELS: {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
}

// AFTER: Direct constants (0 bytes object overhead)
const LD=0, LI=1, LW=2, LC=3;
```

**Savings: ~30 blocks**

### Event Names

**Location:** `src/events/types.ts:64-68`

```javascript
// BEFORE
export const EVENT_NAMES = {
  STATE: 'fridge_state',    // 12 + 5 = 17 bytes
  ALERT: 'fridge_alert',    // 12 + 5 = 17 bytes
  COMMAND: 'fridge_command' // 14 + 7 = 21 bytes
}

// AFTER: Single character events
const EN_S='s', EN_A='a', EN_C='c';
```

**Savings: ~60 bytes**

---

## 5. Unnecessary Exports

### Functions to Internalize

**Location:** `src/system/control/helpers.ts`

| Function | Lines | Used By | Action |
|:---|:---|:---|:---|
| `processHighTempAlerts()` | 235-280 | **NOT CALLED** in core | DELETE |
| `processAdaptiveHysteresis()` | 285-340 | **NOT CALLED** in core | DELETE |
| `processPerformanceMetrics()` | 345-400 | **NOT CALLED** in core | DELETE |
| `processDailySummary()` | 405-450 | **NOT CALLED** in core | DELETE |
| `applySensorHealthToState()` | 45-80 | Internal only | Remove export |

**Location:** `src/core/freeze-protection/helpers.ts`

| Function | Used By | Action |
|:---|:---|:---|
| `shouldEngageFreezeLock()` | freeze-protection.ts only | Remove export |
| `shouldReleaseFreezeLock()` | freeze-protection.ts only | Remove export |

**Savings: ~50 blocks**

---

## 6. Defensive Coding Bloat

### Error Message Simplification

```javascript
// BEFORE: control-core.ts:256-260
} catch (e) {
  const errorMsg = e instanceof Error ? e.message : String(e);
  logger.critical("Control loop crashed: " + errorMsg);
  state.consecutiveErrors++;
}

// AFTER: Error code only
} catch (e) {
  logger.critical(99); // Error code lookup
  state.consecutiveErrors++;
}
```

### Slack Error Simplification

```javascript
// BEFORE: slack-sink.ts:162-165
} catch (err) {
  console.warn('Slack send exception: ' + err);
  onFailure();
}

// AFTER
} catch (e) {
  onFailure();
}
```

**Savings: ~40 blocks**

---

## 7. The "Nuclear" Options

*Features too expensive for 25KB heap - consider removal*

### A. Slack Notification System (~150-200 blocks)

**Location:** `src/logging/slack/` directory

**Cost breakdown:**
- Buffer array for queued messages: ~80 blocks
- HTTP request object construction: ~40 blocks
- Retry timer callbacks: ~40 blocks
- Webhook URL storage: ~20 blocks

**Alternative:** Use Shelly built-in webhooks (free)

### B. Daily Summary Feature (~100 blocks)

**Location:** `src/features/daily-summary/` and `src/boot/main-features.ts:74-107`

**Cost breakdown:**
- dailyState object: ~40 blocks
- Summary string construction: ~30 blocks
- Date tracking: ~15 blocks
- Format functions: ~15 blocks

**Alternative:** Log raw values only, compute externally

### C. Performance Metrics (~60 blocks)

**Location:** `src/boot/main-features.ts:perfState`

**Cost breakdown:**
- perfState object: ~30 blocks
- Loop timing calculations: ~15 blocks
- Histogram buckets: ~15 blocks

**Alternative:** Sample every Nth loop only

### D. Adaptive Hysteresis (~50 blocks)

**Location:** Algorithm state and calculations

**Alternative:** Fixed hysteresis values

---

## 8. Per-Loop Allocation Hotspots

### Control Loop Variables

**Location:** `src/system/control/control-core.ts:84-92`

```javascript
// BEFORE: 5 allocations per loop
const t = now();
const loopStartSec = t;
const loopStartMs = nowMs();
const sensors = readAllSensors(Shelly, CONFIG);
const dt = calculateTimeDelta(t, state.lastLoopTime, CONFIG.LOOP_PERIOD_MS);

// AFTER: Reuse module-level scratch objects
let t, loopStartMs, dt;
const sensors = {airRaw: null, evapRaw: null}; // Pre-allocated

function runCore() {
  t = now();
  loopStartMs = nowMs();
  readAllSensors(Shelly, CONFIG, sensors); // Mutate in place
  dt = calculateTimeDelta(t, state.lastLoopTime);
  // ...
}
```

**Savings: ~15 blocks per loop (× thousands of loops)**

---

## 9. Duplicate Config Objects

### FEATURES_CONFIG Duplication

**Location:** `src/boot/main-features.ts:40-68`

This entire object duplicates values from `src/boot/config.ts`.

**Action:** DELETE and import from config.ts

**Savings: ~50 blocks**

### SENSOR_CONFIG and ALERT_CONFIG

**Location:** `src/system/control/helpers.ts:31-43`

```javascript
// BEFORE: Copies from CONFIG
const SENSOR_CONFIG = {
  SENSOR_NO_READING_SEC: CONFIG.SENSOR_NO_READING_SEC,
  // ...
};

// AFTER: Direct CONFIG access
// Delete these objects entirely, use CONFIG.SENSOR_NO_READING_SEC directly
```

**Savings: ~30 blocks**

---

## Estimated Total Savings

### By Category

| Category | Conservative | Aggressive |
|:---|:---|:---|
| Object -> Array conversion | 180 blocks | 315 blocks |
| String dictionary extraction | 80 blocks | 120 blocks |
| Closure flattening | 100 blocks | 210 blocks |
| Enum/constant optimization | 15 blocks | 35 blocks |
| Export removal | 30 blocks | 50 blocks |
| Error message simplification | 20 blocks | 40 blocks |
| Per-loop allocation reuse | 10 blocks | 30 blocks |
| Config deduplication | 40 blocks | 80 blocks |
| **SUBTOTAL** | **475 blocks** | **880 blocks** |

### Nuclear Options (Feature Removal)

| Feature | Savings |
|:---|:---|
| Slack notifications | 150-200 blocks |
| Daily summary | 80-100 blocks |
| Performance metrics | 50-60 blocks |
| Adaptive hysteresis | 40-50 blocks |
| **SUBTOTAL** | **320-410 blocks** |

---

## FINAL TOTALS

| Approach | Estimated Savings | Remaining Headroom |
|:---|:---|:---|
| **Conservative** (code optimization only) | **475 blocks** | 297 + 475 = **772 blocks free** |
| **Aggressive** (all code optimizations) | **880 blocks** | 297 + 880 = **1177 blocks free** |
| **Nuclear** (+ feature removal) | **1200-1290 blocks** | 297 + 1290 = **1587 blocks free** |

---

## Recommended Action Plan

### Phase 1: Quick Wins (2-3 hours)
- [ ] Delete FEATURES_CONFIG duplication (+50 blocks)
- [ ] Delete SENSOR_CONFIG and ALERT_CONFIG duplication (+30 blocks)
- [ ] Extract emoji/log string constants (+40 blocks)
- [ ] Remove unused function exports (+30 blocks)

**Expected: +150 blocks**

### Phase 2: Object Conversion (4-6 hours)
- [ ] Convert FridgeUserConfig to array (+100 blocks)
- [ ] Convert ControllerState to array (+110 blocks)
- [ ] Create index constants for all arrays

**Expected: +210 blocks**

### Phase 3: Closure Optimization (3-4 hours)
- [ ] Flatten Slack sink callbacks (+60 blocks)
- [ ] Flatten event handler scope (+50 blocks)
- [ ] Pre-create console drain handler (+25 blocks)

**Expected: +135 blocks**

### Phase 4: Nuclear Options (if needed)
- [ ] Evaluate Slack removal
- [ ] Evaluate daily summary simplification
- [ ] Evaluate performance metrics sampling

---

## Verification Commands

After optimization, verify savings with:

```javascript
// Add to boot sequence
print("Heap: " + Shelly.getComponentStatus("sys").ram_free);
print("Blocks: " + JSON.stringify(Shelly.getDeviceInfo()).match(/heap/));
```

Monitor peak usage during:
1. Cold boot
2. First control loop
3. Sensor failure event
4. Slack notification (if retained)
5. Daily summary generation (if retained)

---

*Audit generated: 2025-11-21*
*Auditor: Memory Profiler Agent*
