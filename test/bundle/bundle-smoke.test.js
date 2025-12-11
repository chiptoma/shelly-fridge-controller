// ==============================================================================
// * BUNDLE SMOKE TESTS
// ? Executes the minified bundle in a VM to verify it runs correctly.
// ? Catches runtime errors that static analysis can't detect.
// ==============================================================================

import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import vm from 'vm'

// ----------------------------------------------------------
// * SETUP
// ----------------------------------------------------------

const BUNDLE_PATH = join(process.cwd(), 'dist', 'main.js')
let bundleCode = ''

beforeAll(() => {
  if (!existsSync(BUNDLE_PATH)) {
    throw new Error('Bundle not found. Run "npm run build" first.')
  }
  bundleCode = readFileSync(BUNDLE_PATH, 'utf-8')
})

/**
 * Creates a Shelly-like VM context for executing the bundle
 *
 * ? Key behavior: Timer.set(0, false, cb) callbacks are auto-executed
 * ? to simulate Shelly's async deferral pattern used in KVS operations.
 */
function createShellyContext(overrides = {}) {
  const printLog = []
  const shellyCallLog = []
  const mqttPublishLog = []
  const timerCallbacks = []
  const pendingImmediateCallbacks = []
  let timerId = 1

  const context = {
    // Shelly API mock
    Shelly: {
      call: vi.fn((method, params, callback) => {
        shellyCallLog.push({ method, params })
        // Simulate async callback
        if (callback) {
          if (method === 'Temperature.GetStatus') {
            const temp = params.id === 101 ? 5.0 : -10.0
            callback({ tC: temp }, 0, '')
          } else if (method === 'Switch.GetStatus') {
            callback({ output: false, apower: 0, temperature: { tC: 25 } }, 0, '')
          } else if (method === 'KVS.Get') {
            callback({ value: '{}' }, 0, '')
          } else {
            callback({}, 0, '')
          }
        }
      }),
      getComponentStatus: vi.fn((type, id) => {
        if (type === 'Switch') return { output: false, apower: 0, temperature: { tC: 25 } }
        if (type === 'Input') return { state: false }
        if (type === 'Temperature') return { tC: id === 101 ? 5.0 : -10.0 }
        return {}
      }),
      getUptimeMs: vi.fn(() => 10000),
      emitEvent: vi.fn(),
    },

    // Timer API mock
    // ? Timer.set(0, false, cb) = immediate deferral (breaks call stack)
    // ? Timer.set(delay, true, cb) = repeating timer (main loop)
    Timer: {
      set: vi.fn((delayMs, repeat, callback) => {
        const id = timerId++

        // ? Store repeating timers for manual invocation
        if (repeat) {
          timerCallbacks.push({ id, delayMs, repeat, callback })
        } else if (delayMs === 0) {
          // ? Queue immediate deferrals to execute after current call stack
          pendingImmediateCallbacks.push(callback)
        } else {
          // ? Non-repeating delayed timers stored but not auto-executed
          timerCallbacks.push({ id, delayMs, repeat, callback })
        }

        return id
      }),
      clear: vi.fn(),
    },

    // MQTT API mock
    MQTT: {
      publish: vi.fn((topic, payload) => {
        mqttPublishLog.push({ topic, payload })
      }),
      subscribe: vi.fn(),
    },

    // Console mock
    print: vi.fn((msg) => {
      printLog.push(msg)
    }),

    // Standard globals
    Date: global.Date,
    Math: global.Math,
    JSON: global.JSON,
    Object: global.Object,
    Array: global.Array,
    String: global.String,
    Number: global.Number,
    Boolean: global.Boolean,
    parseInt: global.parseInt,
    parseFloat: global.parseFloat,
    isNaN: global.isNaN,
    isFinite: global.isFinite,

    // Test inspection
    __test__: {
      printLog,
      shellyCallLog,
      mqttPublishLog,
      timerCallbacks,
      pendingImmediateCallbacks,
    },

    ...overrides,
  }

  return vm.createContext(context)
}

/**
 * Drains all pending immediate callbacks (Timer.set(0, false, cb))
 *
 * ? These callbacks form async chains (KVS operations → config load → state load → loop start).
 * ? Must be called after bundle execution to complete the initialization sequence.
 *
 * @param {object} context - VM context with __test__.pendingImmediateCallbacks
 * @param {number} maxIterations - Safety limit to prevent infinite loops
 */
function drainImmediateTimers(context, maxIterations = 100) {
  const pending = context.__test__.pendingImmediateCallbacks
  const timers = context.__test__.timerCallbacks
  let iterations = 0

  // ? Process callbacks until queue is empty
  // ? Each callback may queue more immediate callbacks (async chains)
  while ((pending.length > 0 || hasDelayedTimers(timers)) && iterations < maxIterations) {
    // First drain immediate callbacks
    while (pending.length > 0 && iterations < maxIterations) {
      const cb = pending.shift()
      cb()
      iterations++
    }

    // Then execute one delayed non-repeating timer (staged boot)
    const delayedIdx = timers.findIndex((t) => !t.repeat && !t.executed)
    if (delayedIdx >= 0) {
      timers[delayedIdx].executed = true
      timers[delayedIdx].callback()
      iterations++
    }
  }

  return iterations
}

/**
 * Check if there are pending delayed (non-repeating) timers
 */
function hasDelayedTimers(timers) {
  return timers.some((t) => !t.repeat && !t.executed)
}

// ----------------------------------------------------------
// * EXECUTION TESTS
// ----------------------------------------------------------

describe('Bundle Execution: Basic', () => {
  it('should execute without throwing errors', () => {
    const context = createShellyContext()

    expect(() => {
      vm.runInContext(bundleCode, context, { timeout: 5000 })
    }).not.toThrow()
  })

  it('should call print during initialization', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })

    const printLog = context.__test__.printLog
    expect(printLog.length).toBeGreaterThan(0)
  })

  it('should register a main loop timer', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })

    // ? Drain async init chain: KVS → config → state → startMainLoop
    drainImmediateTimers(context)

    const timerCallbacks = context.__test__.timerCallbacks
    expect(timerCallbacks.length).toBeGreaterThan(0)

    // Main loop timer should be repeating
    const mainLoopTimer = timerCallbacks.find((t) => t.repeat === true)
    expect(mainLoopTimer).toBeDefined()
  })

  it('should load KVS config', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })

    // ? Drain timers to complete boot sequence (including initial GC pause timer)
    drainImmediateTimers(context)

    const shellyCallLog = context.__test__.shellyCallLog
    const kvsCall = shellyCallLog.find((c) => c.method === 'KVS.Get')
    expect(kvsCall).toBeDefined()
  })
})

// ----------------------------------------------------------
// * OUTPUT TESTS
// ----------------------------------------------------------

describe('Bundle Output: Boot Messages', () => {
  it('should print boot message with version', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })

    // ? Drain to complete full boot sequence
    drainImmediateTimers(context)

    const printLog = context.__test__.printLog
    const bootMsg = printLog.find((msg) => msg.includes('BOOT') || msg.includes('🔄'))
    expect(bootMsg).toBeDefined()
  })

  it('should not print error messages on clean boot', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })

    // ? Drain to complete full boot sequence
    drainImmediateTimers(context)

    const printLog = context.__test__.printLog
    const errorMsg = printLog.find((msg) =>
      msg.includes('ERROR') || msg.includes('FATAL') || msg.includes('undefined'),
    )
    expect(errorMsg).toBeUndefined()
  })
})

// ----------------------------------------------------------
// * STATUS ICON LOOKUP TESTS
// ? Verifies the specific bug we fixed (ST.IDLE → t collision)
// ----------------------------------------------------------

describe('Bundle Execution: Status Icon Lookup', () => {
  it('should produce valid status output (not "? undefined")', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })

    // ? Drain to complete full boot sequence
    drainImmediateTimers(context)

    const printLog = context.__test__.printLog

    // Look for status lines
    const statusLines = printLog.filter(
      (msg) => msg.includes('IDLE') || msg.includes('COOLING') || msg.includes('⚪') || msg.includes('❄️'),
    )

    // Should not have "?" followed by numbers (broken icon lookup)
    const brokenOutput = printLog.find((msg) => /\? \d+\.\d+/.test(msg))
    expect(brokenOutput).toBeUndefined()
  })

  it('should maintain valid output across multiple loop ticks', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })
    drainImmediateTimers(context)

    const timerCallbacks = context.__test__.timerCallbacks
    const mainLoopTimer = timerCallbacks.find((t) => t.repeat === true)

    // ? Run 10 loop iterations to catch issues that accumulate
    // ? (e.g., state corruption, memory leaks in minified code)
    for (let i = 0; i < 10; i++) {
      expect(() => mainLoopTimer.callback()).not.toThrow()
      drainImmediateTimers(context) // Process any deferred callbacks
    }

    // ? Check no corruption occurred during multi-tick execution
    const printLog = context.__test__.printLog
    const brokenOutput = printLog.find((msg) => /\? \d+\.\d+/.test(msg))
    expect(brokenOutput).toBeUndefined()

    // ? Verify no undefined or NaN values leaked into output
    const corruptedOutput = printLog.find((msg) =>
      msg.includes('undefined') || msg.includes('NaN'),
    )
    expect(corruptedOutput).toBeUndefined()
  })
})

// ----------------------------------------------------------
// * TIMER CALLBACK TESTS
// ----------------------------------------------------------

describe('Bundle Execution: Timer Callbacks', () => {
  it('should execute main loop callback without errors', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })

    // ? Drain async init chain to reach startMainLoop
    drainImmediateTimers(context)

    const timerCallbacks = context.__test__.timerCallbacks
    const mainLoopTimer = timerCallbacks.find((t) => t.repeat === true)

    expect(mainLoopTimer).toBeDefined()

    // Execute the callback
    expect(() => {
      mainLoopTimer.callback()
    }).not.toThrow()
  })

  it('should produce output after loop tick', () => {
    const context = createShellyContext()
    vm.runInContext(bundleCode, context, { timeout: 5000 })

    // ? Drain async init chain to reach startMainLoop
    drainImmediateTimers(context)

    const printLogBefore = [...context.__test__.printLog]

    const timerCallbacks = context.__test__.timerCallbacks
    const mainLoopTimer = timerCallbacks.find((t) => t.repeat === true)

    if (mainLoopTimer) {
      mainLoopTimer.callback()
    }

    const printLogAfter = context.__test__.printLog
    expect(printLogAfter.length).toBeGreaterThan(printLogBefore.length)
  })
})
