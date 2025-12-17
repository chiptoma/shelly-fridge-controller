// ==============================================================================
// * MAIN TESTS
// ? Validates boot recovery and initialization.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Main', () => {
  let recoverBootState
  let mockS, mockV, mockC, mockPersistState

  beforeEach(async () => {
    vi.resetModules()

    mockS = {
      sys_isRelayOn: false,
      sys_relayOnTs: 0,
      sys_relayOffTs: 0,
      sts_hourRunSec: 0,
      sts_hourTotalSec: 0,
      sts_cycleCnt: 0,
      wld_airSnapDeg: 0,
      flt_fatalArr: [],
    }

    mockV = {
      sys_startMs: 0,
      hw_hasPM: false,
      lop_lastSaveTs: 0,
    }

    mockC = {
      comp_maxRunSec: 3600,
    }

    mockPersistState = vi.fn()

    global.print = vi.fn()
    global.Shelly = {
      getUptimeMs: vi.fn(() => 1000000),
      getComponentStatus: vi.fn(() => ({ output: false, apower: 50 })),
      call: vi.fn((method, params, callback) => {
        if (callback) callback({ items: {} }, 0)
      }),
    }
    global.MQTT = { subscribe: vi.fn() }
    global.Timer = { set: vi.fn((d, r, cb) => { if (cb) cb(); return 1 }) }

    vi.doMock('./config.js', () => ({
      C: mockC,
      loadConfig: vi.fn((cb) => cb()),
    }))
    vi.doMock('./state.js', () => ({
      S: mockS,
      V: mockV,
      persistState: mockPersistState,
      loadState: vi.fn((cb) => cb()),
    }))
    vi.doMock('./utils/math.js', () => ({
      ri: vi.fn((v) => Math.floor(v)),
      nowSec: vi.fn(() => Date.now() / 1000),
    }))
    vi.doMock('./mqtt.js', () => ({
      setupMqttCommands: vi.fn(),
    }))
    vi.doMock('./loop.js', () => ({
      startMainLoop: vi.fn(),
    }))

    const module = await import('./main.js')
    recoverBootState = module.recoverBootState
  })

  // ----------------------------------------------------------
  // * BOOT RECOVERY TESTS
  // ----------------------------------------------------------

  describe('recoverBootState', () => {
    it('should handle clean state (both OFF)', () => {
      global.Shelly.getComponentStatus.mockReturnValue({ output: false })
      mockS.sys_isRelayOn = false
      // ? Must have elapsed time for "Clean idle" message to print
      mockS.sys_lastSaveTs = Date.now() / 1000 - 300

      recoverBootState()

      // Format: "Was idle for Xm → stats updated"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Was idle for'))
    })

    it('should detect power monitor availability', () => {
      global.Shelly.getComponentStatus.mockReturnValue({ output: false, apower: 50 })

      recoverBootState()

      expect(mockV.hw_hasPM).toBe(true)
    })

    it('should report last fatal fault', () => {
      mockS.flt_fatalArr = [{ a: 'WELD', d: 'test', t: Date.now() / 1000 - 3600 }]

      recoverBootState()

      // Format: "Had fatal error Xh ago: ALARM (detail)"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Had fatal error'))
    })

    it('should recover stats when both agree ON with valid timestamp', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: true })
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = now - 1000
      mockS.sys_lastSaveTs = now - 500 // Last save was 500s ago
      mockS.sts_hourRunSec = 500
      mockS.sts_hourTotalSec = 0

      recoverBootState()

      // ? Elapsed since last save = 500s, all was run time, so sts_hourRunSec += 500
      expect(mockS.sts_hourRunSec).toBeCloseTo(1000, 0)
      expect(mockS.sts_hourTotalSec).toBeCloseTo(500, 0)
      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should continue without recovery when saved stats are current', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: true })
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = now - 1000
      // ? Must have elapsed time for recovery message to print
      mockS.sys_lastSaveTs = now - 500
      mockS.sts_hourRunSec = 1000

      recoverBootState()

      // Format: "Script restarted while cooling → added Xm to runtime stats"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Script restarted while cooling'))
    })

    it('should force OFF when compressor ran too long', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: true })
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = now - 10000
      mockC.comp_maxRunSec = 3600

      recoverBootState()

      expect(global.Shelly.call).toHaveBeenCalledWith('Switch.Set', { id: 0, on: false })
      expect(mockS.sys_isRelayOn).toBe(false)
      expect(mockS.wld_airSnapDeg).toBe(0)
      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should handle HW=ON but KVS=OFF (untracked start)', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: true })
      mockS.sys_isRelayOn = false

      recoverBootState()

      // Format: "Relay was ON but state said OFF (unexpected) → state updated to match"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('state updated to match'))
      expect(mockS.sys_isRelayOn).toBe(true)
      expect(mockS.sys_relayOnTs).toBe(Math.floor(now))
      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should handle HW=OFF but KVS=ON (unclean shutdown)', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: false })
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = now - 1000
      mockS.sys_lastSaveTs = now - 500 // Last save was 500s ago
      mockS.sts_hourRunSec = 500
      mockS.sts_hourTotalSec = 0
      mockS.sts_cycleCnt = 5

      recoverBootState()

      // Format: "Script stopped while cooling → added ~Xm to runtime stats"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Script stopped while cooling'))
      expect(mockS.sys_isRelayOn).toBe(false)
      // ? Estimated run = 1000s, elapsed = 500s, so missed run = min(1000, 500) = 500s
      expect(mockS.sts_hourRunSec).toBeCloseTo(1000, 0)
      expect(mockS.sts_hourTotalSec).toBeCloseTo(500, 0)
      expect(mockS.sts_cycleCnt).toBe(6)
      expect(mockS.wld_airSnapDeg).toBe(0)
      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should not recover stats on unclean shutdown if timestamp invalid', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: false })
      mockS.sys_isRelayOn = true
      mockS.sys_relayOnTs = now - 100000
      mockS.sts_hourRunSec = 500
      mockS.sts_cycleCnt = 5

      recoverBootState()

      expect(mockS.sys_isRelayOn).toBe(false)
      expect(mockS.sts_hourRunSec).toBe(500)
      expect(mockS.sts_cycleCnt).toBe(5)
    })
  })
})
