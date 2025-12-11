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
      sys_relayState: false,
      sys_tsRelayOn: 0,
      sys_tsRelayOff: 0,
      stats_hourRun: 0,
      stats_hourTime: 0,
      stats_cycleCount: 0,
      weld_snapAir: 0,
      fault_fatal: [],
    }

    mockV = {
      sys_scrUptimeMs: 0,
      hw_hasPM: false,
      lastSave: 0,
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
      mockS.sys_relayState = false
      // ? Must have elapsed time for "Clean idle" message to print
      mockS.sys_tsLastSave = Date.now() / 1000 - 300

      recoverBootState()

      // ? Actual format: "BOOT ℹ️ Clean idle: Xm elapsed"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Clean idle'))
    })

    it('should detect power monitor availability', () => {
      global.Shelly.getComponentStatus.mockReturnValue({ output: false, apower: 50 })

      recoverBootState()

      expect(mockV.hw_hasPM).toBe(true)
    })

    it('should report last fatal fault', () => {
      mockS.fault_fatal = [{ a: 'WELD', d: 'test', t: Date.now() / 1000 - 3600 }]

      recoverBootState()

      // ? Actual format: "BOOT ⚠️ Last fatal: ALARM (detail), Xh ago"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Last fatal'))
    })

    it('should recover stats when both agree ON with valid timestamp', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: true })
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = now - 1000
      mockS.sys_tsLastSave = now - 500 // Last save was 500s ago
      mockS.stats_hourRun = 500
      mockS.stats_hourTime = 0

      recoverBootState()

      // ? Elapsed since last save = 500s, all was run time, so stats_hourRun += 500
      expect(mockS.stats_hourRun).toBeCloseTo(1000, 0)
      expect(mockS.stats_hourTime).toBeCloseTo(500, 0)
      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should continue without recovery when saved stats are current', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: true })
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = now - 1000
      // ? Must have elapsed time for recovery message to print
      mockS.sys_tsLastSave = now - 500
      mockS.stats_hourRun = 1000

      recoverBootState()

      // ? Actual format: "BOOT ℹ️ Compressor running: recovered Xm (run Ym total)"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Compressor running'))
    })

    it('should force OFF when compressor ran too long', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: true })
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = now - 10000
      mockC.comp_maxRunSec = 3600

      recoverBootState()

      expect(global.Shelly.call).toHaveBeenCalledWith('Switch.Set', { id: 0, on: false })
      expect(mockS.sys_relayState).toBe(false)
      expect(mockS.weld_snapAir).toBe(0)
      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should handle HW=ON but KVS=OFF (untracked start)', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: true })
      mockS.sys_relayState = false

      recoverBootState()

      // ? Actual format: "BOOT ⚠️ State mismatch: HW=ON but state=OFF, syncing to hardware"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('State mismatch'))
      expect(mockS.sys_relayState).toBe(true)
      expect(mockS.sys_tsRelayOn).toBe(Math.floor(now))
      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should handle HW=OFF but KVS=ON (unclean shutdown)', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: false })
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = now - 1000
      mockS.sys_tsLastSave = now - 500 // Last save was 500s ago
      mockS.stats_hourRun = 500
      mockS.stats_hourTime = 0
      mockS.stats_cycleCount = 5

      recoverBootState()

      // ? Actual format: "BOOT ⚠️ Crash while cooling: recovered ~Xm run"
      expect(global.print).toHaveBeenCalledWith(expect.stringContaining('Crash while cooling'))
      expect(mockS.sys_relayState).toBe(false)
      // ? Estimated run = 1000s, elapsed = 500s, so missed run = min(1000, 500) = 500s
      expect(mockS.stats_hourRun).toBeCloseTo(1000, 0)
      expect(mockS.stats_hourTime).toBeCloseTo(500, 0)
      expect(mockS.stats_cycleCount).toBe(6)
      expect(mockS.weld_snapAir).toBe(0)
      expect(mockPersistState).toHaveBeenCalled()
    })

    it('should not recover stats on unclean shutdown if timestamp invalid', () => {
      let now = Date.now() / 1000
      global.Shelly.getComponentStatus.mockReturnValue({ output: false })
      mockS.sys_relayState = true
      mockS.sys_tsRelayOn = now - 100000
      mockS.stats_hourRun = 500
      mockS.stats_cycleCount = 5

      recoverBootState()

      expect(mockS.sys_relayState).toBe(false)
      expect(mockS.stats_hourRun).toBe(500)
      expect(mockS.stats_cycleCount).toBe(5)
    })
  })
})
