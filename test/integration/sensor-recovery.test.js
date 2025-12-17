// ==============================================================================
// * SENSOR RECOVERY INTEGRATION TESTS
// ? Tests sensor failure detection, LIMP mode entry, and recovery scenarios.
// ? Validates the complete lifecycle: normal → failure → LIMP → recovery.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShellyRuntime } from '../utils/shelly-simulator.js'

// ----------------------------------------------------------
// * TEST SETUP
// ----------------------------------------------------------

async function setupSensorTest(runtime, options = {}) {
  runtime.installGlobals(global)
  vi.resetModules()

  const constants = await import('../../src/constants.js')
  const config = await import('../../src/config.js')
  const state = await import('../../src/state.js')
  const sensors = await import('../../src/sensors.js')
  const alarms = await import('../../src/alarms.js')
  const control = await import('../../src/control.js')
  const features = await import('../../src/features.js')

  // Initialize config
  Object.assign(config.C, config.DEFAULT)

  // Apply initial state
  if (options.airTemp !== undefined) {
    runtime.setTemperature(config.C.sys_sensAirId, options.airTemp)
    state.V.sns_airSmoothDeg = options.airTemp
    state.V.sns_airBuf = [options.airTemp, options.airTemp, options.airTemp]
  }
  if (options.evapTemp !== undefined) {
    runtime.setTemperature(config.C.sys_sensEvapId, options.evapTemp)
  }

  runtime.script = {
    constants,
    config,
    state,
    sensors,
    alarms,
    control,
    features,
    S: state.S,
    V: state.V,
    C: config.C,
    ALM: constants.ALM,
    ST: constants.ST,
  }

  return runtime.script
}

// ----------------------------------------------------------
// * SENSOR FAILURE DETECTION
// ----------------------------------------------------------

describe('Sensor Recovery: Failure Detection', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should increment error count on sensor failure', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_errCnt = 0

    script.sensors.handleSensorError()

    expect(script.V.sns_errCnt).toBe(1)
  })

  it('should increment past limit (no cap)', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_errCnt = script.C.sys_sensFailLimit

    script.sensors.handleSensorError()

    // handleSensorError increments without capping
    // The alarm triggers when limit is reached, but count continues
    expect(script.V.sns_errCnt).toBe(script.C.sys_sensFailLimit + 1)
  })

  it('should return true when limit reached', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_errCnt = script.C.sys_sensFailLimit - 1

    const isFatal = script.sensors.handleSensorError()

    expect(isFatal).toBe(true)
  })

  it('should return false before limit', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_errCnt = 0

    const isFatal = script.sensors.handleSensorError()

    expect(isFatal).toBe(false)
  })

  it('should validate sensor readings correctly', async () => {
    script = await setupSensorTest(runtime, {})

    // Valid readings
    expect(script.sensors.validateSensorReadings({ tC: 5.0 }, { tC: -10.0 })).toBe(true)

    // Invalid: null response
    expect(script.sensors.validateSensorReadings(null, { tC: -10.0 })).toBe(false)
    expect(script.sensors.validateSensorReadings({ tC: 5.0 }, null)).toBe(false)

    // Invalid: undefined temperature
    expect(script.sensors.validateSensorReadings({ tC: undefined }, { tC: -10.0 })).toBe(false)

    // Invalid: NaN temperature
    expect(script.sensors.validateSensorReadings({ tC: NaN }, { tC: -10.0 })).toBe(false)
  })
})

// ----------------------------------------------------------
// * STUCK SENSOR DETECTION
// ----------------------------------------------------------

describe('Sensor Recovery: Stuck Detection', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should initialize stuck reference on first call', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_airStuckRefDeg = null
    script.V.sns_airStuckTs = 0

    const stuck = script.sensors.checkSensorStuck(5.0, 'sns_airStuckRefDeg', 'sns_airStuckTs', 1000)

    expect(stuck).toBe(false)
    expect(script.V.sns_airStuckRefDeg).toBe(5.0)
    expect(script.V.sns_airStuckTs).toBe(1000)
  })

  it('should detect stuck sensor after threshold time', async () => {
    script = await setupSensorTest(runtime, {})

    // Initialize
    script.V.sns_airStuckRefDeg = 5.0
    script.V.sns_airStuckTs = 1000

    // Check after threshold exceeded
    const stuckTime = 1000 + script.C.sens_stuckTimeSec + 1
    const stuck = script.sensors.checkSensorStuck(5.0, 'sns_airStuckRefDeg', 'sns_airStuckTs', stuckTime)

    expect(stuck).toBe(true)
  })

  it('should reset when value changes beyond epsilon', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_airStuckRefDeg = 5.0
    script.V.sns_airStuckTs = 1000

    // Value changes significantly (> stuckEpsDeg default 0.1)
    const stuck = script.sensors.checkSensorStuck(5.5, 'sns_airStuckRefDeg', 'sns_airStuckTs', 2000)

    expect(stuck).toBe(false)
    expect(script.V.sns_airStuckRefDeg).toBe(5.5) // Updated reference
    expect(script.V.sns_airStuckTs).toBe(2000) // Reset timestamp
  })

  it('should NOT reset for small fluctuations within epsilon', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_airStuckRefDeg = 5.0
    script.V.sns_airStuckTs = 1000

    // Value changes by less than epsilon
    const stuck = script.sensors.checkSensorStuck(5.05, 'sns_airStuckRefDeg', 'sns_airStuckTs', 2000)

    expect(stuck).toBe(false)
    expect(script.V.sns_airStuckRefDeg).toBe(5.0) // NOT updated
    expect(script.V.sns_airStuckTs).toBe(1000) // NOT reset
  })
})

// ----------------------------------------------------------
// * LIMP MODE ENTRY
// ----------------------------------------------------------

describe('Sensor Recovery: LIMP Mode Entry', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should enter LIMP mode when sensor failure alarm active', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sys_alarm = script.ALM.FAIL

    const mode = script.control.determineMode(0, 0)

    expect(mode.status).toMatch(/^LIMP_/)
  })

  it('should enter LIMP mode when stuck sensor alarm active', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sys_alarm = script.ALM.STUCK

    const mode = script.control.determineMode(0, 0)

    expect(mode.status).toMatch(/^LIMP_/)
  })

  it('should apply sensor alarms correctly', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sys_alarm = script.ALM.NONE

    // Apply fail alarm
    script.alarms.applySensorAlarms(true, false)
    expect(script.V.sys_alarm).toBe(script.ALM.FAIL)

    // Reset and apply stuck alarm
    script.V.sys_alarm = script.ALM.NONE
    script.alarms.applySensorAlarms(false, true)
    expect(script.V.sys_alarm).toBe(script.ALM.STUCK)

    // Both true: FAIL wins (FAIL is worse than STUCK - sensor returning null is worse than frozen value)
    script.V.sys_alarm = script.ALM.NONE
    script.alarms.applySensorAlarms(true, true)
    expect(script.V.sys_alarm).toBe(script.ALM.FAIL)
  })
})

// ----------------------------------------------------------
// * LIMP MODE OPERATION
// ----------------------------------------------------------

describe('Sensor Recovery: LIMP Mode Operation', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should cycle based on fixed schedule in LIMP mode', async () => {
    script = await setupSensorTest(runtime, {})

    // Test ON portion of cycle
    const onTime = (script.C.limp_onSec / 2) * 1000
    global.Shelly.getUptimeMs = () => onTime

    const limpOn = script.features.handleLimpMode()
    expect(limpOn.wantOn).toBe(true)
    expect(limpOn.status).toBe(script.ST.LIMP_COOL)

    // Test OFF portion of cycle
    const offTime = (script.C.limp_onSec + script.C.limp_offSec / 2) * 1000
    global.Shelly.getUptimeMs = () => offTime

    const limpOff = script.features.handleLimpMode()
    expect(limpOff.wantOn).toBe(false)
    expect(limpOff.status).toBe(script.ST.LIMP_IDLE)
  })

  it('should skip timing guards in LIMP mode', async () => {
    script = await setupSensorTest(runtime, {})

    script.S.sys_isRelayOn = false
    script.S.sys_relayOffTs = Date.now() / 1000 // Just turned off

    // Normal mode would block turn-on
    const resultNormal = script.control.executeSwitchDecision(true, Date.now() / 1000, 5, -10, false)
    expect(resultNormal.blocked).toBe(true)

    // LIMP mode bypasses guards
    const resultLimp = script.control.executeSwitchDecision(true, Date.now() / 1000, 0, 0, true)
    expect(resultLimp.blocked).toBe(false)
  })

  it('should provide appropriate detail message', async () => {
    script = await setupSensorTest(runtime, {})

    global.Shelly.getUptimeMs = () => 100 * 1000

    const limp = script.features.handleLimpMode()

    expect(limp.detail).toBeDefined()
    expect(limp.detail.length).toBeGreaterThan(0)
  })
})

// ----------------------------------------------------------
// * SENSOR RECOVERY
// ----------------------------------------------------------

describe('Sensor Recovery: Recovery Process', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should re-initialize buffer on recovery', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_airBuf = [0, 0, 0]
    script.V.sns_airSmoothDeg = 0
    script.V.sns_wasErr = true

    script.sensors.handleSensorRecovery(5.0)

    expect(script.V.sns_airBuf).toEqual([5.0, 5.0, 5.0])
    expect(script.V.sns_airSmoothDeg).toBe(5.0)
  })

  it('should clear wasError flag on recovery', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_wasErr = true

    script.sensors.handleSensorRecovery(5.0)

    expect(script.V.sns_wasErr).toBe(false)
  })

  it('should reset door reference on recovery', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.dor_refTs = 1000
    script.V.sns_wasErr = true

    script.sensors.handleSensorRecovery(5.0)

    expect(script.V.dor_refTs).toBe(0)
  })

  it('should reset error count on valid reading', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_errCnt = 5

    script.sensors.resetSensorError()

    expect(script.V.sns_errCnt).toBe(0)
  })

  it('should process sensor data normally after recovery', async () => {
    script = await setupSensorTest(runtime, {})

    // Recover
    script.sensors.handleSensorRecovery(5.0)
    script.sensors.resetSensorError()

    // Process new reading
    script.sensors.processSensorData(5.5)

    // Buffer and smoothed should update
    expect(script.V.sns_airBuf).toContain(5.5)
    expect(script.V.sns_airSmoothDeg).toBeCloseTo(5.0, 0) // EMA smooths gradually
  })
})

// ----------------------------------------------------------
// * FULL RECOVERY LIFECYCLE
// ----------------------------------------------------------

describe('Sensor Recovery: Full Lifecycle', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should complete full cycle: normal → failure → LIMP → recovery → normal', async () => {
    script = await setupSensorTest(runtime, {
      airTemp: 5.0,
      evapTemp: -8.0,
    })

    // PHASE 1: Normal operation
    script.V.sns_errCnt = 0
    script.V.sns_wasErr = false
    script.V.sys_alarm = script.ALM.NONE

    let mode = script.control.determineMode(5.0, -8.0)
    expect(mode.status).not.toMatch(/^LIMP_/)

    // PHASE 2: Sensor disconnects, errors accumulate
    runtime.disconnectSensor(script.C.sys_sensAirId)

    for (let i = 0; i < script.C.sys_sensFailLimit; i++) {
      script.sensors.handleSensorError()
    }

    expect(script.V.sns_errCnt).toBe(script.C.sys_sensFailLimit)

    // PHASE 3: Alarm triggers LIMP mode
    script.alarms.applySensorAlarms(true, false)
    expect(script.V.sys_alarm).toBe(script.ALM.FAIL)

    mode = script.control.determineMode(0, 0)
    expect(mode.status).toMatch(/^LIMP_/)

    // PHASE 4: Sensor reconnects
    runtime.setTemperature(script.C.sys_sensAirId, 5.0)

    // Simulate detection of valid reading
    script.V.sns_wasErr = true
    script.sensors.handleSensorRecovery(5.0)
    script.sensors.resetSensorError()

    expect(script.V.sns_errCnt).toBe(0)
    expect(script.V.sns_wasErr).toBe(false)

    // PHASE 5: Alarm cleared, back to normal
    script.alarms.clearNonFatalAlarms()
    expect(script.V.sys_alarm).toBe(script.ALM.NONE)

    mode = script.control.determineMode(5.0, -8.0)
    expect(mode.status).not.toMatch(/^LIMP_/)
  })

  it('should maintain correct state across multiple failure/recovery cycles', async () => {
    script = await setupSensorTest(runtime, {
      airTemp: 5.0,
      evapTemp: -8.0,
    })

    for (let cycle = 0; cycle < 3; cycle++) {
      // Fail
      for (let i = 0; i < script.C.sys_sensFailLimit; i++) {
        script.sensors.handleSensorError()
      }
      script.alarms.applySensorAlarms(true, false)
      expect(script.V.sys_alarm).toBe(script.ALM.FAIL)

      // Recover
      script.sensors.handleSensorRecovery(5.0 + cycle)
      script.sensors.resetSensorError()
      script.alarms.clearNonFatalAlarms()

      expect(script.V.sns_errCnt).toBe(0)
      expect(script.V.sys_alarm).toBe(script.ALM.NONE)
    }
  })
})

// ----------------------------------------------------------
// * EDGE CASES
// ----------------------------------------------------------

describe('Sensor Recovery: Edge Cases', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should handle intermittent sensor readings', async () => {
    script = await setupSensorTest(runtime, {})

    // Alternating good/bad readings
    script.V.sns_errCnt = 0

    script.sensors.handleSensorError() // Bad
    expect(script.V.sns_errCnt).toBe(1)

    script.sensors.resetSensorError() // Good
    expect(script.V.sns_errCnt).toBe(0)

    script.sensors.handleSensorError() // Bad
    expect(script.V.sns_errCnt).toBe(1)
  })

  it('should handle extreme temperature values in recovery', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_wasErr = true

    // Extreme cold
    script.sensors.handleSensorRecovery(-40.0)
    expect(script.V.sns_airSmoothDeg).toBe(-40.0)

    // Extreme hot
    script.sensors.handleSensorRecovery(85.0)
    expect(script.V.sns_airSmoothDeg).toBe(85.0)
  })

  it('should handle zero temperature correctly', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_wasErr = true

    script.sensors.handleSensorRecovery(0)

    expect(script.V.sns_airBuf).toEqual([0, 0, 0])
    expect(script.V.sns_airSmoothDeg).toBe(0)
  })

  it('should handle stuck detection at boundary of epsilon', async () => {
    script = await setupSensorTest(runtime, {})

    script.V.sns_airStuckRefDeg = 5.0
    script.V.sns_airStuckTs = 1000

    // Value below epsilon - should NOT reset (condition is > epsilon)
    const halfEpsilon = script.C.sens_stuckEpsDeg / 2
    const belowEpsilon = script.sensors.checkSensorStuck(
      5.0 + halfEpsilon,
      'sns_airStuckRefDeg',
      'sns_airStuckTs',
      2000,
    )

    // Below epsilon should NOT reset reference
    expect(script.V.sns_airStuckRefDeg).toBe(5.0)
  })
})
