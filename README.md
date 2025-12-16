# Shelly Fridge Controller

[![CI](https://github.com/chiptoma/shelly-fridge-controller/actions/workflows/ci.yml/badge.svg)](https://github.com/chiptoma/shelly-fridge-controller/actions/workflows/ci.yml)

A thermostat controller for Shelly Plus 1PM devices. I built this to replace the mechanical thermostat on my garage fridge with something smarter that protects the compressor and lets me monitor things remotely.

## What It Does

- **Temperature control** - Turns compressor ON/OFF to maintain target temperature
- **Compressor protection** - Enforces minimum ON/OFF times to prevent short-cycling damage
- **Adaptive tuning** - Automatically adjusts hysteresis based on your fridge's behavior
- **Fault detection** - Catches stuck relays, sensor failures, and cooling problems
- **Limp mode** - Keeps running (blind cycling) if sensors fail
- **MQTT reporting** - Sends status to Home Assistant or any MQTT client

![Console debug demo](docs/assets/console.gif)

## Hardware

| Component | Required | Notes |
|-----------|----------|-------|
| Shelly Plus 1PM | Yes | Main controller (1PM has power monitoring) |
| DS18B20 Sensor | Yes (1-2) | Temperature sensors |
| Shelly Plus Add-On | Yes | Connects DS18B20 sensors to Shelly |
| External Contactor | Maybe | If compressor draws >16A |

### Wiring

The Shelly switches the **Live wire only**. Neutral goes direct to the compressor.

```
    Mains                     Shelly Plus 1PM                    Compressor
    ─────                     ───────────────                    ──────────
                           ┌─────────────────┐
    L (Live) ──────────────┤ L           O ├──────────────────► L (Live)
                           │                 │
    N (Neutral) ───────────┤ N               │
           │               │                 │
           │               │   [Add-On]      │
           │               │    100: Evap    │◄─── DS18B20 on evaporator
           │               │    101: Air     │◄─── DS18B20 in fridge air
           │               └─────────────────┘
           │
           └──────────────────────────────────────────────────► N (Neutral)
```

**Note:** The Shelly's N terminal powers the device itself. The compressor's neutral connects directly to mains neutral, bypassing the relay entirely. Only Live is switched.

### Sensor Placement

| Sensor | Location | Purpose |
|--------|----------|---------|
| Air (101) | Middle of fridge, away from walls | Measures food temperature |
| Evap (100) | On evaporator coil | Detects icing, freeze protection |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/chiptoma/shelly-fridge-controller.git
cd shelly-fridge-controller
pnpm install

# Configure device IP
cp .env.example .env
# Edit .env with your Shelly's IP

# Deploy to device
pnpm run deploy

# Watch logs
pnpm run shelly:monitor
```

---

## Status Codes

| Status | Meaning |
|--------|---------|
| `IDLE` | At temperature, compressor OFF |
| `COOLING` | Compressor ON, cooling down |
| `WANT_COOL` | Needs to cool but min-off timer active |
| `WANT_IDLE` | Wants to stop but min-on timer active |
| `LIMP_COOL` | Sensors failed, blind cycling ON |
| `LIMP_IDLE` | Sensors failed, blind cycling OFF |
| `TURBO_COOL` | Turbo mode, aggressive cooling |

## Alarms

| Alarm | Severity | Action |
|-------|----------|--------|
| `ALARM_RELAY_WELD` | **FATAL** | Relay stuck closed - replace immediately |
| `ALARM_ROTOR_LOCKED` | **FATAL** | Compressor seized - call technician |
| `ALARM_HIGH_TEMP` | Critical | Check door seal, cooling system |
| `ALARM_SENSOR_FAIL` | Error | Check sensor wiring |
| `ALARM_COMP_GHOST` | Warning | May self-recover, monitor |

---

## Configuration

### Common Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ctrl_targetDeg` | 4.0°C | Target temperature |
| `ctrl_hystDeg` | 1.0°C | Temperature band |
| `comp_minOnSec` | 180s | Minimum compressor run time |
| `comp_minOffSec` | 300s | Minimum compressor rest time |

### Change via MQTT

```json
{"cmd": "setpoint", "value": 3.5}
```

See **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** for all 50+ settings with valid ranges.

---

## Key Features

### Adaptive Hysteresis

The controller watches cycle times and adjusts automatically:
- Cycles too short → widens temperature band
- Cycles too long → tightens temperature band

Target: 10-20 minute cycles (good for compressor life).

### Compressor Protection

| Protection | Default | Why |
|------------|---------|-----|
| Min Run Time | 3 min | Prevents short-cycling |
| Min Off Time | 5 min | Lets pressures equalize |
| Max Run Time | 2 hr | Catches cooling failure |
| Freeze Cut | 0.5°C | Emergency stop if too cold |

### Limp Mode

If sensors fail:
- Blind cycling: 30 min ON, 15 min OFF
- ~66% duty cycle
- Auto-recovers when sensors work again

### Relay Weld Detection

After turning OFF, monitors temperature for 20+ minutes. If temp drops while relay should be OFF → relay is stuck closed. Raises FATAL alarm.

---

## Commands

| Command | Description |
|---------|-------------|
| `pnpm run deploy` | Build and deploy |
| `pnpm run deploy:monitor` | Deploy + watch logs |
| `pnpm run shelly:status` | Show current status |
| `pnpm run shelly:logs` | View error logs |
| `pnpm run shelly:monitor` | Live debug output |
| `pnpm test` | Run tests |
| `pnpm run lint` | Check code |

---

## MQTT

### Status (published to `fridge/status`)

```json
{
  "status": "COOLING",
  "alarm": "NONE",
  "tAirSmt": 4.2,
  "tEvap": -8.5,
  "relayOn": 1,
  "watts": 95,
  "dutyHr": 45,
  "hyst": 1.2
}
```

### Commands (publish to `fridge/command`)

```json
{"cmd": "setpoint", "value": 3.5}
{"cmd": "turbo_on"}
{"cmd": "turbo_off"}
{"cmd": "reset_alarms"}
{"cmd": "status"}
```

### Home Assistant

```yaml
sensor:
  - platform: mqtt
    name: "Fridge Temperature"
    state_topic: "fridge/status"
    value_template: "{{ value_json.tAirSmt }}"
    unit_of_measurement: "°C"

switch:
  - platform: mqtt
    name: "Fridge Turbo"
    command_topic: "fridge/command"
    payload_on: '{"cmd": "turbo_on"}'
    payload_off: '{"cmd": "turbo_off"}'
```

### Security

⚠️ **Important:** This controller accepts commands via MQTT. Ensure your broker is secured:
- Enable authentication on your MQTT broker
- Don't use public test brokers for production
- Consider firewall rules for MQTT port (1883/8883)

Anyone with MQTT access can control your fridge (change setpoints, toggle turbo mode).

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Script won't start | Out of memory | Check `shelly:status` |
| LIMP mode | Sensor failure | Check wiring, sensor IDs |
| Short-cycling | Hysteresis too tight | Increase `ctrl_hystDeg` |
| Temp swings | Hysteresis too wide | Decrease `ctrl_hystDeg` |

---

## Project Structure

```
src/
├── constants.js    # Status/alarm codes, tuning constants
├── config.js       # User config with KVS persistence
├── state.js        # Runtime state
├── sensors.js      # Temperature reading, smoothing
├── alarms.js       # Alarm detection
├── protection.js   # Compressor safety
├── features.js     # Adaptive hysteresis
├── metrics.js      # Duty cycle tracking
├── reporting.js    # MQTT publishing
├── control.js      # Core thermostat logic
├── loop.js         # Main 5-second loop
├── mqtt.js         # Command handling
├── main.js         # Entry point, boot recovery
└── utils/          # Math, KVS utilities
```

---

## Docs

| Document | Description |
|----------|-------------|
| [Configuration](docs/CONFIGURATION.md) | All settings with ranges |
| [Deployment](docs/DEPLOYMENT.md) | Build tools |
| [Testing](docs/TESTING.md) | Test infrastructure |
| [Linting](docs/LINTING.md) | ESLint config |
| [Shelly API](https://shelly-api-docs.shelly.cloud/gen2/Scripts/ShellyScriptLanguageFeatures) | Official Shelly Script reference |

---

## Specs

| | |
|---|---|
| Language | JavaScript (ES5) |
| Runtime | Shelly mJS |
| Memory | ~25KB heap |
| Loop | 5 seconds |
| Tests | 818+ tests |

---

## License

**PolyForm Noncommercial 1.0.0** - Free for personal use. Commercial use requires permission.

See [LICENSE](LICENSE) for full terms.
