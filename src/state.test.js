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
      expect(S.sys_relayOnTs).toBeDefined()
      expect(S.sys_relayOffTs).toBeDefined()
      expect(S.sys_isRelayOn).toBe(false)
    })

    it('should have weld snapshot field', () => {
      // ? weld_snapEvap was removed (dead code - never read)
      expect(S.wld_airSnapDeg).toBe(0)
    })

    it('should have adaptive hysteresis field', () => {
      expect(S.adt_hystDeg).toBe(1.0)
    })

    it('should have stats fields', () => {
      expect(S.sts_lifeTotalSec).toBe(0)
      expect(S.sts_lifeRunSec).toBe(0)
      expect(S.sts_hourTotalSec).toBe(0)
      expect(S.sts_hourRunSec).toBe(0)
      expect(S.sts_cycleCnt).toBe(0)
      expect(S.sts_histIdx).toBe(0)
    })

    it('should have 24-element history array', () => {
      expect(Array.isArray(S.sts_dutyHistArr)).toBe(true)
      expect(S.sts_dutyHistArr.length).toBe(24)
    })

    it('should have defrost state', () => {
      expect(S.dfr_isActive).toBe(false)
    })

    it('should have fault arrays', () => {
      expect(Array.isArray(S.flt_fatalArr)).toBe(true)
      expect(Array.isArray(S.flt_critArr)).toBe(true)
      expect(Array.isArray(S.flt_errorArr)).toBe(true)
      expect(Array.isArray(S.flt_warnArr)).toBe(true)
    })
  })

  // ----------------------------------------------------------
  // * VOLATILE STATE (V) TESTS
  // ----------------------------------------------------------

  describe('V (Volatile State)', () => {
    it('should have system status fields', () => {
      expect(V.sys_status).toBe('BOOT')
      expect(V.sys_statusReason).toBe('NONE')
      expect(V.sys_alarm).toBe('NONE')
      expect(V.sys_detail).toBe('NONE')
    })

    it('should have sensor error tracking', () => {
      expect(V.sns_errCnt).toBe(0)
      expect(V.sns_wasErr).toBe(false)
    })

    it('should have 3-element sensor buffer', () => {
      expect(Array.isArray(V.sns_airBuf)).toBe(true)
      expect(V.sns_airBuf.length).toBe(3)
      expect(V.sns_bufIdx).toBe(0)
    })

    it('should have smoothed air temp as null initially', () => {
      expect(V.sns_airSmoothDeg).toBe(null)
    })

    it('should have stuck sensor tracking', () => {
      expect(V.sns_airStuckRefDeg).toBe(null)
      expect(V.sns_airStuckTs).toBe(0)
      expect(V.sns_evpStuckRefDeg).toBe(null)
      expect(V.sns_evpStuckTs).toBe(0)
    })

    it('should have door detection fields', () => {
      expect(V.dor_refDeg).toBe(0)
      expect(V.dor_refTs).toBe(0)
      expect(V.dor_pauseRemSec).toBe(0)
    })

    it('should have turbo mode fields', () => {
      expect(V.trb_isActive).toBe(false)
      expect(V.trb_remSec).toBe(0)
      expect(V.trb_prevSw).toBe(false)
    })

    it('should have health tracking fields', () => {
      expect(V.hlt_startDeg).toBe(0)
      expect(V.hlt_lastScore).toBe(0)
    })

    it('should have power monitoring fields', () => {
      expect(V.hw_hasPM).toBe(false)
      expect(V.pwr_ghostSec).toBe(0)
    })

    it('should have fault pending as null', () => {
      expect(V.flt_pendCode).toBe(null)
    })

    it('should have lastSave timestamp', () => {
      expect(V.lop_lastSaveTs).toBe(0)
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

    it('should update V.lop_lastSaveTs after completion', () => {
      V.lop_lastSaveTs = 0
      persistState()
      expect(V.lop_lastSaveTs).toBeGreaterThan(0)
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
      S.sys_relayOffTs = futureTime
      S.sys_relayOnTs = futureTime

      loadState(() => { completed = true })
      loadChunksSeqCallback({ 'fridge_st_core': {} })

      expect(S.sys_relayOffTs).toBe(0)
      expect(S.sys_relayOnTs).toBe(0)
    })

    it('should reset timestamps when too old timestamp detected', () => {
      let completed = false
      const oldTime = Date.now() / 1000 - 32000000 // > 1 year ago

      S.sys_relayOffTs = oldTime
      S.sys_relayOnTs = oldTime

      loadState(() => { completed = true })
      loadChunksSeqCallback({ 'fridge_st_core': {} })

      expect(S.sys_relayOffTs).toBe(0)
      expect(S.sys_relayOnTs).toBe(0)
    })

    it('should keep valid timestamps', () => {
      let completed = false
      const validTime = Date.now() / 1000 - 3600 // 1 hour ago

      S.sys_relayOffTs = validTime
      S.sys_relayOnTs = validTime - 100

      loadState(() => { completed = true })
      loadChunksSeqCallback({ 'fridge_st_core': {} })

      expect(S.sys_relayOffTs).toBe(validTime)
      expect(S.sys_relayOnTs).toBe(validTime - 100)
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

    it('should update V.lop_lastSaveTs after sync completes', () => {
      V.lop_lastSaveTs = 0
      let completed = false
      loadState(() => { completed = true })
      loadChunksSeqCallback({})

      expect(V.lop_lastSaveTs).toBeGreaterThan(0)
    })

    // ----------------------------------------------------------
    // * SANITIZE STATS EDGE CASES
    // ----------------------------------------------------------

    it('should reset sts_dutyHistArr when not an array', () => {
      S.sts_dutyHistArr = 'not an array'
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.sts_dutyHistArr).toBeInstanceOf(Array)
      expect(S.sts_dutyHistArr.length).toBe(24)
      expect(S.sts_histIdx).toBe(0)
    })

    it('should reset sts_dutyHistArr when wrong length', () => {
      S.sts_dutyHistArr = [1, 2, 3] // Wrong length
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.sts_dutyHistArr.length).toBe(24)
      expect(S.sts_histIdx).toBe(0)
    })

    it('should reset sts_histIdx when negative', () => {
      S.sts_dutyHistArr = new Array(24).fill(0)
      S.sts_histIdx = -5
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.sts_histIdx).toBe(0)
    })

    it('should reset sts_histIdx when > 23', () => {
      S.sts_dutyHistArr = new Array(24).fill(0)
      S.sts_histIdx = 99
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.sts_histIdx).toBe(0)
    })

    it('should reset negative stats values to zero', () => {
      S.sts_hourTotalSec = -100
      S.sts_hourRunSec = -50
      S.sts_cycleCnt = -1
      loadState(() => {})
      loadChunksSeqCallback({})

      expect(S.sts_hourTotalSec).toBe(0)
      expect(S.sts_hourRunSec).toBe(0)
      expect(S.sts_cycleCnt).toBe(0)
    })
  })
})
