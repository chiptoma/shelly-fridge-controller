// ==============================================================================
// REPORTING
// Console output and MQTT publishing for status, metrics, and alarms.
// Formats human-readable console messages and structured MQTT JSON.
// ==============================================================================

import { ALM, RSN, ICO } from './constants.js'
import { C } from './config.js'
import { S, V } from './state.js'
import { r1, ri, formatXmYs } from './utils/math.js'
import { getEffectiveHysteresis } from './features.js'
import { getAvgDuty24h, getCurrentHourDuty, getLifetimeDuty, getLifetimeRunHours, getCurrentHourAverages } from './metrics.js'

// ----------------------------------------------------------
// CONSOLE FORMATTING
// ----------------------------------------------------------

/**
 * getScriptUptime - Get formatted script uptime
 *
 * @returns {string} - Formatted uptime string (HH:MM)
 */
function getScriptUptime() {
  let upMs = Shelly.getUptimeMs() - V.sys_startMs
  let upH = ri(upMs / 3600000)
  let upM = ri((upMs % 3600000) / 60000)
  return (upH < 10 ? '0' : '') + upH + ':' + (upM < 10 ? '0' : '') + upM
}

/**
 * formatConsoleMessage - Build console output string
 * Includes status, temps, duty cycles, and cycle times.
 *
 * @param {number|null} tSmooth - Smoothed air temperature
 * @param {number|null} tEvap - Evaporator temperature
 * @param {number|null} tRaw - Raw air temperature
 * @returns {string} Formatted console message
 */
function formatConsoleMessage(tSmooth, tEvap, tRaw) {
  // Calculate duty cycles
  let dHour = getCurrentHourDuty()
  let d24 = getAvgDuty24h()
  let dLife = getLifetimeDuty()

  // Calculate average cycle times
  let hourAvgs = getCurrentHourAverages()
  let avgCycleSec = hourAvgs.avgOn + hourAvgs.avgOff

  // Format temperature strings with fixed width (e.g. +04.90, -09.40)
  /**
   * fmtT - Format temperature for fixed-width display
   * @param {number|null} v - Temperature value
   * @returns {string} Formatted string (e.g., +04.90, -09.40, ------)
   * @internal
   */
  function fmtT(v) {
    if (typeof v !== 'number') return '------'
    let s = v.toFixed(2)
    if (v >= 0 && v < 10) return '+0' + s
    if (v >= 10) return '+' + s
    if (v > -10 && v < 0) return '-0' + s.substring(1)
    return s
  }
  let aRaw = fmtT(tRaw)
  let aEma = fmtT(tSmooth)
  let evap = fmtT(tEvap)

  // Build message
  let ico = ICO[V.sys_status] || '?'
  let msg = ico + ' ' + V.sys_status
  if (V.sys_statusReason !== RSN.NONE) msg += ':' + V.sys_statusReason

  // Calculate time since last state save (minutes)
  let saveAgoMin = null
  if (V.lop_lastSaveTs > 0 && V.lop_nowTs >= V.lop_lastSaveTs) {
    saveAgoMin = ri((V.lop_nowTs - V.lop_lastSaveTs) / 60)
  }

  let effHyst = getEffectiveHysteresis()
  msg += ' | UP: ' + getScriptUptime()
         + ' | AIR: ' + aRaw + 'R/' + aEma + 'S EVP: ' + evap
         + ' | SP: ' + C.ctl_targetDeg + ' HYS: ±' + r1(effHyst)
         + ' (CYC: ' + formatXmYs(avgCycleSec) + ')'
         + ' | DUTY: ' + ri(dHour) + 'H/' + ri(d24) + 'D/' + ri(dLife) + 'L %'

  if (saveAgoMin !== null) {
    msg += ' | SAVE: ' + (saveAgoMin < 10 ? '0' : '') + saveAgoMin + 'm'
  }

  if (V.sys_alarm !== ALM.NONE) msg += ' | !' + V.sys_alarm

  return msg
}

// ----------------------------------------------------------
// MQTT PAYLOAD
// Builds payload on-demand. Pre-allocation was reverted because
// it increased initial heap usage beyond Shelly's ~25KB limit.
// ----------------------------------------------------------

/**
 * buildMqttPayload - Create MQTT status payload object
 * Flat structure minimizes object allocation overhead.
 *
 * @param {number|null} tSmooth - Smoothed air temperature
 * @param {number|null} tEvap - Evaporator temperature
 * @param {number|null} tRaw - Raw air temperature
 * @param {number} powerW - Current power draw (watts)
 * @param {number|null} deviceTemp - Device internal temperature
 * @returns {object} MQTT payload object
 */
function buildMqttPayload(tSmooth, tEvap, tRaw, powerW, deviceTemp) {
  // FLAT structure to minimize object allocation overhead
  // Field names align with state-style naming
  let cc = S.sts_cycleCnt
  let avgOnSec = cc > 0 ? ri(S.sts_hourRunSec / cc) : ri(S.sts_hourRunSec)
  let avgOffSec = cc > 0 ? ri((S.sts_hourTotalSec - S.sts_hourRunSec) / cc) : ri(S.sts_hourTotalSec - S.sts_hourRunSec)

  return {
    tAirRaw: tRaw,
    tAirSmt: tSmooth,
    tEvap: tEvap,
    tDev: deviceTemp ? r1(deviceTemp) : null,

    status: V.sys_status,
    reason: V.sys_statusReason,
    alarm: V.sys_alarm,
    relayOn: S.sys_isRelayOn ? 1 : 0,

    dutyHr: r1(getCurrentHourDuty()),
    dutyDay: r1(getAvgDuty24h()),
    dutyLife: r1(getLifetimeDuty()),
    hoursLife: getLifetimeRunHours(),
    hyst: getEffectiveHysteresis(),

    avgOnSec: avgOnSec,
    avgOffSec: avgOffSec,

    defrostOn: S.dfr_isActive ? 1 : 0,
    doorOpen: V.dor_pauseRemSec > 0 ? 1 : 0,
    turboOn: V.trb_isActive ? 1 : 0,

    health: V.hlt_lastScore,
    watts: (V.hw_hasPM && powerW) ? r1(powerW) : null,
  }
}

// ----------------------------------------------------------
// PUBLISH STATUS
// Main entry point - prints console and publishes MQTT.
// ----------------------------------------------------------

/**
 * publishStatus - Output status to console and MQTT
 *
 * @param {number|null} tSmooth - Smoothed air temperature
 * @param {number|null} tEvap - Evaporator temperature
 * @param {number|null} tRaw - Raw air temperature
 * @param {number} powerW - Current power draw (watts)
 * @param {number|null} deviceTemp - Device internal temperature
 */
function publishStatus(tSmooth, tEvap, tRaw, powerW, deviceTemp) {
  // Console output
  let msg = formatConsoleMessage(tSmooth, tEvap, tRaw)
  print(msg)

  // MQTT publish
  let payload = buildMqttPayload(tSmooth, tEvap, tRaw, powerW, deviceTemp)
  MQTT.publish(C.sys_mqttTopic, JSON.stringify(payload), 0, false)
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export {
  getScriptUptime,
  formatConsoleMessage,
  buildMqttPayload,
  publishStatus,
}
