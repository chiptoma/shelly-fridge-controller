# ADR 003: Three-Tier Data Model

## Status

Accepted

## Context

The fridge controller manages three categories of data:

1. **Fixed values** that never change at runtime
2. **User preferences** that can be modified via MQTT
3. **Runtime values** that change every control loop tick

A clear separation was needed to:
- Optimize memory usage
- Enable user configuration without restart
- Persist critical state across power cycles
- Allow volatile state to reset cleanly

## Decision

We implemented a three-tier data model:

```
CONSTANTS (constants.js)     CONFIG (config.js)          STATE (state.js)
━━━━━━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━━
Compile-time, immutable       User-configurable           Runtime values

ST = { IDLE, COOLING, ... }  C.ctl_targetDeg = 4        S.sys_relayOnTs = 0
RSN = { NONE, TEMP, ... }    C.ctl_hystDeg = 1.0        S.sts_lifeRunSec = 0
ALM = { NONE, FAIL, ... }    C.trb_enable = true        V.sys_status = 'IDLE'
ICO = { BOOT, IDLE, ... }    C.cmp_minOffSec = 180      V.sns_airSmoothDeg = null

Never modified                Loaded from KVS             S = persisted to KVS
                              User changes via MQTT       V = volatile (resets)
```

### Tier Details

**Constants (Tier 0)**
- Enums: `ST`, `RSN`, `ALM`, `ICO`, `ADAPT`
- Never modified at runtime
- No KVS storage needed
- Minified to small values

**Config (Tier 1)**
- Object `C` with `prefix_fieldName` properties
- Loaded from KVS at boot
- User-modifiable via MQTT commands
- Validated before application
- Persisted when changed

**State (Tier 2)**
- Object `S` for persisted state (survives restart)
- Object `V` for volatile state (resets on restart)
- `S` saved to KVS periodically and on state changes
- `V` reinitialized on every boot

## Rationale

### Why Separate Constants

Constants like status codes (`ST.IDLE`) are used everywhere. Making them compile-time constants:
- Eliminates KVS lookups
- Enables minification (values become `0`, `1`, etc.)
- Prevents accidental modification
- Documents valid values in one place

### Why Separate Config and State

| Aspect | Config (C) | State (S/V) |
|--------|-----------|-------------|
| Changes | User action | System events |
| Frequency | Rarely | Every tick |
| Source | KVS or MQTT command | Computed |
| Validation | Required | Not needed |

Mixing them would require:
- Validation on every state update
- Unnecessary KVS writes
- Complex change detection

### Why Split S and V

**Persisted State (S)** - Must survive restart:
- `sys_relayOnTs` - When compressor turned on
- `sys_isRelayOn` - Current relay state
- `sts_lifeRunSec` - Lifetime runtime
- `wld_airSnapDeg` - Weld detection snapshot
- `flt_fatalArr` - Fault history

**Volatile State (V)** - Can reset:
- `sys_status` - Current status display
- `sns_airSmoothDeg` - Smoothed temperature
- `trb_isActive` - Turbo mode flag
- `lop_nowTs` - Current timestamp

## Consequences

### Positive

- Clear ownership of each data item
- Minimal KVS I/O
- Fast access (no lookups)
- Easy to reason about state changes
- Boot recovery is straightforward

### Negative

- Three import statements needed
- Must remember which object owns what
- State can become inconsistent if not careful

### Mitigations

- Consistent naming: `prefix_fieldName`
- All state access through `S.` or `V.`
- `persistState()` for explicit saves
- Boot recovery validates S against hardware

## KVS Mapping

State and config are chunked for efficient KVS storage:

```javascript
// Config chunks (by feature prefix)
'fridge_cfg_ctl': ['ctl_targetDeg', 'ctl_hystDeg', ...]
'fridge_cfg_trb': ['trb_enable', 'trb_targetDeg', ...]
'fridge_cfg_adt': ['adt_enable', 'adt_hystMinDeg', ...]

// State chunks (by domain)
'fridge_st_core': ['sys_relayOnTs', 'sys_isRelayOn', ...]
'fridge_st_stats': ['sts_lifeTotalSec', 'sts_lifeRunSec', ...]
'fridge_st_hist': ['sts_dutyHistArr']
'fridge_st_faults': ['flt_fatalArr', 'flt_critArr', ...]
```

## Related

- ADR 001: Flat File Structure
- ADR 002: Memory Optimization Patterns
- ADR 004: Sequential KVS Loading
