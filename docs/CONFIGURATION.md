# Configuration Reference

Complete reference for all configurable options in the Shelly Fridge Controller.

## How Configuration Works

The controller uses a **three-tier configuration system**:

| Tier | Object | Persistence | Purpose |
|------|--------|-------------|---------|
| **Constants** | `ADAPT` | Hardcoded | Tuning constants (rarely changed) |
| **Config** | `C` | KVS (survives reboot) | User settings |
| **State** | `S` / `V` | KVS / Volatile | Runtime state |

### Changing Configuration

Configuration can be changed via:

1. **MQTT Command**: Publish to `fridge/command` topic
   ```json
   {"cmd": "setpoint", "value": 3.5}
   ```
   Note: Currently only `ctl_targetDeg` can be changed via MQTT.

2. **KVS Direct**: Use Shelly's KVS.Set API (for advanced users)
   ```javascript
   KVS.Set("fridge_cfg_ctl", "4.0,1.0,0.08")
   ```

3. **Source Code**: Edit `DEFAULT` in `src/config.js` before deploy

---

## System Settings (SYS)

Basic hardware and communication settings.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `sys_loopSec` | 5 | 1-60 | seconds | Main loop interval (heartbeat) |
| `sys_sensAirId` | 101 | 100-102 | ID | Shelly Add-on ID for air temperature sensor |
| `sys_sensEvpId` | 100 | 100-102 | ID | Shelly Add-on ID for evaporator sensor |
| `sys_sensFailLimit` | 5 | 1-20 | loops | Bad readings before entering Limp Mode |
| `sys_mqttTopic` | `fridge/status` | string | - | MQTT topic for status publishing |
| `sys_mqttCmd` | `fridge/command` | string | - | MQTT topic for commands |

---

## Thermostat Control (CTL)

Core temperature control parameters.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `ctl_targetDeg` | 4.0 | -5 to 15 | °C | Target temperature setpoint |
| `ctl_hystBase` | 1.0 | 0.1-5.0 | °C | Base hysteresis band (±hyst around target) |
| `ctl_smoothAlpha` | 0.08 | 0.01-1.0 | - | EMA smoothing factor (lower = smoother, slower response) |

### How Thermostat Works

```
       ON threshold = target + hysteresis
            ┌─────────────────────
            │         ↑
  target ───┼─────────┼─────────── target
            │         ↓
            └─────────────────────
       OFF threshold = target - hysteresis

Example (target=4°C, hyst=1°C):
  - Compressor turns ON when air temp rises above 5°C
  - Compressor turns OFF when air temp drops below 3°C
  - Dead band: 3°C to 5°C (no change while in this range)
```

---

## Adaptive Hysteresis (ADT)

Self-adjusting temperature control based on cycle times.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `adt_enable` | true | boolean | - | Enable adaptive hysteresis |
| `adt_hystMinDeg` | 0.5 | 0.1-5.0 | °C | Minimum allowed hysteresis |
| `adt_hystMaxDeg` | 3.0 | 0.1-5.0 | °C | Maximum allowed hysteresis |
| `adt_targetMinSec` | 600 | 300-3600 | seconds | Target minimum cycle time (10 min) |
| `adt_targetMaxSec` | 1200 | 600-7200 | seconds | Target maximum cycle time (20 min) |

### Why Adaptive Hysteresis?

**Problem**: Fixed hysteresis causes issues:
- Too tight (small): Frequent cycling, compressor wear, high energy
- Too loose (large): Temperature swings, poor food safety

**Solution**: The system learns optimal hysteresis by observing:
- If cycles are too short → widen hysteresis
- If cycles are too long → tighten hysteresis

---

## Compressor Protection (CMP)

Prevents compressor damage from improper cycling.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `cmp_minOnSec` | 180 | 60-600 | seconds | Minimum run time (3 min) |
| `cmp_minOffSec` | 300 | 60-900 | seconds | Minimum off time (5 min) |
| `cmp_maxRunSec` | 7200 | 1800-14400 | seconds | Maximum continuous run (2 hours) |
| `cmp_freezeCutDeg` | 0.5 | -2 to 2 | °C | Emergency shutoff if air drops below this |

### Why These Limits?

| Protection | Purpose |
|------------|---------|
| **Min ON** | Prevents short-cycling that damages compressor windings |
| **Min OFF** | Allows refrigerant pressures to equalize before restart |
| **Max ON** | Prevents ice buildup and detects cooling failure |
| **Freeze Cut** | Emergency stop to prevent food damage |

---

## Limp Mode (LMP)

Failsafe blind-cycling when sensors fail.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `lmp_enable` | true | boolean | - | Enable limp mode on sensor failure |
| `lmp_onSec` | 1800 | 600-3600 | seconds | Blind ON duration (30 min) |
| `lmp_offSec` | 900 | 300-1800 | seconds | Blind OFF duration (15 min) |

### How Limp Mode Works

When sensors fail, the system enters "limp mode":
- No temperature feedback available
- System cycles blindly: ON for 30min, OFF for 15min
- **66% duty cycle** - keeps fridge cold but not freezing
- Returns to normal when sensors recover

---

## Door Open Detection (DOR)

Detects door openings via rapid temperature rise.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `dor_enable` | true | boolean | - | Enable door detection |
| `dor_rateDegMin` | 5.0 | 0.5-20.0 | °C/min | Temperature rise rate to trigger |
| `dor_pauseSec` | 300 | 30-3600 | seconds | Pause cooling duration (5 min) |

### Why Pause on Door Open?

When door opens, warm air rushes in. If compressor keeps running:
- Evaporator ices up rapidly
- Efficiency drops dramatically
- Better to pause and let temperature stabilize

---

## Defrost (DFR)

Ice removal from evaporator coil.

### Dynamic Defrost (Temperature-Based)

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `dfr_dynEnable` | true | boolean | - | Enable dynamic defrost |
| `dfr_dynTrigDeg` | -16.0 | -40 to 0 | °C | Evap temp that triggers defrost |
| `dfr_dynEndDeg` | -5.0 | -20 to 5 | °C | Evap temp that ends defrost |
| `dfr_dynDwellSec` | 300 | 60-7200 | seconds | Must hold end temp for this duration |

### Scheduled Defrost (Time-Based)

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `dfr_schedEnable` | true | boolean | - | Enable scheduled defrost |
| `dfr_schedHour` | 1 | 0-23 | hour | Hour to start defrost (24h format) |
| `dfr_schedDurSec` | 3600 | 300-14400 | seconds | Maximum defrost duration (1 hour) |

---

## Relay Weld Detection (WLD)

Detects if relay contacts have fused together.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `wld_enable` | true | boolean | - | Enable weld detection |
| `wld_waitSec` | 600 | 60-7200 | seconds | Wait after OFF before checking (10 min) |
| `wld_winSec` | 1800 | 300-14400 | seconds | Detection window end (30 min) |
| `wld_dropDeg` | 0.2 | 0.05-5.0 | °C | Temp drop that triggers alarm |

### How Weld Detection Works

After compressor turns OFF:
1. Wait 10 minutes for temperature to stabilize
2. Monitor for 20 more minutes
3. If temperature **drops** while relay is OFF → relay is welded shut

**FATAL ALARM** - requires manual intervention (relay replacement)

---

## Sensor Health (SNS)

Monitors sensor reliability.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `sns_stuckEnable` | true | boolean | - | Enable stuck sensor detection |
| `sns_stuckTimeSec` | 14400 | 300-86400 | seconds | Time unchanged before alarm (4 hours) |
| `sns_stuckEpsDeg` | 0.2 | 0.05-5.0 | °C | Minimum change to reset timer |

---

## High Temperature Alert (ALM)

Warns when fridge is too warm.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `alm_highEnable` | true | boolean | - | Enable high temp alerts |
| `alm_highDeg` | 10.0 | 0-40 | °C | Temperature threshold |
| `alm_highDelaySec` | 600 | 60-7200 | seconds | Must persist before alerting (10 min) |

---

## Power Monitoring (PWR)

Monitors compressor power consumption.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `pwr_enable` | true | boolean | - | Enable power monitoring |
| `pwr_startMaskSec` | 15 | 1-120 | seconds | Ignore inrush current period |
| `pwr_runMinW` | 10 | 1-1000 | watts | Minimum expected running power |
| `pwr_runMaxW` | 400 | 50-2000 | watts | Maximum expected running power |
| `pwr_ghostTripSec` | 60 | 5-600 | seconds | Low power duration before alarm |
| `pwr_ghostMaxCnt` | 3 | 1-10 | count | Ghost runs before fatal alarm |

### Power Alarm Conditions

| Condition | Meaning | Severity |
|-----------|---------|----------|
| **Ghost Run** | Relay ON but <10W power draw | Warning (recoverable) |
| **Locked Rotor** | Power >400W (motor seized) | Fatal |

---

## Turbo Mode (TRB)

Rapid cooldown mode (e.g., after loading groceries).

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `trb_enable` | true | boolean | - | Enable turbo mode |
| `trb_targetDeg` | 1.0 | -2 to 3 | °C | Turbo target temperature |
| `trb_hystDeg` | 0.5 | 0.3-1.0 | °C | Turbo hysteresis (tighter control) |
| `trb_maxTimeSec` | 10800 | 1800-21600 | seconds | Maximum turbo duration (3 hours) |

### Activating Turbo Mode

Send MQTT command:
```json
{"cmd": "turbo_on"}
```

To deactivate:
```json
{"cmd": "turbo_off"}
```

---

## Gas Leak Detection (GAS)

Detects refrigerant leak or valve failure.

| Setting | Default | Range | Unit | Description |
|---------|---------|-------|------|-------------|
| `gas_checkSec` | 900 | 60-7200 | seconds | Check interval (15 min) |
| `gas_failDiff` | 5.0 | 1.0-20.0 | °C | Required temp difference |

### How Gas Leak Detection Works

After running for `gas_checkSec`:
- Evaporator should be at least `gas_failDiff` colder than air
- If not → cooling system is failing (gas leak, blocked valve, etc.)

---

## Status Codes

System status values shown in MQTT and logs:

| Status | Icon | Meaning |
|--------|------|---------|
| `BOOT` | `BOOT` | System starting up |
| `IDLE` | `IDLE` | Compressor OFF, at target temperature |
| `COOLING` | `COOLING` | Compressor ON, actively cooling |
| `WANT_IDLE` | `WANT_IDLE` | Wants to stop but blocked by timer |
| `WANT_COOL` | `WANT_COOL` | Wants to start but blocked by timer |
| `LIMP_IDLE` | `LIMP_IDLE` | Limp mode, compressor OFF |
| `LIMP_COOL` | `LIMP_COOL` | Limp mode, compressor ON |
| `TURBO_COOL` | `TURBO_COOL` | Turbo mode, compressor ON |
| `TURBO_IDLE` | `TURBO_IDLE` | Turbo mode, compressor OFF |

---

## Alarm Codes

Alarm severity levels and actions:

| Alarm | Severity | Meaning | Action |
|-------|----------|---------|--------|
| `ALARM_RELAY_WELD` | **FATAL** | Relay contacts fused | Replace relay immediately |
| `ALARM_ROTOR_LOCKED` | **FATAL** | Compressor motor seized | Call technician |
| `ALARM_HIGH_TEMP` | Critical | Temperature too high | Check door, check cooling |
| `ALARM_SENSOR_FAIL` | Error | Sensor not responding | Check wiring |
| `ALARM_SENSOR_STUCK` | Error | Sensor reading unchanged | Replace sensor |
| `ALARM_COMP_GHOST` | Warning | No power draw when ON | May recover, monitor |
| `ALARM_COOLING_FAIL` | Warning | Poor cooling performance | Check refrigerant |

---

## Reason Codes

Why the system can't switch states:

| Reason | Meaning |
|--------|---------|
| `NONE` | No blocking condition |
| `PROT_MIN_ON` | Can't turn OFF - minimum run time not met |
| `PROT_MIN_OFF` | Can't turn ON - minimum off time not met |
| `PROT_MAX_ON` | Forced OFF - maximum run time exceeded |
| `PROT_AIR_FRZ` | Forced OFF - air temperature below freeze cut |
| `PROT_DOOR_OPEN` | Paused - door open detected |
| `DEFR_SCHED` | Scheduled defrost in progress |
| `DEFR_TRIG` | Defrost just triggered |
| `DEFR_DYN` | Dynamic defrost in progress |

---

## MQTT Message Format

### Status Message (Published)

Topic: `fridge/status` (default)

```json
{
  "status": "COOLING",
  "reason": "NONE",
  "alarm": "NONE",
  "tAirRaw": 4.3,
  "tAirSmt": 4.2,
  "tEvap": -8.5,
  "tDev": 32.1,
  "relayOn": 1,
  "watts": 95,
  "dutyHr": 45,
  "dutyDay": 42,
  "dutyLife": 40,
  "hoursLife": 127,
  "hyst": 1.2,
  "avgOnSec": 420,
  "avgOffSec": 510,
  "defrostOn": 0,
  "doorOpen": 0,
  "turboOn": 0,
  "health": 0.25
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Current status code (IDLE, COOLING, etc.) |
| `reason` | string | Blocking reason if any |
| `alarm` | string | Active alarm code |
| `tAirRaw` | number | Raw air temperature (°C) |
| `tAirSmt` | number | Smoothed air temperature (°C) |
| `tEvap` | number | Evaporator temperature (°C) |
| `tDev` | number | Shelly device internal temperature (°C) |
| `relayOn` | 0/1 | Relay state (1=ON, 0=OFF) |
| `watts` | number | Power consumption (W, null if no PM) |
| `dutyHr` | number | Duty cycle this hour (%) |
| `dutyDay` | number | Average duty cycle over 24h (%) |
| `dutyLife` | number | Lifetime average duty cycle (%) |
| `hoursLife` | number | Lifetime compressor run hours |
| `hyst` | number | Current effective hysteresis (°C) |
| `avgOnSec` | number | Average ON time this hour (seconds) |
| `avgOffSec` | number | Average OFF time this hour (seconds) |
| `defrostOn` | 0/1 | Defrost active (1=yes) |
| `doorOpen` | 0/1 | Door pause active (1=yes) |
| `turboOn` | 0/1 | Turbo mode active (1=yes) |
| `health` | number | Cooling efficiency (°C/min) - higher is better |

### Command Message (Received)

Topic: `fridge/command` (default)

Commands use a `{"cmd": "...", ...}` structure:

```json
{"cmd": "setpoint", "value": 3.5}
{"cmd": "turbo_on"}
{"cmd": "turbo_off"}
{"cmd": "reset_alarms"}
{"cmd": "status"}
```

| Command | Parameters | Description |
|---------|------------|-------------|
| `setpoint` | `value` (number) | Change target temperature |
| `turbo_on` | - | Activate turbo mode |
| `turbo_off` | - | Deactivate turbo mode |
| `reset_alarms` | - | Clear active alarms |
| `status` | - | Request status (logs only) |

---

## Recommended Settings

### Home Refrigerator (Default)

```json
{
  "ctl_targetDeg": 4.0,
  "ctl_hystBase": 1.0,
  "cmp_minOnSec": 180,
  "cmp_minOffSec": 300
}
```

### Commercial Display Fridge

```json
{
  "ctl_targetDeg": 3.0,
  "ctl_hystBase": 0.5,
  "adt_enable": false,
  "dor_enable": false
}
```

### Deep Freeze Chest

```json
{
  "ctl_targetDeg": -18.0,
  "ctl_hystBase": 2.0,
  "cmp_freezeCutDeg": -25.0,
  "alm_highDeg": -10.0
}
```
