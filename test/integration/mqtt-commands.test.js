// ==============================================================================
// MQTT COMMAND INTEGRATION TESTS
// Tests all MQTT command handling in setupMqttCommands().
// Validates turbo_on, turbo_off, status, reset_alarms commands.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShellyRuntime } from '../utils/shelly-simulator.js'

// ----------------------------------------------------------
// TEST SETUP
// ----------------------------------------------------------

async function setupMqttTest(runtime) {
  runtime.installGlobals(global)
  vi.resetModules()

  const constants = await import('../../src/constants.js')
  const config = await import('../../src/config.js')
  const state = await import('../../src/state.js')
  const mqtt = await import('../../src/mqtt.js')

  // Initialize config
  Object.assign(config.C, config.DEFAULT)

  // Setup MQTT command handler
  mqtt.setupMqttCommands()

  runtime.script = {
    constants,
    config,
    state,
    mqtt,
    S: state.S,
    V: state.V,
    C: config.C,
    DEFAULT: config.DEFAULT,
    ALM: constants.ALM,
  }

  return runtime.script
}

// ----------------------------------------------------------
// TURBO COMMAND
// ----------------------------------------------------------

describe('MQTT: Turbo Command', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    script = await setupMqttTest(runtime)
  })

  it('should activate turbo mode with valid command', () => {
    script.V.trb_isActive = false
    script.V.trb_remSec = 0
    script.C.trb_enable = true

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'turbo_on' }),
    )

    expect(script.V.trb_isActive).toBe(true)
    expect(script.V.trb_remSec).toBe(script.C.trb_maxTimeSec)

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Turbo ON'))).toBe(true)
  })

  it('should NOT activate turbo when trb_enable is false', () => {
    script.V.trb_isActive = false
    script.C.trb_enable = false // Disabled in config

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'turbo_on' }),
    )

    expect(script.V.trb_isActive).toBe(false)
  })
})

// ----------------------------------------------------------
// TURBO_OFF COMMAND
// ----------------------------------------------------------

describe('MQTT: Turbo Off Command', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    script = await setupMqttTest(runtime)
  })

  it('should deactivate turbo mode', () => {
    // Pre-activate turbo
    script.V.trb_isActive = true
    script.V.trb_remSec = 1000

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'turbo_off' }),
    )

    expect(script.V.trb_isActive).toBe(false)
    expect(script.V.trb_remSec).toBe(0)

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Turbo OFF'))).toBe(true)
  })

  it('should handle turbo_off when turbo already inactive', () => {
    script.V.trb_isActive = false

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'turbo_off' }),
    )

    // Should still work gracefully
    expect(script.V.trb_isActive).toBe(false)
    expect(script.V.trb_remSec).toBe(0)
  })
})

// ----------------------------------------------------------
// STATUS COMMAND
// ----------------------------------------------------------

describe('MQTT: Status Command', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    script = await setupMqttTest(runtime)
  })

  it('should acknowledge status request', () => {
    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'status' }),
    )

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Status requested'))).toBe(true)
  })
})

// ----------------------------------------------------------
// RESET_ALARMS COMMAND
// ----------------------------------------------------------

describe('MQTT: Reset Alarms Command', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    script = await setupMqttTest(runtime)
  })

  it('should reset non-fatal alarms', () => {
    script.V.sys_alarm = script.ALM.HIGH // Non-fatal alarm

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'reset_alarms' }),
    )

    expect(script.V.sys_alarm).toBe(script.ALM.NONE)

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Alarms reset'))).toBe(true)
  })

  it('should reset WELD alarm (fatal alarms clearable via MQTT)', () => {
    // Design decision: MQTT reset_alarms clears ALL alarms including fatal.
    // This allows remote recovery without physical device access.
    script.V.sys_alarm = script.ALM.WELD

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'reset_alarms' }),
    )

    expect(script.V.sys_alarm).toBe(script.ALM.NONE) // Cleared

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Alarms reset'))).toBe(true)
  })

  it('should reset LOCKED alarm (fatal alarms clearable via MQTT)', () => {
    // Design decision: MQTT reset_alarms clears ALL alarms including fatal.
    script.V.sys_alarm = script.ALM.LOCKED

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'reset_alarms' }),
    )

    expect(script.V.sys_alarm).toBe(script.ALM.NONE) // Cleared
  })

  it('should reset FAIL alarm (non-fatal)', () => {
    script.V.sys_alarm = script.ALM.FAIL

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'reset_alarms' }),
    )

    expect(script.V.sys_alarm).toBe(script.ALM.NONE)
  })

  it('should reset STUCK alarm (non-fatal)', () => {
    script.V.sys_alarm = script.ALM.STUCK

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'reset_alarms' }),
    )

    expect(script.V.sys_alarm).toBe(script.ALM.NONE)
  })

  it('should reset GHOST alarm (non-fatal)', () => {
    script.V.sys_alarm = script.ALM.GHOST

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'reset_alarms' }),
    )

    expect(script.V.sys_alarm).toBe(script.ALM.NONE)
  })

  it('should reset COOL alarm (non-fatal)', () => {
    script.V.sys_alarm = script.ALM.COOL

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'reset_alarms' }),
    )

    expect(script.V.sys_alarm).toBe(script.ALM.NONE)
  })
})

// ----------------------------------------------------------
// MESSAGE VALIDATION
// ----------------------------------------------------------

describe('MQTT: Message Validation', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    script = await setupMqttTest(runtime)
  })

  it('should reject empty message', () => {
    script.V.trb_isActive = false

    runtime.mqttReceive(script.DEFAULT.sys_mqttCmd, '')

    // Should not activate turbo (message rejected)
    expect(script.V.trb_isActive).toBe(false)

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Rejected size'))).toBe(true)
  })

  it('should reject null message', () => {
    script.V.trb_isActive = false

    runtime.mqttReceive(script.DEFAULT.sys_mqttCmd, null)

    expect(script.V.trb_isActive).toBe(false)
  })

  it('should reject oversized message (> 256 bytes)', () => {
    const longMessage = 'x'.repeat(300)

    runtime.mqttReceive(script.DEFAULT.sys_mqttCmd, longMessage)

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Rejected size'))).toBe(true)
  })

  it('should reject invalid JSON', () => {
    runtime.mqttReceive(script.DEFAULT.sys_mqttCmd, 'not valid json {')

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Parse failed'))).toBe(true)
  })

  it('should reject non-object JSON', () => {
    runtime.mqttReceive(script.DEFAULT.sys_mqttCmd, '"just a string"')

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Invalid structure'))).toBe(true)
  })

  it('should reject object without cmd field', () => {
    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ action: 'turbo' }),
    )

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Invalid structure'))).toBe(true)
  })

  it('should reject object with non-string cmd', () => {
    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 123 }),
    )

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Invalid structure'))).toBe(true)
  })

  it('should reject unknown command', () => {
    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'reboot' }),
    )

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Unknown cmd'))).toBe(true)
  })
})

// ----------------------------------------------------------
// COMMAND EDGE CASES
// ----------------------------------------------------------

describe('MQTT: Command Edge Cases', () => {
  let runtime
  let script

  beforeEach(async () => {
    vi.resetModules()
    runtime = new ShellyRuntime()
    script = await setupMqttTest(runtime)
  })

  it('should handle command with extra fields gracefully', () => {
    script.C.trb_enable = true
    script.V.trb_isActive = false

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({
        cmd: 'turbo_on',
        duration: 3600, // Extra field (ignored)
        source: 'app',  // Extra field (ignored)
      }),
    )

    expect(script.V.trb_isActive).toBe(true)
  })

  it('should be case-sensitive for commands', () => {
    script.C.trb_enable = true
    script.V.trb_isActive = false

    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'TURBO' }), // Uppercase
    )

    // Should reject as unknown command
    expect(script.V.trb_isActive).toBe(false)

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Unknown cmd'))).toBe(true)
  })

  it('should rate limit rapid commands (second command ignored)', () => {
    script.C.trb_enable = true
    script.V.trb_isActive = false

    // Send turbo, then turbo_off rapidly - second should be rate limited
    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'turbo_on' }),
    )
    runtime.mqttReceive(
      script.DEFAULT.sys_mqttCmd,
      JSON.stringify({ cmd: 'turbo_off' }),
    )

    // First command (turbo) executes, second (turbo_off) is rate limited
    expect(script.V.trb_isActive).toBe(true)
    expect(script.V.trb_remSec).toBe(script.C.trb_maxTimeSec)

    const prints = runtime.getPrintHistory()
    expect(prints.some((p) => p.message.includes('Rate limited'))).toBe(true)
  })
})
