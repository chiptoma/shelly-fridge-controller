# Algorithm Reference

Technical documentation for the Shelly Fridge Controller algorithm, including control loop flow, decision priorities, and adaptive systems.

---

## Main Control Loop

The controller runs a 5-second tick cycle that orchestrates all subsystems:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MAIN LOOP TICK (every 5s)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  1. INPUT   │───►│  2. SENSE   │───►│  3. PROTECT │───►│  4. DECIDE  │  │
│  │  (Turbo SW) │    │  (Sensors)  │    │  (Safety)   │    │  (Mode)     │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                     │       │
│         ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │       │
│         │  7. REPORT  │◄───│  6. SWITCH  │◄───│  5. METRICS │◄─────┘       │
│         │  (MQTT/Log) │    │  (Relay)    │    │  (Stats)    │              │
│         └─────────────┘    └─────────────┘    └─────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Breakdown

| Step | Module | What Happens |
|------|--------|--------------|
| **1. Input** | loop.js | Check hardware switch for turbo activation |
| **2. Sense** | sensors.js | Read air/evap temps, apply median filter + EMA |
| **3. Protect** | protection.js | Run safety checks (locked rotor, ghost, weld, cooling health) |
| **4. Decide** | control.js | Determine desired mode via priority cascade |
| **5. Metrics** | metrics.js | Update duty stats, check hourly rollover |
| **6. Switch** | control.js | Apply timing guards and switch relay if allowed |
| **7. Report** | reporting.js | Publish MQTT status, print console log |

---

## Mode Decision Priority Cascade

The `determineMode()` function evaluates conditions in strict priority order. Higher priority conditions override all lower ones.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRIORITY CASCADE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Priority 1: FATAL ALARMS (WELD, LOCKED)                                    │
│      └──► Force OFF, system halted until reboot                             │
│           │                                                                 │
│  Priority 2: LIMP MODE (Sensor failure)                                     │
│      └──► Blind cycling: 30min ON / 15min OFF                               │
│           │                                                                 │
│  Priority 3: TURBO MODE                                                     │
│      └──► Override target (1°C) and hysteresis (±0.5°C)                     │
│           │                                                                 │
│  Priority 4: DOOR PAUSE                                                     │
│      └──► Force OFF while door timer active                                 │
│           │                                                                 │
│  Priority 5: SCHEDULED DEFROST                                              │
│      └──► Force OFF during defrost hour                                     │
│           │                                                                 │
│  Priority 6: FREEZE PROTECTION                                              │
│      └──► Force OFF if air < 0.5°C                                          │
│           │                                                                 │
│  Priority 7: MAX RUN PROTECTION                                             │
│      └──► Force OFF if running > 2 hours                                    │
│           │                                                                 │
│  Priority 8: DYNAMIC DEFROST                                                │
│      └──► Force OFF while evap warming after ice trigger                    │
│           │                                                                 │
│  Priority 9: NORMAL THERMOSTAT                                              │
│      └──► Hysteresis band control                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Thermostat Logic

Standard hysteresis-based control with configurable dead band:

```
Temperature (°C)
    │
 6 ─┤                    ╭─────── ON threshold (target + hyst)
    │                   ╱
 5 ─┤       ┌──────────┤         Example: target=4°C, hyst=1°C
    │       │          │
 4 ─┤───────┼──────────┼──────── TARGET (setpoint)
    │       │          │
 3 ─┤       └──────────┤
    │                   ╲
 2 ─┤                    ╰─────── OFF threshold (target - hyst)
    │
    └────────────────────────────────────────► Time

    ▲ Rising above 5°C → Compressor ON
    ▼ Falling below 3°C → Compressor OFF
    ─ Between 3-5°C → No change (dead band)
```

### Thermostat Function

```javascript
function evaluateThermostat(tCtrl, target, hyst) {
  if (tCtrl > (target + hyst)) return true   // → Cool
  if (tCtrl < (target - hyst)) return false  // → Idle
  return null  // → No change (in dead band)
}
```

---

## Adaptive Hysteresis

Self-adjusting temperature control that optimizes cycle times to protect the compressor while maintaining efficiency.

### Zone Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ADAPTIVE HYSTERESIS ZONES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cycle Time (minutes)                                                       │
│  ═══════════════════════════════════════════════════════════════════════►   │
│  0        15         18                    28                    ∞          │
│  │         │          │                     │                    │          │
│  │ DANGER  │  WIDEN   │      STABLE         │     TIGHTEN        │          │
│  │  ZONE   │   ZONE   │       ZONE          │       ZONE         │          │
│  │         │          │                     │                    │          │
│  └─────────┴──────────┴─────────────────────┴────────────────────┘          │
│                                                                             │
│  DANGER (<15min):  Immediate +0.3°C (no confirmation needed)                │
│  WIDEN  (<18min):  Confirmed +0.2°C after 2 consecutive signals             │
│  STABLE (18-28min): No adjustment - optimal operating range                 │
│  TIGHTEN (>28min): Confirmed -0.2°C after 2 consecutive signals             │
│                    (only if OFF > ON, meaning duty < 50%)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Trend Confirmation

To prevent oscillation, the algorithm requires **2 consecutive signals** in the same direction before adjusting:

```
Loop 1: Cycle=16min → Want WIDEN → Track "widen", count=1 → No action
Loop 2: Cycle=17min → Want WIDEN → Track "widen", count=2 → WIDEN +0.2°C
Loop 3: Cycle=25min → Want nothing → Stay in stable zone → No action
Loop 4: Cycle=35min → Want TIGHTEN → Track "tighten", count=1 → No action
Loop 5: Cycle=30min → Want TIGHTEN → Track "tighten", count=2 → TIGHTEN -0.2°C
```

### Cycle Count Compensation

Hourly boundary effects can distort average cycle times. The algorithm compensates:

| Condition | Interpretation | Action |
|-----------|----------------|--------|
| 5+ cycles/hr AND avg < 20min | Short-cycling (boundary masking) | Force into DANGER zone |
| ≤3 cycles/hr AND avg > 25min | Long cycles (efficient) | Lower threshold to allow TIGHTEN |

### Guards

| Guard | Purpose |
|-------|---------|
| **Freeze Margin** | Won't widen if lower band would approach freeze cut (0.5°C buffer) |
| **Tighten Guard** | Only tightens when OFF > ON (system has cooling headroom) |
| **Turbo Block** | No adaptation during turbo mode |

---

## Compressor Timing Guards

Enforced delays protect the compressor from damage:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TIMING GUARD STATE MACHINE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│     ┌─────────────────┐                      ┌─────────────────┐            │
│     │                 │     Can turn ON?     │                 │            │
│     │      OFF        │─────────────────────►│       ON        │            │
│     │   (IDLE)        │   if minOff elapsed  │   (COOLING)     │            │
│     │                 │◄─────────────────────│                 │            │
│     └─────────────────┘     Can turn OFF?    └─────────────────┘            │
│                             if minOn elapsed                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Default Timing:                                                     │    │
│  │   • minOnSec  = 180s (3 min)  - Prevents incomplete cooling cycles  │    │
│  │   • minOffSec = 300s (5 min)  - Allows pressure equalization        │    │
│  │   • maxRunSec = 7200s (2 hr)  - Detects cooling failure             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Blocked States:                                                            │
│   • WANT_COOL = Wants ON but minOff not elapsed                             │
│   • WANT_IDLE = Wants OFF but minOn not elapsed                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Protection Systems

### Power Monitoring

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         POWER MONITORING FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Relay ON + Running > 15s (past inrush mask)                                │
│      │                                                                      │
│      ├─── Power > 400W ──────────► LOCKED ROTOR (Fatal)                     │
│      │                             Motor seized, immediate shutdown         │
│      │                                                                      │
│      ├─── Power < 10W ───────────► Start ghost timer                        │
│      │        │                                                             │
│      │        └─── 60s continuous ► GHOST RUN #N                            │
│      │                  │                                                   │
│      │                  └─── N >= 3 ► Escalate to FATAL                     │
│      │                                                                      │
│      └─── Power 10-400W ─────────► Normal operation                         │
│                                    Reset ghost count                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Weld Detection

Detects if relay contacts have fused together (stuck closed):

```
Timeline after relay turns OFF:
═══════════════════════════════════════════════════════════════════►

0min        10min                        30min
  │           │                            │
  │  IGNORE   │      DETECTION WINDOW      │   IGNORE
  │  (wait)   │                            │   (too late)
  │           │                            │
  OFF ────────┴────────────────────────────┴────────────────────────

During window: If temperature DROPS by >0.2°C while relay is "OFF":
  → Relay is welded shut, compressor still running
  → FATAL ALARM (requires hardware replacement)
```

### Cooling Health (Gas Leak Detection)

```
After running for 15+ minutes:
  • Air temp should be above target (still cooling down)
  • Evap should be at least 5°C colder than air

If evap ≈ air temp while running → Cooling system failure
  (gas leak, blocked expansion valve, etc.)
```

---

## Defrost Systems

### Dynamic Defrost (Temperature-Triggered)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DYNAMIC DEFROST FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Normal Operation                                                           │
│      │                                                                      │
│      └─── Evap ≤ -16°C ──────────► DEFROST TRIGGERED                        │
│                                        │                                    │
│                                        │ (Compressor OFF)                   │
│                                        ▼                                    │
│                              Wait for evap to warm                          │
│                                        │                                    │
│                                        └─── Evap ≥ -5°C                     │
│                                                  │                          │
│                                                  │ (Start dwell timer)      │
│                                                  ▼                          │
│                                        Hold for 5 minutes                   │
│                                                  │                          │
│                                                  └─── Timer complete        │
│                                                            │                │
│                                                            ▼                │
│                                                   DEFROST COMPLETE          │
│                                                   Resume normal cooling     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Scheduled Defrost (Time-Based)

- Runs daily at configured hour (default: 1:00 AM)
- Duration: up to 1 hour
- Compressor forced OFF during entire window
- Independent of dynamic defrost

---

## Door Detection

Detects door opening via rapid temperature rise rate:

```
Temperature Rate Calculation:
  rate = (currentTemp - previousTemp) / timeDelta * 60  [°C/min]

If rate > 5°C/min:
  → Door open detected
  → Pause cooling for 5 minutes
  → Prevents evaporator icing from warm air influx
```

---

## Limp Mode (Failsafe)

When sensors fail, system enters blind cycling mode:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LIMP MODE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Trigger: 5 consecutive bad sensor readings                                 │
│                                                                             │
│  Behavior:                                                                  │
│    ┌─────────────────────────────────────────────────────────────────┐      │
│    │                                                                 │      │
│    │    30 min ON ──────► 15 min OFF ──────► 30 min ON ──────► ...  │      │
│    │                                                                 │      │
│    │    Duty cycle: 66% (keeps fridge cold but not freezing)        │      │
│    │                                                                 │      │
│    └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│  Recovery: Automatically exits when valid sensor reading received           │
│                                                                             │
│  Note: Timing guards (minOn/minOff) are bypassed in limp mode              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sensor Processing

### Signal Flow

```
Raw Sensor Reading
       │
       ▼
┌──────────────────┐
│  Median Filter   │  ← 3-sample window, rejects spikes
│  (spike reject)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  EMA Smoothing   │  ← α=0.08 (lower = smoother, slower)
│  (noise reduce)  │
└────────┬─────────┘
         │
         ▼
   Smoothed Value
   (used for control)
```

### Stuck Sensor Detection

- Tracks reference value and timestamp for each sensor
- If value unchanged (within ±0.2°C) for 4 hours → STUCK alarm
- Resets timer whenever value moves

---

## Metrics & Statistics

### Tracked Metrics

| Metric | Scope | Purpose |
|--------|-------|---------|
| `sts_hourRunSec` | Current hour | Calculate avg cycle times |
| `sts_hourTotalSec` | Current hour | Hourly rollover detection |
| `sts_cycleCnt` | Current hour | Cycles for averaging |
| `sts_lifeRunSec` | Lifetime | Total compressor runtime |
| `sts_lifeTotalSec` | Lifetime | Total system uptime |
| `sts_dutyHistArr` | 24 hours | Historical duty % (ring buffer) |

### Hourly Rollover

At each hour boundary:
1. Calculate average ON/OFF times from hour's data
2. Trigger adaptive hysteresis adjustment
3. Store duty % in 24-hour history buffer
4. Reset hourly counters
5. Persist state to KVS

---

## Boot Recovery

Handles discrepancies between KVS state and actual hardware after restart:

| KVS State | Hardware State | Recovery Action |
|-----------|----------------|-----------------|
| ON | ON | Add elapsed time to stats, continue cooling |
| ON | OFF | Add estimated runtime to stats, update state |
| OFF | ON | Sync state to hardware, start fresh timestamp |
| OFF | OFF | Add elapsed idle time to stats |

### Stats Recovery

- Elapsed time capped at 1 hour to prevent corruption from stale timestamps
- Cycle count incremented if relay was ON but now OFF
- State persisted immediately after recovery

---

## State Persistence

### KVS Chunks

State split into chunks for efficient storage:

| KVS Key | Contents |
|---------|----------|
| `fridge_st_core` | Relay timestamps, relay state, weld snapshot, adaptive hyst |
| `fridge_st_stats` | Lifetime/hourly stats, duty history, cycle count |
| `fridge_st_faults` | Fault history arrays (fatal, critical, error, warning) |

### Save Triggers

| Trigger | What's Saved |
|---------|--------------|
| Relay state change | Full state |
| Hourly rollover | Full state |
| 15-minute interval | Full state (periodic backup) |
| Fatal alarm | Fault arrays only (immediate) |

---

## Alarm System

### Severity Levels

| Level | Alarms | Behavior |
|-------|--------|----------|
| **Fatal** | WELD, LOCKED | Sticky until reboot, immediate KVS save |
| **Critical** | HIGH_TEMP | Logged with details, recoverable |
| **Error** | SENSOR_FAIL, SENSOR_STUCK | Triggers limp mode |
| **Warning** | GHOST, COOLING_FAIL | Logged, may self-recover |

### Fault Logging

- Each severity level maintains a FIFO queue of last 3 faults
- Entry format: `{ a: alarm_code, t: timestamp, d: detail_string }`
- Fatal faults trigger immediate KVS write
- Other faults batched with hourly persistence

---

## MQTT Interface

See [CONFIGURATION.md](CONFIGURATION.md#mqtt-message-format) for complete MQTT payload reference and [README.md](../README.md#mqtt) for quick start examples.

---

## Memory Considerations

The algorithm is designed for Shelly's ~25KB heap limit:

- **Sequential KVS loading**: Chunks loaded one at a time to allow GC
- **No closures**: Callback parameters prefixed with `$_` to avoid scope issues
- **Pre-allocated buffers**: Sensor buffer, duty history array created once
- **No object spread**: Direct mutation only
- **Global timestamp**: `V.lop_nowTs` instead of local variables in callbacks
