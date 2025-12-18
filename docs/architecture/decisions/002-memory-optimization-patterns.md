# ADR 002: Memory Optimization Patterns

## Status

Accepted

## Context

The Shelly Plus 1PM has approximately 25KB of heap memory available for scripts. The fridge controller must:

- Run continuously for months without restart
- Handle complex thermostat logic
- Persist state across power cycles
- Process sensor data with smoothing
- Manage multiple protection systems

Memory leaks or inefficient patterns cause crashes.

## Decision

We adopted strict memory optimization patterns that prioritize memory efficiency over code elegance.

### Banned Patterns

| Pattern | Reason | Alternative |
|---------|--------|-------------|
| Classes | Constructor overhead | Plain objects + functions |
| Closures | Captured scope consumes memory | Global state objects |
| Spread operator | Creates copies | Direct mutation |
| Array.forEach/map | Creates closures | for loops |
| Object destructuring | Creates temp objects | Direct property access |
| Template literals | String concatenation overhead | Manual concatenation |

### Required Patterns

| Pattern | Example | Benefit |
|---------|---------|---------|
| Pre-allocated arrays | `sns_airBuf: [0, 0, 0]` | No GC churn |
| Direct mutation | `S.value = x` | No copies |
| Short callback params | `$_r, $_e, $_m` | Smaller stack frames |
| Single-letter state objects | `S`, `V`, `C` | Smaller references |

## Rationale

### Memory Budget

```
Available:     ~25KB
Typical usage: ~14KB (56%)
Peak usage:    ~22KB (88%)
Safety margin: ~3KB
```

The 3KB safety margin accommodates:
- Async callback stacks
- Temporary string operations
- MQTT message construction

### Why These Patterns Matter

**Classes vs Functions**
```javascript
// Bad: Class instance overhead
class Controller {
  constructor() { this.state = {} }
}
const c = new Controller()  // Allocates: prototype chain + instance

// Good: Plain object
let S = { state: {} }  // Allocates: only the object
```

**Closures vs Global State**
```javascript
// Bad: Closure captures scope
function createHandler(config) {
  return function() {     // Captures 'config' reference
    return config.value
  }
}

// Good: Global state object
let C = { value: 0 }
function handler() {
  return C.value  // References global, no capture
}
```

**Spread vs Mutation**
```javascript
// Bad: Creates copy
const newState = { ...oldState, key: value }

// Good: Direct mutation
S.key = value
```

## Consequences

### Positive

- Stable memory usage over months
- Predictable GC behavior
- No memory leaks from closures
- Consistent ~14KB runtime footprint

### Negative

- Code appears "old-fashioned"
- No immutability guarantees
- Global state requires discipline
- Harder to test in isolation

### Mitigations

- Clear naming conventions (S, V, C)
- Comprehensive test suite
- State initialization on boot
- Explicit state persistence with `persistState()`

## Measurements

Tested patterns on device:

| Scenario | Memory |
|----------|--------|
| Boot (before KVS load) | ~8KB |
| After config/state load | ~14KB |
| Peak (during KVS write) | ~22KB |
| Steady-state operation | ~14KB |

## Related

- ADR 001: Flat File Structure
- ADR 004: Sequential KVS Loading
