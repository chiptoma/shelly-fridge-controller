// ==============================================================================
// * MATH UTILITIES
// ? Rounding and mathematical helper functions.
// ? Pure functions with no dependencies - 100% testable.
// ==============================================================================

// ----------------------------------------------------------
// * ROUNDING FUNCTIONS
// ? Consistent decimal rounding to save memory.
// ----------------------------------------------------------

/**
 * * r1 - Round to 1 decimal place
 * @param {number} v - Value to round
 * @returns {number} - Rounded value
 */
function r1(v) { return Math.round(v * 10) / 10 }

/**
 * * r2 - Round to 2 decimal places
 * @param {number} v - Value to round
 * @returns {number} - Rounded value
 */
function r2(v) { return Math.round(v * 100) / 100 }

/**
 * * r3 - Round to 3 decimal places
 * @param {number} v - Value to round
 * @returns {number} - Rounded value
 */
function r3(v) { return Math.round(v * 1000) / 1000 }

/**
 * * ri - Round to integer (floor)
 * @param {number} v - Value to round
 * @returns {number} - Floored integer
 */
function ri(v) { return Math.floor(v) }

/**
 * * formatXmYs - Format seconds as XXmYYs string (fixed width)
 * @param {number} sec - Duration in seconds
 * @returns {string} - Formatted duration (e.g. '01m05s', '10m30s')
 */
function formatXmYs(sec) {
  if (typeof sec !== 'number' || !isFinite(sec) || sec <= 0) return '00m00s'
  let total = Math.floor(sec)
  let m = Math.floor(total / 60)
  let s = total % 60
  return (m < 10 ? '0' : '') + m + 'm' + (s < 10 ? '0' : '') + s + 's'
}

/**
 * * nowSec - Get current timestamp in seconds
 * ? Memory optimization: single function for Date.now() / 1000 pattern
 * @returns {number} - Current epoch time in seconds
 */
function nowSec() { return Date.now() / 1000 }

// ----------------------------------------------------------
// * MEDIAN CALCULATION
// ? Optimized 3-value median for sensor noise filtering.
// ----------------------------------------------------------

/**
 * * getMedian3 - Get median of 3 values
 * ? Branchless-optimized for performance.
 *
 * @param {number} a - First value
 * @param {number} b - Second value
 * @param {number} c - Third value
 * @returns {number} - Median value
 */
function getMedian3(a, b, c) {
  if (a <= b) {
    if (b <= c) return b
    if (a <= c) return c
    return a
  } else {
    if (a <= c) return a
    if (b <= c) return c
    return b
  }
}

// ----------------------------------------------------------
// * EXPONENTIAL MOVING AVERAGE
// ? Smooths noisy sensor readings over time.
// ----------------------------------------------------------

/**
 * * calcEMA - Calculate Exponential Moving Average
 * ? Formula: EMA = current * alpha + previous * (1 - alpha)
 *
 * @param {number} current - Current value
 * @param {number|null} prev - Previous EMA value (null for first reading)
 * @param {number} alpha - Smoothing factor (0-1, higher = more responsive)
 * @returns {number} - New EMA value
 */
function calcEMA(current, prev, alpha) {
  if (prev === null) return current
  return (current * alpha) + (prev * (1.0 - alpha))
}

// ----------------------------------------------------------
// * EXPORTS
// ----------------------------------------------------------

export { r1, r2, r3, ri, nowSec, getMedian3, calcEMA, formatXmYs }
