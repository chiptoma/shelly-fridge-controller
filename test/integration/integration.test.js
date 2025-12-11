// ==============================================================================
// * INTEGRATION TESTS
// ? End-to-end scenarios testing the fridge controller behavior.
// ? Uses the Shelly simulator to run complete operational scenarios.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShellyRuntime } from '../utils/shelly-simulator.js'

// ----------------------------------------------------------
// * TEST SETUP
// ? Loads the fridge controller into the simulator.
// ----------------------------------------------------------

/**
 * Setup function that initializes the fridge controller in the simulator
 * This mimics what happens when the script boots on a real Shelly device
 */
async function setupFridgeController(runtime) {
  // Install globals before importing modules
  runtime.installGlobals(global)

  // Reset vitest modules to get fresh imports with our globals
  vi.resetModules()

  // Import the main module which will use our mocked globals
  // Note: The modules will capture the globals at import time
  const constants = await import('../../src/constants.js')
  const config = await import('../../src/config.js')
  const state = await import('../../src/state.js')

  // Store references for assertions
  runtime.script = {
    constants: constants,
    config: config,
    state: state,
    S: state.S,
    V: state.V,
    C: config.C,
    DEFAULT: config.DEFAULT,
  }

  // Initialize with defaults (simulate KVS being empty)
  const defKeys = Object.keys(config.DEFAULT)
  for (let i = 0; i < defKeys.length; i++) {
    config.C[defKeys[i]] = config.DEFAULT[defKeys[i]]
  }

  return runtime.script
}

// ----------------------------------------------------------
// * SHELLY RUNTIME TESTS
// ? Basic tests for the simulator itself.
// ----------------------------------------------------------

describe('ShellyRuntime', () => {
  let runtime

  beforeEach(() => {
    runtime = new ShellyRuntime()
  })

  describe('Time Control', () => {
    it('should start at 0 uptime', () => {
      expect(runtime.uptimeMs).toBe(0)
    })

    it('should advance time correctly', () => {
      runtime.advanceTime(1000)
      expect(runtime.uptimeMs).toBe(1000)
    })

    it('should advance time fast to timer boundaries', () => {
      // Set a timer for 5000ms
      let fired = false
      runtime.Timer.set(5000, false, () => { fired = true })

      // Fast advance 10 seconds
      runtime.advanceTimeFast(10000)

      expect(fired).toBe(true)
      expect(runtime.uptimeMs).toBe(10000)
    })

    it('should fire repeating timers multiple times', () => {
      let count = 0
      runtime.Timer.set(1000, true, () => { count++ })

      runtime.advanceTimeFast(5500)

      expect(count).toBe(5) // Fires at 1000, 2000, 3000, 4000, 5000
    })
  })

  describe('Temperature Sensors', () => {
    it('should return null for disconnected sensors', () => {
      let result = null
      runtime.Shelly.call('Temperature.GetStatus', { id: 101 }, (r, ec) => {
        result = { r, ec }
      })

      expect(result.ec).toBe(-1)
    })

    it('should return temperature when sensor connected', () => {
      runtime.setTemperature(101, 5.5)

      let result = null
      runtime.Shelly.call('Temperature.GetStatus', { id: 101 }, (r, ec) => {
        result = { r, ec }
      })

      expect(result.ec).toBe(0)
      expect(result.r.tC).toBe(5.5)
    })
  })

  describe('KVS Operations', () => {
    it('should store and retrieve values', () => {
      runtime.Shelly.call('KVS.Set', { key: 'test', value: '{"a":1}' }, () => {})

      let result = null
      runtime.Shelly.call('KVS.Get', { key: 'test' }, (r, ec) => {
        result = { r, ec }
      })

      expect(result.r.value).toBe('{"a":1}')
    })

    it('should match keys with pattern', () => {
      runtime.Shelly.call('KVS.Set', { key: 'fridge_cfg_sys', value: '{}' }, () => {})
      runtime.Shelly.call('KVS.Set', { key: 'fridge_cfg_ctrl', value: '{}' }, () => {})
      runtime.Shelly.call('KVS.Set', { key: 'other_key', value: '{}' }, () => {})

      let result = null
      runtime.Shelly.call('KVS.GetMany', { match: 'fridge_cfg_*' }, (r) => {
        result = r
      })

      expect(result.items.length).toBe(2)
    })
  })

  describe('Switch Operations', () => {
    it('should track relay state changes', () => {
      runtime.Shelly.call('Switch.Set', { id: 0, on: true }, () => {})
      expect(runtime.getRelayState()).toBe(true)

      runtime.Shelly.call('Switch.Set', { id: 0, on: false }, () => {})
      expect(runtime.getRelayState()).toBe(false)
    })

    it('should record relay history', () => {
      runtime.Shelly.call('Switch.Set', { id: 0, on: true }, () => {})
      runtime.advanceTime(1000)
      runtime.Shelly.call('Switch.Set', { id: 0, on: false }, () => {})

      const history = runtime.getRelayHistory()
      expect(history.length).toBe(2)
      expect(history[0].state).toBe(true)
      expect(history[1].state).toBe(false)
    })

    it('should include power in status', () => {
      runtime.setPower(0, 85)

      const status = runtime.Shelly.getComponentStatus('Switch', 0)
      expect(status.apower).toBe(85)
    })
  })

  describe('MQTT Operations', () => {
    it('should capture published messages', () => {
      runtime.MQTT.publish('fridge/status', '{"temp":5}', 0, false)

      const msg = runtime.getLastMqttMessage()
      expect(msg.topic).toBe('fridge/status')
      expect(msg.payload).toBe('{"temp":5}')
    })

    it('should deliver subscribed messages', () => {
      let received = null
      runtime.MQTT.subscribe('fridge/command', (topic, msg) => {
        received = { topic, msg }
      })

      runtime.mqttReceive('fridge/command', '{"cmd":"turbo"}')

      expect(received.msg).toBe('{"cmd":"turbo"}')
    })
  })

  describe('Print Logging', () => {
    it('should capture print statements', () => {
      runtime.print('Test message')
      runtime.advanceTime(100)
      runtime.print('Second message')

      const prints = runtime.getPrintHistory()
      expect(prints.length).toBe(2)
      expect(prints[0].message).toBe('Test message')
      expect(prints[1].message).toBe('Second message')
    })
  })
})

// ----------------------------------------------------------
// * FRIDGE CONTROLLER INTEGRATION SCENARIOS
// ? These test the actual fridge controller behavior.
// ----------------------------------------------------------

describe('Fridge Controller Integration', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    script = await setupFridgeController(runtime)
  })

  describe('State Module', () => {
    it('should initialize with default state values', () => {
      expect(script.S.sys_relayState).toBe(false)
      expect(script.S.stats_lifeTime).toBe(0)
    })

    it('should track volatile state', () => {
      expect(script.V.sys_status).toBe('BOOT')
      expect(script.V.sys_alarm).toBe('NONE')
    })
  })

  describe('Config Module', () => {
    it('should have default config values', () => {
      expect(script.C.ctrl_targetDeg).toBe(4.0)
      expect(script.C.comp_minOnSec).toBe(180)
      expect(script.C.comp_minOffSec).toBe(300)
    })

    it('should validate config bounds', async () => {
      // Import validateConfig
      const { validateConfig } = await import('../../src/config.js')

      // Set invalid value
      script.C.sys_loopSec = 0

      const reverted = validateConfig()

      expect(reverted).toContain('sys_loopSec')
      expect(script.C.sys_loopSec).toBe(script.DEFAULT.sys_loopSec)
    })
  })

  describe('Constants Module', () => {
    it('should have status constants', () => {
      expect(script.constants.ST.IDLE).toBe('IDLE')
      expect(script.constants.ST.COOLING).toBe('COOLING')
    })

    it('should have alarm constants', () => {
      expect(script.constants.ALM.WELD).toBe('ALARM_RELAY_WELD')
      expect(script.constants.ALM.LOCKED).toBe('ALARM_ROTOR_LOCKED')
    })
  })
})

// ----------------------------------------------------------
// * PROTECTION MODULE INTEGRATION
// ----------------------------------------------------------

describe('Protection Integration', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should detect timing guard violations', async () => {
    const { canTurnOn, canTurnOff } = await import('../../src/protection.js')
    const { S } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')

    // Initialize config
    const { DEFAULT } = await import('../../src/config.js')
    Object.assign(C, DEFAULT)

    // Set relay off timestamp to "now"
    const now = Date.now() / 1000
    S.sys_tsRelayOff = now

    // Should NOT be able to turn on immediately
    expect(canTurnOn(now)).toBe(false)

    // Should be able to turn on after minOffSec
    expect(canTurnOn(now + C.comp_minOffSec)).toBe(true)
  })

  it('should check weld detection correctly', async () => {
    const { checkWeldDetection } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    // Setup: Relay just turned off, snapshot temp = 10C
    S.sys_relayState = false
    S.sys_tsRelayOff = 0
    S.weld_snapAir = 10.0
    C.weld_waitSec = 60
    C.weld_winSec = 300
    C.weld_dropDeg = 1.0

    // Check within detection window (60-300s after off)
    // now=100, offDur=100, inWindow = (100 > 60 && 100 < 300) = true
    // tCtrl=5.0 < (snapAir=10.0 - dropDeg=1.0) = 9.0 → weld detected
    const result = checkWeldDetection(5.0, 100)

    expect(result).toBe(true)
    expect(V.sys_alarm).toBe('ALARM_RELAY_WELD')
  })
})

// ----------------------------------------------------------
// * SENSOR MODULE INTEGRATION
// ----------------------------------------------------------

describe('Sensor Integration', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should process sensor data through median filter', async () => {
    const { processSensorData } = await import('../../src/sensors.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    // Pre-warm the buffer with stable readings (buffer starts at [0,0,0])
    // This ensures median calculation isn't affected by initial zeros
    V.sens_bufAir = [5.0, 5.0, 5.0]
    V.sens_smoothAir = 5.0

    // Now process a new reading
    processSensorData(5.3)

    // Median of (5.0, 5.0, 5.3) = 5.0, EMA smooths toward it
    // Result should be close to 5.0 (slightly higher due to 5.3 influence)
    expect(V.sens_smoothAir).toBeCloseTo(5.0, 0)
  })

  it('should handle sensor errors', async () => {
    const { handleSensorError } = await import('../../src/sensors.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.sens_errCount = 0

    // Accumulate errors
    for (let i = 0; i < C.sys_sensFailLimit; i++) {
      handleSensorError()
    }

    // Should have hit the limit
    expect(V.sens_errCount).toBe(C.sys_sensFailLimit)
  })
})

// ----------------------------------------------------------
// * CONTROL MODULE INTEGRATION
// ----------------------------------------------------------

describe('Control Integration', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should evaluate thermostat hysteresis correctly', async () => {
    const { evaluateThermostat } = await import('../../src/control.js')

    // Above upper band - should cool
    expect(evaluateThermostat(6.0, 4.0, 1.0)).toBe(true)

    // Below lower band - should idle
    expect(evaluateThermostat(2.0, 4.0, 1.0)).toBe(false)

    // Within band - no change
    expect(evaluateThermostat(4.5, 4.0, 1.0)).toBe(null)
  })

  it('should respect fatal alarms in determineMode', async () => {
    const { determineMode } = await import('../../src/control.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ALM } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)

    // Set fatal alarm
    V.sys_alarm = ALM.WELD

    const mode = determineMode(10.0, -10.0) // Even with high temp

    expect(mode.wantOn).toBe(false)
    expect(mode.detail).toContain('FATAL')
  })
})

// ----------------------------------------------------------
// * FEATURES MODULE INTEGRATION
// ----------------------------------------------------------

describe('Features Integration', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should adapt hysteresis based on cycle metrics', async () => {
    const { adaptHysteresis, getEffectiveHysteresis } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.adapt_hystCurrent = 0.5

    // Short cycles should widen hysteresis
    const result = adaptHysteresis(200, 200, 3) // 200s ON, 200s OFF, 3 cycles

    expect(result).toBe('widen')
    expect(S.adapt_hystCurrent).toBeGreaterThan(0.5)
  })

  it('should handle turbo mode activation', async () => {
    const { checkTurboSwitch, handleTurboMode } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.turbo_lastSw = false

    // Rising edge on switch
    checkTurboSwitch(true)

    expect(V.turbo_active).toBe(true)
    expect(V.turbo_remSec).toBe(C.turbo_maxTimeSec)

    // Handle turbo should return override params
    const turbo = handleTurboMode(5)
    expect(turbo.target).toBe(C.turbo_targetDeg)
  })

  it('should detect door open events', async () => {
    const { detectDoorOpen } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    // Set reference point (door_refTs must be > 0 for detection to trigger)
    V.door_refTemp = 4.0
    V.door_refTs = 1

    // Rapid temp rise (simulating door open)
    // Rate = (10 - 4) / 4 * 60 = 90 deg/min >> 5 deg/min threshold
    const detected = detectDoorOpen(10.0, 5)

    expect(detected).toBe(true)
    // Timer is set to pauseSec then immediately decremented by loopSec
    expect(V.door_timer).toBe(C.door_pauseSec - C.sys_loopSec)
  })
})

// ----------------------------------------------------------
// * METRICS MODULE INTEGRATION
// ----------------------------------------------------------

describe('Metrics Integration', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should accumulate runtime statistics', async () => {
    const { updateRuntimeStats } = await import('../../src/metrics.js')
    const { S } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.stats_lifeTime = 0
    S.stats_lifeRun = 0

    // Simulate 1 hour of running
    for (let i = 0; i < 720; i++) { // 720 * 5s = 3600s = 1 hour
      updateRuntimeStats(true, 5)
    }

    expect(S.stats_lifeRun).toBe(3600)
    // ? getLifetimeRunHours is internal to metrics.js, verify via S.stats_lifeRun
    expect(S.stats_lifeRun / 3600).toBeCloseTo(1.0, 1)
  })

  it('should trigger hourly rollover', async () => {
    const { updateMetrics, isHourlyRolloverDue } = await import('../../src/metrics.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.stats_hourTime = 3599
    S.stats_hourRun = 1800
    S.stats_cycleCount = 3

    // Verify rollover is NOT yet due
    expect(isHourlyRolloverDue()).toBe(false)

    // One more tick should trigger rollover and return results
    const result = updateMetrics(true, 5)

    // updateMetrics returns rollover result when triggered
    // Note: hourRun gets +5 before calculation, so avgOn = (1800+5)/3
    expect(result).not.toBeNull()
    expect(result.avgOn).toBeCloseTo((1800 + 5) / 3, 1)
  })
})

// ----------------------------------------------------------
// * ALARM MODULE INTEGRATION
// ----------------------------------------------------------

describe('Alarm Integration', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should classify alarm severity correctly', async () => {
    const { getSeverity } = await import('../../src/alarms.js')
    const { ALM } = await import('../../src/constants.js')

    expect(getSeverity(ALM.WELD)).toBe('fatal')
    expect(getSeverity(ALM.LOCKED)).toBe('fatal')
    expect(getSeverity(ALM.HIGH)).toBe('critical')
    expect(getSeverity(ALM.FAIL)).toBe('error')
    expect(getSeverity(ALM.GHOST)).toBe('warning')
  })

  it('should clear non-fatal alarms', async () => {
    const { clearNonFatalAlarms } = await import('../../src/alarms.js')
    const { V } = await import('../../src/state.js')
    const { ALM } = await import('../../src/constants.js')

    // Set a non-fatal alarm
    V.sys_alarm = ALM.HIGH

    clearNonFatalAlarms()

    expect(V.sys_alarm).toBe(ALM.NONE)

    // Fatal alarm should NOT be cleared
    V.sys_alarm = ALM.WELD
    clearNonFatalAlarms()
    expect(V.sys_alarm).toBe(ALM.WELD)
  })

  it('should check high temp alarm with delay', async () => {
    const { checkHighTempAlarm } = await import('../../src/alarms.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ALM } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    // ? Use shorter delay for testing
    C.alarm_highDelaySec = 30
    C.sys_loopSec = 10
    V.sys_alarm = ALM.NONE
    V.turbo_active = false

    // High temp but not long enough - first call starts timer
    checkHighTempAlarm(12.0, false) // 10s
    expect(V.sys_alarm).not.toBe(ALM.HIGH)

    checkHighTempAlarm(12.0, false) // 20s
    expect(V.sys_alarm).not.toBe(ALM.HIGH)

    checkHighTempAlarm(12.0, false) // 30s
    expect(V.sys_alarm).not.toBe(ALM.HIGH)

    // ? Fourth call exceeds 30s delay threshold
    checkHighTempAlarm(12.0, false) // 40s > 30s
    expect(V.sys_alarm).toBe(ALM.HIGH)
  })
})

// ==============================================================================
// * COMPREHENSIVE SCENARIO TESTS
// ? End-to-end tests covering every logical path and edge case.
// ==============================================================================

// ----------------------------------------------------------
// * FREEZE PROTECTION SCENARIOS
// ----------------------------------------------------------

describe('Freeze Protection Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should activate freeze protection when air temp below threshold', async () => {
    const { isFreezeProtectionActive } = await import('../../src/protection.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    // Below freeze cut (default 0.5C)
    expect(isFreezeProtectionActive(0.3)).toBe(true)
    expect(isFreezeProtectionActive(0.0)).toBe(true)
    expect(isFreezeProtectionActive(-1.0)).toBe(true)

    // At or above threshold
    expect(isFreezeProtectionActive(0.5)).toBe(false)
    expect(isFreezeProtectionActive(1.0)).toBe(false)
  })

  it('should return IDLE mode with PROT_AIR_FRZ when freeze cut triggers', async () => {
    const { determineMode } = await import('../../src/control.js')
    const { S } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { RSN } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true // Compressor running

    // Temp drops below freeze cut
    const mode = determineMode(0.3, -10.0)

    expect(mode.wantOn).toBe(false)
    expect(mode.reason).toBe(RSN.PROT_AIR_FRZ)
    expect(mode.detail).toContain('Freeze')
  })

  it('should recover from freeze protection when temp rises', async () => {
    const { determineMode } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = 'NONE'

    // Temp back in normal range, should allow normal thermostat
    const mode = determineMode(6.0, -10.0) // Above target+hyst = 4+1 = 5

    expect(mode.wantOn).toBe(true)
  })
})

// ----------------------------------------------------------
// * MAX RUN AND TIMING GUARD SCENARIOS
// ----------------------------------------------------------

describe('Max Run and Timing Guard Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should detect max run exceeded after continuous operation', async () => {
    const { isMaxRunExceeded } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.turbo_active = false

    const now = Date.now() / 1000
    S.sys_tsRelayOn = now - C.comp_maxRunSec - 1 // Just past max run

    expect(isMaxRunExceeded(now)).toBe(true)
  })

  it('should NOT trigger max run during turbo mode', async () => {
    const { isMaxRunExceeded } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.turbo_active = true // Turbo exempts max run

    const now = Date.now() / 1000
    S.sys_tsRelayOn = now - C.comp_maxRunSec - 1000

    expect(isMaxRunExceeded(now)).toBe(false)
  })

  it('should calculate time until turn-on allowed', async () => {
    const { getTimeUntilOnAllowed } = await import('../../src/protection.js')
    const { S } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    const now = Date.now() / 1000
    S.sys_tsRelayOff = now - 100 // 100 seconds ago

    const remaining = getTimeUntilOnAllowed(now)
    expect(remaining).toBe(C.comp_minOffSec - 100)
  })

  it('should calculate time until turn-off allowed', async () => {
    const { getTimeUntilOffAllowed } = await import('../../src/protection.js')
    const { S } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    const now = Date.now() / 1000
    S.sys_tsRelayOn = now - 60 // 60 seconds ago

    const remaining = getTimeUntilOffAllowed(now)
    expect(remaining).toBe(C.comp_minOnSec - 60)
  })

  it('should return 0 when timing already satisfied', async () => {
    const { getTimeUntilOnAllowed, getTimeUntilOffAllowed } = await import('../../src/protection.js')
    const { S } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    const now = Date.now() / 1000
    S.sys_tsRelayOff = now - C.comp_minOffSec - 100
    S.sys_tsRelayOn = now - C.comp_minOnSec - 100

    expect(getTimeUntilOnAllowed(now)).toBe(0)
    expect(getTimeUntilOffAllowed(now)).toBe(0)
  })
})

// ----------------------------------------------------------
// * SENSOR FAILURE CASCADE SCENARIOS
// ----------------------------------------------------------

describe('Sensor Failure Cascade Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should trigger sensor failure after consecutive errors', async () => {
    const { handleSensorError } = await import('../../src/sensors.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.sens_errCount = 0

    // Should return false until limit reached
    for (let i = 0; i < C.sys_sensFailLimit - 1; i++) {
      expect(handleSensorError()).toBe(false)
    }

    // This should hit the limit
    expect(handleSensorError()).toBe(true)
  })

  it('should detect stuck sensor after threshold time', async () => {
    const { checkSensorStuck } = await import('../../src/sensors.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    // Initialize reference
    const startTime = 1000
    V.sens_stuckRefAir = null
    checkSensorStuck(5.0, 'sens_stuckRefAir', 'sens_stuckTsAir', startTime)

    // Sensor reads same value for longer than threshold
    const stuckTime = startTime + C.sens_stuckTimeSec + 1
    const result = checkSensorStuck(5.0, 'sens_stuckRefAir', 'sens_stuckTsAir', stuckTime)

    expect(result).toBe(true)
  })

  it('should reset stuck timer when sensor value changes', async () => {
    const { checkSensorStuck } = await import('../../src/sensors.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    // Initialize
    V.sens_stuckRefAir = null
    checkSensorStuck(5.0, 'sens_stuckRefAir', 'sens_stuckTsAir', 1000)

    // Move sensor significantly (> stuckEpsDeg)
    const result = checkSensorStuck(5.5, 'sens_stuckRefAir', 'sens_stuckTsAir', 2000)

    expect(result).toBe(false)
    expect(V.sens_stuckRefAir).toBe(5.5) // Reference updated
    expect(V.sens_stuckTsAir).toBe(2000) // Timer reset
  })

  it('should enter limp mode when sensor alarm active', async () => {
    const { handleLimpMode } = await import('../../src/features.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ST } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)

    // Limp mode returns ON during first part of cycle
    const limp = handleLimpMode()

    expect(limp.status).toMatch(/^LIMP_/)
    expect(typeof limp.wantOn).toBe('boolean')
    expect(limp.detail).toBeDefined()
  })

  it('should recover sensors and reset buffers', async () => {
    const { handleSensorRecovery } = await import('../../src/sensors.js')
    const { V } = await import('../../src/state.js')

    V.sens_bufAir = [0, 0, 0]
    V.sens_wasError = true

    handleSensorRecovery(5.0)

    expect(V.sens_bufAir).toEqual([5.0, 5.0, 5.0])
    expect(V.sens_smoothAir).toBe(5.0)
    expect(V.sens_wasError).toBe(false)
    expect(V.door_refTs).toBe(0)
  })

  it('should validate sensor readings correctly', async () => {
    const { validateSensorReadings } = await import('../../src/sensors.js')

    // Valid readings
    expect(validateSensorReadings({ tC: 5.0 }, { tC: -10.0 })).toBe(true)

    // Invalid readings
    expect(validateSensorReadings(null, { tC: -10.0 })).toBe(false)
    expect(validateSensorReadings({ tC: 5.0 }, null)).toBe(false)
    expect(validateSensorReadings({ tC: undefined }, { tC: -10.0 })).toBe(false)
    expect(validateSensorReadings({ tC: NaN }, { tC: -10.0 })).toBe(false)
  })
})

// ----------------------------------------------------------
// * FULL COOLING CYCLE SCENARIOS
// ----------------------------------------------------------

describe('Full Cooling Cycle Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should start cooling when above upper hysteresis band', async () => {
    const { evaluateThermostat, determineMode } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = 'NONE'

    // Temp = 6.0 > target(4.0) + hyst(1.0) = 5.0
    expect(evaluateThermostat(6.0, 4.0, 1.0)).toBe(true)

    const mode = determineMode(6.0, -10.0)
    expect(mode.wantOn).toBe(true)
  })

  it('should stop cooling when below lower hysteresis band', async () => {
    const { evaluateThermostat, determineMode } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.sys_alarm = 'NONE'

    // Temp = 2.5 < target(4.0) - hyst(1.0) = 3.0
    expect(evaluateThermostat(2.5, 4.0, 1.0)).toBe(false)

    const mode = determineMode(2.5, -10.0)
    expect(mode.wantOn).toBe(false)
  })

  it('should maintain state within hysteresis band', async () => {
    const { evaluateThermostat } = await import('../../src/control.js')

    // Within band - no change requested
    expect(evaluateThermostat(4.0, 4.0, 1.0)).toBe(null)
    expect(evaluateThermostat(4.5, 4.0, 1.0)).toBe(null)
    expect(evaluateThermostat(3.5, 4.0, 1.0)).toBe(null)
  })

  it('should execute switch decision with timing guards', async () => {
    const { executeSwitchDecision } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = 'NONE'

    const now = Date.now() / 1000
    S.sys_tsRelayOff = now - C.comp_minOffSec - 10 // Timing satisfied

    // Should be able to turn on
    const result = executeSwitchDecision(true, now, 5.0, -10.0, false)

    expect(result.switched).toBe(true)
    expect(result.blocked).toBe(false)
  })

  it('should block switch when timing not satisfied', async () => {
    const { executeSwitchDecision } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { RSN } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = 'NONE'

    const now = Date.now() / 1000
    S.sys_tsRelayOff = now - 10 // Only 10 seconds ago

    const result = executeSwitchDecision(true, now, 5.0, -10.0, false)

    expect(result.switched).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe(RSN.PROT_MIN_OFF)
  })

  it('should skip timing guards in limp mode', async () => {
    const { executeSwitchDecision } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = 'NONE'

    const now = Date.now() / 1000
    S.sys_tsRelayOff = now // Just turned off

    // Limp mode should skip timing guards
    const result = executeSwitchDecision(true, now, 0, 0, true)

    expect(result.switched).toBe(true)
    expect(result.blocked).toBe(false)
  })
})

// ----------------------------------------------------------
// * DEFROST CYCLE SCENARIOS
// ----------------------------------------------------------

describe('Defrost Cycle Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should trigger dynamic defrost when evap reaches threshold', async () => {
    const { checkDefrostTrigger } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.defr_isActive = false
    V.turbo_active = false

    // Evap hits defrost trigger temp (default -16C)
    const result = checkDefrostTrigger(-17.0)

    expect(result).toBe(true)
    expect(S.defr_isActive).toBe(true)
  })

  it('should NOT trigger defrost when already active', async () => {
    const { checkDefrostTrigger } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.defr_isActive = true // Already in defrost
    V.turbo_active = false

    const result = checkDefrostTrigger(-20.0)

    expect(result).toBe(false)
  })

  it('should NOT trigger defrost during turbo mode', async () => {
    const { checkDefrostTrigger } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.defr_isActive = false
    V.turbo_active = true // Turbo active

    const result = checkDefrostTrigger(-20.0)

    expect(result).toBe(false)
  })

  it('should complete defrost after dwell period', async () => {
    const { handleDynamicDefrost } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.defr_isActive = true
    V.turbo_active = false

    // Evap has warmed up to end temp
    // Call multiple times to accumulate dwell timer
    for (let i = 0; i <= C.defr_dynDwellSec / C.sys_loopSec; i++) {
      handleDynamicDefrost(C.defr_dynEndDeg)
    }

    // ? Verify behavior: defrost should be complete
    expect(S.defr_isActive).toBe(false)
  })

  it('should reset dwell timer if evap drops again', async () => {
    const { handleDynamicDefrost } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    // ? Use short dwell for testing
    C.defr_dynDwellSec = 30
    C.sys_loopSec = 10
    S.defr_isActive = true
    V.turbo_active = false

    // ? Accumulate some dwell time with warm evap
    handleDynamicDefrost(C.defr_dynEndDeg) // 10s
    handleDynamicDefrost(C.defr_dynEndDeg) // 20s

    // ? Evap drops below end threshold - timer should reset
    handleDynamicDefrost(C.defr_dynEndDeg - 1)

    // ? Continue with warm evap - should need full dwell again
    // ? If timer didn't reset, defrost would complete after just 1 more call
    // ? defr_dynDwellSec = 30, sys_loopSec = 10, need >= 30s (3 calls) to complete
    handleDynamicDefrost(C.defr_dynEndDeg) // 10s (after reset)
    expect(S.defr_isActive).toBe(true) // Still in defrost

    handleDynamicDefrost(C.defr_dynEndDeg) // 20s
    expect(S.defr_isActive).toBe(true) // Still in defrost

    handleDynamicDefrost(C.defr_dynEndDeg) // 30s = threshold, defrost completes
    expect(S.defr_isActive).toBe(false) // Now complete (>= threshold)
  })

  it('should return defrost mode in determineMode when scheduled', async () => {
    const { determineMode } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { RSN } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = 'NONE'
    S.defr_isActive = true // Active defrost

    // Dynamic defrost is active
    const mode = determineMode(6.0, -6.0) // Evap at end temp

    // Either dynamic defrost returns, or thermostat takes over if defrost complete
    expect([RSN.DEFR_DYN, RSN.NONE]).toContain(mode.reason)
  })
})

// ----------------------------------------------------------
// * POWER MONITORING FAULT SCENARIOS
// ----------------------------------------------------------

describe('Power Monitoring Fault Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should detect locked rotor from excessive power', async () => {
    const { checkLockedRotor } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ALM } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.hw_hasPM = true

    // Power exceeds max threshold after startup mask
    const result = checkLockedRotor(500, C.pwr_startMaskSec + 1)

    expect(result).toBe(true)
    expect(V.sys_alarm).toBe(ALM.LOCKED)
  })

  it('should ignore power during startup mask period', async () => {
    const { checkLockedRotor } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.hw_hasPM = true

    // High power during startup mask (inrush current)
    const result = checkLockedRotor(500, C.pwr_startMaskSec - 1)

    expect(result).toBe(false)
  })

  it('should detect ghost run after sustained low power', async () => {
    const { checkGhostRun } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ALM } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.hw_hasPM = true
    V.pwr_ghostTimer = 0

    // Accumulate ghost timer
    for (let i = 0; i <= C.pwr_ghostTripSec / C.sys_loopSec; i++) {
      checkGhostRun(5, C.pwr_startMaskSec + 10 + i) // Low power
    }

    expect(V.sys_alarm).toBe(ALM.GHOST)
  })

  it('should reset ghost timer when power returns to normal', async () => {
    const { checkGhostRun } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.hw_hasPM = true
    V.pwr_ghostTimer = 30 // Partially accumulated

    // Normal power reading
    checkGhostRun(100, C.pwr_startMaskSec + 10)

    expect(V.pwr_ghostTimer).toBe(0)
  })

  it('should skip power checks when PM not available', async () => {
    const { checkLockedRotor, checkGhostRun } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.hw_hasPM = false // No power monitoring

    expect(checkLockedRotor(500, 100)).toBe(false)
    expect(checkGhostRun(5, 100)).toBe(false)
  })
})

// ----------------------------------------------------------
// * ADAPTIVE HYSTERESIS EDGE CASES
// ----------------------------------------------------------

describe('Adaptive Hysteresis Edge Cases', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should widen hysteresis when cycles are too short', async () => {
    const { adaptHysteresis } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.adapt_hystCurrent = 1.0
    V.turbo_active = false

    // ? New algorithm uses TOTAL cycle time
    // ? totalCycle = 200 + 200 = 400s = 6.7 min < 10 min (adapt_targetMinSec) → WIDEN
    const result = adaptHysteresis(200, 200, 5)

    expect(result).toBe('widen')
    expect(S.adapt_hystCurrent).toBeGreaterThan(1.0)
  })

  it('should tighten hysteresis when ON periods are too long', async () => {
    const { adaptHysteresis } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.adapt_hystCurrent = 2.0
    V.turbo_active = false
    V.adapt_lastDir = null
    V.adapt_consecCount = 0

    // ? New algorithm requires trend confirmation (2 consecutive triggers)
    // ? Long ON, adequate OFF: totalCycle = 2300s = 38 min > maxCycle (25 min)

    // First call - starts tracking
    let result = adaptHysteresis(1500, 800, 3)
    expect(result).toBeNull()
    expect(V.adapt_lastDir).toBe('tighten')

    // Second call - confirms and acts
    result = adaptHysteresis(1500, 800, 3)
    expect(result).toBe('tighten')
    expect(S.adapt_hystCurrent).toBeLessThan(2.0)
  })

  it('should block widening near freeze protection zone', async () => {
    const { adaptHysteresis } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    // Set hysteresis high so widening would push below freeze cut
    // Guard check: target - (hyst + 0.1) <= freezeCut + 0.3
    // 4.0 - (3.5 + 0.1) = 0.4 <= 0.5 + 0.3 = 0.8 → canWiden = false
    S.adapt_hystCurrent = 3.5
    V.turbo_active = false

    // ? New algorithm: totalCycle = 200 + 200 = 400s < 600s → would widen, but freeze guard blocks
    const result = adaptHysteresis(200, 200, 5)

    expect(result).toBe('blocked')
    expect(S.adapt_hystCurrent).toBe(3.5) // Unchanged
  })

  it('should not adapt during turbo mode', async () => {
    const { adaptHysteresis } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.adapt_hystCurrent = 1.0
    V.turbo_active = true // Turbo active

    const result = adaptHysteresis(300, 300, 5)

    expect(result).toBe(null)
    expect(S.adapt_hystCurrent).toBe(1.0)
  })

  it('should require at least 1 cycle before adapting', async () => {
    const { adaptHysteresis } = await import('../../src/features.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.adapt_hystCurrent = 1.0
    V.turbo_active = false
    V.adapt_lastDir = null
    V.adapt_consecCount = 0

    // Zero cycles - not enough data
    const result0 = adaptHysteresis(300, 300, 0)
    expect(result0).toBe(null)

    // 1 cycle with short cycle time - should widen (danger zone)
    // ? totalCycle = 600s < dangerZone (720s) → immediate widen
    const result1 = adaptHysteresis(300, 300, 1)
    expect(result1).toBe('widen')
  })

  it('should bound hysteresis within min/max limits', async () => {
    const { getEffectiveHysteresis } = await import('../../src/features.js')
    const { S } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)

    // Below minimum
    S.adapt_hystCurrent = 0.1
    expect(getEffectiveHysteresis()).toBe(C.adapt_hystMinDeg)

    // Above maximum
    S.adapt_hystCurrent = 10.0
    expect(getEffectiveHysteresis()).toBe(C.adapt_hystMaxDeg)

    // Within bounds
    S.adapt_hystCurrent = 1.5
    expect(getEffectiveHysteresis()).toBe(1.5)
  })
})

// ----------------------------------------------------------
// * ALARM STATE MACHINE SCENARIOS
// ----------------------------------------------------------

describe('Alarm State Machine Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should persist fatal alarms through clearNonFatalAlarms', async () => {
    const { clearNonFatalAlarms } = await import('../../src/alarms.js')
    const { V } = await import('../../src/state.js')
    const { ALM } = await import('../../src/constants.js')

    V.sys_alarm = ALM.WELD
    clearNonFatalAlarms()
    expect(V.sys_alarm).toBe(ALM.WELD)

    V.sys_alarm = ALM.LOCKED
    clearNonFatalAlarms()
    expect(V.sys_alarm).toBe(ALM.LOCKED)
  })

  it('should clear non-fatal alarms', async () => {
    const { clearNonFatalAlarms } = await import('../../src/alarms.js')
    const { V } = await import('../../src/state.js')
    const { ALM } = await import('../../src/constants.js')

    const nonFatalAlarms = [ALM.HIGH, ALM.FAIL, ALM.STUCK, ALM.GHOST, ALM.COOL]

    for (const alarm of nonFatalAlarms) {
      V.sys_alarm = alarm
      clearNonFatalAlarms()
      expect(V.sys_alarm).toBe(ALM.NONE)
    }
  })

  it('should track alarm rising edge', async () => {
    const { processAlarmEdges } = await import('../../src/alarms.js')
    const { V } = await import('../../src/state.js')
    const { ALM } = await import('../../src/constants.js')

    V.fault_pending = null
    V.sens_smoothAir = 12.0

    // Rising edge: NONE -> HIGH
    processAlarmEdges(ALM.NONE, ALM.HIGH, 0)

    expect(V.fault_pending).not.toBeNull()
    expect(V.fault_pending.alarm).toBe(ALM.HIGH)
  })

  it('should log fault on alarm falling edge', async () => {
    const { processAlarmEdges } = await import('../../src/alarms.js')
    const { S, V } = await import('../../src/state.js')
    const { ALM } = await import('../../src/constants.js')

    // Setup pending alarm
    V.fault_pending = {
      t: Math.floor(Date.now() / 1000) - 300,
      alarm: ALM.HIGH,
      peak: 12.0,
      watts: 0,
    }
    S.fault_critical = []

    // Falling edge: HIGH -> NONE
    processAlarmEdges(ALM.HIGH, ALM.NONE, 0)

    expect(V.fault_pending).toBeNull()
    expect(S.fault_critical.length).toBe(1)
  })

  it('should apply sensor alarms correctly', async () => {
    const { applySensorAlarms } = await import('../../src/alarms.js')
    const { V } = await import('../../src/state.js')
    const { ALM } = await import('../../src/constants.js')

    V.sys_alarm = ALM.NONE

    applySensorAlarms(true, false)
    expect(V.sys_alarm).toBe(ALM.FAIL)

    V.sys_alarm = ALM.NONE
    applySensorAlarms(false, true)
    expect(V.sys_alarm).toBe(ALM.STUCK)
  })

  it('should block relay switching during fatal alarm', async () => {
    const { executeSwitchDecision } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ALM } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = ALM.WELD

    const now = Date.now() / 1000
    S.sys_tsRelayOff = now - 1000 // Timing would be OK

    const result = executeSwitchDecision(true, now, 5.0, -10.0, false)

    expect(result.switched).toBe(false)
    expect(result.blocked).toBe(true)
  })
})

// ----------------------------------------------------------
// * WELD DETECTION SCENARIOS
// ----------------------------------------------------------

describe('Weld Detection Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should not detect weld before detection window', async () => {
    const { checkWeldDetection } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    S.sys_tsRelayOff = 0
    S.weld_snapAir = 10.0

    // Check before window starts (< waitSec)
    const result = checkWeldDetection(5.0, C.weld_waitSec - 10)

    expect(result).toBe(false)
  })

  it('should not detect weld after detection window', async () => {
    const { checkWeldDetection } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    S.sys_tsRelayOff = 0
    S.weld_snapAir = 10.0

    // Check after window ends (> winSec)
    const result = checkWeldDetection(5.0, C.weld_winSec + 10)

    expect(result).toBe(false)
  })

  it('should not detect weld when relay is on', async () => {
    const { checkWeldDetection } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true // Relay on
    S.sys_tsRelayOff = 0
    S.weld_snapAir = 10.0

    const result = checkWeldDetection(5.0, C.weld_waitSec + 10)

    expect(result).toBe(false)
  })

  it('should not detect weld when temp stable', async () => {
    const { checkWeldDetection } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    S.sys_tsRelayOff = 0
    S.weld_snapAir = 10.0

    // Temp has NOT dropped significantly
    const result = checkWeldDetection(10.0, C.weld_waitSec + 10)

    expect(result).toBe(false)
  })
})

// ----------------------------------------------------------
// * COOLING HEALTH SCENARIOS
// ----------------------------------------------------------

describe('Cooling Health Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should detect cooling failure when evap not cold enough', async () => {
    const { checkCoolingHealth } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ALM } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.turbo_active = false
    V.sens_smoothAir = 5.0

    const now = Date.now() / 1000
    S.sys_tsRelayOn = now - C.gas_checkSec - 10 // Past check time

    // Evap is too warm (should be < air - failDiff)
    // failDiff = 5, so evap should be < 0 to be OK, but it's 3.0
    const result = checkCoolingHealth(3.0, now)

    expect(result).toBe(true)
    expect(V.sys_alarm).toBe(ALM.COOL)
  })

  it('should not check cooling health before minimum run time', async () => {
    const { checkCoolingHealth } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.turbo_active = false
    V.sens_smoothAir = 5.0

    const now = Date.now() / 1000
    S.sys_tsRelayOn = now - 10 // Just started

    const result = checkCoolingHealth(3.0, now)

    expect(result).toBe(false)
  })

  it('should skip cooling health check during turbo', async () => {
    const { checkCoolingHealth } = await import('../../src/protection.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = true
    V.turbo_active = true // Turbo active
    V.sens_smoothAir = 5.0

    const now = Date.now() / 1000
    S.sys_tsRelayOn = now - C.gas_checkSec - 10

    const result = checkCoolingHealth(3.0, now)

    expect(result).toBe(false)
  })
})

// ----------------------------------------------------------
// * TURBO MODE SCENARIOS
// ----------------------------------------------------------

describe('Turbo Mode Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should activate turbo on rising switch edge', async () => {
    const { checkTurboSwitch } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.turbo_lastSw = false
    V.turbo_active = false

    const result = checkTurboSwitch(true)

    expect(result).toBe(true)
    expect(V.turbo_active).toBe(true)
    expect(V.turbo_remSec).toBe(C.turbo_maxTimeSec)
  })

  it('should not reactivate turbo on sustained switch', async () => {
    const { checkTurboSwitch } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.turbo_lastSw = true // Already high
    V.turbo_active = false

    const result = checkTurboSwitch(true)

    expect(result).toBe(false)
  })

  it('should decrement turbo timer', async () => {
    const { handleTurboMode } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.turbo_active = true
    V.turbo_remSec = 100

    handleTurboMode(5)

    expect(V.turbo_remSec).toBe(95)
  })

  it('should deactivate turbo when timer expires', async () => {
    const { handleTurboMode } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.turbo_active = true
    V.turbo_remSec = 3 // About to expire

    // First call decrements to -2 (still returns turbo object)
    handleTurboMode(5)
    // Second call sees remSec <= 0 and deactivates
    handleTurboMode(5)

    expect(V.turbo_active).toBe(false)
  })

  it('should return override targets during turbo', async () => {
    const { handleTurboMode } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.turbo_active = true
    V.turbo_remSec = 1000

    const turbo = handleTurboMode(5)

    expect(turbo).not.toBeNull()
    expect(turbo.target).toBe(C.turbo_targetDeg)
    expect(turbo.hyst).toBe(C.turbo_hystDeg)
    expect(turbo.detail).toContain('TURBO')
  })

  it('should return null when turbo not active', async () => {
    const { handleTurboMode } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')

    V.turbo_active = false

    const result = handleTurboMode(5)

    expect(result).toBeNull()
  })
})

// ----------------------------------------------------------
// * DOOR PAUSE SCENARIOS
// ----------------------------------------------------------

describe('Door Pause Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should detect door open from rapid temp rise', async () => {
    const { detectDoorOpen } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.door_refTemp = 4.0
    V.door_refTs = 100

    // Rate = (12 - 4) / (110 - 100) * 60 = 48 deg/min
    const result = detectDoorOpen(12.0, 110)

    expect(result).toBe(true)
    expect(V.door_timer).toBeGreaterThan(0)
  })

  it('should not detect door if rate below threshold', async () => {
    const { detectDoorOpen } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')

    Object.assign(C, DEFAULT)
    V.door_refTemp = 4.0
    V.door_refTs = 100
    V.door_timer = 0

    // Slow rise: rate = (4.2 - 4.0) / 60 * 60 = 0.2 deg/min
    const result = detectDoorOpen(4.2, 160)

    expect(result).toBe(false)
    expect(V.door_timer).toBeLessThanOrEqual(0)
  })

  it('should report door pause active when timer > 0', async () => {
    const { isDoorPauseActive } = await import('../../src/features.js')
    const { V } = await import('../../src/state.js')

    V.door_timer = 100
    expect(isDoorPauseActive()).toBe(true)

    V.door_timer = 0
    expect(isDoorPauseActive()).toBe(false)

    V.door_timer = -5
    expect(isDoorPauseActive()).toBe(false)
  })

  it('should return door pause mode in determineMode', async () => {
    const { determineMode } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { RSN } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = 'NONE'
    V.door_timer = 100 // Door pause active

    const mode = determineMode(6.0, -10.0)

    expect(mode.wantOn).toBe(false)
    expect(mode.reason).toBe(RSN.PROT_DOOR)
  })
})

// ----------------------------------------------------------
// * LIMP MODE SCENARIOS
// ----------------------------------------------------------

describe('Limp Mode Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    runtime.installGlobals(global)
  })

  it('should return limp cool during ON portion of cycle', async () => {
    const { handleLimpMode } = await import('../../src/features.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ST } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)

    // Mock uptime to be in ON portion
    const uptimeMs = (C.limp_onSec / 2) * 1000 // Middle of ON period
    global.Shelly.getUptimeMs = () => uptimeMs

    const limp = handleLimpMode()

    expect(limp.wantOn).toBe(true)
    expect(limp.status).toBe(ST.LIMP_COOL)
  })

  it('should return limp idle during OFF portion of cycle', async () => {
    const { handleLimpMode } = await import('../../src/features.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ST } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)

    // Mock uptime to be in OFF portion
    const uptimeMs = (C.limp_onSec + C.limp_offSec / 2) * 1000
    global.Shelly.getUptimeMs = () => uptimeMs

    const limp = handleLimpMode()

    expect(limp.wantOn).toBe(false)
    expect(limp.status).toBe(ST.LIMP_IDLE)
  })

  it('should enter limp mode when sensor fail alarm active', async () => {
    const { determineMode } = await import('../../src/control.js')
    const { S, V } = await import('../../src/state.js')
    const { C } = await import('../../src/config.js')
    const { DEFAULT } = await import('../../src/config.js')
    const { ALM, ST } = await import('../../src/constants.js')

    Object.assign(C, DEFAULT)
    S.sys_relayState = false
    V.sys_alarm = ALM.FAIL // Sensor failure

    const mode = determineMode(0, 0) // Temps don't matter in limp

    expect(mode.status).toMatch(/^LIMP_/)
  })
})
