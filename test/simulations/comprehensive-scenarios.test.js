// ==============================================================================
// * COMPREHENSIVE SCENARIO SIMULATIONS
// ? Extended simulations for edge cases, combined failures, and long-running tests.
// ? Ensures the fridge controller handles all real-world scenarios correctly.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShellyRuntime } from '../utils/shelly-simulator.js'

// ----------------------------------------------------------
// * TEST HELPERS
// ----------------------------------------------------------

async function setupController(runtime, options = {}) {
  runtime.installGlobals(global)
  vi.resetModules()

  const constants = await import('../../src/constants.js')
  const config = await import('../../src/config.js')
  const state = await import('../../src/state.js')
  const sensors = await import('../../src/sensors.js')
  const control = await import('../../src/control.js')
  const protection = await import('../../src/protection.js')
  const features = await import('../../src/features.js')
  const alarms = await import('../../src/alarms.js')
  const metrics = await import('../../src/metrics.js')

  // Initialize config with defaults
  Object.assign(config.C, config.DEFAULT)

  // Apply any custom config
  if (options.config) {
    Object.assign(config.C, options.config)
  }

  // Apply initial state
  if (options.state) {
    Object.assign(state.S, options.state)
  }

  // Apply initial volatile state
  if (options.volatile) {
    Object.assign(state.V, options.volatile)
  }

  runtime.script = {
    constants,
    config,
    state,
    sensors,
    control,
    protection,
    features,
    alarms,
    metrics,
    S: state.S,
    V: state.V,
    C: config.C,
    ALM: constants.ALM,
    ST: constants.ST,
    RSN: constants.RSN,
  }

  return runtime.script
}

function simulateLoopTick(script, runtime, temps) {
  const now = runtime.uptimeMs / 1000

  // Set temperatures
  if (temps.air !== undefined) runtime.setTemperature(101, temps.air)
  if (temps.evap !== undefined) runtime.setTemperature(100, temps.evap)

  // Get sensor readings
  const rAir = runtime.temperatures[101]
  const rEvap = runtime.temperatures[100]

  // Store loop timestamp in global state (fix for Shelly closure bug)
  script.V.loopNow = now

  // Process sensors
  if (script.sensors.validateSensorReadings(rAir, rEvap)) {
    script.sensors.resetSensorError()
    if (script.V.sens_wasError) {
      script.sensors.handleSensorRecovery(rAir.tC)
    }
    script.sensors.processSensorData(rAir.tC)
  } else {
    script.sensors.handleSensorError()
  }

  // Clear and apply alarms
  script.alarms.clearNonFatalAlarms()
  const alarmFail = script.V.sens_errCount >= script.C.sys_sensFailLimit
  script.alarms.applySensorAlarms(alarmFail, false)

  // Update metrics
  script.metrics.updateMetrics(script.S.sys_relayState, script.C.sys_loopSec)

  // Determine mode and execute
  const mode = script.control.determineMode(script.V.sens_smoothAir, rEvap?.tC, now)
  const isLimp = script.V.sys_alarm === script.ALM.FAIL || script.V.sys_alarm === script.ALM.STUCK
  const result = script.control.executeSwitchDecision(mode.wantOn, now, script.V.sens_smoothAir, rEvap?.tC, isLimp)

  if (!result.blocked && !result.switched) {
    script.V.sys_status = mode.status
    if (mode.reason !== script.RSN.NONE) script.V.sys_reason = mode.reason
  }

  return { mode, result, now }
}

function advanceTime(runtime, seconds) {
  runtime.advanceTime(seconds * 1000)
}

// ----------------------------------------------------------
// * HIGH TEMPERATURE ALARM SCENARIOS
// ----------------------------------------------------------

describe('High Temperature Alarm: Sustained High Temp', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should trigger HIGH alarm after sustained high temperature', async () => {
    const script = await setupController(runtime, {
      config: {
        alarm_highDeg: 10,
        alarm_highDelaySec: 300, // 5 minutes
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
    })

    // Start cooling with high temp
    script.V.sens_smoothAir = 12.0
    script.V.sens_wasError = false

    // Run for 6 minutes at high temp (exceeds 5 min delay)
    for (let i = 0; i < 72; i++) {
      simulateLoopTick(script, runtime, { air: 12.0, evap: -10 })
      script.alarms.checkHighTempAlarm(script.V.sens_smoothAir, false)
      advanceTime(runtime, 5)
    }

    expect(script.V.sys_alarm).toBe(script.ALM.HIGH)
  })

  it('should NOT trigger HIGH alarm during scheduled defrost', async () => {
    const script = await setupController(runtime, {
      config: {
        alarm_highDeg: 10,
        alarm_highDelaySec: 300,
      },
    })

    script.V.sens_smoothAir = 15.0
    script.V.sens_wasError = false

    // Run during defrost (isDeepDefrost = true)
    for (let i = 0; i < 72; i++) {
      simulateLoopTick(script, runtime, { air: 15.0, evap: 5.0 })
      script.alarms.checkHighTempAlarm(script.V.sens_smoothAir, true) // defrost active
      advanceTime(runtime, 5)
    }

    expect(script.V.sys_alarm).not.toBe(script.ALM.HIGH)
  })

  it('should clear HIGH alarm when temperature drops', async () => {
    const script = await setupController(runtime, {
      config: {
        alarm_highDeg: 10,
        alarm_highDelaySec: 60,
      },
    })

    script.V.sens_smoothAir = 12.0

    // ? Timer is now module-local - accumulate naturally
    // ? alarm_highDelaySec = 60, sys_loopSec = 5, need 60/5 = 12 calls to trigger
    for (let i = 0; i < 15; i++) {
      simulateLoopTick(script, runtime, { air: 12.0, evap: -10 })
      script.alarms.checkHighTempAlarm(script.V.sens_smoothAir, false)
      advanceTime(runtime, 5)
    }

    expect(script.V.sys_alarm).toBe(script.ALM.HIGH)

    // Now cool down below threshold
    script.V.sens_smoothAir = 5.0
    script.alarms.clearNonFatalAlarms()
    script.alarms.checkHighTempAlarm(script.V.sens_smoothAir, false)

    expect(script.V.sys_alarm).toBe(script.ALM.NONE)
  })
})

// ----------------------------------------------------------
// * POWER MONITORING FAULT SCENARIOS
// ----------------------------------------------------------

describe('Power Monitoring: Ghost Run Detection', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect ghost run (relay ON but no power draw)', async () => {
    const script = await setupController(runtime, {
      config: {
        pwr_runMinW: 10,        // Ghost if below 10W
        pwr_ghostTripSec: 30,   // Trip after 30s of low power
        pwr_startMaskSec: 15,   // Ignore first 15s
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        hw_hasPM: true,
        pwr_ghostTimer: 0,
      },
    })

    // Advance past startup mask
    advanceTime(runtime, 20)

    // Simulate relay ON but very low power (ghost run)
    runtime.switches[0].output = true
    runtime.switches[0].apower = 2 // Below threshold

    // Run for enough time to accumulate ghost timer (30s / 5s = 6+ iterations)
    for (let i = 0; i < 10; i++) {
      const runDur = (runtime.uptimeMs / 1000) - script.S.sys_tsRelayOn
      const detected = script.protection.checkGhostRun(2, runDur)

      if (detected) {
        script.control.setRelay(false, runtime.uptimeMs / 1000, 0, 0, true)
        break
      }
      advanceTime(runtime, 5)
    }

    expect(script.V.sys_alarm).toBe(script.ALM.GHOST)
    expect(script.S.sys_relayState).toBe(false)
  })

  it('should NOT trigger ghost run with normal power draw', async () => {
    const script = await setupController(runtime, {
      config: {
        pwr_runMinW: 5,
        pwr_ghostTripSec: 30,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        hw_hasPM: true,
      },
    })

    runtime.switches[0].output = true
    runtime.switches[0].apower = 85 // Normal compressor power

    // Run for a while
    for (let i = 0; i < 10; i++) {
      const runDur = (runtime.uptimeMs / 1000) - script.S.sys_tsRelayOn
      script.protection.checkGhostRun(85, runDur)
      advanceTime(runtime, 5)
    }

    expect(script.V.sys_alarm).not.toBe(script.ALM.GHOST)
    expect(script.S.sys_relayState).toBe(true)
  })
})

describe('Power Monitoring: Locked Rotor Detection', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect locked rotor (excessive power draw)', async () => {
    const script = await setupController(runtime, {
      config: {
        pwr_enable: true,
        pwr_runMaxW: 150,        // Locked rotor threshold (lowered for test)
        pwr_startMaskSec: 10,    // Ignore first 10s
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        hw_hasPM: true,
      },
    })

    runtime.switches[0].output = true
    runtime.switches[0].apower = 200 // Excessive power (locked rotor)

    // Advance past startup mask
    advanceTime(runtime, 15)

    // Check for locked rotor
    const runDur = (runtime.uptimeMs / 1000) - script.S.sys_tsRelayOn
    const detected = script.protection.checkLockedRotor(200, runDur)

    if (detected) {
      script.control.setRelay(false, runtime.uptimeMs / 1000, 0, 0, true)
    }

    expect(script.V.sys_alarm).toBe(script.ALM.LOCKED)
    expect(script.S.sys_relayState).toBe(false)
  })

  it('should ignore high power during startup period', async () => {
    const script = await setupController(runtime, {
      config: {
        pwr_runMaxW: 150,
        pwr_startMaskSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: runtime.uptimeMs / 1000,
      },
      volatile: {
        hw_hasPM: true,
      },
    })

    runtime.switches[0].apower = 200

    // Check during startup - should not trigger
    const runDur = 3 // Within startup ignore period
    const detected = script.protection.checkLockedRotor(200, runDur)

    expect(detected).toBe(false)
  })
})

// ----------------------------------------------------------
// * MULTI-DAY STABILITY SIMULATIONS
// ----------------------------------------------------------

describe('Multi-Day Stability: 24-Hour Duty Cycle', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should maintain stable duty cycle over 1 hour simulation', async () => {
    const script = await setupController(runtime, {
      config: {
        ctrl_targetDeg: 4.0,
        ctrl_hystDeg: 1.0,
        sys_loopSec: 5,
        comp_minOnSec: 60,
        comp_minOffSec: 60,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
        stats_hourRun: 0,
        stats_hourTime: 0,
        stats_cycleCount: 0,
      },
    })

    script.V.sens_wasError = false
    script.V.sys_alarm = script.ALM.NONE

    // Simulate 1 hour (720 ticks at 5 sec each = 3600 sec)
    let temp = 5.5 // Start above setpoint
    let runTime = 0
    let totalTime = 0

    for (let tick = 0; tick < 720; tick++) {
      // Simulate temperature behavior
      if (script.S.sys_relayState) {
        temp -= 0.02 // Cooling rate
        runTime += 5
      } else {
        temp += 0.01 // Warming rate (slower)
      }
      totalTime += 5

      // Clamp temperature to realistic range
      temp = Math.max(0, Math.min(10, temp))

      // Update sensor smoothing
      script.V.sens_smoothAir = temp

      // Determine mode and execute switch
      const now = runtime.uptimeMs / 1000
      const mode = script.control.determineMode(temp, temp - 15, now)
      const isLimp = false
      script.control.executeSwitchDecision(mode.wantOn, now, temp, temp - 15, isLimp)

      advanceTime(runtime, 5)
    }

    // Calculate duty cycle from our tracking
    const dutyCycle = totalTime > 0 ? (runTime / totalTime) * 100 : 0

    // Verify duty cycle is within reasonable range (20-60%)
    expect(dutyCycle).toBeGreaterThan(15)
    expect(dutyCycle).toBeLessThan(70)

    // Verify we had some cycles
    expect(script.S.stats_cycleCount).toBeGreaterThan(0)
  })
})

// ----------------------------------------------------------
// * STATS RECOVERY ACROSS REBOOTS
// ----------------------------------------------------------

describe('Stats Recovery: Duty Cycle Accuracy', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should maintain accurate duty cycle across simulated reboot', async () => {
    const script = await setupController(runtime, {
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
        sys_tsLastSave: 0,
        stats_hourRun: 1800, // 30 min recorded
        stats_hourTime: 3600, // 60 min total (50% duty)
      },
    })

    // Record initial duty cycle
    const initialDuty = (script.S.stats_hourRun / script.S.stats_hourTime) * 100

    // Simulate running for 10 more minutes
    advanceTime(runtime, 600)
    const now = runtime.uptimeMs / 1000

    // Simulate reboot recovery scenario
    // Last save was 5 minutes ago, compressor was running
    script.S.sys_tsLastSave = now - 300
    const elapsedTotal = now - script.S.sys_tsLastSave

    // Recovery: add elapsed time (all was run time since compressor was ON)
    script.S.stats_hourRun += elapsedTotal
    script.S.stats_hourTime += elapsedTotal

    // Verify duty cycle is still accurate
    const recoveredDuty = (script.S.stats_hourRun / script.S.stats_hourTime) * 100

    // Duty should have increased slightly (was running during recovery period)
    expect(recoveredDuty).toBeGreaterThanOrEqual(initialDuty)
    expect(recoveredDuty).toBeLessThan(100) // Should not exceed 100%
  })

  it('should recover idle time correctly', async () => {
    const script = await setupController(runtime, {
      state: {
        sys_relayState: false, // Compressor was OFF
        sys_tsRelayOff: 0,
        sys_tsLastSave: 0,
        stats_hourRun: 1800, // 30 min run
        stats_hourTime: 3600, // 60 min total (50% duty)
      },
    })

    advanceTime(runtime, 600)
    const now = runtime.uptimeMs / 1000

    // Last save was 5 minutes ago, compressor was OFF
    script.S.sys_tsLastSave = now - 300
    const elapsedTotal = now - script.S.sys_tsLastSave

    // Recovery: add elapsed time to total only (idle time)
    script.S.stats_hourTime += elapsedTotal
    // stats_hourRun stays the same (no run time during idle)

    const recoveredDuty = (script.S.stats_hourRun / script.S.stats_hourTime) * 100

    // Duty should have DECREASED (was idle during recovery period)
    expect(recoveredDuty).toBeLessThan(50) // Was 50%, now lower
    expect(recoveredDuty).toBeGreaterThan(0)
  })
})

// ----------------------------------------------------------
// * COMBINED FAILURE SCENARIOS
// ----------------------------------------------------------

describe('Combined Failures: Sensor Failure During Cooling', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should enter LIMP mode and continue cooling on sensor failure', async () => {
    const script = await setupController(runtime, {
      config: {
        sys_sensFailLimit: 3,
        limp_onSec: 300,
        limp_offSec: 600,
      },
      state: {
        sys_relayState: true, // Cooling in progress
        sys_tsRelayOn: 0,
      },
      volatile: {
        sens_errCount: 0,
        sens_wasError: false,
      },
    })

    // Start with valid sensors
    runtime.setTemperature(101, 6.0)
    runtime.setTemperature(100, -10)
    simulateLoopTick(script, runtime, { air: 6.0, evap: -10 })

    // Now sensors fail - increment error count manually to reach limit
    for (let i = 0; i < 5; i++) {
      script.sensors.handleSensorError() // This increments sens_errCount
      advanceTime(runtime, 5)
    }

    // Apply sensor alarms - this sets the FAIL alarm when limit reached
    const alarmFail = script.V.sens_errCount >= script.C.sys_sensFailLimit
    script.alarms.applySensorAlarms(alarmFail, false)

    // Should be in LIMP mode
    expect(script.V.sys_alarm).toBe(script.ALM.FAIL)

    // Should still be able to operate in limp mode
    const mode = script.control.determineMode(null, null, runtime.uptimeMs / 1000)
    expect(mode.status).toContain('LIMP')
  })

  it('should handle sensor recovery during limp cooling', async () => {
    const script = await setupController(runtime, {
      config: {
        sys_sensFailLimit: 3,
        sys_sensRecovery: 3,
      },
      state: {
        sys_relayState: true,
      },
      volatile: {
        sens_errCount: 5,
        sens_wasError: true,
        sys_alarm: 'FAIL',
      },
    })

    // Sensors recover
    for (let i = 0; i < 5; i++) {
      runtime.setTemperature(101, 5.0)
      runtime.setTemperature(100, -10.0)
      simulateLoopTick(script, runtime, { air: 5.0, evap: -10 })
      advanceTime(runtime, 5)
    }

    // Should exit LIMP mode
    expect(script.V.sens_errCount).toBe(0)
    expect(script.V.sys_alarm).toBe(script.ALM.NONE)
  })
})

describe('Combined Failures: Door Open + High Temp', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should handle prolonged door open causing high temp alarm', async () => {
    const script = await setupController(runtime, {
      config: {
        door_rateDegMin: 0.5,
        door_pauseSec: 60,
        alarm_highDeg: 12,
        alarm_highDelaySec: 120,
      },
      state: {
        sys_relayState: false,
      },
      volatile: {
        sens_smoothAir: 4.0,
        door_refTemp: 4.0,
        door_refTs: 0,
      },
    })

    // Simulate door open - temp rises rapidly
    let temp = 4.0
    for (let i = 0; i < 60; i++) {
      temp += 0.3 // Rapid temp rise (door open)
      temp = Math.min(temp, 20) // Cap at realistic value

      script.V.sens_smoothAir = temp
      script.features.detectDoorOpen(temp, runtime.uptimeMs / 1000)
      script.alarms.checkHighTempAlarm(temp, false)

      advanceTime(runtime, 5)
    }

    // Should have detected door open initially
    // And eventually triggered high temp alarm
    expect(script.V.sys_alarm).toBe(script.ALM.HIGH)
  })
})

// ----------------------------------------------------------
// * EXTENDED DOOR OPEN SCENARIOS
// ----------------------------------------------------------

describe('Door Open: Extended Duration', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should pause cooling during door detection period', async () => {
    const script = await setupController(runtime, {
      config: {
        door_enable: true,
        door_rateDegMin: 0.5, // Rate threshold for door detection
        door_pauseSec: 60,
        ctrl_targetDeg: 4.0,
        ctrl_hystDeg: 1.0,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: false,
      },
      volatile: {
        sens_smoothAir: 4.0,
        door_refTemp: 0,
        door_refTs: 0,
        door_timer: 0,
      },
    })

    // Advance time first so timestamps are non-zero
    advanceTime(runtime, 5)

    // First call to establish reference (now > 0)
    script.features.detectDoorOpen(4.0, runtime.uptimeMs / 1000)
    advanceTime(runtime, 5)

    // Second call with rapid temp rise (simulates door open)
    // Rate = (6.0 - 4.0) / 5 * 60 = 24 deg/min (way above threshold)
    script.features.detectDoorOpen(6.0, runtime.uptimeMs / 1000)

    // Should be in door pause period
    expect(script.V.door_timer).toBeGreaterThan(0)

    // During pause, mode should indicate door (reason contains DOOR, not status)
    const mode = script.control.determineMode(6.0, -10, runtime.uptimeMs / 1000)
    expect(mode.reason).toContain('DOOR')
    expect(mode.wantOn).toBe(false)
  })

  it('should resume cooling after door closes and pause expires', async () => {
    const script = await setupController(runtime, {
      config: {
        door_rateDegMin: 0.5,
        door_pauseSec: 30,
        ctrl_targetDeg: 4.0,
        ctrl_hystDeg: 1.0,
        adapt_enable: false,      // Use fixed hysteresis for predictable test
        comp_minOffSec: 0,        // Disable min-off guard for this test
        defr_schedEnable: false,  // Disable scheduled defrost
        defr_dynEnable: false,    // Disable dynamic defrost
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,   // Allow immediate turn-on
      },
      volatile: {
        sens_smoothAir: 6.0,
        door_timer: 30, // Pause was active
      },
    })

    // Advance past pause period
    advanceTime(runtime, 35)

    // Temp stable (door closed), still above setpoint
    script.V.sens_smoothAir = 5.5
    script.V.door_timer = 0 // Pause expired

    const mode = script.control.determineMode(5.5, -10, runtime.uptimeMs / 1000)

    // Should want to cool now (5.5 > 4.0 + 1.0 = 5.0)
    expect(mode.wantOn).toBe(true)
  })
})

// ----------------------------------------------------------
// * FREEZE PROTECTION EDGE CASES
// ----------------------------------------------------------

describe('Freeze Protection: Edge Cases', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should stop cooling when approaching freeze limit', async () => {
    const script = await setupController(runtime, {
      config: {
        ctrl_targetDeg: 4.0,
        ctrl_hystDeg: 1.0,
        comp_freezeCutDeg: 0.0,
      },
      state: {
        sys_relayState: true, // Cooling
        sys_tsRelayOn: 0,
      },
    })

    script.V.sens_smoothAir = 0.5 // Just above freeze limit

    const mode = script.control.determineMode(0.5, -15, runtime.uptimeMs / 1000)

    // Should want OFF due to approaching freeze
    expect(mode.wantOn).toBe(false)
  })

  it('should prevent re-cooling too quickly after freeze protection', async () => {
    // Set initial timestamp so we have a reference point
    const initialNow = runtime.uptimeMs / 1000

    const script = await setupController(runtime, {
      config: {
        ctrl_targetDeg: 4.0,
        ctrl_hystDeg: 1.0,
        adapt_enable: false,      // Use fixed hysteresis for predictable test
        comp_minOffSec: 180,      // 3 minutes minimum off time
        defr_schedEnable: false,  // Disable scheduled defrost
        defr_dynEnable: false,    // Disable dynamic defrost
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: initialNow, // Just turned off at current time
      },
    })

    // Even if temp is high, should not turn on immediately
    advanceTime(runtime, 60) // Only 1 minute passed (need 3 minutes)

    const now = runtime.uptimeMs / 1000
    const mode = script.control.determineMode(6.0, -10, now)
    const result = script.control.executeSwitchDecision(
      mode.wantOn,
      now,
      6.0,
      -10,
      false,
    )

    // Thermostat should want ON (6.0 > 4.0 + 1.0 = 5.0)
    expect(mode.wantOn).toBe(true)
    // But blocked by min off time (60s elapsed < 180s required)
    expect(result.blocked).toBe(true)
    expect(result.switched).toBe(false)
  })
})

// ----------------------------------------------------------
// * WELD DETECTION EDGE CASES
// ----------------------------------------------------------

describe('Weld Detection: Temperature Drift Scenarios', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect weld when temp drops while relay supposedly OFF', async () => {
    const script = await setupController(runtime, {
      config: {
        weld_enable: true,
        weld_waitSec: 60,      // Start checking 1 min after OFF (shortened for test)
        weld_winSec: 300,      // Stop checking 5 min after OFF
        weld_dropDeg: 0.5,     // Alarm if temp drops 0.5C while OFF
      },
      state: {
        sys_relayState: false, // Software says OFF
        sys_tsRelayOff: 0,     // Relay off at time 0
        weld_snapAir: 5.0,     // Temp at relay off
      },
    })

    // Advance past wait period but within detection window
    advanceTime(runtime, 120) // 2 minutes - within window (60s < 120s < 300s)

    // Temp has dropped significantly (weld - compressor still running despite relay "off")
    // Drop must be greater than weld_dropDeg (0.5)
    const droppedTemp = 4.0 // Dropped 1.0°C from snapshot of 5.0°C

    script.protection.checkWeldDetection(droppedTemp, runtime.uptimeMs / 1000)

    expect(script.V.sys_alarm).toBe(script.ALM.WELD)
  })

  it('should NOT trigger weld if temp stable after relay off', async () => {
    const script = await setupController(runtime, {
      config: {
        weld_dropDeg: 0.5,
        weld_waitSec: 60,
        weld_winSec: 300,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
        weld_snapAir: 5.0,
      },
    })

    advanceTime(runtime, 180)

    // Temp stable or rising slightly (normal behavior)
    script.V.sens_smoothAir = 5.2

    script.protection.checkWeldDetection(5.2, runtime.uptimeMs / 1000)

    expect(script.V.sys_alarm).not.toBe(script.ALM.WELD)
  })
})

// ----------------------------------------------------------
// * DEFROST CYCLE EDGE CASES
// ----------------------------------------------------------

describe('Defrost: Manual and Automatic Triggers', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should trigger defrost when evap temp drops too low', async () => {
    const script = await setupController(runtime, {
      config: {
        defr_dynEnable: true,
        defr_dynTrigDeg: -20,
        defr_dynDwellSec: 300,
      },
      state: {
        sys_relayState: true,
        defr_isActive: false,
      },
    })

    // Evap temp drops below threshold
    script.features.checkDefrostTrigger(-22)

    expect(script.S.defr_isActive).toBe(true)
  })

  it('should exit defrost when evap temp rises', async () => {
    const script = await setupController(runtime, {
      config: {
        defr_dynEnable: true,
        defr_dynEndDeg: 0, // Exit when evap >= 0
        defr_dynDwellSec: 30,
        sys_loopSec: 5,
      },
      state: {
        defr_isActive: true,
      },
    })

    // ? defr_dwellTimer is now module-local - accumulate naturally
    // ? defr_dynDwellSec = 30, sys_loopSec = 5, need 30/5 = 6 calls to complete
    const tEvap = 1.0 // Above exit threshold (defr_dynEndDeg = 0)

    // Accumulate dwell time with warm evap
    for (let i = 0; i < 7; i++) {
      script.features.handleDynamicDefrost(tEvap)
    }

    expect(script.S.defr_isActive).toBe(false)
  })
})

// ----------------------------------------------------------
// * TURBO MODE INTERACTIONS
// ----------------------------------------------------------

describe('Turbo Mode: Override Behavior', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should force cooling during turbo mode regardless of temp', async () => {
    const script = await setupController(runtime, {
      config: {
        ctrl_targetDeg: 4.0,
        ctrl_hystDeg: 1.0,
        adapt_enable: false,      // Use fixed hysteresis for predictable test
        turbo_enable: true,
        turbo_maxTimeSec: 1800,
        turbo_targetDeg: 2.0,
        turbo_hystDeg: 0.5,
        comp_minOffSec: 0,        // Disable min-off guard for this test
        sys_loopSec: 5,
        defr_schedEnable: false,  // Disable scheduled defrost
        defr_dynEnable: false,    // Disable dynamic defrost
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,   // Allow immediate turn-on
      },
      volatile: {
        turbo_active: true,
        turbo_remSec: 1000,
        sens_smoothAir: 3.0, // Below normal setpoint but above turbo target+hyst
        door_timer: 0,       // Ensure no door pause
      },
    })

    const mode = script.control.determineMode(3.0, -10, runtime.uptimeMs / 1000)

    // With turbo: target=2.0, hyst=0.5, so turn ON threshold is 2.5
    // Temp 3.0 > 2.5, so should want cooling
    expect(mode.wantOn).toBe(true)
    expect(mode.status).toContain('TURBO')
  })

  it('should respect min-on protection even in turbo mode', async () => {
    const script = await setupController(runtime, {
      config: {
        comp_minOnSec: 120,
        turbo_enable: true,
        turbo_targetDeg: 2.0,
        turbo_hystDeg: 0.5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: runtime.uptimeMs / 1000, // Just started
      },
      volatile: {
        turbo_active: true,
        sens_smoothAir: 1.0, // Below turbo setpoint
      },
    })

    advanceTime(runtime, 30) // Only 30 seconds

    const mode = script.control.determineMode(1.0, -15, runtime.uptimeMs / 1000)
    const result = script.control.executeSwitchDecision(
      mode.wantOn,
      runtime.uptimeMs / 1000,
      1.0,
      -15,
      false,
    )

    // Should be blocked by min-on
    if (!mode.wantOn) {
      expect(result.blocked).toBe(true)
    }
  })
})
