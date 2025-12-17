// ==============================================================================
// * SENSOR TESTS
// ? Validates sensor reading, smoothing, and health monitoring.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Sensors', () => {
  let checkSensorStuck, handleSensorError, handleSensorRecovery
  let processSensorData, validateSensorReadings, resetSensorError
  let mockV, mockC

  beforeEach(async () => {
    vi.resetModules()

    // Create mock state
    mockV = {
      sns_errCnt: 0,
      sns_wasErr: true,
      sns_airBuf: [0, 0, 0],
      sns_bufIdx: 0,
      sns_airSmoothDeg: null,
      sns_airStuckRefDeg: null,
      sns_airStuckTs: 0,
      sns_evpStuckRefDeg: null,
      sns_evpStuckTs: 0,
      dor_refDeg: 0,
      dor_refTs: 0,
    }

    // Create mock config
    mockC = {
      sys_sensFailLimit: 5,
      sens_stuckEnable: true,
      sens_stuckEpsDeg: 0.2,
      sens_stuckTimeSec: 14400,
      ctrl_smoothAlpha: 0.08,
    }

    // Mock print
    global.print = vi.fn()

    // Mock dependencies
    vi.doMock('./config.js', () => ({ C: mockC }))
    vi.doMock('./state.js', () => ({ S: {}, V: mockV }))
    vi.doMock('./utils/math.js', () => ({
      r2: vi.fn((v) => Math.round(v * 100) / 100),
      getMedian3: vi.fn((a, b, c) => {
        if (a <= b) {
          if (b <= c) return b
          if (a <= c) return c
          return a
        } else {
          if (a <= c) return a
          if (b <= c) return c
          return b
        }
      }),
      calcEMA: vi.fn((current, prev, alpha) => {
        if (prev === null) return current
        return (current * alpha) + (prev * (1.0 - alpha))
      }),
    }))

    const module = await import('./sensors.js')
    checkSensorStuck = module.checkSensorStuck
    handleSensorError = module.handleSensorError
    handleSensorRecovery = module.handleSensorRecovery
    processSensorData = module.processSensorData
    validateSensorReadings = module.validateSensorReadings
    resetSensorError = module.resetSensorError
  })

  // ----------------------------------------------------------
  // * CHECK SENSOR STUCK TESTS
  // ----------------------------------------------------------

  describe('checkSensorStuck', () => {
    it('should initialize reference on first call', () => {
      mockV.sns_airStuckRefDeg = null
      const result = checkSensorStuck(5.0, 'sns_airStuckRefDeg', 'sns_airStuckTs', 1000)

      expect(result).toBe(false)
      expect(mockV.sns_airStuckRefDeg).toBe(5.0)
      expect(mockV.sns_airStuckTs).toBe(1000)
    })

    it('should reset timer when value changes significantly', () => {
      mockV.sns_airStuckRefDeg = 5.0
      mockV.sns_airStuckTs = 1000

      const result = checkSensorStuck(5.5, 'sns_airStuckRefDeg', 'sns_airStuckTs', 2000)

      expect(result).toBe(false)
      expect(mockV.sns_airStuckRefDeg).toBe(5.5)
      expect(mockV.sns_airStuckTs).toBe(2000)
    })

    it('should not reset timer for small changes', () => {
      mockV.sns_airStuckRefDeg = 5.0
      mockV.sns_airStuckTs = 1000

      const result = checkSensorStuck(5.1, 'sns_airStuckRefDeg', 'sns_airStuckTs', 2000)

      expect(result).toBe(false)
      expect(mockV.sns_airStuckTs).toBe(1000) // Unchanged
    })

    it('should return true when stuck too long', () => {
      mockV.sns_airStuckRefDeg = 5.0
      mockV.sns_airStuckTs = 1000

      // 14400 + 1 seconds later
      const result = checkSensorStuck(5.0, 'sns_airStuckRefDeg', 'sns_airStuckTs', 15401)

      expect(result).toBe(true)
    })

    it('should not return true if not stuck long enough', () => {
      mockV.sns_airStuckRefDeg = 5.0
      mockV.sns_airStuckTs = 1000

      const result = checkSensorStuck(5.0, 'sns_airStuckRefDeg', 'sns_airStuckTs', 10000)

      expect(result).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // * HANDLE SENSOR ERROR TESTS
  // ----------------------------------------------------------

  describe('handleSensorError', () => {
    it('should increment error count', () => {
      mockV.sns_errCnt = 0
      handleSensorError()
      expect(mockV.sns_errCnt).toBe(1)
    })

    it('should return false when under limit', () => {
      mockV.sns_errCnt = 3
      const result = handleSensorError()
      expect(result).toBe(false)
    })

    it('should return true when limit exceeded', () => {
      mockV.sns_errCnt = 5
      const result = handleSensorError()
      expect(result).toBe(true)
      expect(mockV.sns_errCnt).toBe(6)
    })
  })

  // ----------------------------------------------------------
  // * HANDLE SENSOR RECOVERY TESTS
  // ----------------------------------------------------------

  describe('handleSensorRecovery', () => {
    it('should initialize buffer with raw value', () => {
      handleSensorRecovery(4.5)

      expect(mockV.sns_airBuf[0]).toBe(4.5)
      expect(mockV.sns_airBuf[1]).toBe(4.5)
      expect(mockV.sns_airBuf[2]).toBe(4.5)
    })

    it('should reset buffer index', () => {
      mockV.sns_bufIdx = 2
      handleSensorRecovery(4.5)
      expect(mockV.sns_bufIdx).toBe(0)
    })

    it('should initialize smoothed value', () => {
      handleSensorRecovery(4.5)
      expect(mockV.sns_airSmoothDeg).toBe(4.5)
    })

    it('should reset door reference', () => {
      mockV.dor_refTs = 1000
      mockV.dor_refDeg = 5.0
      handleSensorRecovery(4.5)

      expect(mockV.dor_refTs).toBe(0)
      expect(mockV.dor_refDeg).toBe(0)
    })

    it('should clear error flag', () => {
      mockV.sns_wasErr = true
      handleSensorRecovery(4.5)
      expect(mockV.sns_wasErr).toBe(false)
    })

    it('should print recovery message', () => {
      handleSensorRecovery(4.5)
      expect(global.print).toHaveBeenCalledWith('ℹ️ SENS  : Sensors recovered after errors')
    })
  })

  // ----------------------------------------------------------
  // * PROCESS SENSOR DATA TESTS
  // ----------------------------------------------------------

  describe('processSensorData', () => {
    it('should update circular buffer', () => {
      // ? Must set sns_airSmoothDeg to non-null to skip warmup path
      mockV.sns_airSmoothDeg = 4.0
      mockV.sns_bufIdx = 0
      processSensorData(5.0)

      expect(mockV.sns_airBuf[0]).toBe(5.0)
      expect(mockV.sns_bufIdx).toBe(1)
    })

    it('should wrap buffer index at 3', () => {
      // ? Must set sns_airSmoothDeg to non-null to skip warmup path
      mockV.sns_airSmoothDeg = 4.0
      mockV.sns_bufIdx = 2
      processSensorData(5.0)

      expect(mockV.sns_bufIdx).toBe(0)
    })

    it('should return median value', () => {
      mockV.sns_airBuf = [3.0, 5.0, 4.0]
      mockV.sns_bufIdx = 0
      mockV.sns_airSmoothDeg = 4.0

      const median = processSensorData(6.0)

      // After adding 6.0 at index 0: [6.0, 5.0, 4.0]
      // Median of 6, 5, 4 = 5
      expect(median).toBe(5)
    })

    it('should update smoothed value with EMA', () => {
      mockV.sns_airBuf = [4.0, 4.0, 4.0]
      mockV.sns_bufIdx = 0
      mockV.sns_airSmoothDeg = 4.0

      processSensorData(4.0)

      expect(mockV.sns_airSmoothDeg).toBeDefined()
    })

    it('should handle first reading (null smoothAir)', () => {
      mockV.sns_airSmoothDeg = null
      mockV.sns_airBuf = [5.0, 5.0, 5.0]  // Pre-fill buffer
      mockV.sns_bufIdx = 0

      processSensorData(5.0)

      // Median of [5, 5, 5] = 5, EMA with null prev returns current
      expect(mockV.sns_airSmoothDeg).toBe(5.0)
    })
  })

  // ----------------------------------------------------------
  // * VALIDATE SENSOR READINGS TESTS
  // ----------------------------------------------------------

  describe('validateSensorReadings', () => {
    it('should return false if rAir is null', () => {
      const result = validateSensorReadings(null, { tC: 5.0 })
      expect(result).toBe(false)
    })

    it('should return false if rEvap is null', () => {
      const result = validateSensorReadings({ tC: 5.0 }, null)
      expect(result).toBe(false)
    })

    it('should return false if tC is undefined', () => {
      const result = validateSensorReadings({ tC: undefined }, { tC: 5.0 })
      expect(result).toBe(false)
    })

    it('should return false if tC is NaN', () => {
      const result = validateSensorReadings({ tC: NaN }, { tC: 5.0 })
      expect(result).toBe(false)
    })

    it('should return true for valid readings', () => {
      const result = validateSensorReadings({ tC: 4.5 }, { tC: -10.0 })
      expect(result).toBe(true)
    })

    it('should return true for zero values', () => {
      const result = validateSensorReadings({ tC: 0 }, { tC: 0 })
      expect(result).toBe(true)
    })

    it('should return true for negative values', () => {
      const result = validateSensorReadings({ tC: -5.0 }, { tC: -20.0 })
      expect(result).toBe(true)
    })
  })

  // ----------------------------------------------------------
  // * RESET SENSOR ERROR TESTS
  // ----------------------------------------------------------

  describe('resetSensorError', () => {
    it('should reset error count to zero', () => {
      mockV.sns_errCnt = 5
      resetSensorError()
      expect(mockV.sns_errCnt).toBe(0)
    })
  })
})
