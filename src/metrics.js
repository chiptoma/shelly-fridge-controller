// ==============================================================================
// * METRICS & STATISTICS
// ? Runtime statistics, duty cycle tracking, and hourly rollover.
// ? Tracks compressor runtime, cycle counts, and historical duty%.
// ==============================================================================

import { C } from './config.js'
import { S, V, persistState } from './state.js'
import { r1 } from './utils/math.js'
import { adaptHysteresis } from './features.js'

// ----------------------------------------------------------
// * RUNTIME ACCUMULATORS
// ? Updates running totals for time and cycles.
// ----------------------------------------------------------

/**
 * * UPDATE RUNTIME STATS
 * ? Increments lifetime and hourly statistics.
 * ? Always accumulates regardless of alarm state.
 *
 * @param  {boolean} isOn - Current relay state
 * @param  {number}  dt   - Time delta (seconds)
 */
function updateRuntimeStats(isOn, dt) {
  S.sts_lifeTotalSec += dt
  if (isOn) S.sts_lifeRunSec += dt
  S.sts_hourTotalSec += dt
  if (isOn) S.sts_hourRunSec += dt
}

/**
 * * INCREMENT CYCLE COUNT
 * ? Call this when relay turns OFF to count completed cycles.
 */
function incrementCycleCount() {
  S.sts_cycleCnt += 1
}

// ----------------------------------------------------------
// * HOURLY ROLLOVER
// ? Processes hourly statistics and triggers adaptation.
// ----------------------------------------------------------

/**
 * * CHECK HOURLY ROLLOVER
 * ? Returns true if hour boundary has been crossed.
 *
 * @returns {boolean} - True if rollover needed
 */
function isHourlyRolloverDue() {
  return S.sts_hourTotalSec >= 3600
}

/**
 * * PROCESS HOURLY ROLLOVER
 * ? Calculates averages, triggers adaptation, stores history.
 * ? Call only when isHourlyRolloverDue() returns true.
 *
 * @returns {object} - { avgOn, avgOff, duty, adapted }
 */
function processHourlyRollover() {
  // Calculate average ON and OFF times
  let avgOn = 0
  let avgOff = 0

  if (S.sts_cycleCnt >= 1) {
    avgOn = S.sts_hourRunSec / S.sts_cycleCnt
    avgOff = (S.sts_hourTotalSec - S.sts_hourRunSec) / S.sts_cycleCnt
  }

  // Trigger adaptive hysteresis (if enabled)
  let adapted = adaptHysteresis(avgOn, avgOff, S.sts_cycleCnt)

  // Calculate and store duty%
  let duty = (S.sts_hourRunSec / S.sts_hourTotalSec) * 100
  S.sts_dutyHistArr[S.sts_histIdx] = r1(duty)
  S.sts_histIdx = (S.sts_histIdx + 1) % 24

  // Reset hourly counters
  S.sts_hourTotalSec = 0
  S.sts_hourRunSec = 0
  S.sts_cycleCnt = 0

  // Save state after rollover (critical for history preservation)
  persistState()

  return {
    avgOn: avgOn,
    avgOff: avgOff,
    duty: r1(duty),
    adapted: adapted,
  }
}

// ----------------------------------------------------------
// * DUTY CYCLE QUERIES
// ? Read-only access to duty statistics.
// ----------------------------------------------------------

/**
 * * GET 24-HOUR AVERAGE DUTY
 * ? Calculates average duty% over the last 24 hours.
 * ? Includes current partial hour in place of oldest slot.
 *
 * @returns {number} - Average duty percentage (0-100)
 */
function getAvgDuty24h() {
  let sum = 0
  for (let i = 0; i < 24; i++) {
    sum += S.sts_dutyHistArr[i]
  }

  // ? Include current hour: replace the slot that will be overwritten on rollover
  if (S.sts_hourTotalSec > 0) {
    let currentDuty = (S.sts_hourRunSec / S.sts_hourTotalSec) * 100
    sum = sum - S.sts_dutyHistArr[S.sts_histIdx] + currentDuty
  }

  return r1(sum / 24)
}

/**
 * * GET CURRENT HOUR DUTY
 * ? Calculates duty% for the current partial hour.
 *
 * @returns {number} - Current hour duty percentage (0-100)
 */
function getCurrentHourDuty() {
  if (S.sts_hourTotalSec <= 0) return 0
  return r1((S.sts_hourRunSec / S.sts_hourTotalSec) * 100)
}

/**
 * * GET CURRENT HOUR AVERAGES
 * ? Returns avg ON/OFF (seconds) and cycle count for current hour window.
 *
 * @returns {object} - { avgOn, avgOff, cycleCount }
 */
function getCurrentHourAverages() {
  let cc = S.sts_cycleCnt
  let avgOn = cc > 0 ? S.sts_hourRunSec / cc : S.sts_hourRunSec
  let avgOff = cc > 0 ? (S.sts_hourTotalSec - S.sts_hourRunSec) / cc : (S.sts_hourTotalSec - S.sts_hourRunSec)
  return { avgOn: avgOn, avgOff: avgOff, cycleCount: cc }
}

/**
 * * GET LIFETIME DUTY
 * ? Calculates duty% over entire system lifetime.
 *
 * @returns {number} - Lifetime duty percentage (0-100)
 */
function getLifetimeDuty() {
  if (S.sts_lifeTotalSec <= 0) return 0
  return r1((S.sts_lifeRunSec / S.sts_lifeTotalSec) * 100)
}

/**
 * * GET LIFETIME RUN HOURS
 * ? Returns total compressor run time in hours.
 *
 * @returns {number} - Total run hours
 */
function getLifetimeRunHours() {
  return r1(S.sts_lifeRunSec / 3600)
}

// ----------------------------------------------------------
// * COMBINED METRICS UPDATE
// ? Convenience function for main loop.
// ----------------------------------------------------------

/**
 * * UPDATE METRICS
 * ? Main entry point - updates stats and handles rollover.
 * ? Returns rollover result if triggered, null otherwise.
 *
 * @param  {boolean} isOn - Current relay state
 * @param  {number}  dt   - Time delta (seconds)
 * @returns {object|null}  - Rollover result or null
 */
function updateMetrics(isOn, dt) {
  updateRuntimeStats(isOn, dt)

  if (isHourlyRolloverDue()) {
    return processHourlyRollover()
  }

  return null
}

// ----------------------------------------------------------
// * EXPORTS
// ----------------------------------------------------------

export {
  updateRuntimeStats,
  incrementCycleCount,
  isHourlyRolloverDue,
  processHourlyRollover,
  getAvgDuty24h,
  getCurrentHourDuty,
  getCurrentHourAverages,
  getLifetimeDuty,
  getLifetimeRunHours,
  updateMetrics,
}
