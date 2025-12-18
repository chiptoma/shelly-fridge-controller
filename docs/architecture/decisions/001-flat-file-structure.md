# ADR 001: Flat File Structure

## Status

Accepted

## Context

The Shelly Fridge Controller runs on a Shelly Plus 1PM device with severe constraints:

- ~25KB heap memory limit
- mJS runtime (ES5-ish with ES6 module syntax)
- 32KB script bundle size limit
- No filesystem access beyond KVS

A decision was needed on how to organize the codebase: modular TypeScript architecture vs flat JavaScript files.

## Decision

We chose a **flat file structure** where each concern gets one file:

```
src/
├── constants.js    # Compile-time constants
├── config.js       # User configuration
├── state.js        # Runtime state
├── sensors.js      # Temperature sensors
├── control.js      # Thermostat logic
├── features.js     # Optional features
├── protection.js   # Safety systems
├── alarms.js       # Fault management
├── metrics.js      # Statistics
├── reporting.js    # MQTT publishing
├── mqtt.js         # Command handling
├── loop.js         # Main control loop
├── main.js         # Entry point
└── utils/
    ├── math.js     # Math utilities
    └── kvs.js      # KVS operations
```

## Rationale

### Why Not Modular TypeScript

1. **mJS Import Limitations**: Shelly's mJS runtime cannot reliably import from nested directories or handle complex module resolution

2. **Bundle Size**: TypeScript compilation adds overhead. Every abstraction layer costs bytes toward the 32KB limit

3. **No Build Complexity**: Flat structure needs only concatenation, no transpilation or complex bundling

4. **Memory Overhead**: Module systems add runtime overhead. Flat concatenation produces simpler code

### Why Flat Works

1. **Single Responsibility**: Each file owns one concern. Files are small enough to understand completely

2. **Explicit Dependencies**: The `FILE_ORDER` array in `concat.cjs` documents dependency order

3. **Testing Compatibility**: ES6 imports work for unit tests (stripped during bundle build)

4. **Simple Mental Model**: ~15 files, each with a clear purpose

## Consequences

### Positive

- Minimal bundle overhead
- Fast build times (concatenation only)
- Easy to understand full codebase
- Works reliably on constrained device

### Negative

- Cannot use TypeScript type checking
- No IDE refactoring across modules
- Must manually maintain dependency order
- Tests must mock globals (Shelly, Timer, etc.)

### Mitigations

- ESLint with strict rules for code quality
- JSDoc for documentation (not type checking)
- Comprehensive test suite (843 tests, 98% coverage)
- `FILE_ORDER` tier system prevents circular deps

## Related

- ADR 002: Memory Optimization Patterns
- ADR 003: Three-Tier Data Model
