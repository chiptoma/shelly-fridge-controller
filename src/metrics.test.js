// ==============================================================================
// * METRICS TESTS
// ? Validates runtime stats, duty cycle, and hourly rollover.
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
      stats_lifeTime: 0,
      stats_lifeRun: 0,
      stats_hourTime: 0,
      stats_hourRun: 0,
      stats_cycleCount: 0,
      stats_hourIdx: 0,
      stats_history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
  // * UPDATE RUNTIME STATS TESTS
  // ----------------------------------------------------------

  describe('updateRuntimeStats', () => {
    it('should increment lifetime and hourly totals when ON', () => {
      updateRuntimeStats(true, 5)

      expect(mockS.stats_lifeTime).toBe(5)
      expect(mockS.stats_lifeRun).toBe(5)
      expect(mockS.stats_hourTime).toBe(5)
      expect(mockS.stats_hourRun).toBe(5)
    })

    it('should increment time but not run when OFF', () => {
      updateRuntimeStats(false, 5)

      expect(mockS.stats_lifeTime).toBe(5)
      expect(mockS.stats_lifeRun).toBe(0)
      expect(mockS.stats_hourTime).toBe(5)
      expect(mockS.stats_hourRun).toBe(0)
    })

    it('should skip stats during FAIL alarm', () => {
      mockV.sys_alarm = mockALM.FAIL
      updateRuntimeStats(true, 5)

      expect(mockS.stats_lifeTime).toBe(0)
    })

    it('should skip stats during STUCK alarm', () => {
      mockV.sys_alarm = mockALM.STUCK
      updateRuntimeStats(true, 5)

      expect(mockS.stats_lifeTime).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // * INCREMENT CYCLE COUNT TESTS
  // ----------------------------------------------------------

  describe('incrementCycleCount', () => {
    it('should increment cycle counter', () => {
      mockS.stats_cycleCount = 5
      incrementCycleCount()
      expect(mockS.stats_cycleCount).toBe(6)
    })
  })

  // ----------------------------------------------------------
  // * HOURLY ROLLOVER TESTS
  // ----------------------------------------------------------

  describe('isHourlyRolloverDue', () => {
    it('should return true at 3600 seconds', () => {
      mockS.stats_hourTime = 3600
      expect(isHourlyRolloverDue()).toBe(true)
    })

    it('should return true over 3600 seconds', () => {
      mockS.stats_hourTime = 3700
      expect(isHourlyRolloverDue()).toBe(true)
    })

    it('should return false under 3600 seconds', () => {
      mockS.stats_hourTime = 3500
      expect(isHourlyRolloverDue()).toBe(false)
    })
  })

  describe('processHourlyRollover', () => {
    it('should calculate average ON time with 2+ cycles', () => {
      mockS.stats_hourTime = 3600
      mockS.stats_hourRun = 1800
      mockS.stats_cycleCount = 3

      const result = processHourlyRollover()

      expect(result.avgOn).toBe(600) // 1800 / 3
      expect(result.avgOff).toBe(600) // (3600 - 1800) / 3
    })

    it('should calculate average ON and OFF time with 1 cycle', () => {
      mockS.stats_hourTime = 3600
      mockS.stats_hourRun = 1800
      mockS.stats_cycleCount = 1

      const result = processHourlyRollover()

      // ? Now correctly calculates avgOff for single cycle
      expect(result.avgOn).toBe(1800)
      expect(result.avgOff).toBe(1800)  // (3600 - 1800) / 1 = 1800
    })

    it('should calculate duty percentage', () => {
      mockS.stats_hourTime = 3600
      mockS.stats_hourRun = 1800
      mockS.stats_cycleCount = 3

      const result = processHourlyRollover()

      expect(result.duty).toBe(50)
    })

    it('should store duty in history', () => {
      mockS.stats_hourTime = 3600
      mockS.stats_hourRun = 1800
      mockS.stats_hourIdx = 5

      processHourlyRollover()

      expect(mockS.stats_history[5]).toBe(50)
    })

    it('should advance history index', () => {
      mockS.stats_hourTime = 3600
      mockS.stats_hourIdx = 5

      processHourlyRollover()

      expect(mockS.stats_hourIdx).toBe(6)
    })

    it('should wrap history index at 24', () => {
      mockS.stats_hourTime = 3600
      mockS.stats_hourIdx = 23

      processHourlyRollover()

      expect(mockS.stats_hourIdx).toBe(0)
    })

    it('should reset hourly counters', () => {
      mockS.stats_hourTime = 3600
      mockS.stats_hourRun = 1800
      mockS.stats_cycleCount = 5

      processHourlyRollover()

      expect(mockS.stats_hourTime).toBe(0)
      expect(mockS.stats_hourRun).toBe(0)
      expect(mockS.stats_cycleCount).toBe(0)
    })

    it('should trigger adaptation', () => {
      mockS.stats_hourTime = 3600
      mockS.stats_hourRun = 1800
      mockS.stats_cycleCount = 3

      processHourlyRollover()

      expect(mockAdaptHysteresis).toHaveBeenCalledWith(600, 600, 3)
    })
  })

  // ----------------------------------------------------------
  // * DUTY CYCLE QUERY TESTS
  // ----------------------------------------------------------

  describe('getAvgDuty24h', () => {
    it('should calculate 24-hour average', () => {
      // Set all hours to 50%
      for (let i = 0; i < 24; i++) {
        mockS.stats_history[i] = 50
      }

      expect(getAvgDuty24h()).toBe(50)
    })

    it('should handle varying duty values', () => {
      // Mix of values
      mockS.stats_history = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
        10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
        0, 0, 0, 0]
      // Sum = 1100, Avg = 45.83...
      const result = getAvgDuty24h()
      expect(result).toBeCloseTo(45.8, 1)
    })

    it('should return 0 for empty history', () => {
      expect(getAvgDuty24h()).toBe(0)
    })
  })

  describe('getCurrentHourDuty', () => {
    it('should calculate partial hour duty', () => {
      mockS.stats_hourTime = 1800
      mockS.stats_hourRun = 900

      expect(getCurrentHourDuty()).toBe(50)
    })

    it('should return 0 if no time elapsed', () => {
      mockS.stats_hourTime = 0
      expect(getCurrentHourDuty()).toBe(0)
    })
  })

  describe('getLifetimeDuty', () => {
    it('should calculate lifetime duty', () => {
      mockS.stats_lifeTime = 86400
      mockS.stats_lifeRun = 43200

      expect(getLifetimeDuty()).toBe(50)
    })

    it('should return 0 if no lifetime', () => {
      mockS.stats_lifeTime = 0
      expect(getLifetimeDuty()).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // * GET LIFETIME RUN HOURS TESTS
  // ----------------------------------------------------------

  describe('getLifetimeRunHours', () => {
    it('should return run time in hours', () => {
      mockS.stats_lifeRun = 7200 // 2 hours in seconds

      expect(getLifetimeRunHours()).toBe(2)
    })

    it('should return fractional hours', () => {
      mockS.stats_lifeRun = 5400 // 1.5 hours

      expect(getLifetimeRunHours()).toBe(1.5)
    })

    it('should return 0 when no run time', () => {
      mockS.stats_lifeRun = 0

      expect(getLifetimeRunHours()).toBe(0)
    })
  })

  // ----------------------------------------------------------
  // * UPDATE METRICS TESTS
  // ----------------------------------------------------------

  describe('updateMetrics', () => {
    it('should update stats and return null if no rollover', () => {
      mockS.stats_hourTime = 0
      const result = updateMetrics(true, 5)

      expect(mockS.stats_hourTime).toBe(5)
      expect(result).toBeNull()
    })

    it('should trigger rollover and return result', () => {
      mockS.stats_hourTime = 3595 // Will cross 3600 with +5
      mockS.stats_hourRun = 1800
      mockS.stats_cycleCount = 3

      // After adding 5, hourTime = 3600, triggers rollover
      const result = updateMetrics(true, 5)

      expect(result).not.toBeNull()
      expect(result.duty).toBeDefined()
    })
  })
})
