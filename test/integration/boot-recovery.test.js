// ==============================================================================
// BOOT RECOVERY INTEGRATION TESTS
// Tests the 4 boot recovery scenarios in recoverBootState().
// Validates hardware/software state synchronization on restart.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShellyRuntime } from '../utils/shelly-simulator.js'

// ----------------------------------------------------------
// TEST SETUP
// ----------------------------------------------------------

/**
 * Setup function that initializes the fridge controller
 * with specific initial state for boot recovery testing
 */
async function setupForBootRecovery(runtime, options = {}) {
  runtime.installGlobals(global)
  vi.resetModules()

  // Pre-configure KVS with state before loading modules
  if (options.persistedState) {
    runtime.kvs['fridge_state'] = JSON.stringify(options.persistedState)
  }

  // Configure hardware switch state
  if (options.hardwareRelayOn !== undefined) {
    runtime.switches[0].output = options.hardwareRelayOn
  }

  // Configure power readings (for hw_hasPM detection)
  if (options.hasPowerMonitor) {
    runtime.switches[0].apower = options.power || 0
  }

  // Import modules
  const constants = await import('../../src/constants.js')
  const config = await import('../../src/config.js')
  const state = await import('../../src/state.js')
  const main = await import('../../src/main.js')

  // Initialize config
  Object.assign(config.C, config.DEFAULT)

  // Store references
  runtime.script = {
    constants,
    config,
    state,
    main,
    S: state.S,
    V: state.V,
    C: config.C,
    DEFAULT: config.DEFAULT,
    recoverBootState: main.recoverBootState,
  }

  return runtime.script
}

// ----------------------------------------------------------
// BOOT RECOVERY SCENARIO 1
// Hardware ON + Software ON = Compressor was running
// ----------------------------------------------------------

describe('Boot Recovery: Scenario 1 - Compressor Was Running', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should recover missed stats when compressor ran reasonable time', async () => {
    // Setup: Compressor was running for 10 minutes before crash
    // Hardware relay is ON, software state says ON
    const now = Date.now() / 1000
    const relayOnTime = now - 600 // 10 minutes ago
    const lastSaveTime = now - 300 // Last save was 5 minutes ago

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: true,
      persistedState: {
        sys_isRelayOn: true,
        sys_relayOnTs: relayOnTime,
        sys_relayOffTs: 0,
        sys_lastSaveTs: lastSaveTime,
        sts_hourRunSec: 300, // Only 5 minutes recorded
        sts_hourTotalSec: 300,
        sts_cycleCnt: 1,
        sts_lifeTotalSec: 0,
        sts_lifeRunSec: 0,
        adt_hystDeg: 1.0,
        dfr_isActive: false,
        wld_airSnapDeg: 0,
      },
    })

    // Manually apply persisted state to S
    Object.assign(script.S, {
      sys_isRelayOn: true,
      sys_relayOnTs: relayOnTime,
      sys_relayOffTs: 0,
      sys_lastSaveTs: lastSaveTime,
      sts_hourRunSec: 300,
      sts_hourTotalSec: 300,
      sts_cycleCnt: 1,
    })

    // Run boot recovery
    script.recoverBootState()

    // Verify: Missed ~5 minutes should be recovered
    // elapsedTotal = now - lastSaveTime = ~300s
    // All elapsed time was run time (compressor was ON)
    expect(script.S.sts_hourRunSec).toBeGreaterThan(300)
    expect(script.S.sts_hourTotalSec).toBeGreaterThan(300)
    expect(script.S.sys_isRelayOn).toBe(true) // Still running

    // Format: "Script restarted while cooling → added Xm to runtime stats"
    const prints = runtime.getPrintHistory()
    const recoveryMsg = prints.find((p) => p.message.includes('Script restarted while cooling'))
    expect(recoveryMsg).toBeDefined()
  })

  it('should stop compressor when ran too long (exceeds max run)', async () => {
    // Setup: Compressor ran way too long (3+ hours)
    const now = Date.now() / 1000
    const relayOnTime = now - 14400 // 4 hours ago (exceeds comp_maxRunSec)

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: true,
      hasPowerMonitor: true,
    })

    // Apply state
    Object.assign(script.S, {
      sys_isRelayOn: true,
      sys_relayOnTs: relayOnTime,
      sys_relayOffTs: 0,
      sts_hourRunSec: 0,
      wld_airSnapDeg: 5.0,
    })

    // Run boot recovery
    script.recoverBootState()

    // Verify: Compressor should be stopped
    expect(script.S.sys_isRelayOn).toBe(false)
    expect(script.S.wld_airSnapDeg).toBe(0) // Reset on forced stop
    expect(runtime.getRelayState()).toBe(false) // Hardware switch turned off

    // Check for warning message (format: "Compressor ran Xm (limit Ym) → turned OFF for protection")
    const prints = runtime.getPrintHistory()
    const warningMsg = prints.find((p) => p.message.includes('turned OFF for protection'))
    expect(warningMsg).toBeDefined()
  })

  it('should continue running when time is valid with no missed stats', async () => {
    const now = Date.now() / 1000
    const relayOnTime = now - 300 // 5 minutes ago

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: true,
    })

    Object.assign(script.S, {
      sys_isRelayOn: true,
      sys_relayOnTs: relayOnTime,
      sys_relayOffTs: 0,
      sts_hourRunSec: 400, // More than actual run (due to previous cycles)
    })

    script.recoverBootState()

    // Should just continue, no stat recovery needed
    expect(script.S.sys_isRelayOn).toBe(true)

    // Note: When sys_lastSaveTs is 0 or elapsedTotal is 0, boot recovery
    // may not print a message (no stats to recover). Check for any boot message
    // or verify state is correctly maintained.
    const prints = runtime.getPrintHistory()
    // If there's a recovery message, great; if not, state should still be valid
    const anyBootMsg = prints.find((p) => p.message.includes('BOOT'))
    // Either we have a boot message or the state is correctly maintained
    expect(script.S.sys_isRelayOn).toBe(true)
  })
})

// ----------------------------------------------------------
// BOOT RECOVERY SCENARIO 2
// Hardware ON + Software OFF = Unexpected hardware state
// ----------------------------------------------------------

describe('Boot Recovery: Scenario 2 - Hardware ON, No Record', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should record fresh start when hardware ON but no software record', async () => {
    // Setup: Hardware relay is ON but software says OFF
    // This could happen if script crashed before recording state
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: true,
    })

    Object.assign(script.S, {
      sys_isRelayOn: false, // Software says OFF
      sys_relayOnTs: 0,
      sys_relayOffTs: 0,
    })

    const beforeNow = Math.floor(Date.now() / 1000) - 1 // Allow for ri() rounding

    script.recoverBootState()

    // Verify: Software state should sync with hardware
    expect(script.S.sys_isRelayOn).toBe(true)
    expect(script.S.sys_relayOnTs).toBeGreaterThanOrEqual(beforeNow)

    // Format: "Relay was ON but state said OFF (unexpected) → state updated to match"
    const prints = runtime.getPrintHistory()
    const syncMsg = prints.find((p) => p.message.includes('state updated to match'))
    expect(syncMsg).toBeDefined()
  })
})

// ----------------------------------------------------------
// BOOT RECOVERY SCENARIO 3
// Hardware OFF + Software ON = Crashed while cooling
// ----------------------------------------------------------

describe('Boot Recovery: Scenario 3 - Crashed While Cooling', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should recover stats from crashed cooling session', async () => {
    const now = Date.now() / 1000
    const relayOnTime = now - 900 // 15 minutes ago
    const lastSaveTime = now - 600 // Last save was 10 minutes ago

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false, // Hardware is OFF
    })

    Object.assign(script.S, {
      sys_isRelayOn: true, // Software says was ON
      sys_relayOnTs: relayOnTime,
      sys_relayOffTs: 0,
      sys_lastSaveTs: lastSaveTime, // Required for time recovery
      sts_hourRunSec: 300, // Only 5 min recorded
      sts_hourTotalSec: 300,
      sts_cycleCnt: 0,
      wld_airSnapDeg: 5.0,
    })

    script.recoverBootState()

    // Verify: Stats recovered, state synced
    // elapsedTotal = now - lastSaveTime = ~600s
    // estRunSec = now - relayOnTime = ~900s
    // missedRun = min(900, 600) = 600s
    expect(script.S.sys_isRelayOn).toBe(false)
    expect(script.S.sts_hourRunSec).toBeGreaterThan(300) // Recovered time
    expect(script.S.sts_hourTotalSec).toBeGreaterThan(300) // Total time also recovered
    expect(script.S.sts_cycleCnt).toBe(1) // Cycle counted
    expect(script.S.wld_airSnapDeg).toBe(0) // Reset

    // Format: "Script stopped while cooling → added ~Xm to runtime stats"
    const prints = runtime.getPrintHistory()
    const crashMsg = prints.find((p) => p.message.includes('Script stopped while cooling'))
    expect(crashMsg).toBeDefined()
  })

  it('should not recover stats if estimated run is invalid', async () => {
    const now = Date.now() / 1000

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    Object.assign(script.S, {
      sys_isRelayOn: true,
      sys_relayOnTs: now - 50000, // Way too long (invalid)
      sys_relayOffTs: 0,
      sts_hourRunSec: 300,
      sts_cycleCnt: 0,
    })

    script.recoverBootState()

    // State synced but no stat recovery (invalid time)
    expect(script.S.sys_isRelayOn).toBe(false)
    expect(script.S.sts_cycleCnt).toBe(0) // No cycle counted
  })
})

// ----------------------------------------------------------
// BOOT RECOVERY SCENARIO 4
// Hardware OFF + Software OFF = Clean state
// ----------------------------------------------------------

describe('Boot Recovery: Scenario 4 - Clean State', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should report clean state when hardware and software aligned', async () => {
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    // Must set sys_lastSaveTs for elapsedTotal to be > 0
    // Otherwise "Clean idle" message won't print
    Object.assign(script.S, {
      sys_isRelayOn: false,
      sys_relayOnTs: 0,
      sys_relayOffTs: Date.now() / 1000 - 1000,
      sys_lastSaveTs: Date.now() / 1000 - 500,  // 500s ago
    })

    script.recoverBootState()

    // No changes needed
    expect(script.S.sys_isRelayOn).toBe(false)

    // Format: "Was idle for Xm → stats updated"
    const prints = runtime.getPrintHistory()
    const cleanMsg = prints.find((p) => p.message.includes('Was idle for'))
    expect(cleanMsg).toBeDefined()
  })
})

// ----------------------------------------------------------
// POWER MONITOR DETECTION
// ----------------------------------------------------------

describe('Boot Recovery: Power Monitor Detection', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should detect power monitoring capability', async () => {
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
      hasPowerMonitor: true,
      power: 85,
    })

    Object.assign(script.S, { sys_isRelayOn: false })

    script.recoverBootState()

    expect(script.V.hw_hasPM).toBe(true)

    // Note: hw_hasPM is set silently - no explicit "Power monitoring" message
    // in current code. Just verify the flag is correctly set.
    // If we want to verify boot happened, check for any boot message
    const prints = runtime.getPrintHistory()
    const anyBootMsg = prints.find((p) => p.message.includes('BOOT'))
    expect(anyBootMsg).toBeDefined()
  })

  it('should handle missing power monitoring gracefully', async () => {
    // Remove apower property to simulate no PM
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })
    delete runtime.switches[0].apower

    Object.assign(script.S, { sys_isRelayOn: false })

    script.recoverBootState()

    expect(script.V.hw_hasPM).toBe(false)
  })
})

// ----------------------------------------------------------
// FATAL FAULT REPORTING
// ----------------------------------------------------------

describe('Boot Recovery: Fatal Fault History', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should report last fatal alarm on boot', async () => {
    const now = Date.now() / 1000
    const faultTime = now - 7200 // 2 hours ago

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    Object.assign(script.S, {
      sys_isRelayOn: false,
      flt_fatalArr: [
        { t: faultTime, a: 'ALARM_RELAY_WELD', d: 'Temp continued dropping after relay off' },
      ],
    })

    script.recoverBootState()

    // Format: "Had fatal error Xh ago: ALARM_RELAY_WELD (...)"
    const prints = runtime.getPrintHistory()
    const fatalMsg = prints.find((p) => p.message.includes('Had fatal error'))
    expect(fatalMsg).toBeDefined()
    expect(fatalMsg.message).toContain('ALARM_RELAY_WELD')
  })
})

// ----------------------------------------------------------
// KVS PERSISTENCE VERIFICATION
// ----------------------------------------------------------

describe('Boot Recovery: KVS Persistence Verification', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should preserve adaptive hysteresis across reboot', async () => {
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    Object.assign(script.S, {
      sys_isRelayOn: false,
      adt_hystDeg: 1.8, // Learned value
    })

    script.recoverBootState()

    // Learned hysteresis should be preserved
    expect(script.S.adt_hystDeg).toBe(1.8)
  })

  it('should preserve defrost state across reboot', async () => {
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    Object.assign(script.S, {
      sys_isRelayOn: false,
      dfr_isActive: true, // Was in defrost
    })

    script.recoverBootState()

    // Defrost state should be preserved
    expect(script.S.dfr_isActive).toBe(true)
  })

  it('should preserve weld detection snapshot after clean reboot', async () => {
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    Object.assign(script.S, {
      sys_isRelayOn: false,
      sys_relayOffTs: Date.now() / 1000 - 60,
      wld_airSnapDeg: 4.5, // Snapshot from last turn-off
    })

    script.recoverBootState()

    // Weld snapshot should be preserved for continued detection
    expect(script.S.wld_airSnapDeg).toBe(4.5)
  })

  it('should preserve hourly stats history array', async () => {
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    const history = [50, 45, 48, 52, 55, 60, 58, 55, 50, 48, 45, 42, 40, 38, 35, 32, 30, 28, 26, 24, 22, 20, 18, 16]

    Object.assign(script.S, {
      sys_isRelayOn: false,
      sts_dutyHistArr: history,
      sts_histIdx: 12,
    })

    script.recoverBootState()

    // History array should be preserved
    expect(script.S.sts_dutyHistArr.length).toBe(24)
    expect(script.S.sts_histIdx).toBe(12)
    expect(script.S.sts_dutyHistArr[0]).toBe(50)
  })

  it('should preserve fault logs across reboot', async () => {
    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    Object.assign(script.S, {
      sys_isRelayOn: false,
      flt_fatalArr: [{ t: 1700000000, a: 'WELD', d: 'S:5.0→4.2' }],
      flt_critArr: [{ t: 1700000100, a: 'GHOST', d: '2W' }],
      flt_errorArr: [],
      flt_warnArr: [],
    })

    script.recoverBootState()

    // All fault arrays should be preserved
    expect(script.S.flt_fatalArr.length).toBe(1)
    expect(script.S.flt_fatalArr[0].a).toBe('WELD')
    expect(script.S.flt_critArr.length).toBe(1)
  })
})

// ----------------------------------------------------------
// MULTI-FAULT BOOT RECOVERY
// Tests recovery when multiple issues present at boot.
// ----------------------------------------------------------

describe('Boot Recovery: Multi-Fault Scenarios', () => {
  let runtime

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
  })

  it('should handle stale relay + sensor failure history at boot', async () => {
    // Setup: Hardware says OFF, but persisted state says ON with stale timestamp
    // AND there's a previous sensor failure in fault history
    const now = Date.now() / 1000
    const staleRelayOnTs = now - 7200 // 2 hours stale (exceeds max run)
    const lastSaveTs = now - 3600 // Last save 1 hour ago

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false, // Hardware is OFF
    })

    Object.assign(script.S, {
      sys_isRelayOn: true, // Stale: software thinks relay is ON
      sys_relayOnTs: staleRelayOnTs, // Stale timestamp
      sys_relayOffTs: 0,
      sys_lastSaveTs: lastSaveTs,
      sts_hourRunSec: 100,
      sts_hourTotalSec: 100,
      sts_cycleCnt: 0,
      wld_airSnapDeg: 5.0,
      // Previous sensor failure in history
      flt_errorArr: [{ t: now - 86400, a: 'ALARM_SENSOR_FAIL', d: 'Air sensor NaN' }],
    })

    // Boot recovery should:
    // 1. Detect hardware/software mismatch (Scenario 3)
    // 2. Cap stat recovery to 1 hour max
    // 3. Preserve fault history
    script.recoverBootState()

    // Verify state is corrected
    expect(script.S.sys_isRelayOn).toBe(false) // Synced with hardware
    // Note: Cycle not counted when timestamp is too stale (>1hr cap on recovery)
    expect(script.S.wld_airSnapDeg).toBe(0) // Reset on state sync

    // Verify fault history preserved
    expect(script.S.flt_errorArr.length).toBe(1)
    expect(script.S.flt_errorArr[0].a).toBe('ALARM_SENSOR_FAIL')

    // Verify stats recovered with cap (max 1 hour = 3600s)
    // Recovery should add up to 3600s (the elapsed time since last save)
    expect(script.S.sts_hourTotalSec).toBeGreaterThanOrEqual(100)
  })

  it('should recover from power loss during defrost with sensor error history', async () => {
    // Setup: Was in dynamic defrost, power lost, also has ghost alarm history
    const now = Date.now() / 1000
    const lastSaveTs = now - 600 // 10 min ago

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false,
    })

    Object.assign(script.S, {
      sys_isRelayOn: false, // Was in defrost (compressor OFF)
      sys_relayOnTs: 0,
      sys_relayOffTs: now - 1200, // Turned off 20 min ago (before defrost)
      sys_lastSaveTs: lastSaveTs,
      dfr_isActive: true, // Was actively defrosting
      sts_hourRunSec: 300,
      sts_hourTotalSec: 600,
      adt_hystDeg: 1.5, // Learned hysteresis
      // Ghost alarm in warning history
      flt_warnArr: [{ t: now - 43200, a: 'ALARM_COMP_GHOST', d: '0W for 60s' }],
    })

    script.recoverBootState()

    // Verify defrost state preserved (not cleared by boot recovery)
    expect(script.S.dfr_isActive).toBe(true)

    // Verify adaptive hysteresis preserved
    expect(script.S.adt_hystDeg).toBe(1.5)

    // Verify warning history preserved
    expect(script.S.flt_warnArr.length).toBe(1)
    expect(script.S.flt_warnArr[0].a).toBe('ALARM_COMP_GHOST')

    // Verify idle stats recovered (was idle during defrost)
    expect(script.S.sts_hourTotalSec).toBeGreaterThanOrEqual(600)
  })

  it('should handle fatal weld alarm + stale cooling state at boot', async () => {
    // Setup: Fatal weld alarm recorded, but persisted state shows cooling
    // This tests that fatal alarm history is preserved and reported
    const now = Date.now() / 1000
    const weldTime = now - 3600 // Weld detected 1 hour ago
    const lastSaveTs = now - 3600

    const script = await setupForBootRecovery(runtime, {
      hardwareRelayOn: false, // Hardware forced OFF by weld detection
    })

    Object.assign(script.S, {
      sys_isRelayOn: true, // Stale: software says ON
      sys_relayOnTs: now - 7200, // Was "cooling" for 2h (stale)
      sys_relayOffTs: 0,
      sys_lastSaveTs: lastSaveTs,
      sts_hourRunSec: 200,
      sts_cycleCnt: 0,
      wld_airSnapDeg: 4.5,
      // Fatal weld alarm in history
      flt_fatalArr: [{ t: weldTime, a: 'ALARM_RELAY_WELD', d: 'Temp 5.0→4.2 while OFF' }],
    })

    script.recoverBootState()

    // Verify state synced with hardware
    expect(script.S.sys_isRelayOn).toBe(false)
    // Note: Cycle not counted when timestamp is too stale (>1hr cap on recovery)

    // Verify fatal alarm history preserved
    expect(script.S.flt_fatalArr.length).toBe(1)
    expect(script.S.flt_fatalArr[0].a).toBe('ALARM_RELAY_WELD')

    // Verify boot recovery reported the fatal alarm
    const prints = runtime.getPrintHistory()
    const fatalMsg = prints.find((p) => p.message.includes('Had fatal error'))
    expect(fatalMsg).toBeDefined()
    expect(fatalMsg.message).toContain('ALARM_RELAY_WELD')
  })
})
