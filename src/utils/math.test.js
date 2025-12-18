// ==============================================================================
// MATH UTILITIES TESTS
// Tests for rounding, median, EMA, and time formatting functions.
// ==============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { r1, r2, r3, ri, nowSec, getMedian3, calcEMA, formatXmYs } from './math.js'

// ----------------------------------------------------------
// ROUNDING FUNCTIONS
// ----------------------------------------------------------

describe('Rounding Functions', () => {
  describe('r1 - Round to 1 decimal', () => {
    it('should round to 1 decimal place', () => {
      expect(r1(1.234)).toBe(1.2)
      expect(r1(1.25)).toBe(1.3)
      expect(r1(1.24)).toBe(1.2)
    })

    it('should handle negative numbers', () => {
      expect(r1(-1.234)).toBe(-1.2)
      expect(r1(-1.25)).toBe(-1.2) // Banker's rounding
    })

    it('should handle zero', () => {
      expect(r1(0)).toBe(0)
      expect(r1(0.04)).toBe(0)
      expect(r1(0.05)).toBe(0.1)
    })

    it('should handle integers', () => {
      expect(r1(5)).toBe(5)
      expect(r1(100)).toBe(100)
    })
  })

  describe('r2 - Round to 2 decimals', () => {
    it('should round to 2 decimal places', () => {
      expect(r2(1.2345)).toBe(1.23)
      expect(r2(1.235)).toBe(1.24)
      expect(r2(1.234)).toBe(1.23)
    })

    it('should handle negative numbers', () => {
      expect(r2(-1.2345)).toBe(-1.23)
    })

    it('should handle zero', () => {
      expect(r2(0)).toBe(0)
      expect(r2(0.004)).toBe(0)
      expect(r2(0.005)).toBe(0.01)
    })
  })

  describe('r3 - Round to 3 decimals', () => {
    it('should round to 3 decimal places', () => {
      expect(r3(1.23456)).toBe(1.235)
      expect(r3(1.2345)).toBe(1.235)
      expect(r3(1.2344)).toBe(1.234)
    })

    it('should handle negative numbers', () => {
      expect(r3(-1.23456)).toBe(-1.235)
    })

    it('should handle zero', () => {
      expect(r3(0)).toBe(0)
      expect(r3(0.0004)).toBe(0)
      expect(r3(0.0005)).toBe(0.001)
    })
  })

  describe('ri - Round to integer (floor)', () => {
    it('should floor positive numbers', () => {
      expect(ri(1.9)).toBe(1)
      expect(ri(1.1)).toBe(1)
      expect(ri(1.0)).toBe(1)
    })

    it('should floor negative numbers', () => {
      expect(ri(-1.1)).toBe(-2)
      expect(ri(-1.9)).toBe(-2)
    })

    it('should handle zero', () => {
      expect(ri(0)).toBe(0)
      expect(ri(0.9)).toBe(0)
      expect(ri(-0.1)).toBe(-1)
    })

    it('should return integers unchanged', () => {
      expect(ri(5)).toBe(5)
      expect(ri(-5)).toBe(-5)
    })
  })
})

// ----------------------------------------------------------
// TIME FUNCTIONS
// ----------------------------------------------------------

describe('Time Functions', () => {
  describe('nowSec', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return current timestamp in seconds', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
      const expected = Date.now() / 1000
      expect(nowSec()).toBe(expected)
    })

    it('should return different values at different times', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
      const time1 = nowSec()

      vi.setSystemTime(new Date('2024-01-01T00:00:10Z'))
      const time2 = nowSec()

      expect(time2 - time1).toBe(10)
    })
  })

  describe('formatXmYs', () => {
    it('should format seconds as XXmYYs', () => {
      expect(formatXmYs(65)).toBe('01m05s')
      expect(formatXmYs(630)).toBe('10m30s')
      expect(formatXmYs(3661)).toBe('61m01s')
    })

    it('should handle zero', () => {
      expect(formatXmYs(0)).toBe('00m00s')
    })

    it('should handle negative values', () => {
      expect(formatXmYs(-10)).toBe('00m00s')
    })

    it('should handle non-numbers', () => {
      expect(formatXmYs(null)).toBe('00m00s')
      expect(formatXmYs(undefined)).toBe('00m00s')
      expect(formatXmYs('string')).toBe('00m00s')
    })

    it('should handle Infinity and NaN', () => {
      expect(formatXmYs(Infinity)).toBe('00m00s')
      expect(formatXmYs(-Infinity)).toBe('00m00s')
      expect(formatXmYs(NaN)).toBe('00m00s')
    })

    it('should handle decimal seconds (floor)', () => {
      expect(formatXmYs(65.9)).toBe('01m05s')
      expect(formatXmYs(59.999)).toBe('00m59s')
    })

    it('should pad single digits', () => {
      expect(formatXmYs(5)).toBe('00m05s')
      expect(formatXmYs(60)).toBe('01m00s')
      expect(formatXmYs(61)).toBe('01m01s')
    })
  })
})

// ----------------------------------------------------------
// MEDIAN CALCULATION
// ----------------------------------------------------------

describe('getMedian3', () => {
  it('should return median of ascending values', () => {
    expect(getMedian3(1, 2, 3)).toBe(2)
    expect(getMedian3(10, 20, 30)).toBe(20)
  })

  it('should return median of descending values', () => {
    expect(getMedian3(3, 2, 1)).toBe(2)
    expect(getMedian3(30, 20, 10)).toBe(20)
  })

  it('should return median of mixed order values', () => {
    expect(getMedian3(1, 3, 2)).toBe(2)
    expect(getMedian3(2, 1, 3)).toBe(2)
    expect(getMedian3(2, 3, 1)).toBe(2)
    expect(getMedian3(3, 1, 2)).toBe(2)
  })

  it('should handle equal values', () => {
    expect(getMedian3(5, 5, 5)).toBe(5)
    expect(getMedian3(1, 5, 5)).toBe(5)
    expect(getMedian3(5, 1, 5)).toBe(5)
    expect(getMedian3(5, 5, 1)).toBe(5)
  })

  it('should handle negative values', () => {
    expect(getMedian3(-3, -1, -2)).toBe(-2)
    expect(getMedian3(-10, 0, 10)).toBe(0)
  })

  it('should handle decimal values', () => {
    expect(getMedian3(1.1, 1.2, 1.3)).toBe(1.2)
    expect(getMedian3(1.3, 1.1, 1.2)).toBe(1.2)
  })

  it('should handle temperature-like values', () => {
    // Simulating noisy sensor readings
    expect(getMedian3(4.2, 4.5, 4.3)).toBe(4.3)
    expect(getMedian3(-10.5, -10.2, -10.8)).toBe(-10.5)
  })
})

// ----------------------------------------------------------
// EXPONENTIAL MOVING AVERAGE
// ----------------------------------------------------------

describe('calcEMA', () => {
  it('should return current value when prev is null', () => {
    expect(calcEMA(5.0, null, 0.1)).toBe(5.0)
    expect(calcEMA(10.0, null, 0.5)).toBe(10.0)
  })

  it('should calculate EMA with alpha = 0.1', () => {
    // EMA = current * 0.1 + prev * 0.9
    const result = calcEMA(10.0, 5.0, 0.1)
    expect(result).toBeCloseTo(5.5, 5) // 10 * 0.1 + 5 * 0.9 = 5.5
  })

  it('should calculate EMA with alpha = 0.5', () => {
    // EMA = current * 0.5 + prev * 0.5
    const result = calcEMA(10.0, 5.0, 0.5)
    expect(result).toBeCloseTo(7.5, 5) // 10 * 0.5 + 5 * 0.5 = 7.5
  })

  it('should calculate EMA with alpha = 1.0 (no smoothing)', () => {
    const result = calcEMA(10.0, 5.0, 1.0)
    expect(result).toBe(10.0) // 10 * 1.0 + 5 * 0 = 10
  })

  it('should calculate EMA with alpha = 0 (maximum smoothing)', () => {
    const result = calcEMA(10.0, 5.0, 0)
    expect(result).toBe(5.0) // 10 * 0 + 5 * 1.0 = 5
  })

  it('should handle typical thermostat alpha (0.08)', () => {
    // Starting at 10C, new reading 5C
    const result = calcEMA(5.0, 10.0, 0.08)
    expect(result).toBeCloseTo(9.6, 5) // 5 * 0.08 + 10 * 0.92 = 9.6
  })

  it('should converge over multiple iterations', () => {
    let ema = null
    const readings = [5.0, 5.0, 5.0, 5.0, 5.0]

    for (const reading of readings) {
      ema = calcEMA(reading, ema, 0.5)
    }

    // After 5 readings at 5.0, EMA should be very close to 5.0
    expect(ema).toBeCloseTo(5.0, 1)
  })

  it('should track sudden changes gradually', () => {
    let ema = 20.0 // Starting EMA

    // Sudden drop to 10C
    ema = calcEMA(10.0, ema, 0.1)
    expect(ema).toBeCloseTo(19.0, 5) // Slow response

    ema = calcEMA(10.0, ema, 0.1)
    expect(ema).toBeCloseTo(18.1, 5) // Still approaching

    // With alpha = 0.5, faster tracking
    ema = 20.0
    ema = calcEMA(10.0, ema, 0.5)
    expect(ema).toBeCloseTo(15.0, 5) // Faster response
  })
})
