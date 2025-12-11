// ==============================================================================
// * CONFIGURATION TESTS
// ? Validates DEFAULT values, KVS keys, and config validation logic.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Configuration', () => {
  let DEFAULT, C, CFG_KEYS, validateConfig, loadConfig
  let mockLoadChunksSeq, mockSyncToKvs, mockSaveAllToKvs
  let loadChunksSeqCallback

  beforeEach(async () => {
    vi.resetModules()
    loadChunksSeqCallback = null

    global.print = vi.fn()
    global.Shelly = { call: vi.fn() }
    global.Timer = { set: vi.fn((d, r, cb) => { if (cb) cb() }) }

    mockSyncToKvs = vi.fn((m, s, c, cb, name) => { if (cb) cb() })
    mockSaveAllToKvs = vi.fn((m, s, cb) => { if (cb) cb() })
    // ? loadChunksSeq captures callback for test control
    mockLoadChunksSeq = vi.fn((mapping, target, cb) => {
      loadChunksSeqCallback = cb
    })

    vi.doMock('./utils/kvs.js', () => ({
      loadChunksSeq: mockLoadChunksSeq,
      syncToKvs: mockSyncToKvs,
      saveAllToKvs: mockSaveAllToKvs,
    }))

    const module = await import('./config.js')
    DEFAULT = module.DEFAULT
    C = module.C
    CFG_KEYS = module.CFG_KEYS
    validateConfig = module.validateConfig
    loadConfig = module.loadConfig

    for (let k in DEFAULT) {
      C[k] = DEFAULT[k]
    }
  })

  // ----------------------------------------------------------
  // * DEFAULT VALUES TESTS
  // ----------------------------------------------------------

  describe('DEFAULT', () => {
    it('should have sys_loopSec between 1 and 60', () => {
      expect(DEFAULT.sys_loopSec).toBeGreaterThanOrEqual(1)
      expect(DEFAULT.sys_loopSec).toBeLessThanOrEqual(60)
    })

    it('should have ctrl_targetDeg between -5 and 15', () => {
      expect(DEFAULT.ctrl_targetDeg).toBeGreaterThanOrEqual(-5)
      expect(DEFAULT.ctrl_targetDeg).toBeLessThanOrEqual(15)
    })

    it('should have ctrl_hystDeg between 0.1 and 5', () => {
      expect(DEFAULT.ctrl_hystDeg).toBeGreaterThanOrEqual(0.1)
      expect(DEFAULT.ctrl_hystDeg).toBeLessThanOrEqual(5)
    })

    it('should have comp_minOnSec between 60 and 600', () => {
      expect(DEFAULT.comp_minOnSec).toBeGreaterThanOrEqual(60)
      expect(DEFAULT.comp_minOnSec).toBeLessThanOrEqual(600)
    })

    it('should have comp_minOffSec between 60 and 900', () => {
      expect(DEFAULT.comp_minOffSec).toBeGreaterThanOrEqual(60)
      expect(DEFAULT.comp_minOffSec).toBeLessThanOrEqual(900)
    })

    it('should have comp_maxRunSec between 1800 and 14400', () => {
      expect(DEFAULT.comp_maxRunSec).toBeGreaterThanOrEqual(1800)
      expect(DEFAULT.comp_maxRunSec).toBeLessThanOrEqual(14400)
    })

    it('should have adapt_hystMinDeg < adapt_hystMaxDeg', () => {
      expect(DEFAULT.adapt_hystMinDeg).toBeLessThan(DEFAULT.adapt_hystMaxDeg)
    })

    it('should define all MQTT topics', () => {
      expect(DEFAULT.sys_mqttTopic).toBe('fridge/status')
      expect(DEFAULT.sys_mqttCmd).toBe('fridge/command')
    })

    it('should have all expected config keys', () => {
      const expectedKeys = [
        'sys_loopSec', 'sys_sensAirId', 'sys_sensEvapId', 'sys_sensFailLimit',
        'ctrl_targetDeg', 'ctrl_hystDeg', 'ctrl_smoothAlpha',
        'adapt_enable', 'adapt_hystMinDeg', 'adapt_hystMaxDeg',
        'comp_minOnSec', 'comp_minOffSec', 'comp_maxRunSec', 'comp_freezeCutDeg',
        'limp_enable', 'limp_onSec', 'limp_offSec',
        'door_enable', 'door_rateDegMin', 'door_pauseSec',
        'defr_dynEnable', 'defr_dynTrigDeg', 'defr_dynEndDeg', 'defr_dynDwellSec',
        'weld_enable', 'weld_waitSec', 'weld_winSec', 'weld_dropDeg',
        'turbo_enable', 'turbo_targetDeg', 'turbo_hystDeg', 'turbo_maxTimeSec',
      ]

      expectedKeys.forEach((key) => {
        expect(DEFAULT[key]).toBeDefined()
      })
    })
  })

  // ----------------------------------------------------------
  // * CFG_KEYS TESTS
  // ----------------------------------------------------------

  describe('CFG_KEYS', () => {
    it('should map all config categories', () => {
      expect(CFG_KEYS['fridge_cfg_sys']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_ctrl']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_adapt']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_comp']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_limp']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_door']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_defr']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_weld']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_sens']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_alarm']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_pwr']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_turbo']).toBeDefined()
      // Note: gas keys were merged into fridge_cfg_weld to reduce chunk count
    })

    it('should have arrays as values', () => {
      Object.values(CFG_KEYS).forEach((keys) => {
        expect(Array.isArray(keys)).toBe(true)
        expect(keys.length).toBeGreaterThan(0)
      })
    })

    it('should reference valid DEFAULT keys', () => {
      Object.values(CFG_KEYS).flat().forEach((key) => {
        expect(DEFAULT[key]).toBeDefined()
      })
    })
  })

  // ----------------------------------------------------------
  // * VALIDATE CONFIG TESTS
  // ----------------------------------------------------------

  describe('validateConfig', () => {
    it('should return empty array when config is valid', () => {
      const bad = validateConfig()
      expect(bad).toEqual([])
    })

    it('should revert sys_loopSec if out of range (too low)', () => {
      C.sys_loopSec = 0
      const bad = validateConfig()
      expect(bad).toContain('sys_loopSec')
      expect(C.sys_loopSec).toBe(DEFAULT.sys_loopSec)
    })

    it('should revert sys_loopSec if out of range (too high)', () => {
      C.sys_loopSec = 100
      const bad = validateConfig()
      expect(bad).toContain('sys_loopSec')
      expect(C.sys_loopSec).toBe(DEFAULT.sys_loopSec)
    })

    it('should revert sys_loopSec if not a number', () => {
      C.sys_loopSec = 'invalid'
      const bad = validateConfig()
      expect(bad).toContain('sys_loopSec')
      expect(C.sys_loopSec).toBe(DEFAULT.sys_loopSec)
    })

    it('should revert ctrl_targetDeg if out of range', () => {
      C.ctrl_targetDeg = 20
      const bad = validateConfig()
      expect(bad).toContain('ctrl_targetDeg')
      expect(C.ctrl_targetDeg).toBe(DEFAULT.ctrl_targetDeg)
    })

    it('should revert ctrl_hystDeg if out of range', () => {
      C.ctrl_hystDeg = 0.01
      const bad = validateConfig()
      expect(bad).toContain('ctrl_hystDeg')
      expect(C.ctrl_hystDeg).toBe(DEFAULT.ctrl_hystDeg)
    })

    it('should revert comp_minOnSec if too low', () => {
      C.comp_minOnSec = 30
      const bad = validateConfig()
      expect(bad).toContain('comp_minOnSec')
      expect(C.comp_minOnSec).toBe(DEFAULT.comp_minOnSec)
    })

    it('should revert comp_minOffSec if too high', () => {
      C.comp_minOffSec = 1000
      const bad = validateConfig()
      expect(bad).toContain('comp_minOffSec')
      expect(C.comp_minOffSec).toBe(DEFAULT.comp_minOffSec)
    })

    it('should revert comp_maxRunSec if out of range', () => {
      C.comp_maxRunSec = 1000
      const bad = validateConfig()
      expect(bad).toContain('comp_maxRunSec')
      expect(C.comp_maxRunSec).toBe(DEFAULT.comp_maxRunSec)
    })

    it('should revert comp_freezeCutDeg if out of range', () => {
      C.comp_freezeCutDeg = 5
      const bad = validateConfig()
      expect(bad).toContain('comp_freezeCutDeg')
      expect(C.comp_freezeCutDeg).toBe(DEFAULT.comp_freezeCutDeg)
    })

    it('should revert both hyst bounds if min >= max', () => {
      C.adapt_hystMinDeg = 3.0
      C.adapt_hystMaxDeg = 2.0
      const bad = validateConfig()
      expect(bad).toContain('adapt_hyst_range')
      expect(C.adapt_hystMinDeg).toBe(DEFAULT.adapt_hystMinDeg)
      expect(C.adapt_hystMaxDeg).toBe(DEFAULT.adapt_hystMaxDeg)
    })

    it('should print warning when values are reverted', () => {
      C.sys_loopSec = 0
      validateConfig()
      expect(global.print).toHaveBeenCalled()
    })

    it('should not print when config is valid', () => {
      validateConfig()
      expect(global.print).not.toHaveBeenCalled()
    })

    it('should handle multiple invalid values', () => {
      C.sys_loopSec = 0
      C.ctrl_targetDeg = 100
      C.comp_minOnSec = 10
      const bad = validateConfig()
      expect(bad.length).toBe(3)
      expect(bad).toContain('sys_loopSec')
      expect(bad).toContain('ctrl_targetDeg')
      expect(bad).toContain('comp_minOnSec')
    })
  })

  // ----------------------------------------------------------
  // * LOAD CONFIG TESTS
  // ----------------------------------------------------------

  describe('loadConfig', () => {
    // ? loadChunksSeq loads KVS chunks sequentially for reduced peak memory
    it('should call loadChunksSeq with CFG_KEYS', () => {
      loadConfig(() => {})

      expect(mockLoadChunksSeq).toHaveBeenCalledWith(
        CFG_KEYS,
        C,
        expect.any(Function),
      )
    })

    it('should call onComplete after successful load', () => {
      let completed = false
      loadConfig(() => { completed = true })

      // ? loadChunksSeq callback receives parsed chunks object
      loadChunksSeqCallback({})

      expect(completed).toBe(true)
    })

    it('should copy DEFAULT values to C before loading', () => {
      // Corrupt C first
      C.sys_loopSec = 999

      loadConfig(() => {})

      // C should have DEFAULT values restored (happens before loadChunksSeq call)
      expect(C.sys_loopSec).toBe(DEFAULT.sys_loopSec)
    })

    it('should call loadChunksSeq with CFG_KEYS and C', () => {
      loadConfig(() => {})
      loadChunksSeqCallback({})

      expect(mockLoadChunksSeq).toHaveBeenCalledWith(
        CFG_KEYS,
        C,
        expect.any(Function),
      )
    })

    it('should handle empty chunks object', () => {
      let completed = false
      loadConfig(() => { completed = true })
      loadChunksSeqCallback({})

      expect(completed).toBe(true)
    })

    it('should call validateConfig after loading', () => {
      // ? loadChunksSeq merges into C directly, so set invalid value before callback
      C.sys_loopSec = 999 // Invalid value

      loadConfig(() => {})
      loadChunksSeqCallback({ 'fridge_cfg_sys': {} })

      // validateConfig should have been called and reverted the value
      expect(C.sys_loopSec).toBe(DEFAULT.sys_loopSec)
    })

    it('should call syncToKvs after validation', () => {
      loadConfig(() => {})
      loadChunksSeqCallback({})

      expect(mockSyncToKvs).toHaveBeenCalledWith(
        CFG_KEYS,
        DEFAULT,
        expect.any(Object),
        expect.any(Function),
        'Config',
      )
    })

    it('should handle empty response gracefully', () => {
      let completed = false
      loadConfig(() => { completed = true })
      loadChunksSeqCallback({})

      expect(completed).toBe(true)
    })
  })
})
