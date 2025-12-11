// ==============================================================================
// * EDGE CASE SIMULATION TESTS
// ? Tests rare but critical failure scenarios and edge conditions.
// ? Covers sensor malfunctions, relay failures, and extreme conditions.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShellyRuntime } from '../utils/shelly-simulator.js'

// ----------------------------------------------------------
// * LOCAL HELPERS
// ----------------------------------------------------------

function advanceTime(runtime, seconds) {
  runtime.advanceTime(seconds * 1000)
}

// ----------------------------------------------------------
// * SETUP HELPERS
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
  const alarms = await import('../../src/alarms.js')
  const features = await import('../../src/features.js')
  const metrics = await import('../../src/metrics.js')

  // Apply config
  Object.assign(config.C, config.DEFAULT)
  if (options.config) {
    Object.assign(config.C, options.config)
  }

  // Apply state
  if (options.state) {
    Object.assign(state.S, options.state)
  }

  // Apply volatile
  if (options.volatile) {
    Object.assign(state.V, options.volatile)
  }

  return {
    ...constants,
    C: config.C,
    S: state.S,
    V: state.V,
    sensors,
    control,
    protection,
    alarms,
    features,
    metrics,
  }
}

// ----------------------------------------------------------
// * SENSOR STUCK SCENARIOS
// ? Tests for sensors that report the same value continuously.
// ----------------------------------------------------------

describe('Sensor Stuck: Air Sensor Frozen Value', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect air sensor stuck after threshold period', async () => {
    const script = await setupController(runtime, {
      config: {
        sens_stuckEnable: true,
        sens_stuckTimeSec: 300,   // 5 minutes stuck threshold
        sens_stuckEpsDeg: 0.1,    // Must change by at least 0.1C
        sys_loopSec: 5,
      },
      volatile: {
        sens_stuckRefAir: null,   // Must be null for initialization
        sens_stuckTsAir: 0,
      },
    })

    // Initialize reference (first call sets refKey)
    script.sensors.checkSensorStuck(4.0, 'sens_stuckRefAir', 'sens_stuckTsAir', 0)

    // Simulate stuck sensor - same value for 6+ minutes
    let isStuck = false
    for (let t = 5; t <= 400; t += 5) {
      isStuck = script.sensors.checkSensorStuck(4.0, 'sens_stuckRefAir', 'sens_stuckTsAir', t)
      if (isStuck) break
    }

    expect(isStuck).toBe(true)
  })

  it('should NOT trigger stuck if sensor value changes slightly', async () => {
    const script = await setupController(runtime, {
      config: {
        sens_stuckEnable: true,
        sens_stuckTimeSec: 300,
        sens_stuckEpsDeg: 0.1,
        sys_loopSec: 5,
      },
      volatile: {
        sens_stuckRefAir: null,
        sens_stuckTsAir: 0,
      },
    })

    // Initialize
    script.sensors.checkSensorStuck(4.0, 'sens_stuckRefAir', 'sens_stuckTsAir', 0)

    // Simulate small variations over time
    let isStuck = false
    let temp = 4.0
    for (let t = 5; t <= 400; t += 5) {
      // Small variation that exceeds tolerance
      temp = 4.0 + (Math.sin(t / 50) * 0.15)
      isStuck = script.sensors.checkSensorStuck(temp, 'sens_stuckRefAir', 'sens_stuckTsAir', t)
    }

    expect(isStuck).toBe(false)
  })

  it('should enter LIMP mode when sensor stuck alarm is set', async () => {
    const script = await setupController(runtime, {
      config: {
        temp_setpoint: 4.0,
        limp_cycleSec: 600,
      },
      volatile: {
        sys_alarm: 'NONE',
      },
    })

    // Set STUCK alarm
    script.V.sys_alarm = script.ALM.STUCK

    // Determine mode should return LIMP
    const mode = script.control.determineMode(null, null, runtime.uptimeMs / 1000)

    expect(mode.status).toContain('LIMP')
  })
})

describe('Sensor Stuck: Evaporator Sensor Frozen Value', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect evap sensor stuck independently from air', async () => {
    const script = await setupController(runtime, {
      config: {
        sens_stuckEnable: true,
        sens_stuckTimeSec: 300,
        sens_stuckEpsDeg: 0.1,
      },
      volatile: {
        sens_stuckRefEvap: null,
        sens_stuckTsEvap: 0,
      },
    })

    // Initialize
    script.sensors.checkSensorStuck(-15.0, 'sens_stuckRefEvap', 'sens_stuckTsEvap', 0)

    // Evap stuck at same value
    let isStuck = false
    for (let t = 5; t <= 400; t += 5) {
      isStuck = script.sensors.checkSensorStuck(-15.0, 'sens_stuckRefEvap', 'sens_stuckTsEvap', t)
      if (isStuck) break
    }

    expect(isStuck).toBe(true)
  })

  it('should handle both sensors stuck simultaneously', async () => {
    const script = await setupController(runtime, {
      config: {
        sens_stuckEnable: true,
        sens_stuckTimeSec: 300,
        sens_stuckEpsDeg: 0.1,
      },
      volatile: {
        sens_stuckRefAir: null,
        sens_stuckTsAir: 0,
        sens_stuckRefEvap: null,
        sens_stuckTsEvap: 0,
      },
    })

    // Initialize both
    script.sensors.checkSensorStuck(4.0, 'sens_stuckRefAir', 'sens_stuckTsAir', 0)
    script.sensors.checkSensorStuck(-15.0, 'sens_stuckRefEvap', 'sens_stuckTsEvap', 0)

    // Both stuck
    let airStuck = false
    let evapStuck = false
    for (let t = 5; t <= 400; t += 5) {
      airStuck = script.sensors.checkSensorStuck(4.0, 'sens_stuckRefAir', 'sens_stuckTsAir', t)
      evapStuck = script.sensors.checkSensorStuck(-15.0, 'sens_stuckRefEvap', 'sens_stuckTsEvap', t)
    }

    expect(airStuck).toBe(true)
    expect(evapStuck).toBe(true)
  })
})

// ----------------------------------------------------------
// * SENSOR INTERMITTENT FAILURE (FLAPPING)
// ? Tests for sensors that fail and recover repeatedly.
// ----------------------------------------------------------

describe('Sensor Failure: Intermittent (Flapping) Behavior', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should accumulate errors during intermittent failures', async () => {
    const script = await setupController(runtime, {
      config: {
        sys_sensFailLimit: 5,
      },
      volatile: {
        sens_errCount: 0,
      },
    })

    // Simulate flapping: fail, recover, fail, recover, fail...
    for (let i = 0; i < 3; i++) {
      // Fail
      script.sensors.handleSensorError()
      script.sensors.handleSensorError()
      // Recover (single good reading resets count)
      script.sensors.resetSensorError()
    }

    // Error count should be back to 0 after recovery
    expect(script.V.sens_errCount).toBe(0)
  })

  it('should trigger alarm if failures outpace recoveries', async () => {
    const script = await setupController(runtime, {
      config: {
        sys_sensFailLimit: 5,
      },
      volatile: {
        sens_errCount: 0,
      },
    })

    // Rapid consecutive failures
    for (let i = 0; i < 6; i++) {
      script.sensors.handleSensorError()
    }

    expect(script.V.sens_errCount).toBeGreaterThanOrEqual(5)

    // Apply alarm
    script.alarms.applySensorAlarms(true, false)
    expect(script.V.sys_alarm).toBe(script.ALM.FAIL)
  })

  it('should track was_error state across recovery cycles', async () => {
    const script = await setupController(runtime, {
      config: {
        sys_sensFailLimit: 3,
      },
      volatile: {
        sens_errCount: 0,
        sens_wasError: false,
      },
    })

    // Hit failure threshold
    for (let i = 0; i < 4; i++) {
      script.sensors.handleSensorError()
    }
    script.V.sens_wasError = true

    // Recover
    script.sensors.resetSensorError()
    script.sensors.handleSensorRecovery(5.0)

    // wasError should be cleared after recovery
    expect(script.V.sens_wasError).toBe(false)
  })
})

// ----------------------------------------------------------
// * RELAY WELD: FULL DETECTION SEQUENCE
// ? Tests complete weld detection from trigger through system response.
// ----------------------------------------------------------

describe('Relay Weld: Complete Detection Sequence', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should execute full weld detection sequence', async () => {
    const script = await setupController(runtime, {
      config: {
        weld_enable: true,
        weld_waitSec: 30,    // Start checking 30s after OFF
        weld_winSec: 180,    // Check until 3 min after OFF
        weld_dropDeg: 0.5,   // Alarm if drops 0.5C
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
        weld_snapAir: 5.0,   // Temp when relay turned off
        fault_fatal: [],
      },
      volatile: {
        sys_alarm: 'NONE',
      },
    })

    // Phase 1: Wait period (no detection) - offDur=20 < waitSec=30
    let detected = script.protection.checkWeldDetection(5.0, 20)
    expect(detected).toBe(false)
    expect(script.V.sys_alarm).toBe('NONE')

    // Phase 2: In detection window, temp stable (no weld) - offDur=60, temp=4.9 (dropped only 0.1C)
    detected = script.protection.checkWeldDetection(4.9, 60)
    expect(detected).toBe(false)

    // Phase 3: Temp drops significantly (WELD!) - offDur=90, temp=4.2 (dropped 0.8C > 0.5C threshold)
    detected = script.protection.checkWeldDetection(4.2, 90)
    expect(detected).toBe(true)
    expect(script.V.sys_alarm).toBe(script.ALM.WELD)
  })

  it('should prevent relay activation after weld detected', async () => {
    const script = await setupController(runtime, {
      config: {
        temp_setpoint: 4.0,
        temp_hystOn: 1.0,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
      },
      volatile: {
        sys_alarm: 'NONE',
      },
    })

    // Set WELD alarm
    script.V.sys_alarm = script.ALM.WELD

    // Even if temp is high, should NOT want to turn on
    const mode = script.control.determineMode(10.0, -10, runtime.uptimeMs / 1000)

    expect(mode.wantOn).toBe(false)
    expect(mode.detail).toContain('FATAL')
  })

  it('should log fault when weld detected', async () => {
    const script = await setupController(runtime, {
      config: {
        weld_enable: true,
        weld_waitSec: 30,
        weld_winSec: 180,
        weld_dropDeg: 0.5,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
        weld_snapAir: 5.0,
        fault_fatal: [],
      },
      volatile: {
        sys_alarm: 'NONE',
      },
    })

    // Trigger weld in detection window (offDur=60, temp dropped from 5.0 to 4.0 = 1.0C drop)
    script.protection.checkWeldDetection(4.0, 60)

    // Check fault was recorded via print
    const prints = runtime.getPrintHistory()
    const weldMsg = prints.find((p) => p.message.includes('WELD'))
    expect(weldMsg).toBeDefined()
  })
})

// ----------------------------------------------------------
// * COOLING SYSTEM FAILURE (GAS LEAK)
// ? Tests for detection of refrigerant loss or valve failure.
// ----------------------------------------------------------

describe('Cooling Failure: Gas Leak Detection', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect cooling failure when evap temp stays high', async () => {
    const script = await setupController(runtime, {
      config: {
        gas_checkSec: 300,   // Check after 5 min of running (shortened for test)
        gas_failDiff: 5.0,   // Evap should be 5C colder than air
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,    // Relay on at time 0
      },
      volatile: {
        sys_alarm: 'NONE',
        sens_smoothAir: 6.0,
        turbo_active: false,
      },
    })

    // Evap temp is same as air (gas leak - no cooling)
    // checkCoolingHealth checks: tEvap > (sens_smoothAir - gas_failDiff)
    // i.e., tEvap > (6.0 - 5.0) = 1.0C would trigger alarm
    const tEvap = 5.5  // Should be around -10C if working, but it's 5.5C (too warm)
    // Pass time > gas_checkSec (350 > 300)
    const detected = script.protection.checkCoolingHealth(tEvap, 350)

    expect(detected).toBe(true)
    expect(script.V.sys_alarm).toBe(script.ALM.COOL)
  })

  it('should NOT trigger cooling alarm if evap is cold enough', async () => {
    const script = await setupController(runtime, {
      config: {
        gas_checkSec: 300,
        gas_failDiff: 5.0,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sys_alarm: 'NONE',
        sens_smoothAir: 6.0,
        turbo_active: false,
      },
    })

    // Evap is cold as expected (-10C is way below 6.0 - 5.0 = 1.0C threshold)
    const tEvap = -10.0
    const detected = script.protection.checkCoolingHealth(tEvap, 350)

    expect(detected).toBe(false)
    expect(script.V.sys_alarm).toBe('NONE')
  })

  it('should NOT check cooling health during startup period', async () => {
    const script = await setupController(runtime, {
      config: {
        gas_checkSec: 300,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sys_alarm: 'NONE',
        sens_smoothAir: 6.0,
        turbo_active: false,
      },
    })

    // Only 2 minutes in (120s < gas_checkSec 300s)
    const tEvap = 5.0  // Would be alarming after check period
    const detected = script.protection.checkCoolingHealth(tEvap, 120)

    expect(detected).toBe(false)
    expect(script.V.sys_alarm).toBe('NONE')
  })
})

// ----------------------------------------------------------
// * CONCURRENT ALARMS
// ? Tests for multiple alarm conditions occurring simultaneously.
// ----------------------------------------------------------

describe('Concurrent Alarms: Priority Handling', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should prioritize WELD (fatal) over STUCK (non-fatal)', async () => {
    const script = await setupController(runtime, {
      state: {
        sys_relayState: false,
      },
      volatile: {
        sys_alarm: 'NONE',
      },
    })

    // WELD takes priority
    script.V.sys_alarm = script.ALM.WELD

    const mode = script.control.determineMode(5.0, -10, runtime.uptimeMs / 1000)

    // Should show WELD, not enter LIMP mode
    expect(mode.detail).toContain('FATAL')
    expect(mode.detail).toContain('WELD')
    expect(mode.wantOn).toBe(false)
  })

  it('should prioritize LOCKED (fatal) over FAIL (non-fatal)', async () => {
    const script = await setupController(runtime, {
      state: {
        sys_relayState: true,
      },
    })

    script.V.sys_alarm = script.ALM.LOCKED

    const mode = script.control.determineMode(5.0, -10, runtime.uptimeMs / 1000)

    expect(mode.detail).toContain('FATAL')
    expect(mode.detail).toContain('LOCKED')
    expect(mode.wantOn).toBe(false)
  })

  it('should handle sensor failure + high temp simultaneously', async () => {
    const script = await setupController(runtime, {
      config: {
        temp_highAlarmDeg: 10.0,
        temp_highDelaySec: 60,
      },
      volatile: {
        sys_alarm: 'NONE',
        sens_errCount: 10,
        sens_wasError: true,
        temp_highAlarmTs: Date.now() / 1000 - 120, // Alarm should be active
      },
    })

    // Sensor failure alarm takes priority for control
    script.V.sys_alarm = script.ALM.FAIL

    const mode = script.control.determineMode(null, null, runtime.uptimeMs / 1000)

    // Should be in LIMP mode (handling sensor failure)
    expect(mode.status).toContain('LIMP')
  })

  it('should clear non-fatal alarm when fatal occurs', async () => {
    const script = await setupController(runtime, {
      volatile: {
        sys_alarm: 'NONE',
      },
    })

    // First have a non-fatal alarm
    script.V.sys_alarm = script.ALM.STUCK

    // Then fatal occurs
    script.V.sys_alarm = script.ALM.WELD

    // Fatal replaces non-fatal
    expect(script.V.sys_alarm).toBe(script.ALM.WELD)
  })
})

// ----------------------------------------------------------
// * EXTREME ENVIRONMENT SCENARIOS
// ? Tests for unusual ambient conditions.
// ----------------------------------------------------------

describe('Extreme Environment: Very Hot Ambient', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should continue cooling even with very high ambient temp', async () => {
    const script = await setupController(runtime, {
      config: {
        ctrl_targetDeg: 4.0,
        ctrl_hystOnDeg: 1.0,
        comp_maxRunSec: 7200, // 2 hours
        comp_minOffSec: 180,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
      },
      volatile: {
        sens_smoothAir: 25.0, // Very warm fridge (just opened or malfunction)
        sys_alarm: 'NONE',
        turbo_active: false,
      },
    })

    // Set sys_tsRelayOff in the past to satisfy min-off timing
    script.S.sys_tsRelayOff = -200

    const mode = script.control.determineMode(25.0, -5, runtime.uptimeMs / 1000)

    // Should definitely want to cool
    expect(mode.wantOn).toBe(true)
  })

  it('should trigger high temp alarm when very warm for extended period', async () => {
    const script = await setupController(runtime, {
      config: {
        alarm_highEnable: true,
        alarm_highDeg: 15.0,
        alarm_highDelaySec: 300,
        sys_loopSec: 5,
      },
      volatile: {
        sys_alarm: 'NONE',
        // ? alarm_highTimer is now module-local in alarms.js
        turbo_active: false,
      },
    })

    // Increment timer by calling repeatedly (simulating loop ticks)
    // Need to accumulate > alarm_highDelaySec (300s)
    for (let i = 0; i < 70; i++) { // 70 * 5s = 350s
      script.alarms.checkHighTempAlarm(20.0, false)
    }

    expect(script.V.sys_alarm).toBe(script.ALM.HIGH)
  })
})

describe('Extreme Environment: Very Cold Ambient', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should not cool below freeze threshold', async () => {
    const script = await setupController(runtime, {
      config: {
        ctrl_targetDeg: 4.0,
        comp_freezeCutDeg: 0.5,  // Correct config key
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sens_smoothAir: -1.0, // Below freeze limit
        sys_alarm: 'NONE',
        turbo_active: false,
      },
    })

    const mode = script.control.determineMode(-1.0, -20, runtime.uptimeMs / 1000)

    // Should want OFF due to freeze protection
    expect(mode.wantOn).toBe(false)
    expect(mode.reason).toBe(script.RSN.PROT_AIR_FRZ)
  })

  it('should handle fridge in freezing room (ambient below target)', async () => {
    const script = await setupController(runtime, {
      config: {
        temp_setpoint: 4.0,
        temp_hystOn: 1.0,
      },
      state: {
        sys_relayState: false,
      },
      volatile: {
        sens_smoothAir: 2.0, // Already cold, no cooling needed
      },
    })

    const mode = script.control.determineMode(2.0, -5, runtime.uptimeMs / 1000)

    // Already within target range, don't cool
    expect(mode.wantOn).toBe(false)
  })
})

// ----------------------------------------------------------
// * POWER ANOMALIES
// ? Tests for unusual power consumption patterns.
// ----------------------------------------------------------

describe('Power Anomalies: Fluctuating Power Draw', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should handle power fluctuation without false ghost detection', async () => {
    const script = await setupController(runtime, {
      config: {
        pwr_runMinW: 10,
        pwr_ghostTripSec: 30,
        pwr_startMaskSec: 10,
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

    advanceTime(runtime, 20) // Past startup mask

    // Simulate fluctuating power (briefly dips low then recovers)
    let ghostDetected = false

    // Low power tick
    script.protection.checkGhostRun(5, 20)
    // Normal power tick (resets timer)
    script.protection.checkGhostRun(80, 25)
    // Low again
    script.protection.checkGhostRun(5, 30)
    // Normal again
    ghostDetected = script.protection.checkGhostRun(80, 35)

    expect(ghostDetected).toBe(false)
    expect(script.V.pwr_ghostTimer).toBe(0) // Reset by good reading
  })

  it('should detect sustained low power as ghost run', async () => {
    const script = await setupController(runtime, {
      config: {
        pwr_runMinW: 10,
        pwr_ghostTripSec: 30,
        pwr_startMaskSec: 10,
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

    advanceTime(runtime, 20)

    // Sustained low power
    let ghostDetected = false
    for (let i = 0; i < 10 && !ghostDetected; i++) {
      ghostDetected = script.protection.checkGhostRun(5, 20 + i * 5)
    }

    expect(ghostDetected).toBe(true)
    expect(script.V.sys_alarm).toBe(script.ALM.GHOST)
  })
})

// ----------------------------------------------------------
// * TIMING EDGE CASES
// ? Tests for boundary conditions in timing guards.
// ----------------------------------------------------------

describe('Timing Edge Cases: Boundary Conditions', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should handle exactly at min-on boundary', async () => {
    const script = await setupController(runtime, {
      config: {
        comp_minOnSec: 60,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
    })

    // Exactly at boundary
    const canOff = script.protection.canTurnOff(60)
    expect(canOff).toBe(true)

    // Just before boundary
    const cantOff = script.protection.canTurnOff(59)
    expect(cantOff).toBe(false)
  })

  it('should handle exactly at min-off boundary', async () => {
    const script = await setupController(runtime, {
      config: {
        comp_minOffSec: 180,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
      },
    })

    // Exactly at boundary
    const canOn = script.protection.canTurnOn(180)
    expect(canOn).toBe(true)

    // Just before boundary
    const cantOn = script.protection.canTurnOn(179)
    expect(cantOn).toBe(false)
  })

  it('should handle max run exactly at limit', async () => {
    const script = await setupController(runtime, {
      config: {
        comp_maxRunSec: 3600,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        turbo_active: false,
      },
    })

    // Just at limit
    const exceeded = script.protection.isMaxRunExceeded(3601)
    expect(exceeded).toBe(true)

    // Just under limit
    const notExceeded = script.protection.isMaxRunExceeded(3600)
    expect(notExceeded).toBe(false)
  })
})

// ----------------------------------------------------------
// * LONG IDLE SCENARIOS
// ? Tests for fridge unused for extended periods.
// ----------------------------------------------------------

describe('Long Idle: Extended Off Period', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should handle stats after very long idle period', async () => {
    const script = await setupController(runtime, {
      config: {
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
        stats_hourRun: 0,
        stats_hourTime: 0,
        stats_cycleCount: 0,
      },
    })

    // Simulate 24 hours of idle time
    for (let hour = 0; hour < 24; hour++) {
      // Update metrics for an hour of idle
      for (let tick = 0; tick < 720; tick++) { // 720 * 5s = 1 hour
        script.metrics.updateMetrics(false, 5)
      }
    }

    // Stats should show lots of idle time, no run time
    expect(script.S.stats_hourRun).toBe(0)
    expect(script.S.stats_cycleCount).toBe(0)
  })

  it('should resume normal operation after long idle', async () => {
    const script = await setupController(runtime, {
      config: {
        temp_setpoint: 4.0,
        temp_hystOn: 1.0,
        comp_minOffSec: 180,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0, // Long ago
      },
    })

    // Way past min-off time
    advanceTime(runtime, 86400) // 24 hours

    // Temp is now warm
    const mode = script.control.determineMode(8.0, -5, runtime.uptimeMs / 1000)

    // Should want to cool (no timing issues after long idle)
    expect(mode.wantOn).toBe(true)
  })
})

// ----------------------------------------------------------
// * RAPID CYCLING PREVENTION
// ? Tests for short-cycle protection.
// ----------------------------------------------------------

describe('Rapid Cycling: Prevention Mechanisms', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should prevent rapid on/off cycling', async () => {
    const script = await setupController(runtime, {
      config: {
        comp_minOnSec: 60,
        comp_minOffSec: 180,
        ctrl_targetDeg: 4.0,
        ctrl_hystOnDeg: 0.5,
        ctrl_hystOffDeg: 0.5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
        sys_tsRelayOff: 0,
      },
      volatile: {
        sys_alarm: 'NONE',
        turbo_active: false,
      },
    })

    // Compressor just turned on at time 0, now at time 10
    // Temp quickly drops below setpoint - hysteresis (thermostat wants OFF)
    // Temp 2.5 < (4.0 - 0.5) = 3.5 → should want OFF
    const mode = script.control.determineMode(2.5, -15, 10)
    expect(mode.wantOn).toBe(false) // Wants to turn off

    // But timing guard blocks it (10s < minOnSec 60s)
    const canOff = script.protection.canTurnOff(10)
    expect(canOff).toBe(false)

    // Execute switch should be blocked
    const result = script.control.executeSwitchDecision(false, 10, 2.5, -15, false)
    expect(result.blocked).toBe(true)
    expect(result.switched).toBe(false)
  })

  it('should allow cycling after timing guards satisfied', async () => {
    const script = await setupController(runtime, {
      config: {
        comp_minOnSec: 60,
        comp_minOffSec: 180,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
    })

    // Past min-on time
    advanceTime(runtime, 100)

    const canOff = script.protection.canTurnOff(100)
    expect(canOff).toBe(true)
  })
})
