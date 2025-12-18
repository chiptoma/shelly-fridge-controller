# Testing Infrastructure

This document describes the test infrastructure for the Shelly Fridge Controller project.

## Test Structure

```
test/
├── integration/       # Integration tests (end-to-end scenarios)
│   ├── boot-recovery.test.js       # Boot state recovery
│   ├── integration.test.js         # Core integration scenarios
│   ├── main-loop.test.js           # Main loop orchestration
│   ├── mqtt-commands.test.js       # MQTT command handling
│   ├── sensor-recovery.test.js     # Sensor failure/recovery
│   └── state-transitions.test.js   # State machine transitions
│
├── simulations/       # Long-running simulation tests
│   ├── adaptive-hysteresis.test.js # Multi-day adaptive hysteresis
│   ├── comprehensive-scenarios.test.js
│   ├── edge-cases.test.js
│   └── event-injection.test.js
│
├── bundle/           # Build artifact tests
│   ├── bundle-smoke.test.js        # Bundle validity
│   └── minification-safety.test.js # Minification checks
│
├── utils/            # Test utilities and infrastructure
│   ├── index.js              # Central exports
│   └── shelly-simulator.js   # Full Shelly runtime simulator
│
└── README.md         # Test folder documentation

src/
└── *.test.js         # Unit tests co-located with source
```

## Test Categories

### Unit Tests (`src/*.test.js`)
Located alongside source files. Test individual modules in isolation with mocked dependencies.

### Integration Tests (`test/integration/`)
End-to-end scenarios using the full Shelly simulator. Test real module interactions.

### Simulation Tests (`test/simulations/`)
Long-running scenarios that simulate days/weeks of operation. Test time-based behaviors like adaptive hysteresis.

### Bundle Tests (`test/bundle/`)
Verify the build output is valid and minification doesn't break functionality.

## Test Utilities

### ShellyRuntime (`test/utils/shelly-simulator.js`)

A complete virtual Shelly environment that simulates:
- Virtual clock with time control
- KVS storage
- Switch/Relay state
- Temperature sensors (connect/disconnect)
- MQTT pub/sub
- Timer API
- Input state
- History tracking for assertions

```javascript
import { ShellyRuntime } from '../test/utils/shelly-simulator.js'

const runtime = new ShellyRuntime()

// Install globals (Shelly, Timer, MQTT, print, etc.)
runtime.installGlobals(global)

// Control temperatures
runtime.setTemperature(101, 5.0)  // Air sensor
runtime.setTemperature(100, -10.0) // Evap sensor
runtime.disconnectSensor(101)      // Simulate failure

// Control time
runtime.advanceTime(1000)           // Advance 1 second
runtime.advanceTimeFast(3600000)    // Fast-forward 1 hour (fires timers)

// Check history
runtime.getRelayHistory()
runtime.getPrintHistory()
runtime.getLastMqttMessage()
```

## Writing Tests

### Integration Test Pattern

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShellyRuntime } from '../test/utils/shelly-simulator.js'

async function setupTest(runtime, options = {}) {
  runtime.installGlobals(global)
  vi.resetModules()

  // Import modules after globals installed
  const config = await import('../src/config.js')
  const state = await import('../src/state.js')
  // ... more imports

  // Initialize
  Object.assign(config.C, config.DEFAULT)

  // Return references
  return { config, state, /* ... */ }
}

describe('Feature Test', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should do something', async () => {
    script = await setupTest(runtime, { airTemp: 5.0 })

    // Set up scenario
    runtime.setTemperature(script.C.sys_sensAirId, 8.0)

    // Execute
    script.mainLoop()

    // Assert
    expect(script.V.sys_status).toBe('COOLING')
  })
})
```

### Simulation Test Pattern

```javascript
function simulateThermalCycle(runtime, script, pattern, durationSec) {
  const loopSec = script.C.sys_loopSec

  for (let elapsed = 0; elapsed < durationSec; elapsed += loopSec) {
    // Update temperatures based on relay state
    // Call control logic
    // Update metrics
  }

  return { /* results */ }
}

it('should adapt over 3 days', async () => {
  const result = simulateThermalCycle(
    runtime,
    script,
    { coolRate: 0.08, warmRate: 0.04 },
    3 * 86400 // 3 days
  )

  expect(result.rolloverCount).toBe(72)
})
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test src/control.test.js

# Run integration tests only
npm test test/integration

# Run simulations only
npm test test/simulations

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Test Coverage

The project maintains high test coverage:
- **818 total tests**
- **~98% coverage** on core modules

### Coverage by Area
- Unit tests: ~477 tests (src/*.test.js + src/utils/*.test.js)
- Integration tests: ~214 tests (test/integration/)
- Simulations: ~89 tests (test/simulations/)
- Bundle tests: ~38 tests (test/bundle/)

## Key Testing Patterns

### 1. Module Isolation
Each test file resets modules with `vi.resetModules()` to ensure fresh state.

### 2. Time Control
Use `runtime.advanceTimeFast()` to simulate hours/days without actual delays.

### 3. Sensor Simulation
Use `runtime.setTemperature()` and `runtime.disconnectSensor()` to simulate sensor conditions.

### 4. State Assertions
Check both `S` (persisted state) and `V` (volatile state) for correct behavior.

### 5. History Verification
Use `runtime.getPrintHistory()` and `runtime.getRelayHistory()` to verify side effects.

## Vitest Configuration

The project uses Vitest with dynamic imports for proper module isolation. See `vitest.config.ts` for configuration details.

Key features:
- **Dynamic Import Pattern**: Modules are loaded AFTER mocks are configured
- **Full TypeScript**: Tests have full type checking
- **Module Isolation**: Each test gets fresh module instances
- **Fast Execution**: 820 tests run in ~1s
