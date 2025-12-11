// ==============================================================================
// * METRICS & STATISTICS
// ? Runtime statistics, duty cycle tracking, and hourly rollover.
// ? Tracks compressor runtime, cycle counts, and historical duty%.
// ==============================================================================

import { ALM } from './constants.js'
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
 * ? Skips when in sensor failure mode.
 *
 * @param  {boolean} isOn - Current relay state
 * @param  {number}  dt   - Time delta (seconds)
 */
function updateRuntimeStats(isOn, dt) {
  // Skip stat tracking during sensor failure
  if (V.sys_alarm === ALM.FAIL || V.sys_alarm === ALM.STUCK) return

  S.stats_lifeTime += dt
  if (isOn) S.stats_lifeRun += dt
  S.stats_hourTime += dt
  if (isOn) S.stats_hourRun += dt
}

/**
 * * INCREMENT CYCLE COUNT
 * ? Call this when relay turns OFF to count completed cycles.
 */
function incrementCycleCount() {
  S.stats_cycleCount += 1
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
  return S.stats_hourTime >= 3600
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

  if (S.stats_cycleCount >= 1) {
    avgOn = S.stats_hourRun / S.stats_cycleCount
    avgOff = (S.stats_hourTime - S.stats_hourRun) / S.stats_cycleCount
  }

  // Trigger adaptive hysteresis (if enabled)
  let adapted = adaptHysteresis(avgOn, avgOff, S.stats_cycleCount)

  // Calculate and store duty%
  let duty = (S.stats_hourRun / S.stats_hourTime) * 100
  S.stats_history[S.stats_hourIdx] = r1(duty)
  S.stats_hourIdx = (S.stats_hourIdx + 1) % 24

  // Reset hourly counters
  S.stats_hourTime = 0
  S.stats_hourRun = 0
  S.stats_cycleCount = 0

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
 *
 * @returns {number} - Average duty percentage (0-100)
 */
function getAvgDuty24h() {
  let sum = 0
  for (let i = 0; i < 24; i++) {
    sum += S.stats_history[i]
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
  if (S.stats_hourTime <= 0) return 0
  return r1((S.stats_hourRun / S.stats_hourTime) * 100)
}

/**
 * * GET CURRENT HOUR AVERAGES
 * ? Returns avg ON/OFF (seconds) and cycle count for current hour window.
 *
 * @returns {object} - { avgOn, avgOff, cycleCount }
 */
function getCurrentHourAverages() {
  let cc = S.stats_cycleCount
  let avgOn = cc > 0 ? S.stats_hourRun / cc : S.stats_hourRun
  let avgOff = cc > 0 ? (S.stats_hourTime - S.stats_hourRun) / cc : (S.stats_hourTime - S.stats_hourRun)
  return { avgOn: avgOn, avgOff: avgOff, cycleCount: cc }
}

/**
 * * GET LIFETIME DUTY
 * ? Calculates duty% over entire system lifetime.
 *
 * @returns {number} - Lifetime duty percentage (0-100)
 */
function getLifetimeDuty() {
  if (S.stats_lifeTime <= 0) return 0
  return r1((S.stats_lifeRun / S.stats_lifeTime) * 100)
}

/**
 * * GET LIFETIME RUN HOURS
 * ? Returns total compressor run time in hours.
 *
 * @returns {number} - Total run hours
 */
function getLifetimeRunHours() {
  return r1(S.stats_lifeRun / 3600)
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
