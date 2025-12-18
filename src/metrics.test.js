// ==============================================================================
// METRICS TESTS
// Validates runtime stats, duty cycle, and hourly rollover.
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Metrics', () => {
  let updateRuntimeStats, incrementCycleCount
  let isHourlyRolloverDue, processHourlyRollover
  let getAvgDuty24h, getCurrentHourDuty, getLifetimeDuty, getLifetimeRunHours
  let updateMetrics
  let mockS, mockV, mockALM, mockAdaptHysteresis

  beforeEach(async () => {
    vi.resetModules()

    // Create mock ALM constants
    mockALM = {
      NONE: 'NONE',
      FAIL: 'ALARM_SENSOR_FAIL',
      STUCK: 'ALARM_SENSOR_STUCK',
    }

    // Create mock state
    mockS = {
      sts_lifeTotalSec: 0,
      sts_lifeRunSec: 0,
      sts_hourTotalSec: 0,
      sts_hourRunSec: 0,
      sts_cycleCnt: 0,
      sts_histIdx: 0,
      sts_dutyHistArr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    }

    // Create mock volatile state
    mockV = {
      sys_alarm: 'NONE',
    }

    // Mock global print
    global.print = vi.fn()

    // Track adaptation calls
    mockAdaptHysteresis = vi.fn(() => null)

    // Mock dependencies
    vi.doMock('./constants.js', () => ({ ALM: mockALM }))
    vi.doMock('./config.js', () => ({ C: {} }))
    vi.doMock('./state.js', () => ({ S: mockS, V: mockV, persistState: vi.fn() }))
    vi.doMock('./utils/math.js', () => ({
      r1: vi.fn((v) => Math.round(v * 10) / 10),
    }))
    vi.doMock('./features.js', () => ({
      adaptHysteresis: mockAdaptHysteresis,
    }))

    const module = await import('./metrics.js')
    updateRuntimeStats = module.updateRuntimeStats
    incrementCycleCount = module.incrementCycleCount
    isHourlyRolloverDue = module.isHourlyRolloverDue
    processHourlyRollover = module.processHourlyRollover
    getAvgDuty24h = module.getAvgDuty24h
    getCurrentHourDuty = module.getCurrentHourDuty
    getLifetimeDuty = module.getLifetimeDuty
    getLifetimeRunHours = module.getLifetimeRunHours
    updateMetrics = module.updateMetrics
  })

  // ----------------------------------------------------------
  // UPDATE RUNTIME STATS TESTS
  // ----------------------------------------------------------

  describe('updateRuntimeStats', () => {
    it('should increment lifetime and hourly totals when ON', () => {
      updateRuntimeStats(true, 5)

      expect(mockS.sts_lifeTotalSec).toBe(5)
      expect(mockS.sts_lifeRunSec).toBe(5)
      expect(mockS.sts_hourTotalSec).toBe(5)
      expect(mockS.sts_hourRunSec).toBe(5)
    })

    it('should increment time but not run when OFF', () => {
      updateRuntimeStats(false, 5)

      expect(mockS.sts_lifeTotalSec).toBe(5)
      expect(mockS.sts_lifeRunSec).toBe(0)
      expect(mockS.sts_hourTotalSec).toBe(5)
      expect(mockS.sts_hourRunSec).toBe(0)
    })

    it('should accumulate stats during FAIL alarm', () => {
      mockV.sys_alarm = mockALM.FAIL
      updateRuntimeStats(true, 5)

      expect(mockS.sts_lifeTotalSec).toBe(5)
      expect(mockS.sts_hourTotalSec).toBe(5)
    })

    it('should accumulate stats during STUCK alarm', () => {
      mockV.sys_alarm = mockALM.STUCK
      updateRuntimeStats(true, 5)

      expect(mockS.sts_lifeTotalSec).toBe(5)
      expect(mockS.sts_hourTotalSec).toBe(5)
    })
  })

  // ----------------------------------------------------------
  // INCREMENT CYCLE COUNT TESTS
  // ----------------------------------------------------------

  describe('incrementCycleCount', () => {
    it('should increment cycle counter', () => {
      mockS.sts_cycleCnt = 5
      incrementCycleCount()
      expect(mockS.sts_cycleCnt).toBe(6)
    })
  })

  // ----------------------------------------------------------
  // HOURLY ROLLOVER TESTS
  // ----------------------------------------------------------

  describe('isHourlyRolloverDue', () => {
    it('should return true at 3600 seconds', () => {
      mockS.sts_hourTotalSec = 3600
      expect(isHourlyRolloverDue()).toBe(true)
    })

    it('should return true over 3600 seconds', () => {
      mockS.sts_hourTotalSec = 3700
      expect(isHourlyRolloverDue()).toBe(true)
    })

    it('should return false under 3600 seconds', () => {
      mockS.sts_hourTotalSec = 3500
      expect(isHourlyRolloverDue()).toBe(false)
    })
  })

  describe('processHourlyRollover', () => {
    it('should calculate average ON time with 2+ cycles', () => {
      mockS.sts_hourTotalSec = 3600
      mockS.sts_hourRunSec = 1800
      mockS.sts_cycleCnt = 3

      const result = processHourlyRollover()

      expect(result.avgOn).toBe(600) // 1800 / 3
      expect(result.avgOff).toBe(600) // (3600 - 1800) / 3
    })

    it('should calculate average ON and OFF time with 1 cycle', () => {
      mockS.sts_hourTotalSec = 3600
      mockS.sts_hourRunSec = 1800
      mockS.sts_cycleCnt = 1

      const result = processHourlyRollover()

      // Now correctly calculates avgOff for single cycle
      expect(result.avgOn).toBe(1800)
      expect(result.avgOff).toBe(1800)  // (3600 - 1800) / 1 = 1800
    })

    it('should calculate duty percentage', () => {
      mockS.sts_hourTotalSec = 3600
      mockS.sts_hourRunSec = 1800
      mockS.sts_cycleCnt = 3

      const result = processHourlyRollover()

      expect(result.duty).toBe(50)
    })

    it('should store duty in history', () => {
      mockS.sts_hourTotalSec = 3600
      mockS.sts_hourRunSec = 1800
      mockS.sts_histIdx = 5

      processHourlyRollover()

      expect(mockS.sts_dutyHistArr[5]).toBe(50)
    })

    it('should advance history index', () => {
      mockS.sts_hourTotalSec = 3600
      mockS.sts_histIdx = 5

      processHourlyRollover()

      expect(mockS.sts_histIdx).toBe(6)
    })

    it('should wrap history index at 24', () => {
      mockS.sts_hourTotalSec = 3600
      mockS.sts_histIdx = 23

      processHourlyRollover()

      expect(mockS.sts_histIdx).toBe(0)
    })

    it('should reset hourly counters', () => {
      mockS.sts_hourTotalSec = 3600
      mockS.sts_hourRunSec = 1800
      mockS.sts_cycleCnt = 5

      processHourlyRollover()

      expect(mockS.sts_hourTotalSec).toBe(0)
      expect(mockS.sts_hourRunSec).toBe(0)
      expect(mockS.sts_cycleCnt).toBe(0)
    })

    it('should trigger adaptation', () => {
      mockS.sts_hourTotalSec = 3600
      mockS.sts_hourRunSec = 1800
      mockS.sts_cycleCnt = 3

      processHourlyRollover()

      expect(mockAdaptHysteresis).toHaveBeenCalledWith(600, 600, 3)
    })
  })

  // ----------------------------------------------------------
  // DUTY CYCLE QUERY TESTS
  // ----------------------------------------------------------

  describe('getAvgDuty24h', () => {
    it('should calculate 24-hour average', () => {
      // Set all hours to 50%
      for (let i = 0; i < 24; i++) {
        mockS.sts_dutyHistArr[i] = 50
      }

      expect(getAvgDuty24h()).toBe(50)
    })

    it('should handle varying duty values', () => {
      // Mix of values
      mockS.sts_dutyHistArr = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
        10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
        0, 0, 0, 0]
      // Sum = 1100, Avg = 45.83...
      const result = getAvgDuty24h()
      expect(result).toBeCloseTo(45.8, 1)
    })

    it('should return 0 for empty history', () => {
      expect(getAvgDuty24h()).toBe(0)
    })

    it('should include current hour in average', () => {
      // Empty history but current hour has 48% duty (1200/2500)
      mockS.sts_hourTotalSec = 2500
      mockS.sts_hourRunSec = 1200

      // Current duty = 48%, history all zeros
      // Average = (0 + 48) / 24 = 2%
      expect(getAvgDuty24h()).toBe(2)
    })

    it('should replace oldest slot with current hour', () => {
      // Fill all slots with 50%
      for (let i = 0; i < 24; i++) {
        mockS.sts_dutyHistArr[i] = 50
      }
      // Current hour has 100% duty
      mockS.sts_hourTotalSec = 1000
      mockS.sts_hourRunSec = 1000
      mockS.sts_histIdx = 5  // Next slot to be written

      // Sum of history = 24 * 50 = 1200
      // Replace slot 5 (50%) with current (100%): 1200 - 50 + 100 = 1250
      // Average = 1250 / 24 = 52.08...
      expect(getAvgDuty24h()).toBeCloseTo(52.1, 1)
    })
  })

  describe('getCurrentHourDuty', () => {
    it('should calculate partial hour duty', () => {
      mockS.sts_hourTotalSec = 1800
      mockS.sts_hourRunSec = 900

      expect(getCurrentHourDuty()).toBe(50)
    })

    it('should return 0 if no time elapsed', () => {
      mockS.sts_hourTotalSec = 0
      expect(getCurrentHourDuty()).toBe(0)
    })
  })

  describe('getLifetimeDuty', () => {
    it('should calculate lifetime duty', () => {
      mockS.sts_lifeTotalSec = 86400
      mockS.sts_lifeRunSec = 43200

      expect(getLifetimeDuty()).toBe(50)
    })

    it('should return 0 if no lifetime', () => {
      mockS.sts_lifeTotalSec = 0
      expect(getLifetimeDuty()).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // GET LIFETIME RUN HOURS TESTS
  // ----------------------------------------------------------

  describe('getLifetimeRunHours', () => {
    it('should return run time in hours', () => {
      mockS.sts_lifeRunSec = 7200 // 2 hours in seconds

      expect(getLifetimeRunHours()).toBe(2)
    })

    it('should return fractional hours', () => {
      mockS.sts_lifeRunSec = 5400 // 1.5 hours

      expect(getLifetimeRunHours()).toBe(1.5)
    })

    it('should return 0 when no run time', () => {
      mockS.sts_lifeRunSec = 0

      expect(getLifetimeRunHours()).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // UPDATE METRICS TESTS
  // ----------------------------------------------------------

  describe('updateMetrics', () => {
    it('should update stats and return null if no rollover', () => {
      mockS.sts_hourTotalSec = 0
      const result = updateMetrics(true, 5)

      expect(mockS.sts_hourTotalSec).toBe(5)
      expect(result).toBeNull()
    })

    it('should trigger rollover and return result', () => {
      mockS.sts_hourTotalSec = 3595 // Will cross 3600 with +5
      mockS.sts_hourRunSec = 1800
      mockS.sts_cycleCnt = 3

      // After adding 5, hourTime = 3600, triggers rollover
      const result = updateMetrics(true, 5)

      expect(result).not.toBeNull()
      expect(result.duty).toBeDefined()
    })
  })
})
