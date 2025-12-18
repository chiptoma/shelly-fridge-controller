// ==============================================================================
// ALARM MANAGEMENT
// Detection, severity mapping, fault logging, and edge detection.
// Handles alarm state machine transitions and persistent fault history.
// ==============================================================================

import { ALM } from './constants.js'
import { C } from './config.js'
import { S, V, ST_KEYS } from './state.js'
import { ri } from './utils/math.js'
import { pickKeys } from './utils/kvs.js'

// Module-local timer for high temp alarm delay
let alarm_highTimer = 0

// ----------------------------------------------------------
// ALARM SEVERITY
// Maps alarm codes to severity levels for logging.
// ----------------------------------------------------------

/**
 * GET SEVERITY
 * Maps alarm type to severity level for fault queue routing.
 *
 * @param  {string} alarm - Alarm code from ALM constants
 * @returns {string}       - Severity level: 'fatal', 'critical', 'error', or 'warning'
 *
 * Severity mapping:
 *   fatal    - WELD, LOCKED (requires reboot)
 *   critical - HIGH temp (safety concern)
 *   error    - FAIL, STUCK (sensor issues)
 *   warning  - All others
 */
function getSeverity(alarm) {
  if (alarm === ALM.WELD || alarm === ALM.LOCKED) return 'fatal'
  if (alarm === ALM.HIGH) return 'critical'
  if (alarm === ALM.FAIL || alarm === ALM.STUCK) return 'error'
  return 'warning'
}

// ----------------------------------------------------------
// FAULT DETAIL BUILDER
// Formats alarm-specific detail strings for fault log.
// ----------------------------------------------------------

/**
 * FORMAT FAULT DETAIL
 * Creates human-readable detail string for fault log entries.
 * Format varies by alarm type to capture relevant diagnostics.
 *
 * @param  {string} alarm   - Alarm code that triggered
 * @param  {object} pending - Pending fault context { t, alarm, peak, watts, evap, airRaw, airSmt }
 * @param  {number} durSec  - Duration of alarm condition (seconds)
 * @returns {string}         - Formatted detail string
 *
 * Format by alarm type:
 *   GHOST - "75W/30s" (watts detected / duration)
 *   COOL  - "A:25 R:24 C:23 E:4" (air peak, raw, smooth, evap)
 *   HIGH  - "12C/5m" (peak temp / duration minutes)
 *   FAIL  - "Null:3" (error count)
 *   STUCK - "Air:10m" (stuck duration minutes)
 */
function formatFaultDetail(alarm, pending, durSec) {
  let durMin = ri(durSec / 60)
  if (alarm === ALM.GHOST) return (pending.watts || 0).toFixed(0) + 'W/' + durSec + 's'
  if (alarm === ALM.COOL) return 'A:' + (pending.peak || 0).toFixed(0)
    + ' R:' + (pending.airRaw || 0).toFixed(0)
    + ' C:' + (pending.airSmt || 0).toFixed(0)
    + ' E:' + (pending.evap || 0).toFixed(0)
  if (alarm === ALM.HIGH) return (pending.peak || 0).toFixed(0) + 'C/' + durMin + 'm'
  if (alarm === ALM.FAIL) return 'Null:' + V.sns_errCnt
  if (alarm === ALM.STUCK) return 'Air:' + durMin + 'm'
  return durMin + 'm'
}

// ----------------------------------------------------------
// FAULT LOGGER
// Records fault to appropriate severity array in S.
// Fatal faults trigger immediate KVS save.
// ----------------------------------------------------------

/**
 * FAULT_KEYS - Severity to array key mapping
 * Routes faults to appropriate persistence arrays (flt_XArr).
 */
let FAULT_KEYS = {
  fatal: 'flt_fatalArr',
  critical: 'flt_critArr',
  error: 'flt_errorArr',
  warning: 'flt_warnArr',
}

/**
 * recordFault - Log fault entry to severity-specific queue
 * Maintains FIFO queue of max 3 entries per severity level.
 *
 * @param  {string} severity - Severity level ('fatal', 'critical', 'error', 'warning')
 * @param  {string} alarm    - Alarm code from ALM constants
 * @param  {string} detail   - Human-readable detail string
 *
 * Fatal faults trigger immediate KVS.Set (bypasses batch save).
 * Other severities batch with hourly state persistence.
 */
function recordFault(severity, alarm, detail) {
  // Validate severity maps to existing array
  let key = FAULT_KEYS[severity]
  let arr = key ? S[key] : null
  if (!arr) {
    print('⚠️ ALARM Unknown severity "' + severity + '": ignoring fault')
    return
  }

  let entry = { a: alarm, t: ri(Date.now() / 1000), d: detail }

  // Add to front, keep max 3 (manual - unshift not in Shelly)
  if (arr.length >= 2) arr[2] = arr[1]
  if (arr.length >= 1) arr[1] = arr[0]
  arr[0] = entry

  // Explicit truncation (belt and suspenders)
  if (arr.length > 3) arr.length = 3

  // Immediate save for fatal, others batched with hourly
  if (severity === 'fatal') {
    Shelly.call('KVS.Set', {
      key: 'fridge_st_faults',
      value: JSON.stringify(pickKeys(S, ST_KEYS['fridge_st_faults'])),
    })
    print('ALARM 🚨 Fatal fault logged: ' + alarm + ' - ' + detail)
  }
}

// ----------------------------------------------------------
// ALARM EDGE DETECTION
// Detects rising/falling alarm edges and triggers logging.
// Call this AFTER all alarm evaluations for the loop.
// ----------------------------------------------------------

/**
 * PROCESS ALARM EDGES
 * Detects alarm state transitions and manages fault logging lifecycle.
 * Rising edge captures context, falling edge logs the fault.
 *
 * @param  {string} alarmBefore - Previous loop's alarm state
 * @param  {string} alarmAfter  - Current loop's alarm state
 * @param  {number} swWatts     - Current switch power (for ghost detection)
 * @param  {number} tAirRaw     - Current raw air temperature
 * @param  {number} tEvap       - Current evap temperature (for COOL detail)
 *
 * State machine:
 *   NONE → ALARM = Rising edge (capture pending context)
 *   ALARM → NONE = Falling edge (log fault with duration)
 *
 * Must be called AFTER all alarm evaluations in main loop.
 */
function processAlarmEdges(alarmBefore, alarmAfter, swWatts, tAirRaw, tEvap) {
  // HANDLE CHANGE/AWAY FROM PREVIOUS (including ALARM -> different ALARM or -> NONE)
  if (alarmBefore !== ALM.NONE && alarmBefore !== alarmAfter && V.flt_pendCode) {
    let now = ri(Date.now() / 1000)
    let duration = now - V.flt_pendCode.t
    let detail = formatFaultDetail(alarmBefore, V.flt_pendCode, duration)
    let sev = getSeverity(alarmBefore)
    if (sev !== 'fatal') recordFault(sev, alarmBefore, detail)
    V.flt_pendCode = null
  }

  // RISING OR CHANGE TO NEW ALARM: start tracking new pending
  if (alarmAfter !== ALM.NONE && alarmAfter !== alarmBefore) {
    V.flt_pendCode = {
      t: ri(Date.now() / 1000),
      alarm: alarmAfter,
      peak: V.sns_airSmoothDeg,
      watts: (V.hw_hasPM && S.sys_isRelayOn) ? swWatts : 0,
      airRaw: (typeof tAirRaw === 'number') ? tAirRaw : V.sns_airSmoothDeg,
      airSmt: V.sns_airSmoothDeg,
      evap: (typeof tEvap === 'number') ? tEvap : 0,
    }
  }
}

// ----------------------------------------------------------
// CLEAR NON-FATAL ALARMS
// Resets non-sticky alarms for re-evaluation.
// Fatal alarms (WELD, LOCKED) persist until reboot.
// ----------------------------------------------------------

/**
 * CLEAR NON-FATAL ALARMS
 * Resets alarm state for re-evaluation each loop iteration.
 * Fatal alarms (WELD, LOCKED) are sticky and require reboot.
 *
 * WELD and LOCKED alarms persist until device restart.
 */
function clearNonFatalAlarms() {
  if (V.sys_alarm !== ALM.LOCKED && V.sys_alarm !== ALM.WELD) {
    V.sys_alarm = ALM.NONE
  }
}

// ----------------------------------------------------------
// APPLY SENSOR ALARMS
// Re-applies sensor failure/stuck alarms to V.sys_alarm.
// ----------------------------------------------------------

/**
 * APPLY SENSOR ALARMS
 * Sets V.sys_alarm based on sensor health flags.
 * FAIL takes precedence over STUCK.
 *
 * @param  {boolean} alarmFail  - True if sensor returning null
 * @param  {boolean} alarmStuck - True if sensor value frozen
 */
function applySensorAlarms(alarmFail, alarmStuck) {
  if (alarmFail) {
    V.sys_alarm = ALM.FAIL
    return
  }
  if (alarmStuck) V.sys_alarm = ALM.STUCK
}

// ----------------------------------------------------------
// HIGH TEMP ALARM CHECK
// Triggers alarm if temp exceeds threshold for delay period.
// ----------------------------------------------------------

/**
 * CHECK HIGH TEMP ALARM
 * Triggers HIGH alarm when control temp exceeds threshold.
 * Uses configurable delay to prevent false alarms.
 *
 * @param  {number}  tCtrl        - Control temperature (smoothed air)
 * @param  {boolean} isDeepDefrost - True if in deep defrost mode (suppresses alarm)
 * @returns {boolean}              - True if alarm triggered this call
 *
 * Alarm suppressed during:
 *   - Deep defrost (expected high temps)
 *   - Turbo mode (intentional cooldown)
 *   - Disabled via C.alarm_highEnable
 */
function checkHighTempAlarm(tCtrl, isDeepDefrost) {
  if (C.alm_highEnable && tCtrl > C.alm_highDeg && !isDeepDefrost && !V.trb_isActive) {
    alarm_highTimer += C.sys_loopSec
    if (alarm_highTimer > C.alm_highDelaySec) {
      V.sys_alarm = ALM.HIGH
      print('ALARM 🚨 High temp: ' + tCtrl.toFixed(1) + 'C exceeds ' + C.alm_highDeg + 'C for ' + Math.floor(alarm_highTimer / 60) + 'm')
      return true
    }
  } else {
    alarm_highTimer = 0
  }
  return false
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export {
  getSeverity,
  formatFaultDetail,
  recordFault,
  processAlarmEdges,
  clearNonFatalAlarms,
  applySensorAlarms,
  checkHighTempAlarm,
}
