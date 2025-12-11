// ==============================================================================
// * STATE TESTS
// ? Validates S, V, ST_KEYS structures and persistence functions.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('State', () => {
  let S, V, ST_KEYS, persistState, loadState
  let mockSaveAllToKvs, mockLoadChunksSeq, mockSyncToKvs
  let loadChunksSeqCallback

  beforeEach(async () => {
    vi.resetModules()
    loadChunksSeqCallback = null

    global.Shelly = { call: vi.fn() }
    global.Timer = { set: vi.fn((d, r, cb) => { if (cb) cb() }) }
    global.print = vi.fn()

    mockSaveAllToKvs = vi.fn((mapping, source, onDone) => {
      if (onDone) onDone()
    })

    mockSyncToKvs = vi.fn((m, s, c, cb, name) => { if (cb) cb() })
    // ? loadChunksSeq captures callback for test control
    mockLoadChunksSeq = vi.fn((mapping, target, cb) => {
      loadChunksSeqCallback = cb
    })

    vi.doMock('./utils/kvs.js', () => ({
      loadChunksSeq: mockLoadChunksSeq,
      syncToKvs: mockSyncToKvs,
      saveAllToKvs: mockSaveAllToKvs,
    }))

    vi.doMock('./utils/math.js', () => ({
      ri: vi.fn((v) => Math.floor(v)),
    }))

    const module = await import('./state.js')
    S = module.S
    V = module.V
    ST_KEYS = module.ST_KEYS
    persistState = module.persistState
    loadState = module.loadState
  })

  // ----------------------------------------------------------
  // * ST_KEYS TESTS
  // ----------------------------------------------------------

  describe('ST_KEYS', () => {
    it('should map all state categories', () => {
      expect(ST_KEYS['fridge_st_core']).toBeDefined()
      expect(ST_KEYS['fridge_st_stats']).toBeDefined()
      expect(ST_KEYS['fridge_st_faults']).toBeDefined()
    })

    it('should have arrays as values', () => {
      Object.values(ST_KEYS).forEach((keys) => {
        expect(Array.isArray(keys)).toBe(true)
        expect(keys.length).toBeGreaterThan(0)
      })
    })

    it('should reference valid S keys in core', () => {
      ST_KEYS['fridge_st_core'].forEach((key) => {
        expect(S[key]).toBeDefined()
      })
    })

    it('should reference valid S keys in stats', () => {
      ST_KEYS['fridge_st_stats'].forEach((key) => {
        expect(S[key]).toBeDefined()
      })
    })

    it('should reference valid S keys in faults', () => {
      ST_KEYS['fridge_st_faults'].forEach((key) => {
        expect(S[key]).toBeDefined()
      })
    })
  })

  // ----------------------------------------------------------
  // * PERSISTED STATE (S) TESTS
  // ----------------------------------------------------------

  describe('S (Persisted State)', () => {
    it('should have relay state fields', () => {
      expect(S.sys_tsRelayOn).toBeDefined()
      expect(S.sys_tsRelayOff).toBeDefined()
      expect(S.sys_relayState).toBe(false)
    })

    it('should have weld snapshot field', () => {
      // ? weld_snapEvap was removed (dead code - never read)
      expect(S.weld_snapAir).toBe(0)
    })

    it('should have adaptive hysteresis field', () => {
      expect(S.adapt_hystCurrent).toBe(1.0)
    })

    it('should have stats fields', () => {
      expect(S.stats_lifeTime).toBe(0)
      expect(S.stats_lifeRun).toBe(0)
      expect(S.stats_hourTime).toBe(0)
      expect(S.stats_hourRun).toBe(0)
      expect(S.stats_cycleCount).toBe(0)
      expect(S.stats_hourIdx).toBe(0)
    })

    it('should have 24-element history array', () => {
      expect(Array.isArray(S.stats_history)).toBe(true)
      expect(S.stats_history.length).toBe(24)
    })

    it('should have defrost state', () => {
      expect(S.defr_isActive).toBe(false)
    })

    it('should have fault arrays', () => {
      expect(Array.isArray(S.fault_fatal)).toBe(true)
      expect(Array.isArray(S.fault_critical)).toBe(true)
      expect(Array.isArray(S.fault_error)).toBe(true)
      expect(Array.isArray(S.fault_warning)).toBe(true)
    })
  })

  // ----------------------------------------------------------
  // * VOLATILE STATE (V) TESTS
  // ----------------------------------------------------------

  describe('V (Volatile State)', () => {
    it('should have system status fields', () => {
      expect(V.sys_status).toBe('BOOT')
      expect(V.sys_reason).toBe('NONE')
      expect(V.sys_alarm).toBe('NONE')
      expect(V.sys_statusDetail).toBe('NONE')
    })

    it('should have sensor error tracking', () => {
      expect(V.sens_errCount).toBe(0)
      expect(V.sens_wasError).toBe(true)
    })

    it('should have 3-element sensor buffer', () => {
      expect(Array.isArray(V.sens_bufAir)).toBe(true)
      expect(V.sens_bufAir.length).toBe(3)
      expect(V.sens_bufIdx).toBe(0)
    })

    it('should have smoothed air temp as null initially', () => {
      expect(V.sens_smoothAir).toBe(null)
    })

    it('should have stuck sensor tracking', () => {
      expect(V.sens_stuckRefAir).toBe(null)
      expect(V.sens_stuckTsAir).toBe(0)
      expect(V.sens_stuckRefEvap).toBe(null)
      expect(V.sens_stuckTsEvap).toBe(0)
    })

    it('should have door detection fields', () => {
      expect(V.door_refTemp).toBe(0)
      expect(V.door_refTs).toBe(0)
      expect(V.door_timer).toBe(0)
    })

    it('should have turbo mode fields', () => {
      expect(V.turbo_active).toBe(false)
      expect(V.turbo_remSec).toBe(0)
      expect(V.turbo_lastSw).toBe(false)
    })

    it('should have health tracking fields', () => {
      expect(V.health_startTemp).toBe(0)
      expect(V.health_lastScore).toBe(0)
    })

    it('should have power monitoring fields', () => {
      expect(V.hw_hasPM).toBe(false)
      expect(V.pwr_ghostTimer).toBe(0)
    })

    it('should have fault pending as null', () => {
      expect(V.fault_pending).toBe(null)
    })

    it('should have lastSave timestamp', () => {
      expect(V.lastSave).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // * PERSIST STATE TESTS
  // ----------------------------------------------------------

  describe('persistState', () => {
    it('should call saveAllToKvs with ST_KEYS and S', () => {
      persistState()
      expect(mockSaveAllToKvs).toHaveBeenCalledWith(
        ST_KEYS,
        S,
        expect.any(Function),
      )
    })

    it('should update V.lastSave after completion', () => {
      V.lastSave = 0
      persistState()
      expect(V.lastSave).toBeGreaterThan(0)
    })
  })

  // ----------------------------------------------------------
  // * LOAD STATE TESTS
  // ----------------------------------------------------------

  describe('loadState', () => {
    // ? loadChunksSeq loads KVS chunks sequentially for reduced peak memory
    it('should call loadChunksSeq with ST_KEYS', () => {
      loadState(() => {})

      expect(mockLoadChunksSeq).toHaveBeenCalledWith(
        ST_KEYS,
        S,
        expect.any(Function),
      )
    })

    it('should call onComplete after successful load', () => {
      let completed = false
      loadState(() => { completed = true })

      // ? loadChunksSeq callback receives parsed chunks object
      loadChunksSeqCallback({})

      expect(completed).toBe(true)
    })

    it('should call loadChunksSeq with ST_KEYS and S', () => {
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(mockLoadChunksSeq).toHaveBeenCalledWith(
        ST_KEYS,
        S,
        expect.any(Function),
      )
    })

    it('should handle empty chunks object', () => {
      let completed = false
      loadState(() => { completed = true })
      loadChunksSeqCallback({})

      expect(completed).toBe(true)
    })

    it('should reset timestamps when future timestamp detected', () => {
      let completed = false
      const futureTime = Date.now() / 1000 + 120 // 2 minutes in future

      // ? loadChunksSeq merges into S directly, so set invalid timestamps before callback
      S.sys_tsRelayOff = futureTime
      S.sys_tsRelayOn = futureTime

      loadState(() => { completed = true })
      loadChunksSeqCallback({ 'fridge_st_core': {} })

      expect(S.sys_tsRelayOff).toBe(0)
      expect(S.sys_tsRelayOn).toBe(0)
    })

    it('should reset timestamps when too old timestamp detected', () => {
      let completed = false
      const oldTime = Date.now() / 1000 - 32000000 // > 1 year ago

      S.sys_tsRelayOff = oldTime
      S.sys_tsRelayOn = oldTime

      loadState(() => { completed = true })
      loadChunksSeqCallback({ 'fridge_st_core': {} })

      expect(S.sys_tsRelayOff).toBe(0)
      expect(S.sys_tsRelayOn).toBe(0)
    })

    it('should keep valid timestamps', () => {
      let completed = false
      const validTime = Date.now() / 1000 - 3600 // 1 hour ago

      S.sys_tsRelayOff = validTime
      S.sys_tsRelayOn = validTime - 100

      loadState(() => { completed = true })
      loadChunksSeqCallback({ 'fridge_st_core': {} })

      expect(S.sys_tsRelayOff).toBe(validTime)
      expect(S.sys_tsRelayOn).toBe(validTime - 100)
    })

    it('should call syncToKvs after loading', () => {
      let completed = false
      loadState(() => { completed = true })
      loadChunksSeqCallback({})

      expect(mockSyncToKvs).toHaveBeenCalledWith(
        ST_KEYS,
        S,
        expect.any(Object),
        expect.any(Function),
        'State',
      )
    })

    it('should update V.lastSave after sync completes', () => {
      V.lastSave = 0
      let completed = false
      loadState(() => { completed = true })
      loadChunksSeqCallback({})

      expect(V.lastSave).toBeGreaterThan(0)
    })

    // ----------------------------------------------------------
    // * SANITIZE STATS EDGE CASES
    // ----------------------------------------------------------

    it('should reset stats_history when not an array', () => {
      S.stats_history = 'not an array'
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.stats_history).toBeInstanceOf(Array)
      expect(S.stats_history.length).toBe(24)
      expect(S.stats_hourIdx).toBe(0)
    })

    it('should reset stats_history when wrong length', () => {
      S.stats_history = [1, 2, 3] // Wrong length
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.stats_history.length).toBe(24)
      expect(S.stats_hourIdx).toBe(0)
    })

    it('should reset stats_hourIdx when negative', () => {
      S.stats_history = new Array(24).fill(0)
      S.stats_hourIdx = -5
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.stats_hourIdx).toBe(0)
    })

    it('should reset stats_hourIdx when > 23', () => {
      S.stats_history = new Array(24).fill(0)
      S.stats_hourIdx = 99
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.stats_hourIdx).toBe(0)
    })

    it('should reset negative stats values to zero', () => {
      S.stats_hourTime = -100
      S.stats_hourRun = -50
      S.stats_cycleCount = -1
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.stats_hourTime).toBe(0)
      expect(S.stats_hourRun).toBe(0)
      expect(S.stats_cycleCount).toBe(0)
    })
  })
})
