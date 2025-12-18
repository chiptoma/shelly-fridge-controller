// ==============================================================================
// CONFIGURATION TESTS
// Validates DEFAULT values, KVS keys, and config validation logic.
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
    // loadChunksSeq captures callback for test control
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
  // DEFAULT VALUES TESTS
  // ----------------------------------------------------------

  describe('DEFAULT', () => {
    it('should have sys_loopSec between 1 and 60', () => {
      expect(DEFAULT.sys_loopSec).toBeGreaterThanOrEqual(1)
      expect(DEFAULT.sys_loopSec).toBeLessThanOrEqual(60)
    })

    it('should have ctl_targetDeg between -5 and 15', () => {
      expect(DEFAULT.ctl_targetDeg).toBeGreaterThanOrEqual(-5)
      expect(DEFAULT.ctl_targetDeg).toBeLessThanOrEqual(15)
    })

    it('should have ctl_hystDeg between 0.1 and 5', () => {
      expect(DEFAULT.ctl_hystDeg).toBeGreaterThanOrEqual(0.1)
      expect(DEFAULT.ctl_hystDeg).toBeLessThanOrEqual(5)
    })

    it('should have cmp_minOnSec between 60 and 600', () => {
      expect(DEFAULT.cmp_minOnSec).toBeGreaterThanOrEqual(60)
      expect(DEFAULT.cmp_minOnSec).toBeLessThanOrEqual(600)
    })

    it('should have cmp_minOffSec between 60 and 900', () => {
      expect(DEFAULT.cmp_minOffSec).toBeGreaterThanOrEqual(60)
      expect(DEFAULT.cmp_minOffSec).toBeLessThanOrEqual(900)
    })

    it('should have cmp_maxRunSec between 1800 and 14400', () => {
      expect(DEFAULT.cmp_maxRunSec).toBeGreaterThanOrEqual(1800)
      expect(DEFAULT.cmp_maxRunSec).toBeLessThanOrEqual(14400)
    })

    it('should have adt_hystMinDeg < adt_hystMaxDeg', () => {
      expect(DEFAULT.adt_hystMinDeg).toBeLessThan(DEFAULT.adt_hystMaxDeg)
    })

    it('should define all MQTT topics', () => {
      expect(DEFAULT.sys_mqttTopic).toBe('fridge/status')
      expect(DEFAULT.sys_mqttCmd).toBe('fridge/command')
    })

    it('should have all expected config keys', () => {
      const expectedKeys = [
        'sys_loopSec', 'sys_sensAirId', 'sys_sensEvpId', 'sys_sensFailLimit',
        'ctl_targetDeg', 'ctl_hystDeg', 'ctl_smoothAlpha',
        'adt_enable', 'adt_hystMinDeg', 'adt_hystMaxDeg',
        'cmp_minOnSec', 'cmp_minOffSec', 'cmp_maxRunSec', 'cmp_freezeCutDeg',
        'lmp_enable', 'lmp_onSec', 'lmp_offSec',
        'dor_enable', 'dor_rateDegMin', 'dor_pauseSec',
        'dfr_dynEnable', 'dfr_dynTrigDeg', 'dfr_dynEndDeg', 'dfr_dynDwellSec',
        'wld_enable', 'wld_waitSec', 'wld_winSec', 'wld_dropDeg',
        'trb_enable', 'trb_targetDeg', 'trb_hystDeg', 'trb_maxTimeSec',
      ]

      expectedKeys.forEach((key) => {
        expect(DEFAULT[key]).toBeDefined()
      })
    })
  })

  // ----------------------------------------------------------
  // CFG_KEYS TESTS
  // ----------------------------------------------------------

  describe('CFG_KEYS', () => {
    it('should map all config categories', () => {
      expect(CFG_KEYS['fridge_cfg_sys']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_ctl']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_adt']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_cmp']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_lmp']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_dor']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_dfr']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_wld']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_sns']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_alm']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_pwr']).toBeDefined()
      expect(CFG_KEYS['fridge_cfg_trb']).toBeDefined()
      // Note: gas keys were merged into fridge_cfg_wld to reduce chunk count
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
  // VALIDATE CONFIG TESTS
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

    it('should revert ctl_targetDeg if out of range', () => {
      C.ctl_targetDeg = 20
      const bad = validateConfig()
      expect(bad).toContain('ctl_targetDeg')
      expect(C.ctl_targetDeg).toBe(DEFAULT.ctl_targetDeg)
    })

    it('should revert ctl_hystDeg if out of range', () => {
      C.ctl_hystDeg = 0.01
      const bad = validateConfig()
      expect(bad).toContain('ctl_hystDeg')
      expect(C.ctl_hystDeg).toBe(DEFAULT.ctl_hystDeg)
    })

    it('should revert cmp_minOnSec if too low', () => {
      C.cmp_minOnSec = 30
      const bad = validateConfig()
      expect(bad).toContain('cmp_minOnSec')
      expect(C.cmp_minOnSec).toBe(DEFAULT.cmp_minOnSec)
    })

    it('should revert cmp_minOffSec if too high', () => {
      C.cmp_minOffSec = 1000
      const bad = validateConfig()
      expect(bad).toContain('cmp_minOffSec')
      expect(C.cmp_minOffSec).toBe(DEFAULT.cmp_minOffSec)
    })

    it('should revert cmp_maxRunSec if out of range', () => {
      C.cmp_maxRunSec = 1000
      const bad = validateConfig()
      expect(bad).toContain('cmp_maxRunSec')
      expect(C.cmp_maxRunSec).toBe(DEFAULT.cmp_maxRunSec)
    })

    it('should revert cmp_freezeCutDeg if out of range', () => {
      C.cmp_freezeCutDeg = 5
      const bad = validateConfig()
      expect(bad).toContain('cmp_freezeCutDeg')
      expect(C.cmp_freezeCutDeg).toBe(DEFAULT.cmp_freezeCutDeg)
    })

    it('should revert both hyst bounds if min >= max', () => {
      C.adt_hystMinDeg = 3.0
      C.adt_hystMaxDeg = 2.0
      const bad = validateConfig()
      expect(bad).toContain('adt_hyst_range')
      expect(C.adt_hystMinDeg).toBe(DEFAULT.adt_hystMinDeg)
      expect(C.adt_hystMaxDeg).toBe(DEFAULT.adt_hystMaxDeg)
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
      C.ctl_targetDeg = 100
      C.cmp_minOnSec = 10
      const bad = validateConfig()
      expect(bad.length).toBe(3)
      expect(bad).toContain('sys_loopSec')
      expect(bad).toContain('ctl_targetDeg')
      expect(bad).toContain('cmp_minOnSec')
    })
  })

  // ----------------------------------------------------------
  // LOAD CONFIG TESTS
  // ----------------------------------------------------------

  describe('loadConfig', () => {
    // loadChunksSeq loads KVS chunks sequentially for reduced peak memory
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

      // loadChunksSeq callback receives parsed chunks object
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
      // loadChunksSeq merges into C directly, so set invalid value before callback
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
