# Fridge Controller Configuration Guide

Complete reference for configuring the Shelly-based fridge controller. This document details all configuration parameters, their valid ranges, and recommended values.

## Table of Contents

- [Thermostat & Sensors](#thermostat--sensors)
- [Safety (Compressor & Freeze Protection)](#safety-compressor--freeze-protection)
- [Feature Flags](#feature-flags)
- [Duty-Cycle Reporting](#duty-cycle-reporting)
- [Daily Summary](#daily-summary)
- [Sensor Failure Detection](#sensor-failure-detection)
- [High Temperature Alerts](#high-temperature-alerts)
- [Adaptive Hysteresis](#adaptive-hysteresis)
- [Watchdog](#watchdog)
- [Performance Metrics](#performance-metrics)
- [Slack Integration](#slack-integration)
- [Logging](#logging)
- [Application Constants](#application-constants)
- [Validation Constants](#validation-constants)

## Configuration Range Notation

Throughout this document, ranges are specified as:
- **Critical**: Hard limits enforced by validation. Values outside this range cause configuration errors.
- **Recommended**: Suggested range for optimal operation. Values outside this range generate warnings.

---

## Thermostat & Sensors

### AIR_SENSOR_ID
Logical ID/index of the cabinet (air) temperature sensor.

- **Type**: Integer
- **Critical**: 0–255
- **Must be different from**: EVAP_SENSOR_ID
- **Recommended**: Small, stable ID, unique per sensor on the bus
- **Default**: 101

### EVAP_SENSOR_ID
Logical ID/index of the evaporator temperature sensor.

- **Type**: Integer
- **Critical**: 0–255
- **Must be different from**: AIR_SENSOR_ID
- **Recommended**: Small, stable ID, explicitly mapped in wiring/docs
- **Default**: 100

### SETPOINT
Target cabinet air temperature in °C.

- **Type**: Number
- **Critical**: 1–10 °C
- **Recommended**: 3–5 °C
- **Default**: 4.0 °C
- **Notes**: 4 °C is ideal for water/sparkling water storage

### HYSTERESIS
Temperature swing ±(°C) around setpoint for ON/OFF control.

- **Type**: Number
- **Critical**: 0.3–5.0 °C
- **Recommended**: 0.5–2.0 °C
- **Default**: 1.0 °C
- **Notes**: Balance between temperature stability and compressor cycling frequency

### AIR_SENSOR_SMOOTHING_SEC
Moving-average window (seconds) for air temperature readings.

- **Type**: Integer
- **Critical**: 5–300 s
- **Recommended**: 20–60 s
- **Default**: 30 s
- **Notes**: Provides stable but responsive cabinet readings

### EVAP_SENSOR_SMOOTHING_SEC
Moving-average window (seconds) for evaporator temperature readings.

- **Type**: Integer
- **Critical**: 5–300 s
- **Recommended**: 5–20 s
- **Default**: 10 s
- **Notes**: Tracks coil behavior without noise

### LOOP_PERIOD_MS
Main control loop period in milliseconds.

- **Type**: Integer
- **Critical**: 2000–15000 ms
- **Recommended**: 5000 ms
- **Default**: 5000 ms (5 seconds)
- **Notes**: Matches fridge dynamics and Shelly constraints

---

## Safety (Compressor & Freeze Protection)

### MIN_ON
Compressor minimum run time (seconds) - short-cycle protection.

- **Type**: Integer
- **Critical**: 120–600 s
- **Recommended**: 180 s
- **Default**: 180 s (3 minutes)
- **Notes**: Prevents compressor damage from rapid cycling

### MIN_OFF
Compressor minimum rest time (seconds) - short-cycle protection.

- **Type**: Integer
- **Critical**: 180–1800 s
- **Must satisfy**: MIN_ON + MIN_OFF ≥ 240 s
- **Recommended**: 300 s
- **Default**: 300 s (5 minutes)
- **Notes**: Allows adequate pressure equalization

### FREEZE_PROTECTION_ON
Evaporator temperature (°C) at which freeze protection engages (stops cooling).

- **Type**: Number
- **Critical**: –30 to –5 °C
- **Must be less than**: FREEZE_PROTECTION_OFF
- **Recommended**: –15 to –18 °C
- **Default**: –16.0 °C
- **Notes**: Prevents evaporator icing and blockage

### FREEZE_PROTECTION_OFF
Evaporator temperature (°C) at which freeze protection releases (resumes cooling).

- **Type**: Number
- **Critical**: –8 to +5 °C
- **Must be greater than**: FREEZE_PROTECTION_ON
- **Recommended**: –5 to –2 °C
- **Default**: –2.0 °C
- **Notes**: Ensures adequate thaw before resuming

### FREEZE_RECOVERY_DELAY
Delay (seconds) after FREEZE_PROTECTION_OFF before compressor can restart.

- **Type**: Integer
- **Critical**: 120–900 s
- **Recommended**: 300 s
- **Default**: 300 s (5 minutes)
- **Notes**: Aligns with MIN_OFF, provides thaw/stabilization time

### FREEZE_RECOVERY_HYSTERESIS
Extra °C above FREEZE_PROTECTION_OFF before starting recovery logic.

- **Type**: Number
- **Critical**: 0.1–5.0 °C
- **Recommended**: 0.5–1.0 °C
- **Default**: 0.5 °C
- **Notes**: Tight, safe margin to prevent oscillation

### FREEZE_LOCK_HYSTERESIS
Deadband °C around FREEZE_PROTECTION_ON to prevent rapid lock/unlock.

- **Type**: Number
- **Critical**: 0.1–5.0 °C
- **Recommended**: 0.2–0.5 °C
- **Default**: 0.3 °C
- **Notes**: Prevents flapping at threshold boundary

---

## Feature Flags

All feature flags are **boolean** values (true/false).

### FEATURE_DUTY_CYCLE
Enable reporting of compressor duty cycle.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true in development/monitoring environments

### FEATURE_DAILY_SUMMARY
Enable generation of daily summary statistics.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true when daily logs are consumed or archived

### FEATURE_SENSOR_FAILURE
Enable sensor failure detection logic.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true (primary safety mechanism)
- **Warning**: Should not be disabled without alternative safety measures

### FEATURE_HIGH_TEMP_ALERTS
Enable high-temperature alerting.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true for any remotely monitored fridge

### FEATURE_ADAPTIVE_HYSTERESIS
Enable duty-cycle-based automatic hysteresis adjustment.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true (bounded adaptation improves efficiency)
- **Notes**: Constrained by ADAPTIVE_MAX_SHIFT

### FEATURE_WATCHDOG
Enable watchdog supervision of the control loop.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true (prevents silent lockups)

### FEATURE_PERFORMANCE_METRICS
Enable performance/loop timing metrics.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true while tuning; optional in long-term production

---

## Duty-Cycle Reporting

### DUTY_INTERVAL_SEC
Length of duty-cycle reporting window (seconds).

- **Type**: Integer
- **Critical**: 300–86400 s
- **Recommended**: 3600 s (hourly)
- **Default**: 3600 s
- **Notes**: Balance between granularity and overhead

### DUTY_LOG_EVERY_INTERVAL
Whether to log duty-cycle at every interval.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true (overhead is small)

---

## Daily Summary

### DAILY_SUMMARY_HOUR
Wall-clock hour (0–23) when daily summary should be emitted.

- **Type**: Integer
- **Critical**: 0–23
- **Recommended**: 4–7 (early morning low-activity window)
- **Default**: 7

### DAILY_SUMMARY_ENABLED
Master switch for daily summary generation.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true for long-running systems with logging

---

## Sensor Failure Detection

### SENSOR_NO_READING_SEC
Timeout (seconds) for receiving no readings from a sensor.

- **Type**: Integer
- **Critical**: 5–120 s
- **Recommended**: 20–60 s
- **Default**: 30 s
- **Notes**: Good mid-point for detection without false alarms

### SENSOR_STUCK_SEC
Time window (seconds) for flagging a sensor as "stuck" if value does not change.

- **Type**: Integer
- **Critical**: 60–3600 s
- **Recommended**: ~300 s (5 min)
- **Default**: 300 s
- **Notes**: Appropriate for drinks fridge thermal dynamics

### SENSOR_STUCK_EPSILON
Maximum absolute delta (°C) still treated as "no change" for stuck detection.

- **Type**: Number
- **Critical**: 0.0001–0.5 °C
- **Recommended**: 0.05–0.1 °C
- **Default**: 0.05 °C
- **Notes**: Precise but realistic; accounts for DS18B20 resolution (0.0625°C)

### SENSOR_CRITICAL_FAILURE_SEC
Time (seconds) from initial sensor failure until escalation to critical.

- **Type**: Integer
- **Critical**: 60–3600 s
- **Recommended**: ~600 s (10 min)
- **Default**: 600 s
- **Notes**: Avoids flapping while ensuring timely escalation

---

## High Temperature Alerts

### HIGH_TEMP_INSTANT_THRESHOLD
Instant high-temperature alarm threshold (°C).

- **Type**: Number
- **Critical**: 5–20 °C
- **Recommended**: 10 °C (well above normal range)
- **Default**: 10.0 °C
- **Notes**: For drinks fridge

### HIGH_TEMP_INSTANT_DELAY_SEC
Time (seconds) above instant threshold before raising an instant alert.

- **Type**: Integer
- **Critical**: 60–900 s
- **Must be**: ≤ HIGH_TEMP_SUSTAINED_DELAY_SEC
- **Recommended**: 180–300 s
- **Default**: 180 s (3 minutes)
- **Notes**: Filters door openings and short warm pulses

### HIGH_TEMP_SUSTAINED_THRESHOLD
Sustained high-temperature alarm threshold (°C).

- **Type**: Number
- **Critical**: 5–20 °C
- **Recommended**: 10 °C
- **Default**: 10.0 °C
- **Notes**: Usually equal to instant threshold

### HIGH_TEMP_SUSTAINED_DELAY_SEC
Time (seconds) above sustained threshold before raising a sustained alert.

- **Type**: Integer
- **Critical**: 300–3600 s
- **Must be**: ≥ HIGH_TEMP_INSTANT_DELAY_SEC
- **Recommended**: 600–1200 s
- **Default**: 600 s (10 minutes)
- **Notes**: Long-fault detection

---

## Adaptive Hysteresis

### ADAPTIVE_HIGH_DUTY
Duty cycle percentage above which hysteresis is increased.

- **Type**: Integer
- **Critical**: 0–100%
- **Must be**: > ADAPTIVE_LOW_DUTY
- **Recommended**: 70%
- **Default**: 70
- **Notes**: High duty indicates system working hard

### ADAPTIVE_LOW_DUTY
Duty cycle percentage below which hysteresis is decreased.

- **Type**: Integer
- **Critical**: 0–100%
- **Must be**: < ADAPTIVE_HIGH_DUTY
- **Recommended**: 30%
- **Default**: 30
- **Notes**: Low duty indicates excess capacity

### ADAPTIVE_MAX_SHIFT
Maximum hysteresis adjustment (°C).

- **Type**: Number
- **Critical**: 0.1–1.0 °C
- **Recommended**: 0.5 °C
- **Default**: 0.5 °C
- **Notes**: Bounded adaptation prevents instability

---

## Watchdog

### WATCHDOG_TIMEOUT_SEC
Maximum allowed time (seconds) between healthy loop iterations.

- **Type**: Integer
- **Critical**: 5–120 s
- **Recommended**: 30 s
- **Default**: 30 s
- **Notes**: Good balance between responsiveness and noise

---

## Performance Metrics

### PERF_LOG_INTERVAL_SEC
Interval (seconds) at which performance stats are logged.

- **Type**: Integer
- **Critical**: 60–86400 s
- **Recommended**: 3600 s (hourly)
- **Default**: 3600 s

### PERF_SLOW_LOOP_THRESHOLD_MS
Loop execution time (ms) above which a loop is counted as "slow".

- **Type**: Integer
- **Critical**: 50–2000 ms
- **Recommended**: 200–300 ms
- **Default**: 250 ms
- **Notes**: For a 5 s loop period

### PERF_WARN_SLOW_LOOPS
Whether to emit warnings for slow loops.

- **Type**: Boolean
- **Default**: false
- **Recommended**: false on constrained devices to avoid log spam

---

## Slack Integration

### SLACK_ENABLED
Master switch for Slack notifications.

- **Type**: Boolean
- **Default**: true
- **Recommended**: true when remote monitoring is desired

### SLACK_LOG_LEVEL
Minimum log severity sent to Slack (0=DEBUG, 1=INFO, 2=WARNING, 3=CRITICAL).

- **Type**: Integer
- **Critical**: 0–3 (must match LOG_LEVELS values)
- **Recommended**: 1 (INFO) for production; 2 (WARNING) if noise-sensitive
- **Default**: 1

### SLACK_WEBHOOK_KVS_KEY
KVS key name where the Slack webhook URL is stored.

- **Type**: String
- **Critical**: Non-empty string when SLACK_ENABLED = true
- **Recommended**: Stable key name
- **Default**: 'slack_webhook'
- **Notes**: Clear and explicit naming

### SLACK_MIN_INTERVAL
Minimum interval (seconds) between Slack messages.

- **Type**: Integer
- **Critical**: ≥1 s
- **Recommended**: 10–60 s
- **Default**: 30 s
- **Notes**: Avoids rate limiting and bursts; 30s is conservative

### SLACK_QUEUE_MAX
Maximum number of buffered Slack messages.

- **Type**: Integer
- **Critical**: 1–100
- **Recommended**: 10–30
- **Default**: 10
- **Notes**: Conservative for Shelly RAM constraints

### SLACK_RETRY_DELAY
Delay (seconds) before retrying a failed Slack send.

- **Type**: Integer
- **Critical**: 5–600 s
- **Recommended**: 30–60 s
- **Default**: 30 s

---

## Logging

### LOG_LEVEL
Current log verbosity (0=DEBUG, 1=INFO, 2=WARNING, 3=CRITICAL).

- **Type**: Integer
- **Critical**: 0–3 (must match LOG_LEVELS values)
- **Recommended**: 1 (INFO) for normal operation, 0 (DEBUG) only during tuning
- **Default**: 1

### LOG_AUTO_DEMOTE_HOURS
Hours after which log level can auto-demote (e.g., DEBUG → INFO).

- **Type**: Integer
- **Critical**: 1–720 h
- **Recommended**: 24 h
- **Default**: 24
- **Notes**: Resets debug verbosity after a day

---

## Application Constants

These are internal constants that should rarely change unless porting or doing low-level tuning.

### LOG_LEVELS
Canonical mapping of log level names to numeric codes.

- **Type**: Object
- **Values**:
  - DEBUG: 0
  - INFO: 1
  - WARNING: 2
  - CRITICAL: 3
- **Notes**: Values must be distinct; LOG_LEVEL and SLACK_LOG_LEVEL must use these

### RELAY_RESPONSE_TIMEOUT_SEC
Maximum time (seconds) to wait for relay state-change confirmation.

- **Type**: Number
- **Critical**: 0.5–10 s
- **Recommended**: 1–3 s
- **Default**: 2 s
- **Notes**: Robust middle ground

### MAX_CONSECUTIVE_ERRORS
Number of consecutive errors before treating the situation as critical.

- **Type**: Integer
- **Critical**: 1–20
- **Recommended**: 3–5
- **Default**: 3
- **Notes**: Conservative for safety

### CONSOLE_LOG_MAX_QUEUE
Maximum number of queued console log messages.

- **Type**: Integer
- **Critical**: 50–500 (avoid >1000 on small devices)
- **Recommended**: 100–200
- **Default**: 150
- **Notes**: Reasonable compromise for Shelly

### CONSOLE_LOG_INTERVAL_MS
Interval (milliseconds) between draining queued console logs.

- **Type**: Integer
- **Critical**: 10–200 ms
- **Recommended**: 50–100 ms
- **Default**: 50 ms
- **Notes**: Responsive without being noisy

---

## Validation Constants

These constants define thresholds used during configuration validation.

### MIN_TOTAL_CYCLE_TIME_SEC
Minimum required sum of MIN_ON + MIN_OFF for safe compressor cycling.

- **Value**: 240 s (4 minutes)
- **Notes**: Prevents rapid cycling damage to compressor. Do not change unless compressor specs explicitly allow shorter cycles.

### MIN_FREEZE_GAP_WARNING_C
Minimum gap (°C) between FREEZE_PROTECTION_ON and OFF thresholds to avoid warning.

- **Value**: 3.0 °C
- **Notes**: Not a hard error, but gaps < 3°C may cause frequent lock/unlock cycles. 5°C+ recommended for stability.

### MIN_CONTROL_LOOPS_PER_OFF
Minimum control loop iterations during MIN_OFF period.

- **Value**: 3
- **Notes**: At least 3 loops needed for responsive control and stable state management. Fundamental to control loop responsiveness.

### MIN_SENSOR_EPSILON
Minimum allowable SENSOR_STUCK_EPSILON value (°C) for stuck sensor detection.

- **Value**: 0.0001 °C
- **Notes**: Smaller values may cause false positives from sensor noise. Based on DS18B20 sensor resolution (0.0625°C).

---

## Cross-Field Validation Rules

The following relationships are enforced between configuration fields:

1. **Sensor IDs**: AIR_SENSOR_ID ≠ EVAP_SENSOR_ID
2. **Cycle Time**: MIN_ON + MIN_OFF ≥ 240s (MIN_TOTAL_CYCLE_TIME_SEC)
3. **Freeze Protection**: FREEZE_PROTECTION_OFF > FREEZE_PROTECTION_ON
4. **ADAPTIVE_DUTY**: ADAPTIVE_LOW_DUTY < ADAPTIVE_HIGH_DUTY
5. **High Temp Alerts**: HIGH_TEMP_INSTANT_DELAY_SEC ≤ HIGH_TEMP_SUSTAINED_DELAY_SEC

### Warnings (Sub-optimal but allowed)

1. **Freeze gap**: FREEZE_PROTECTION_OFF - FREEZE_PROTECTION_ON < 3°C
2. **Adaptive shift**: ADAPTIVE_MAX_SHIFT ≥ HYSTERESIS (may cause instability)
3. **Cycle balance**: MIN_ON > MIN_OFF (unusual pattern)
4. **Setpoint vs freeze**: SETPOINT ≤ FREEZE_PROTECTION_OFF (potential conflict)
5. **High temp vs setpoint**: Thresholds too close to normal operating range
6. **Smoothing vs failure**: Smoothing window > SENSOR_NO_READING_SEC (may prevent detection)
7. **MIN_OFF vs loop**: MIN_OFF gives < 3 control loops (insufficient responsiveness)
8. **Failure escalation**: SENSOR_CRITICAL_FAILURE_SEC ≤ SENSOR_NO_READING_SEC (no time to escalate)
9. **Alert comparison**: HIGH_TEMP_INSTANT_THRESHOLD ≠ HIGH_TEMP_SUSTAINED_THRESHOLD (unusual)
10. **Recovery hysteresis**: FREEZE_RECOVERY_HYSTERESIS < FREEZE_LOCK_HYSTERESIS (may cause oscillation)

---

## Configuration Best Practices

### 1. Start with Defaults
The default configuration is optimized for a small drinks fridge with standard R134a refrigeration. Start here and adjust only if needed.

### 2. Temperature Control Trade-offs
- **Tighter hysteresis** (0.5–0.7°C) = More stable temperature, more frequent cycling
- **Wider hysteresis** (1.5–2.0°C) = Less cycling, more temperature variation

### 3. Sensor Smoothing
- **Air sensor**: Longer smoothing (30–60s) prevents control oscillation from door openings
- **Evap sensor**: Shorter smoothing (5–15s) tracks coil dynamics for freeze protection

### 4. Compressor Protection
Never reduce MIN_ON + MIN_OFF below 240s (4 minutes) unless your compressor manufacturer explicitly allows it. Most small compressors require 180–300s minimum OFF time.

### 5. Freeze Protection Gap
Maintain at least 5°C between FREEZE_PROTECTION_ON and FREEZE_PROTECTION_OFF to prevent rapid lock/unlock cycles during borderline conditions.

### 6. Monitoring and Alerting
Enable all feature flags during initial setup. Once stable, you can disable FEATURE_PERFORMANCE_METRICS if desired, but keep FEATURE_SENSOR_FAILURE and FEATURE_HIGH_TEMP_ALERTS enabled.

### 7. Slack Notifications
Set SLACK_LOG_LEVEL to WARNING (2) in production to reduce noise, or INFO (1) during initial setup and troubleshooting.

---

## Example Configurations

### Minimal Safe Configuration
```javascript
{
  SETPOINT: 4.0,
  HYSTERESIS: 1.0,
  MIN_ON: 180,
  MIN_OFF: 300,
  FREEZE_PROTECTION_ON: -16.0,
  FREEZE_PROTECTION_OFF: -2.0,
  // ... all other values at defaults
}
```

### Tight Temperature Control
```javascript
{
  SETPOINT: 4.0,
  HYSTERESIS: 0.7,              // Tighter control
  AIR_SENSOR_SMOOTHING_SEC: 45,  // More smoothing
  MIN_ON: 180,
  MIN_OFF: 360,                  // Longer rest for stability
  ADAPTIVE_MAX_SHIFT: 0.3,       // Limit adaptation
  // ... other values at defaults
}
```

### Aggressive Efficiency
```javascript
{
  SETPOINT: 5.0,                 // Slightly warmer
  HYSTERESIS: 1.5,               // Wider band
  FEATURE_ADAPTIVE_HYSTERESIS: true,
  ADAPTIVE_MAX_SHIFT: 0.7,       // Allow more adaptation
  ADAPTIVE_HIGH_DUTY: 65,
  ADAPTIVE_LOW_DUTY: 35,
  // ... other values at defaults
}
```

---

## Validation

All configuration is validated before the controller starts. Validation checks:

1. **Type checking**: Integers, numbers, booleans, strings
2. **Range validation**: Critical and recommended ranges
3. **Cross-field constraints**: Relationships between parameters

Validation produces:
- **Errors** (CRITICAL): Configuration cannot be used, must be fixed
- **Warnings** (WARNING): Sub-optimal configuration, review recommended

See `src/validation/validator.ts` for complete validation logic.

---

## Troubleshooting

### Configuration Error: "MIN_ON + MIN_OFF must be at least 240s"
**Cause**: Total cycle time is too short for safe compressor operation.
**Solution**: Increase MIN_ON and/or MIN_OFF so their sum is ≥ 240s.

### Warning: "Freeze protection gap is narrow"
**Cause**: FREEZE_PROTECTION_OFF - FREEZE_PROTECTION_ON < 3°C
**Solution**: Widen the gap to 5°C+ to prevent oscillation. Example: ON=-18°C, OFF=-8°C.

### Warning: "MIN_OFF gives only X control loops"
**Cause**: MIN_OFF / (LOOP_PERIOD_MS / 1000) < 3
**Solution**: Either increase MIN_OFF or decrease LOOP_PERIOD_MS to ensure at least 3 loop iterations during the OFF period.

### Error: "HIGH_TEMP_INSTANT_DELAY_SEC must be <= HIGH_TEMP_SUSTAINED_DELAY_SEC"
**Cause**: Instant alerts configured to trigger after sustained alerts.
**Solution**: Ensure instant delay is shorter than sustained delay (e.g., instant=180s, sustained=600s).

---

## Further Reading

- [Main README](../README.md) - Project overview and setup
- [Validation Types](../src/validation/types.ts) - Type definitions
- [Validation Logic](../src/validation/validator.ts) - Complete validation rules
- [Freeze Protection](../src/core/freeze-protection.ts) - Freeze protection algorithm
