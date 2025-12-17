// ==============================================================================
// * MQTT TESTS
// ? Validates MQTT command handling.
// ? Current mqtt.js only exports setupMqttCommands - handles turbo_on, turbo_off,
// ? status, reset_alarms, and setpoint commands.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('MQTT Commands', () => {
  let setupMqttCommands
  let mockV, mockC, mockALM, mockMqttSubscribe, mockPersistConfig, mockValidateConfig

  beforeEach(async () => {
    vi.resetModules()

    mockALM = {
      NONE: 'NONE',
      WELD: 'ALARM_RELAY_WELD',
      LOCKED: 'ALARM_ROTOR_LOCKED',
    }

    mockV = {
      sys_alarm: 'NONE',
      trb_isActive: false,
      trb_remSec: 0,
    }

    mockC = {
      sys_mqttCmd: 'fridge/cmd',
      turbo_enable: true,
      turbo_maxTimeSec: 3600,
      ctrl_targetDeg: 4.0,
      ctrl_hystDeg: 1.0,
    }

    mockPersistConfig = vi.fn()
    mockValidateConfig = vi.fn().mockReturnValue([])

    mockMqttSubscribe = vi.fn()
    global.MQTT = { subscribe: mockMqttSubscribe }
    global.print = vi.fn()
    global.Shelly = { getUptimeMs: vi.fn().mockReturnValue(10000) }

    vi.doMock('./constants.js', () => ({ ALM: mockALM }))
    vi.doMock('./config.js', () => ({
      DEFAULT: { sys_mqttCmd: 'fridge/cmd' },
      C: mockC,
      persistConfig: mockPersistConfig,
      validateConfig: mockValidateConfig,
    }))
    vi.doMock('./state.js', () => ({
      V: mockV,
    }))

    const module = await import('./mqtt.js')
    setupMqttCommands = module.setupMqttCommands
  })

  // ----------------------------------------------------------
  // * setupMqttCommands TESTS
  // ----------------------------------------------------------

  describe('setupMqttCommands', () => {
    it('should subscribe to command topic', () => {
      setupMqttCommands()
      expect(mockMqttSubscribe).toHaveBeenCalledWith('fridge/cmd', expect.any(Function))
    })

    it('should handle turbo_on command', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'turbo_on' }))

      expect(mockV.trb_isActive).toBe(true)
      expect(mockV.trb_remSec).toBe(3600)
    })

    it('should handle turbo_off command', () => {
      mockV.trb_isActive = true
      mockV.trb_remSec = 1000
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'turbo_off' }))

      expect(mockV.trb_isActive).toBe(false)
      expect(mockV.trb_remSec).toBe(0)
    })

    it('should reject large messages', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', 'x'.repeat(300))

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Rejected size'))
    })

    it('should reject invalid JSON', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', 'not json')

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Parse failed'))
    })

    it('should reject unknown commands', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'unknown' }))

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Unknown cmd'))
    })

    it('should handle reset_alarms for non-fatal alarms', () => {
      mockV.sys_alarm = 'ALARM_HIGH_TEMP'
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'reset_alarms' }))

      expect(mockV.sys_alarm).toBe('NONE')
    })

    // ? Design decision: MQTT reset_alarms clears ALL alarms including fatal.
    // ? This allows remote recovery without physical device access.
    it('should reset fatal WELD alarm (intentional design)', () => {
      mockV.sys_alarm = 'ALARM_RELAY_WELD'
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'reset_alarms' }))

      expect(mockV.sys_alarm).toBe('NONE')
    })

    it('should reset fatal LOCKED alarm (intentional design)', () => {
      mockV.sys_alarm = 'ALARM_ROTOR_LOCKED'
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'reset_alarms' }))

      expect(mockV.sys_alarm).toBe('NONE')
    })

    it('should handle status command', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'status' }))

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Status requested'))
    })

    it('should reject null message', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', null)

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Rejected size'))
    })

    it('should reject invalid object structure', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify('string'))

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Invalid structure'))
    })

    it('should reject missing cmd property', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ foo: 'bar' }))

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Invalid structure'))
    })

    it('should not activate turbo when disabled', () => {
      mockC.turbo_enable = false
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'turbo_on' }))

      expect(mockV.trb_isActive).toBe(false)
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Turbo disabled'))
    })

    // ----------------------------------------------------------
    // * SETPOINT COMMAND TESTS
    // ----------------------------------------------------------

    it('should handle valid setpoint command', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'setpoint', value: 3.5 }))

      expect(mockC.ctrl_targetDeg).toBe(3.5)
      expect(mockPersistConfig).toHaveBeenCalled()
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Setpoint updated'))
    })

    it('should reject setpoint when validation fails', () => {
      // Mock validateConfig to indicate ctrl_targetDeg was reverted
      mockValidateConfig.mockReturnValue(['ctrl_targetDeg'])
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'setpoint', value: -10 }))

      expect(mockC.ctrl_targetDeg).toBe(4.0) // unchanged (reverted)
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Setpoint rejected'))
    })

    // ----------------------------------------------------------
    // * RATE LIMITING TESTS
    // ----------------------------------------------------------

    it('should allow first command', () => {
      global.Shelly.getUptimeMs.mockReturnValue(10000)
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      handler('fridge/cmd', JSON.stringify({ cmd: 'status' }))

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Status requested'))
    })

    it('should rate limit commands within 2 seconds', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      // First command at t=10000
      global.Shelly.getUptimeMs.mockReturnValue(10000)
      handler('fridge/cmd', JSON.stringify({ cmd: 'status' }))

      // Second command at t=11000 (1 second later) - should be rate limited
      global.Shelly.getUptimeMs.mockReturnValue(11000)
      global.print.mockClear()
      handler('fridge/cmd', JSON.stringify({ cmd: 'turbo_on' }))

      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Rate limited'))
      expect(mockV.trb_isActive).toBe(false) // turbo should NOT have activated
    })

    it('should allow command after rate limit window', () => {
      setupMqttCommands()
      const handler = mockMqttSubscribe.mock.calls[0][1]

      // First command at t=10000
      global.Shelly.getUptimeMs.mockReturnValue(10000)
      handler('fridge/cmd', JSON.stringify({ cmd: 'status' }))

      // Second command at t=12001 (>2 seconds later) - should be allowed
      global.Shelly.getUptimeMs.mockReturnValue(12001)
      handler('fridge/cmd', JSON.stringify({ cmd: 'turbo_on' }))

      expect(mockV.trb_isActive).toBe(true)
    })
  })
})
