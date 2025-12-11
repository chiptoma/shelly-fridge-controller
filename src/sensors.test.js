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
      sens_errCount: 0,
      sens_wasError: true,
      sens_bufAir: [0, 0, 0],
      sens_bufIdx: 0,
      sens_smoothAir: null,
      sens_stuckRefAir: null,
      sens_stuckTsAir: 0,
      sens_stuckRefEvap: null,
      sens_stuckTsEvap: 0,
      door_refTemp: 0,
      door_refTs: 0,
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
      mockV.sens_stuckRefAir = null
      const result = checkSensorStuck(5.0, 'sens_stuckRefAir', 'sens_stuckTsAir', 1000)

      expect(result).toBe(false)
      expect(mockV.sens_stuckRefAir).toBe(5.0)
      expect(mockV.sens_stuckTsAir).toBe(1000)
    })

    it('should reset timer when value changes significantly', () => {
      mockV.sens_stuckRefAir = 5.0
      mockV.sens_stuckTsAir = 1000

      const result = checkSensorStuck(5.5, 'sens_stuckRefAir', 'sens_stuckTsAir', 2000)

      expect(result).toBe(false)
      expect(mockV.sens_stuckRefAir).toBe(5.5)
      expect(mockV.sens_stuckTsAir).toBe(2000)
    })

    it('should not reset timer for small changes', () => {
      mockV.sens_stuckRefAir = 5.0
      mockV.sens_stuckTsAir = 1000

      const result = checkSensorStuck(5.1, 'sens_stuckRefAir', 'sens_stuckTsAir', 2000)

      expect(result).toBe(false)
      expect(mockV.sens_stuckTsAir).toBe(1000) // Unchanged
    })

    it('should return true when stuck too long', () => {
      mockV.sens_stuckRefAir = 5.0
      mockV.sens_stuckTsAir = 1000

      // 14400 + 1 seconds later
      const result = checkSensorStuck(5.0, 'sens_stuckRefAir', 'sens_stuckTsAir', 15401)

      expect(result).toBe(true)
    })

    it('should not return true if not stuck long enough', () => {
      mockV.sens_stuckRefAir = 5.0
      mockV.sens_stuckTsAir = 1000

      const result = checkSensorStuck(5.0, 'sens_stuckRefAir', 'sens_stuckTsAir', 10000)

      expect(result).toBe(false)
    })
  })

  // ----------------------------------------------------------
  // * HANDLE SENSOR ERROR TESTS
  // ----------------------------------------------------------

  describe('handleSensorError', () => {
    it('should increment error count', () => {
      mockV.sens_errCount = 0
      handleSensorError()
      expect(mockV.sens_errCount).toBe(1)
    })

    it('should return false when under limit', () => {
      mockV.sens_errCount = 3
      const result = handleSensorError()
      expect(result).toBe(false)
    })

    it('should return true when limit exceeded', () => {
      mockV.sens_errCount = 5
      const result = handleSensorError()
      expect(result).toBe(true)
      expect(mockV.sens_errCount).toBe(6)
    })
  })

  // ----------------------------------------------------------
  // * HANDLE SENSOR RECOVERY TESTS
  // ----------------------------------------------------------

  describe('handleSensorRecovery', () => {
    it('should initialize buffer with raw value', () => {
      handleSensorRecovery(4.5)

      expect(mockV.sens_bufAir[0]).toBe(4.5)
      expect(mockV.sens_bufAir[1]).toBe(4.5)
      expect(mockV.sens_bufAir[2]).toBe(4.5)
    })

    it('should reset buffer index', () => {
      mockV.sens_bufIdx = 2
      handleSensorRecovery(4.5)
      expect(mockV.sens_bufIdx).toBe(0)
    })

    it('should initialize smoothed value', () => {
      handleSensorRecovery(4.5)
      expect(mockV.sens_smoothAir).toBe(4.5)
    })

    it('should reset door reference', () => {
      mockV.door_refTs = 1000
      mockV.door_refTemp = 5.0
      handleSensorRecovery(4.5)

      expect(mockV.door_refTs).toBe(0)
      expect(mockV.door_refTemp).toBe(0)
    })

    it('should clear error flag', () => {
      mockV.sens_wasError = true
      handleSensorRecovery(4.5)
      expect(mockV.sens_wasError).toBe(false)
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
      // ? Must set sens_smoothAir to non-null to skip warmup path
      mockV.sens_smoothAir = 4.0
      mockV.sens_bufIdx = 0
      processSensorData(5.0)

      expect(mockV.sens_bufAir[0]).toBe(5.0)
      expect(mockV.sens_bufIdx).toBe(1)
    })

    it('should wrap buffer index at 3', () => {
      // ? Must set sens_smoothAir to non-null to skip warmup path
      mockV.sens_smoothAir = 4.0
      mockV.sens_bufIdx = 2
      processSensorData(5.0)

      expect(mockV.sens_bufIdx).toBe(0)
    })

    it('should return median value', () => {
      mockV.sens_bufAir = [3.0, 5.0, 4.0]
      mockV.sens_bufIdx = 0
      mockV.sens_smoothAir = 4.0

      const median = processSensorData(6.0)

      // After adding 6.0 at index 0: [6.0, 5.0, 4.0]
      // Median of 6, 5, 4 = 5
      expect(median).toBe(5)
    })

    it('should update smoothed value with EMA', () => {
      mockV.sens_bufAir = [4.0, 4.0, 4.0]
      mockV.sens_bufIdx = 0
      mockV.sens_smoothAir = 4.0

      processSensorData(4.0)

      expect(mockV.sens_smoothAir).toBeDefined()
    })

    it('should handle first reading (null smoothAir)', () => {
      mockV.sens_smoothAir = null
      mockV.sens_bufAir = [5.0, 5.0, 5.0]  // Pre-fill buffer
      mockV.sens_bufIdx = 0

      processSensorData(5.0)

      // Median of [5, 5, 5] = 5, EMA with null prev returns current
      expect(mockV.sens_smoothAir).toBe(5.0)
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
      mockV.sens_errCount = 5
      resetSensorError()
      expect(mockV.sens_errCount).toBe(0)
    })
  })
})
