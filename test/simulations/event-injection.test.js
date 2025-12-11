// ==============================================================================
// * EVENT INJECTION SIMULATIONS
// ? Realistic multi-loop simulations with events injected mid-operation.
// ? Tests system response to door opens, sensor failures, weld detection, etc.
// ? during normal ongoing operation rather than in isolation.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShellyRuntime } from '../utils/shelly-simulator.js'

// ----------------------------------------------------------
// * SIMULATION FRAMEWORK
// ----------------------------------------------------------

/**
 * * SimulationRunner
 * ? Runs multi-loop simulations with event injection support.
 * ? Tracks system state, events, and allows assertions at any point.
 */
class SimulationRunner {
  constructor(runtime, script) {
    this.runtime = runtime
    this.script = script
    this.loopCount = 0
    this.events = []
    this.stateHistory = []
    this.injectedEvents = []
  }

  /**
   * * scheduleEvent
   * ? Schedule an event to occur at a specific loop iteration.
   */
  scheduleEvent(atLoop, eventFn, description) {
    this.injectedEvents.push({ atLoop, eventFn, description, fired: false })
  }

  /**
   * * scheduleRandomEvent
   * ? Schedule an event to occur at a random loop within range.
   */
  scheduleRandomEvent(minLoop, maxLoop, eventFn, description) {
    const atLoop = minLoop + Math.floor(Math.random() * (maxLoop - minLoop))
    this.scheduleEvent(atLoop, eventFn, description)
    return atLoop
  }

  /**
   * * runLoop
   * ? Execute a single control loop iteration.
   */
  runLoop(temps = {}) {
    const { script, runtime } = this
    const now = runtime.uptimeMs / 1000

    // Check for scheduled events
    for (const event of this.injectedEvents) {
      if (!event.fired && this.loopCount === event.atLoop) {
        event.eventFn(this)
        event.fired = true
        this.events.push({
          loop: this.loopCount,
          time: now,
          type: 'injected',
          description: event.description,
        })
      }
    }

    // Set temperatures - only if explicitly provided (null means disconnected)
    // ? temps.air === null means sensor disconnected (don't override)
    // ? temps.air === undefined means use current smoothed value
    if (temps.air !== null && temps.air !== undefined) {
      runtime.setTemperature(101, temps.air)
    } else if (temps.air === undefined) {
      // Use existing smooth value or default
      const airTemp = script.V.sens_smoothAir || 4.0
      runtime.setTemperature(101, airTemp)
    }
    // If temps.air === null, leave sensor as-is (disconnected)

    const evapTemp = temps.evap !== undefined ? temps.evap : -10.0
    runtime.setTemperature(100, evapTemp)

    // Store loop timestamp
    script.V.loopNow = now

    // Get sensor readings
    const rAir = runtime.temperatures[101]
    const rEvap = runtime.temperatures[100]

    // Process sensors
    if (script.sensors.validateSensorReadings(rAir, rEvap)) {
      script.sensors.resetSensorError()
      if (script.V.sens_wasError) {
        script.sensors.handleSensorRecovery(rAir.tC)
      }
      script.sensors.processSensorData(rAir.tC)

      // Check sensor stuck
      script.sensors.checkSensorStuck(rAir.tC, 'sens_stuckRefAir', 'sens_stuckTsAir', now)
    } else {
      script.sensors.handleSensorError()
    }

    // Clear and apply alarms
    script.alarms.clearNonFatalAlarms()
    const alarmFail = script.V.sens_errCount >= script.C.sys_sensFailLimit
    const isStuck = script.sensors.checkSensorStuck(
      script.V.sens_smoothAir,
      'sens_stuckRefAir',
      'sens_stuckTsAir',
      now,
    )
    script.alarms.applySensorAlarms(alarmFail, isStuck)

    // Door detection
    if (script.C.door_enable) {
      script.features.detectDoorOpen(script.V.sens_smoothAir, now)
    }

    // Determine mode and execute
    const mode = script.control.determineMode(script.V.sens_smoothAir, rEvap?.tC, now)
    const isLimp = script.V.sys_alarm === script.ALM.FAIL || script.V.sys_alarm === script.ALM.STUCK
    const result = script.control.executeSwitchDecision(mode.wantOn, now, script.V.sens_smoothAir, rEvap?.tC, isLimp)

    // Update status
    if (!result.blocked && !result.switched) {
      script.V.sys_status = mode.status
      if (mode.reason !== script.RSN.NONE) script.V.sys_reason = mode.reason
    }

    // Protection checks
    if (script.S.sys_relayState) {
      const runDur = now - script.S.sys_tsRelayOn
      if (script.V.hw_hasPM) {
        const power = runtime.switches[0]?.apower || 0
        script.protection.checkGhostRun(power, runDur)
        script.protection.checkLockedRotor(power, runDur)
      }
      script.protection.checkCoolingHealth(rEvap?.tC, now)
    } else {
      script.protection.checkWeldDetection(script.V.sens_smoothAir, now)
    }

    // Update metrics
    script.metrics.updateMetrics(script.S.sys_relayState, script.C.sys_loopSec)

    // Record state
    this.stateHistory.push({
      loop: this.loopCount,
      time: now,
      status: script.V.sys_status,
      alarm: script.V.sys_alarm,
      relayOn: script.S.sys_relayState,
      temp: script.V.sens_smoothAir,
      mode: mode.status,
      reason: mode.reason,
    })

    // Advance time
    runtime.advanceTime(script.C.sys_loopSec * 1000)
    this.loopCount++

    return { mode, result, now }
  }

  /**
   * * runLoops
   * ? Execute multiple control loop iterations.
   */
  runLoops(count, tempFn) {
    for (let i = 0; i < count; i++) {
      const temps = tempFn ? tempFn(i, this) : {}
      this.runLoop(temps)
    }
  }

  /**
   * * getStateAt
   * ? Get state history at a specific loop.
   */
  getStateAt(loop) {
    return this.stateHistory.find((s) => s.loop === loop)
  }

  /**
   * * findEventByType
   * ? Find first event matching description pattern.
   */
  findEvent(pattern) {
    return this.events.find((e) => e.description.includes(pattern))
  }
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
  const features = await import('../../src/features.js')
  const alarms = await import('../../src/alarms.js')
  const metrics = await import('../../src/metrics.js')

  // Initialize config with defaults
  Object.assign(config.C, config.DEFAULT)
  if (options.config) {
    Object.assign(config.C, options.config)
  }

  // Initialize state
  if (options.state) {
    Object.assign(state.S, options.state)
  }

  // Initialize volatile
  state.V.sens_stuckRefAir = null
  state.V.sens_stuckTsAir = 0
  state.V.sens_stuckRefEvap = null
  state.V.sens_stuckTsEvap = 0
  if (options.volatile) {
    Object.assign(state.V, options.volatile)
  }

  const script = {
    ...constants,
    C: config.C,
    S: state.S,
    V: state.V,
    sensors,
    control,
    protection,
    features,
    alarms,
    metrics,
  }

  return new SimulationRunner(runtime, script)
}

// ----------------------------------------------------------
// * DOOR OPEN DURING OPERATION
// ----------------------------------------------------------

describe('Event Injection: Door Open During Cooling', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should pause cooling when door opens during active cooling cycle', async () => {
    const sim = await setupController(runtime, {
      config: {
        door_enable: true,
        door_rateDegMin: 0.5,
        door_pauseSec: 60,
        ctrl_targetDeg: 4.0,
        ctrl_hystOnDeg: 1.0,
        comp_minOnSec: 30,
        comp_minOffSec: 60,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sens_smoothAir: 6.0,
        sys_alarm: 'NONE',
        turbo_active: false,
      },
    })

    // Schedule door open at loop 10 (simulated by rapid temp rise)
    sim.scheduleEvent(10, (s) => {
      // Simulate door open: rapid temp rise
      s.script.V.door_refTemp = s.script.V.sens_smoothAir
      s.script.V.door_refTs = s.runtime.uptimeMs / 1000 - 10
    }, 'Door opened - reference set')

    // Run normal cooling for 8 loops
    sim.runLoops(8, () => ({ air: 5.5, evap: -10 }))

    // Verify cooling was active
    expect(sim.script.S.sys_relayState).toBe(true)

    // Run loops 8-12 with rapid temp rise (door open simulation)
    sim.runLoops(5, (i) => ({
      air: 5.5 + (i * 0.3), // Rapid rise: 0.3C per 5s = 3.6C/min
      evap: -10,
    }))

    // Door timer should have been triggered
    expect(sim.script.V.door_timer).toBeGreaterThan(0)

    // Mode should indicate door pause
    const lastState = sim.stateHistory[sim.stateHistory.length - 1]
    expect(lastState.reason).toBe(sim.script.RSN.PROT_DOOR)
  })

  it('should resume cooling after door pause expires', async () => {
    // ? Start runtime with time > 0 so door_refTs passes the > 0 check
    runtime.advanceTime(1000)

    const sim = await setupController(runtime, {
      config: {
        door_enable: true,
        door_rateDegMin: 0.5, // 0.5 deg/min threshold
        door_pauseSec: 30,    // Short pause for test
        ctrl_targetDeg: 4.0,
        ctrl_hystOnDeg: 1.0,
        ctrl_smoothAlpha: 0.5, // Higher alpha = less smoothing = faster response
        comp_minOnSec: 10,
        comp_minOffSec: 30,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sens_smoothAir: 5.0,
        sens_bufAir: [5.0, 5.0, 5.0], // Initialize buffer for proper median
        sens_bufIdx: 0,
        sys_alarm: 'NONE',
        door_timer: 0,
        door_refTemp: 0,
        door_refTs: 0,
      },
    })

    // First loop sets reference values (time is now > 0)
    sim.runLoop({ air: 5.0, evap: -10 })

    // Multiple consecutive readings showing rapid rise (door open spike)
    // ? Each reading builds up in the buffer, eventually moving the median
    sim.runLoop({ air: 6.0, evap: -10 })
    sim.runLoop({ air: 6.5, evap: -10 })
    sim.runLoop({ air: 7.0, evap: -10 })

    // Door should be detected (rate > 0.5 deg/min)
    expect(sim.script.V.door_timer).toBeGreaterThan(0)

    // Run enough loops to expire door pause
    // The timer decrements each loop, so run until it hits 0
    let loops = 0
    while (sim.script.V.door_timer > 0 && loops < 20) {
      sim.runLoop({ air: 6.0, evap: -10 }) // Stable temp (door closed)
      loops++
    }

    // Verify door timer expired
    expect(sim.script.V.door_timer).toBeLessThanOrEqual(0)

    // Run one more loop - should want to cool (temp above setpoint)
    const result = sim.runLoop({ air: 6.0, evap: -10 })
    expect(result.mode.wantOn).toBe(true)
  })
})

// ----------------------------------------------------------
// * SENSOR FAILURE DURING OPERATION
// ----------------------------------------------------------

describe('Event Injection: Sensor Failure During Cooling', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should enter LIMP mode when sensor fails during cooling', async () => {
    const sim = await setupController(runtime, {
      config: {
        ctrl_targetDeg: 4.0,
        sys_sensFailLimit: 3,
        limp_enable: true,
        limp_onSec: 300,
        limp_offSec: 600,
        comp_minOnSec: 30,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sens_smoothAir: 5.0,
        sens_bufAir: [5.0, 5.0, 5.0],
        sens_bufIdx: 0,
        sens_errCount: 0,
        sys_alarm: 'NONE',
      },
    })

    // Run 5 normal loops
    sim.runLoops(5, () => ({ air: 5.0, evap: -10 }))

    // Verify cooling was active
    expect(sim.script.S.sys_relayState).toBe(true)
    expect(sim.script.V.sys_alarm).toBe('NONE')

    // Disconnect sensor by setting null
    runtime.setTemperature(101, null)

    // Run loops with disconnected sensor - error count should increase
    // ? Pass air: null explicitly to keep sensor disconnected (not undefined!)
    for (let i = 0; i < 5; i++) {
      sim.runLoop({ air: null, evap: -10 })
    }

    // Should have hit error limit and entered LIMP
    expect(sim.script.V.sens_errCount).toBeGreaterThanOrEqual(sim.script.C.sys_sensFailLimit)
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.FAIL)

    // Status should indicate LIMP mode
    const lastState = sim.stateHistory[sim.stateHistory.length - 1]
    expect(lastState.status).toContain('LIMP')
  })

  it('should recover from sensor failure when sensor reconnects', async () => {
    const sim = await setupController(runtime, {
      config: {
        ctrl_targetDeg: 4.0,
        sys_sensFailLimit: 3,
        limp_enable: true,
        limp_onSec: 300,
        limp_offSec: 600,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: -100,
      },
      volatile: {
        sens_smoothAir: 5.0,
        sens_errCount: 0,
        sens_wasError: false,
        sens_bufAir: [5.0, 5.0, 5.0],
        sens_bufIdx: 0,
        sys_alarm: 'NONE',
      },
    })

    // Run 3 normal loops
    sim.runLoops(3, () => ({ air: 5.0, evap: -10 }))

    // Disconnect sensor
    runtime.setTemperature(101, null)

    // Fail sensor for enough loops to trigger alarm
    // ? Pass air: null explicitly to keep sensor disconnected
    for (let i = 0; i < 5; i++) {
      sim.runLoop({ air: null, evap: -10 })
    }

    // Should be in FAIL state
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.FAIL)
    expect(sim.script.V.sens_errCount).toBeGreaterThanOrEqual(3)

    // Mark that we had an error (for recovery detection)
    sim.script.V.sens_wasError = true

    // Reconnect sensor
    runtime.setTemperature(101, 5.0)

    // Run recovery loops - first loop after reconnect should recover
    sim.runLoops(3, () => ({ air: 5.0, evap: -10 }))

    // Should have recovered
    expect(sim.script.V.sens_errCount).toBe(0)
    expect(sim.script.V.sens_wasError).toBe(false)
  })
})

// ----------------------------------------------------------
// * SENSOR STUCK DURING OPERATION
// ----------------------------------------------------------

describe('Event Injection: Sensor Stuck During Operation', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect sensor stuck after continuous same readings', async () => {
    const sim = await setupController(runtime, {
      config: {
        sens_stuckEnable: true,
        sens_stuckTimeSec: 30, // Short for test
        sens_stuckEpsDeg: 0.05, // Very tight tolerance
        ctrl_targetDeg: 4.0,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: -100,
      },
      volatile: {
        sens_smoothAir: 4.0,
        sens_stuckRefAir: null, // Will be initialized on first call
        sens_stuckTsAir: 0,
        sys_alarm: 'NONE',
      },
    })

    // Run loops with exact same temperature (sensor stuck)
    // Need > sens_stuckTimeSec (30s) / sys_loopSec (5s) = 6 loops, plus initial
    const stuckLoops = Math.ceil(40 / 5) // 8 loops to exceed 30s
    sim.runLoops(stuckLoops, () => ({ air: 4.0, evap: -10 }))

    // Should have detected stuck sensor
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.STUCK)
  })

  it('should NOT trigger stuck if temperature varies normally', async () => {
    const sim = await setupController(runtime, {
      config: {
        sens_stuckEnable: true,
        sens_stuckTimeSec: 60,
        sens_stuckEpsDeg: 0.1,
        ctrl_targetDeg: 4.0,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: -100,
      },
      volatile: {
        sens_smoothAir: 4.0,
        sys_alarm: 'NONE',
      },
    })

    // Run loops with natural temperature variation
    sim.runLoops(20, (i) => ({
      air: 4.0 + Math.sin(i / 3) * 0.2, // ±0.2C oscillation
      evap: -10,
    }))

    // Should NOT have triggered stuck
    expect(sim.script.V.sys_alarm).not.toBe(sim.script.ALM.STUCK)
  })

  it('should enter LIMP mode when sensor stuck detected during cooling', async () => {
    const sim = await setupController(runtime, {
      config: {
        sens_stuckEnable: true,
        sens_stuckTimeSec: 30, // ? Short for test (matches passing test)
        sens_stuckEpsDeg: 0.05,
        ctrl_targetDeg: 4.0,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sens_smoothAir: 5.0,
        sens_stuckRefAir: null, // ? Explicitly initialize (matches passing test)
        sens_stuckTsAir: 0,
        sys_alarm: 'NONE',
      },
    })

    // Run with stuck sensor (exact same reading)
    // ? Need > sens_stuckTimeSec (30s) / sys_loopSec (5s) = 6 loops, plus margin
    const stuckLoops = Math.ceil(40 / 5) // 8 loops to exceed 30s
    sim.runLoops(stuckLoops, () => ({ air: 5.0, evap: -10 }))

    // Should have entered LIMP mode
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.STUCK)

    const lastState = sim.stateHistory[sim.stateHistory.length - 1]
    expect(lastState.status).toContain('LIMP')
  })
})

// ----------------------------------------------------------
// * WELD DETECTION DURING OPERATION
// ----------------------------------------------------------

describe('Event Injection: Weld Detection During Operation', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect weld when relay turns off but temp keeps dropping', async () => {
    // ? Start runtime at 15s so we're already in the detection window
    // ? (past weld_waitSec=10 but within weld_winSec=60)
    runtime.advanceTime(15000)

    const sim = await setupController(runtime, {
      config: {
        weld_enable: true,
        weld_waitSec: 10,  // Wait 10s before checking
        weld_winSec: 60,   // Detection window
        weld_dropDeg: 0.5, // 0.5C drop triggers alarm
        ctrl_targetDeg: 4.0,
        ctrl_hystOffDeg: 0.5,
        ctrl_smoothAlpha: 0.8, // High alpha = fast response to temp changes
        comp_minOnSec: 10,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: false, // Relay is OFF
        sys_tsRelayOff: 0,     // Turned off at time 0 (15s ago now)
        weld_snapAir: 5.0,     // Snapshot temp when turned off
        fault_fatal: [],
      },
      volatile: {
        sens_smoothAir: 5.0,
        sens_bufAir: [5.0, 5.0, 5.0], // Initialize smoothing buffer
        sens_bufIdx: 0,
        sys_alarm: 'NONE',
      },
    })

    // We're now at 15s, in detection window (10-60s)
    // offDur = 15 > 10 (weld_waitSec), so detection is active
    // Run with dropping temp - if relay is actually welded ON, temp drops

    // Run loops with temperature dropping significantly (simulating welded relay)
    // snap = 5.0, weld_dropDeg = 0.5, need smooth_temp < 4.5 to trigger
    // With alpha=0.8, smoothing responds quickly to changes
    sim.runLoops(5, (i) => ({
      air: 5.0 - ((i + 1) * 0.3), // Dropping: 4.7, 4.4, 4.1, 3.8, 3.5
      evap: -12, // Very cold evap (compressor still running due to weld!)
    }))

    // Should have detected weld (smoothed temp dropped below 4.5)
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.WELD)
  })

  it('should NOT trigger weld if temp stabilizes after relay off', async () => {
    const sim = await setupController(runtime, {
      config: {
        weld_enable: true,
        weld_waitSec: 10,
        weld_winSec: 60,
        weld_dropDeg: 0.5,
        ctrl_targetDeg: 4.0,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: 0,
        weld_snapAir: 3.5,
        fault_fatal: [],
      },
      volatile: {
        sens_smoothAir: 3.5,
        sys_alarm: 'NONE',
      },
    })

    // Run with stable temp (relay truly off)
    sim.runLoops(15, () => ({
      air: 3.5, // Stable - no weld
      evap: -5, // Evap warming up too
    }))

    // Should NOT have triggered weld
    expect(sim.script.V.sys_alarm).not.toBe(sim.script.ALM.WELD)
  })
})

// ----------------------------------------------------------
// * POWER ANOMALIES DURING OPERATION
// ----------------------------------------------------------

describe('Event Injection: Power Anomalies During Cooling', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect ghost run when power drops mid-cycle', async () => {
    const sim = await setupController(runtime, {
      config: {
        pwr_enable: true,
        pwr_runMinW: 10,
        pwr_ghostTripSec: 15, // Short for test
        pwr_ghostMaxCount: 10, // ? Prevent escalation during test
        pwr_startMaskSec: 5,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        hw_hasPM: true,
        pwr_ghostTimer: 0,
        pwr_ghostCount: 0, // ? Start with fresh count
        sys_alarm: 'NONE',
      },
    })

    // Normal power for first loops
    runtime.setPower(0, 80)
    sim.runLoops(3, () => ({ air: 5.0, evap: -10 }))

    // Schedule power drop at loop 5
    sim.scheduleEvent(5, (s) => {
      s.runtime.setPower(0, 2) // Ghost - very low power
    }, 'Power dropped - ghost condition')

    // Run more loops - power drops at loop 5
    sim.runLoops(10, () => ({ air: 5.0, evap: -10 }))

    // Should have detected ghost
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.GHOST)
  })

  it('should detect locked rotor when power spikes mid-cycle', async () => {
    const sim = await setupController(runtime, {
      config: {
        pwr_enable: true,
        pwr_runMaxW: 150,
        pwr_startMaskSec: 5,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        hw_hasPM: true,
        sys_alarm: 'NONE',
      },
    })

    // Normal power initially
    runtime.setPower(0, 80)
    sim.runLoops(3, () => ({ air: 5.0, evap: -10 }))

    // Schedule power spike at loop 5
    sim.scheduleEvent(5, (s) => {
      s.runtime.setPower(0, 200) // Locked rotor - high power
    }, 'Power spiked - locked rotor')

    // Run more loops
    sim.runLoops(5, () => ({ air: 5.0, evap: -10 }))

    // Should have detected locked rotor
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.LOCKED)
  })
})

// ----------------------------------------------------------
// * MULTI-EVENT CHAOS SIMULATION
// ----------------------------------------------------------

describe('Event Injection: Multi-Event Chaos Simulation', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should handle door open followed by sensor failure', async () => {
    // ? Start runtime with time > 0 for door detection
    runtime.advanceTime(1000)

    const sim = await setupController(runtime, {
      config: {
        door_enable: true,
        door_rateDegMin: 0.5,
        door_pauseSec: 30,
        sys_sensFailLimit: 3,
        ctrl_targetDeg: 4.0,
        ctrl_smoothAlpha: 0.5, // Higher alpha = less smoothing = faster response
        limp_enable: true,
        limp_onSec: 300,
        limp_offSec: 600,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sens_smoothAir: 5.0,
        sens_bufAir: [5.0, 5.0, 5.0],
        sens_bufIdx: 0,
        sens_errCount: 0,
        sys_alarm: 'NONE',
        door_timer: 0,
        door_refTemp: 0,
        door_refTs: 0,
      },
    })

    // Run normally - first loop sets door reference
    sim.runLoops(3, () => ({ air: 5.0, evap: -10 }))

    // Door opens - multiple readings with rapid temp rise
    sim.runLoop({ air: 6.0, evap: -10 })
    sim.runLoop({ air: 6.5, evap: -10 })
    sim.runLoop({ air: 7.0, evap: -10 })

    expect(sim.script.V.door_timer).toBeGreaterThan(0)

    // Then sensor fails
    runtime.setTemperature(101, null)
    for (let i = 0; i < 5; i++) {
      sim.runLoop({ air: null, evap: -10 })
    }

    // Sensor failure alarm should take precedence
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.FAIL)
  })

  it('should handle cooling failure during extended run', async () => {
    const sim = await setupController(runtime, {
      config: {
        gas_checkSec: 30, // Short for test
        gas_failDiff: 5.0,
        comp_maxRunSec: 3600,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: true,
        sys_tsRelayOn: 0,
      },
      volatile: {
        sens_smoothAir: 8.0,
        sys_alarm: 'NONE',
        turbo_active: false,
      },
    })

    // Normal cooling initially - evap getting cold
    sim.runLoops(5, () => ({ air: 7.5, evap: -10 }))

    // Cooling failure! Evap stays warm
    sim.runLoops(10, () => ({
      air: 7.5,
      evap: 5.0, // Should be -10, but only 5.0 = gas leak!
    }))

    // Should detect cooling failure
    expect(sim.script.V.sys_alarm).toBe(sim.script.ALM.COOL)
  })

  it('should maintain safety through random event sequence', async () => {
    const sim = await setupController(runtime, {
      config: {
        door_enable: true,
        door_rateDegMin: 0.5,
        door_pauseSec: 20,
        ctrl_targetDeg: 4.0,
        ctrl_hystOnDeg: 1.0,
        ctrl_hystOffDeg: 0.5,
        comp_minOnSec: 15,
        comp_minOffSec: 30,
        comp_freezeCutDeg: 0.5,
        sys_loopSec: 5,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: -100,
      },
      volatile: {
        sens_smoothAir: 6.0,
        sys_alarm: 'NONE',
      },
    })

    // Schedule random events
    const events = []
    events.push(sim.scheduleRandomEvent(5, 15, (s) => {
      // Simulate door open via temp rise
      s.script.V.door_refTemp = s.script.V.sens_smoothAir
      s.script.V.door_refTs = s.runtime.uptimeMs / 1000 - 10
    }, 'Random door open'))

    // Run 100 loops with temperature cycling
    let temp = 6.0
    let cooling = false
    let violations = []

    for (let i = 0; i < 100; i++) {
      // Natural temperature behavior
      if (sim.script.S.sys_relayState) {
        cooling = true
        temp -= 0.05 // Cooling
      } else {
        cooling = false
        temp += 0.02 // Warming
      }

      // Door events cause temp spikes
      if (i >= events[0] && i <= events[0] + 3) {
        temp += 0.4 // Door open spike
      }

      // Bound temperature
      temp = Math.max(0.0, Math.min(15.0, temp))

      const result = sim.runLoop({ air: temp, evap: cooling ? -12 : -5 })

      // Check for safety violations
      if (temp < sim.script.C.comp_freezeCutDeg && sim.script.S.sys_relayState) {
        // Should have freeze protection
        if (result.mode.wantOn === true) {
          violations.push({ loop: i, issue: 'Cooling below freeze point' })
        }
      }
    }

    // No safety violations
    expect(violations).toHaveLength(0)

    // System should have completed cycles
    expect(sim.stateHistory.length).toBe(100)
  })
})

// ----------------------------------------------------------
// * LONG DURATION STABILITY
// ----------------------------------------------------------

describe('Event Injection: Long Duration Stability', () => {
  let runtime

  beforeEach(() => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should maintain stable operation over 500 cycles with random events', async () => {
    const sim = await setupController(runtime, {
      config: {
        door_enable: true,
        door_rateDegMin: 0.5,
        door_pauseSec: 60,
        sens_stuckEnable: true,
        sens_stuckTimeSec: 600,
        sens_stuckEpsDeg: 0.1,
        ctrl_targetDeg: 4.0,
        ctrl_hystDeg: 1.0,          // Fixed: use actual config key
        adapt_enable: false,         // Use fixed hysteresis
        comp_minOnSec: 60,
        comp_minOffSec: 180,
        sys_loopSec: 5,
        defr_schedEnable: false,     // Disable scheduled defrost for predictable test
        defr_dynEnable: false,
      },
      state: {
        sys_relayState: false,
        sys_tsRelayOff: -200,
      },
      volatile: {
        sens_smoothAir: 5.0,
        sys_alarm: 'NONE',
      },
    })

    // Schedule multiple random door events
    for (let i = 0; i < 5; i++) {
      sim.scheduleRandomEvent(50 + i * 100, 100 + i * 100, (s) => {
        s.script.V.door_refTemp = s.script.V.sens_smoothAir
        s.script.V.door_refTs = s.runtime.uptimeMs / 1000 - 10
      }, `Door event ${i + 1}`)
    }

    // Run 500 loops with natural temperature behavior
    let temp = 5.0
    let onCount = 0
    let offCount = 0

    for (let i = 0; i < 500; i++) {
      // Track cycling
      const wasOn = sim.script.S.sys_relayState

      // Temperature behavior
      if (sim.script.S.sys_relayState) {
        temp -= 0.03 + Math.random() * 0.02 // Cooling with noise
      } else {
        temp += 0.015 + Math.random() * 0.01 // Warming with noise
      }

      // Random door events add heat
      if (sim.injectedEvents.some((e) => e.atLoop === i)) {
        temp += 1.0 // Door open spike
      }

      // Bound temperature
      temp = Math.max(1.0, Math.min(12.0, temp))

      sim.runLoop({ air: temp, evap: sim.script.S.sys_relayState ? -12 : -3 })

      // Count state changes
      if (sim.script.S.sys_relayState && !wasOn) onCount++
      if (!sim.script.S.sys_relayState && wasOn) offCount++
    }

    // Should have completed multiple cycles
    // ? With minOnSec=60s, minOffSec=180s and 500 loops of 5s (2500s total),
    // ? realistic cycle count is 2-6 depending on temperature dynamics and random events
    // ? Using >= 2 to account for edge cases with door pause interruptions
    expect(onCount).toBeGreaterThanOrEqual(2)
    expect(offCount).toBeGreaterThanOrEqual(2)

    // No fatal alarms
    expect(sim.script.V.sys_alarm).not.toBe(sim.script.ALM.WELD)
    expect(sim.script.V.sys_alarm).not.toBe(sim.script.ALM.LOCKED)

    // Temperature should be controlled
    const finalTemp = sim.script.V.sens_smoothAir
    expect(finalTemp).toBeLessThan(10) // Not runaway
  })
})
