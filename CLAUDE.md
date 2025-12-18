# Shelly Fridge Controller - Project Coding Standards

## Project Overview

Memory-constrained Shelly Plus 1PM device controller for refrigeration system with adaptive temperature control. The project prioritizes **memory efficiency over code elegance** due to severe hardware limitations (~25KB heap).

**Key Constraints:**
- Runtime memory: ~15KB typical, ~25KB peak limit
- Bundle size: 32KB max (scripts fail to upload beyond this)
- JavaScript only (Shelly mJS runtime, ES5-ish with ES6 modules)
- No classes, minimal closures, pre-allocated structures

## Shelly API Reference

**IMPORTANT:** For detailed information about Shelly Script APIs, language features, and platform capabilities, refer to the official Shelly documentation:
- [Script Language Features](https://shelly-api-docs.shelly.cloud/gen2/Scripts/ShellyScriptLanguageFeatures) - JavaScript features and limitations
- [Script Tutorial](https://shelly-api-docs.shelly.cloud/gen2/Scripts/Tutorial) - Getting started guide
- [KVS API](https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/KVS) - Key-Value Store persistence

Key points for this project:
- JavaScript engine: mJS (ES5-ish with ES6 modules)
- Global APIs: `Shelly.call()`, `Shelly.getComponentStatus()`, `Timer.set()`, `MQTT.*`, `print()`
- Memory constraints: ~25KB heap limit, no classes, minimal closures

---

## Project Structure

```
fridge/
├── src/                        # Source files (JavaScript)
│   ├── constants.js            # Compile-time constants (ST, RSN, ALM, ICO, ADAPT)
│   ├── config.js               # User configuration with KVS persistence
│   ├── state.js                # Runtime state (S=persisted, V=volatile)
│   ├── sensors.js              # Temperature sensor reading and smoothing
│   ├── control.js              # Relay control and thermostat logic
│   ├── features.js             # Optional features (turbo, door, defrost, etc.)
│   ├── protection.js           # Safety systems (freeze, weld, ghost detection)
│   ├── alarms.js               # Fault management and alarm escalation
│   ├── metrics.js              # Duty cycle tracking and hourly statistics
│   ├── reporting.js            # Console output and MQTT publishing
│   ├── mqtt.js                 # MQTT command handler
│   ├── loop.js                 # Main control loop
│   ├── main.js                 # Entry point and boot sequence
│   ├── *.test.js               # Co-located unit tests
│   └── utils/                  # Shared utilities
│       ├── kvs.js              # KVS operations (loadChunksSeq, syncToKvs)
│       ├── kvs.test.js
│       ├── math.js             # Math utilities (r1, ri, clamp, formatXmYs)
│       └── math.test.js
├── test/                       # Additional tests
│   ├── integration/            # Integration tests
│   ├── simulations/            # Long-running simulation tests
│   ├── bundle/                 # Bundle validation tests
│   └── utils/                  # Test utilities (Shelly simulator)
├── tools/                      # Build tooling
│   ├── concat.cjs              # Bundle concatenation (includes FILE_ORDER)
│   ├── minify.cjs              # Terser minification with reserved names
│   ├── validate-bundle.cjs     # Bundle syntax validation
│   └── shelly-deploy/          # Deployment CLI (TypeScript)
├── dist/                       # Build output
│   ├── bundle.js               # Concatenated bundle (intermediate)
│   └── main.js                 # Minified bundle for deployment
├── vitest.config.ts            # Test configuration
├── eslint.config.ts            # Linting configuration
└── package.json                # Scripts and dependencies
```

---

## File Organization

### Flat Architecture (Not Modular)

This project uses a **flat file structure**, not a modular TypeScript architecture. Each concern gets one file:

```
src/
├── module.js           # Implementation
└── module.test.js      # Co-located tests
```

**Why flat?**
1. Shelly mJS cannot import from subdirectories reliably
2. Fewer files = smaller concatenated bundle
3. Simpler mental model for memory-constrained device

### File Naming Conventions

| Pattern | Purpose |
|---------|---------|
| `module.js` | Main implementation |
| `module.test.js` | Unit tests for module |
| `utils/*.js` | Shared utilities only |

### Import Pattern

All imports use relative paths within `src/`:

```javascript
// Good - relative imports
import { ST, RSN, ALM } from './constants.js'
import { C } from './config.js'
import { S, V } from './state.js'
import { r1, ri } from './utils/math.js'
import { loadChunksSeq, syncToKvs } from './utils/kvs.js'

// Bad - no path aliases, no deep imports
import { something } from '$/module'  // NOT USED
import { something } from '@/module'  // NOT USED
```

---

## State Architecture

### Three-Tier Data Model

```
CONSTANTS (constants.js)          CONFIG (config.js)           STATE (state.js)
━━━━━━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━━━━          ━━━━━━━━━━━━━━━━━
Compile-time, never change         User-configurable            Runtime values

ST = { BOOT, IDLE, RUN, ... }     C.ctl_targetDeg = 4          S.sys_isRelayOn = false
RSN = { NONE, TEMP, TIMER }       C.ctl_hystDeg = 1.0          S.sts_lifeRunSec = 0
ALM = { NONE, TEMP, SENSOR }      C.trb_enable = true          V.sys_status = 'IDLE'
                                  ...                           V.trb_isActive = false

Never modified                    Loaded from KVS at boot       S = persisted to KVS
                                  User can change via MQTT      V = volatile (lost on restart)
```

### Persisted State (S) vs Volatile State (V)

```javascript
// state.js - Persisted state survives restarts
let S = {
  sys_relayOnTs: 0,        // Timestamp when relay turned on
  sys_isRelayOn: false,   // Current relay state
  sts_lifeRunSec: 0,        // Lifetime run seconds
  sts_dutyHistArr: [...],    // 24-hour duty history
  // ... critical state
}

// state.js - Volatile state resets on restart
let V = {
  sys_status: 'BOOT',      // Current status (BOOT, IDLE, RUN, etc.)
  sys_alarm: 'NONE',       // Active alarm
  sns_airSmoothDeg: null,    // Smoothed temperature
  trb_isActive: false,     // Turbo mode state
  lop_nowTs: 0,            // Current timestamp (set each tick)
  // ... transient state
}
```

### KVS Key Mappings

State and config are chunked for efficient KVS storage:

```javascript
// config.js - Config chunks (3-letter prefixes: ctl_, trb_, adt_, cmp_, etc.)
let CFG_KEYS = {
  'fridge_cfg_ctl': ['ctl_targetDeg', 'ctl_hystDeg', 'ctl_smoothAlpha'],
  'fridge_cfg_trb': ['trb_enable', 'trb_targetDeg', 'trb_hystDeg', 'trb_maxTimeSec'],
  // ... adt_, cmp_, lmp_, dor_, dfr_, wld_, sns_, alm_, pwr_, gas_
}

// state.js - State chunks
let ST_KEYS = {
  'fridge_st_core': ['sys_relayOnTs', 'sys_relayOffTs', 'sys_isRelayOn', ...],
  'fridge_st_stats': ['sts_lifeTotalSec', 'sts_lifeRunSec', 'sts_histIdx', ...],
  'fridge_st_hist': ['sts_dutyHistArr'],  // Separate chunk: large 24-element array
  'fridge_st_faults': ['flt_fatalArr', 'flt_critArr', 'flt_errorArr', 'flt_warnArr'],
}
```

---

## Memory Optimization Patterns

### Critical Rules

1. **No Classes**: Functions and plain objects only
2. **No Closures**: Avoid nested functions capturing scope
3. **No Spread Operators**: Creates copies (memory waste)
4. **Pre-allocate Arrays**: Create once, reuse forever
5. **Short Variable Names**: In production callbacks
6. **Direct Mutation**: No immutability patterns

### Good Patterns

```javascript
// Pre-allocated buffer (reused every tick)
let V = {
  sns_airBuf: [0, 0, 0],  // Fixed-size, reused
  sns_bufIdx: 0,
}

// Direct mutation (no copies)
function updateBuffer(value) {
  V.sns_airBuf[V.sns_bufIdx] = value
  V.sns_bufIdx = (V.sns_bufIdx + 1) % 3
}

// Simple for-loops (no forEach, no map)
for (let i = 0; i < arr.length; i++) {
  // ...
}

// Short callback params (Shelly convention)
Shelly.call('KVS.Get', { key: k }, function($_r, $_e, $_m) {
  if ($_e === 0 && $_r) { /* success */ }
})

// Global timestamp (avoids Date.now() allocation in callbacks)
// V.lop_nowTs is set once per tick in loop.js, used everywhere else
V.lop_nowTs = Math.floor(Date.now() / 1000)  // Set at tick start

// In callbacks/handlers, use V.lop_nowTs instead of Date.now()
function handleSomething() {
  let elapsed = V.lop_nowTs - S.sys_relayOnTs  // Good - no allocation
  // let elapsed = Date.now()/1000 - S.sys_relayOnTs  // Bad - allocates
}
```

### Bad Patterns (Avoid)

```javascript
// Classes add overhead
class ThermostatController { }  // BAD

// Spread creates copies
const newState = { ...oldState, key: value }  // BAD

// forEach/map create closures
array.forEach(item => { })  // BAD
array.map(x => x * 2)       // BAD

// Object destructuring in params
function foo({ a, b }) { }  // BAD - creates temp object
```

### Sequential KVS Loading

Peak memory spikes occur during boot when loading config/state. Use sequential loading to allow GC between chunks:

```javascript
// Sequential loading (reduces peak memory)
loadChunksSeq(ST_KEYS, S, function(loadedChunks) {
  // Each chunk loaded, parsed, merged, then GC'd
  // before next chunk loads
})

// NOT batch loading (causes memory spike)
// fetchAllKvs('fridge_*', ...) // REMOVED - caused 25KB peak
```

---

## Build Pipeline

### Bundle Creation

The build process concatenates and minifies source files:

```bash
# Full build pipeline
npm run build
# 1. tools/concat.cjs - Concatenates src/*.js in dependency order
# 2. tools/minify.cjs - Minifies with terser, preserves reserved names
# 3. tools/validate-bundle.cjs - Syntax validation

# Individual steps (if needed)
npm run build:concat    # Step 1 only
npm run build:minify    # Steps 2 + 3
```

### File Concatenation Order

Defined in `FILE_ORDER` array within `tools/concat.cjs`. Files are ordered in dependency tiers:

| Tier | Files | Purpose |
|------|-------|---------|
| 0 | constants.js | Pure data (no deps) |
| 1 | config.js | Configuration |
| 2 | utils/math.js, utils/kvs.js | Pure utilities |
| 3 | state.js | State (depends on kvs, math) |
| 4 | sensors.js | Hardware sensors |
| 5-8 | alarms, protection, features, metrics | Business logic |
| 9 | reporting.js | Status reporting |
| 10 | control.js | Thermostat control |
| 11 | loop.js | Main loop |
| 12 | mqtt.js | MQTT handlers |
| 13 | main.js | Entry point (must be last) |

### Minification Reserved Names

`tools/minify.cjs` reserves names that must not be mangled. Due to Shelly mJS scope leakage issues, the reserved list is extensive:

```javascript
reserved: [
  // ALL single letters banned (prevents collision with callback params)
  'a', 'b', 'c', ..., 'z', 'A', 'B', ..., 'Z', '_',

  // Math helpers (used everywhere)
  'ri', 'r1', 'r2', 'r3', 'nowSec', 'formatXmYs', 'getMedian3', 'calcEMA',

  // KVS functions (async callbacks)
  'pickKeys', 'loadChunksSeq', 'syncToKvs', 'saveAllToKvs', 'chunkNeedsSync',

  // Config/State functions (minified names collide with callback params)
  'validateConfig', 'loadConfig', 'persistConfig', 'persistState', 'loadState',

  // Control/Protection functions (called from Timer callbacks)
  'setRelay', 'evaluateThermostat', 'canTurnOn', 'canTurnOff',
  'checkWeldDetection', 'checkGhostRun', 'isFreezeProtectionActive',

  // ... many more (see tools/minify.cjs for full list)
]
```

**Why so many reserved names?** Shelly's mJS engine has broken scoping where callback parameters leak into outer scopes, causing named functions to be shadowed.

---

## Testing

### Test Stack

- **Vitest**: Modern test runner with native ES module support
- **Dynamic Imports**: Achieve module isolation between tests
- **Manual Timer Control**: Tests explicitly trigger Timer callbacks

### Test File Pattern

```javascript
// module.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Module Name', () => {
  let functionUnderTest
  let mockShelly, mockTimer, timerCallbacks

  beforeEach(async () => {
    vi.resetModules()
    timerCallbacks = []

    // Mock Shelly globals
    mockShelly = { call: vi.fn() }
    global.Shelly = mockShelly

    mockTimer = {
      set: vi.fn((delay, repeat, cb) => {
        timerCallbacks.push(cb)
        return timerCallbacks.length
      }),
    }
    global.Timer = mockTimer

    global.print = vi.fn()

    // Dynamic import AFTER mocks configured
    const module = await import('./module.js')
    functionUnderTest = module.functionUnderTest
  })

  it('should do something', () => {
    functionUnderTest()
    timerCallbacks[0]()  // Manually trigger timer callback
    expect(mockShelly.call).toHaveBeenCalled()
  })
})
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific file
npm test src/sensors.test.js

# Watch mode
npm test -- --watch
```

### Current Coverage

```
File           | % Stmts | % Branch | % Funcs | % Lines
---------------|---------|----------|---------|--------
All files      |   97.92 |    94.84 |   98.71 |   97.92
 constants.js  |     100 |      100 |     100 |     100
 config.js     |   94.11 |    90.47 |     100 |   94.11
 state.js      |    90.9 |    88.88 |     100 |    90.9
 sensors.js    |     100 |      100 |     100 |     100
 control.js    |     100 |      100 |     100 |     100
 ...           |     ... |      ... |     ... |     ...
```

---

## Deployment

### Deploy CLI

The project includes a TypeScript-based deployment tool:

```bash
# Build and deploy with live monitoring
npm run deploy:monitor

# Deploy only
npm run deploy

# View logs
npm run shelly:logs

# Check status
npm run shelly:status
```

### Environment Configuration

Create `.env` from `.env.example`:

```env
SHELLY_IP=192.168.1.183
SCRIPT_NAME=fridge-controller
# SCRIPT_ID=1                    # Optional, auto-detected by name
AUTO_START=true
```

---

## Security Considerations

This is a local IoT controller. Security design decisions:

- **MQTT:** No authentication by design (local network only). For internet-exposed setups, configure TLS and authentication on your MQTT broker.
- **KVS:** No encryption at rest (Shelly device constraint). Do not store secrets in config.
- **Commands:** MQTT command parsing uses allowlist validation, no injection vectors.

See README.md for the full security note.

---

## Code Style

### Variable Naming

```javascript
// Module-level state objects (single uppercase letter)
let S = { }  // Persisted state
let V = { }  // Volatile state
let C = { }  // Config

// Callback parameters (short, prefixed with $_)
function($_r, $_e, $_m) {
  // $_r = result, $_e = error code, $_m = message
}

// Loop variables (short)
for (let i = 0; i < n; i++) { }

// Descriptive names for clarity
let targetTemp = C.ctl_targetDeg
let currentTemp = V.sns_airSmoothDeg
```

---

## Development Workflow

### Adding a New Feature

1. Identify which file owns the responsibility
2. Add to existing file (prefer flat over new files)
3. Add corresponding tests
4. Run `npm test` to verify
5. Run `npm run build` to verify bundle size
6. Run `npm run deploy:monitor` to test on device

### Making Changes

```bash
# 1. Run tests first
npm test

# 2. Make changes

# 3. Run tests again
npm test

# 4. Check lint
npm run lint

# 5. Build and verify
npm run build

# 6. Deploy and monitor
npm run deploy:monitor
```

### Review Checklist

- [ ] Tests pass (`npm test`)
- [ ] Coverage maintained (`npm run test:coverage`)
- [ ] Lint clean (`npm run lint`)
- [ ] Bundle under 32KB (`npm run build`)
- [ ] Memory patterns followed (no classes, no spread)

---

## Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `constants.js` | Enums and compile-time values |
| `config.js` | User configuration, KVS persistence |
| `state.js` | Runtime state (S=persisted, V=volatile) |
| `sensors.js` | Temperature reading, smoothing, validation |
| `control.js` | Relay control, thermostat decisions |
| `features.js` | Turbo mode, door detection, defrost, adaptive hysteresis |
| `protection.js` | Freeze protection, weld detection, ghost run detection |
| `alarms.js` | Fault tracking, alarm escalation |
| `metrics.js` | Duty cycle tracking, hourly statistics |
| `reporting.js` | Console output, MQTT payload building |
| `mqtt.js` | MQTT command subscription and handling |
| `loop.js` | Main control loop, tick orchestration |
| `main.js` | Boot sequence, entry point |
| `utils/kvs.js` | KVS operations (load, sync, save) |
| `utils/math.js` | Math utilities (round, clamp, format) |

---

## NPM Scripts Reference

| Script | Description |
|--------|-------------|
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:integration` | Run integration tests only |
| `npm run test:simulations` | Run simulation tests only |
| `npm run build` | Full build (concat + minify + validate) |
| `npm run build:concat` | Concatenate source files only |
| `npm run build:minify` | Minify + validate only |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run deploy` | Build and deploy to Shelly |
| `npm run deploy:monitor` | Deploy and monitor live logs |
| `npm run shelly:status` | Check script status |
| `npm run shelly:logs` | View script logs |
| `npm run shelly:monitor` | Live log monitoring |
| `npm run shelly:stop` | Stop script on device |
| `npm run shelly:start` | Start script on device |

---

## Troubleshooting

### Memory Issues

If seeing memory errors or OOM:
1. Check peak memory with `npm run deploy:monitor`
2. Look for array allocations in loops
3. Ensure no object spread usage
4. Verify sequential KVS loading is used

### Build Failures

If bundle exceeds 32KB:
1. Check for accidental imports
2. Remove unused exports
3. Verify minification reserved list is minimal
4. Check for duplicate code

### Test Failures

If tests pass individually but fail together:
1. Ensure `vi.resetModules()` in beforeEach
2. Check Timer callback arrays are reset
3. Verify no module-level state leaking

---

## Production Metrics

Current production build:
- **Bundle size**: ~30KB (under 32KB limit)
- **Runtime memory**: ~14KB (56% of 25KB limit)
- **Peak memory**: ~22KB (88% of limit)
- **Test count**: 866 tests
- **Coverage**: ~98%
