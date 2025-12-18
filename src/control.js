// ==============================================================================
// CONTROL ENGINE
// Main decision engine for compressor control.
// Handles mode determination, thermostat logic, and relay switching.
// ==============================================================================

import { ST, RSN, ALM } from './constants.js'
import { C } from './config.js'
import { S, V, persistState } from './state.js'
import { ri, r1, r2, r3, formatXmYs } from './utils/math.js'
import { canTurnOn, canTurnOff, getTimeUntilOnAllowed, getTimeUntilOffAllowed, isMaxRunExceeded, isFreezeProtectionActive } from './protection.js'
import { getEffectiveHysteresis, handleTurboMode, handleLimpMode, handleDynamicDefrost, isScheduledDefrost, isDoorPauseActive } from './features.js'
import { incrementCycleCount } from './metrics.js'

// ----------------------------------------------------------
// STATUS HELPERS
// Convenience functions for setting system status.
// ----------------------------------------------------------

/**
 * setIdleState - Set status to IDLE with given reason
 * Uses WANT_IDLE if relay is currently on.
 *
 * @param {string} reason - Reason code from RSN
 * @mutates V.sys_status - Set to ST.IDLE or ST.WANT_IDLE
 * @mutates V.sys_statusReason - Set to provided reason
 */
function setIdleState(reason) {
  V.sys_status = S.sys_isRelayOn ? ST.WANT_IDLE : ST.IDLE
  V.sys_statusReason = reason
}

// ----------------------------------------------------------
// THERMOSTAT LOGIC
// Hysteresis-based temperature control.
// ----------------------------------------------------------

/**
 * evaluateThermostat - Check if compressor should run
 * Uses hysteresis band to determine on/off.
 *
 * @param {number} tCtrl - Control temperature
 * @param {number} target - Target temperature
 * @param {number} hyst - Hysteresis value (+/-)
 * @returns {boolean|null} true=cool, false=idle, null=no change
 */
function evaluateThermostat(tCtrl, target, hyst) {
  if (tCtrl > (target + hyst)) return true
  if (tCtrl < (target - hyst)) return false
  return null // Within band - no change
}

// ----------------------------------------------------------
// RELAY CONTROL
// Direct relay switching with state management.
// ----------------------------------------------------------

/**
 * setRelay - Switch relay and update timestamps
 * Captures snapshots for weld detection and health scoring.
 *
 * @param {boolean} state - Desired relay state
 * @param {number} now - Current timestamp (seconds)
 * @param {number} tAir - Current air temperature
 * @param {number} tEvap - Current evap temperature
 * @param {boolean} skipSnap - Skip snapshot capture
 * @mutates S.sys_isRelayOn, S.sys_relayOnTs, S.sys_relayOffTs
 * @mutates S.wld_airSnapDeg, V.hlt_startDeg, V.hlt_lastScore
 * @sideeffect Calls Shelly.call('Switch.Set')
 * @sideeffect Calls persistState() on state change
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Inherent control logic complexity
function setRelay(state, now, tAir, tEvap, skipSnap) {
  // Log state change
  if (state && !S.sys_isRelayOn) {
    let offSec = 0
    if (S.sys_relayOffTs > 0 && now > S.sys_relayOffTs) {
      offSec = now - S.sys_relayOffTs
    }
    let msg = 'RELAY ON' + (V.trb_isActive ? ' (TURBO)' : '')
    if (offSec > 0) {
      msg += ' (after ' + formatXmYs(offSec) + ' off)'
    }
    print(msg)
  } else if (!state && S.sys_isRelayOn) {
    let onSec = 0
    if (S.sys_relayOnTs > 0 && now > S.sys_relayOnTs) {
      onSec = now - S.sys_relayOnTs
    }
    print('RELAY OFF (after ' + formatXmYs(onSec) + ' on)')
  }

  // Update logical relay state to match commanded state
  S.sys_isRelayOn = state

  // Pre-compute timestamp BEFORE Shelly.call to avoid mJS scoping bug
  // where callback parameters shadow outer scope functions (ri minified to same name)
  let tsNow = ri(now)

  // Track if this is an emergency shutdown (locked rotor, ghost, etc.)
  let isEmergency = skipSnap && !state

  // Execute hardware switch with verification callback
  // CRITICAL: Use $_ prefix for callback params to prevent Terser from minifying
  // to single letters that shadow math functions (ri, r1, r2) due to mJS scoping bug
  let switchCb = function ($_cbRes, $_cbErr, $_cbMsg) {
    if ($_cbErr !== 0) {
      print('RELAY CMD FAILED: ' + $_cbErr)
      if (isEmergency) {
        print('EMERGENCY RETRY')
        Shelly.call('Switch.Set', { id: 0, on: state })
      }
    }
  }
  Shelly.call('Switch.Set', { id: 0, on: state }, switchCb)

  if (state) {
    // Turning ON - use pre-computed timestamp
    S.sys_relayOnTs = tsNow
    if (!skipSnap && tAir !== null) {
      V.hlt_startDeg = tAir
    }
  } else {
    // Turning OFF - use pre-computed timestamp
    S.sys_relayOffTs = tsNow
    incrementCycleCount()

    // Capture weld snapshot even on emergency/skipSnap to avoid stale value
    if (tAir !== null) {
      S.wld_airSnapDeg = tAir
    }

    // Calculate health score (deg/min) when snapshots are taken in normal path
    if (!skipSnap && tAir !== null && V.hlt_startDeg > 0) {
      let runMins = (now - S.sys_relayOnTs) / 60
      if (runMins > 5) {
        let delta = V.hlt_startDeg - tAir
        if (delta > 0) {
          V.hlt_lastScore = r3(delta / runMins)
        }
      }
    }
  }

  persistState()
}

// ----------------------------------------------------------
// MODE DETERMINATION
// Returns object on-demand. Pre-allocation reverted due to
// initial heap constraints on Shelly's ~25KB limit.
// ----------------------------------------------------------

/**
 * determineMode - Main decision engine for relay state
 * Priority order: Fatal > Limp > Defrost > Door > Freeze > MaxRun > Normal
 *
 * @param {number} tCtrl - Control temperature (smoothed air)
 * @param {number} tEvap - Evaporator temperature
 * @param {number} now - Current timestamp (seconds)
 * @returns {object} { wantOn, status, reason, detail }
 * @mutates V.sns_wasErr - Set true when entering limp mode
 * @mutates S.dfr_isActive - Cleared during scheduled defrost
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- State machine with many transitions
function determineMode(tCtrl, tEvap, now) {
  // Get base target and hysteresis
  let target = C.ctl_targetDeg
  let hyst = getEffectiveHysteresis()

  // Priority 1: FATAL ALARMS (WELD, LOCKED)
  if (V.sys_alarm === ALM.WELD || V.sys_alarm === ALM.LOCKED) {
    return { wantOn: false, status: ST.IDLE, reason: RSN.NONE, detail: 'FATAL: ' + V.sys_alarm }
  }

  // Priority 2: LIMP MODE (Sensor failure)
  if (V.sys_alarm === ALM.FAIL || V.sys_alarm === ALM.STUCK) {
    V.sns_wasErr = true
    let limp = handleLimpMode()
    return { wantOn: limp.wantOn, status: limp.status, reason: RSN.NONE, detail: limp.detail }
  }

  // Priority 3: TURBO MODE OVERRIDE
  let detail = 'NONE'
  let turbo = handleTurboMode(C.sys_loopSec)
  if (turbo) {
    target = turbo.target
    hyst = turbo.hyst
    detail = turbo.detail
  }

  // Priority 4: DOOR PAUSE
  if (isDoorPauseActive()) {
    return { wantOn: false, status: S.sys_isRelayOn ? ST.WANT_IDLE : ST.IDLE, reason: RSN.PROT_DOOR, detail: 'Door pause' }
  }

  // Priority 5: SCHEDULED DEFROST
  if (isScheduledDefrost()) {
    S.dfr_isActive = false  // Clear dynamic defrost flag during scheduled defrost
    return { wantOn: false, status: S.sys_isRelayOn ? ST.WANT_IDLE : ST.IDLE, reason: RSN.DEFR_SCHED, detail: 'Scheduled defrost' }
  }

  // Priority 6: FREEZE PROTECTION
  if (isFreezeProtectionActive(tCtrl)) {
    return { wantOn: false, status: S.sys_isRelayOn ? ST.WANT_IDLE : ST.IDLE, reason: RSN.PROT_AIR_FRZ, detail: 'Freeze cut' }
  }

  // Priority 7: MAX RUN PROTECTION
  if (isMaxRunExceeded(now)) {
    return { wantOn: false, status: ST.WANT_IDLE, reason: RSN.PROT_MAX_ON, detail: 'Max run exceeded' }
  }

  // Priority 8: DYNAMIC DEFROST
  if (handleDynamicDefrost(tEvap)) {
    return { wantOn: false, status: S.sys_isRelayOn ? ST.WANT_IDLE : ST.IDLE, reason: RSN.DEFR_DYN, detail: 'Dynamic defrost' }
  }

  // Priority 9: NORMAL THERMOSTAT
  let thermostat = evaluateThermostat(tCtrl, target, hyst)
  let wantOn = (thermostat !== null) ? thermostat : S.sys_isRelayOn

  // Determine status based on turbo and relay state
  let status
  if (V.trb_isActive) {
    status = S.sys_isRelayOn ? ST.TURBO_COOL : ST.TURBO_IDLE
  } else {
    status = S.sys_isRelayOn ? ST.COOLING : ST.IDLE
  }

  return { wantOn: wantOn, status: status, reason: RSN.NONE, detail: detail }
}

// ----------------------------------------------------------
// SWITCH DECISION
// Returns object on-demand. Pre-allocation reverted due to
// initial heap constraints on Shelly's ~25KB limit.
// ----------------------------------------------------------

/**
 * executeSwitchDecision - Apply timing guards and switch relay
 * Enforces min ON/OFF times unless in limp mode.
 *
 * @param {boolean} wantOn - Desired relay state
 * @param {number} now - Current timestamp (seconds)
 * @param {number} tAir - Air temperature
 * @param {number} tEvap - Evap temperature
 * @param {boolean} isLimp - True if in limp mode
 * @returns {object} { switched, blocked, reason, detail }
 * @mutates V.sys_status, V.sys_statusReason, V.sys_detail
 * @sideeffect Calls setRelay() on state change
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Control orchestration with timing guards
function executeSwitchDecision(wantOn, now, tAir, tEvap, isLimp) {
  // In limp mode, switch immediately (no timing guards)
  if (isLimp) {
    if (wantOn !== S.sys_isRelayOn) {
      setRelay(wantOn, now, 0, 0, true)
      V.sys_status = wantOn ? ST.LIMP_COOL : ST.LIMP_IDLE
      return { switched: true, blocked: false, reason: RSN.NONE, detail: null }
    }
    return { switched: false, blocked: false, reason: RSN.NONE, detail: null }
  }

  // Skip switching during fatal/ghost alarms
  if (V.sys_alarm === ALM.WELD || V.sys_alarm === ALM.LOCKED || V.sys_alarm === ALM.GHOST) {
    return { switched: false, blocked: true, reason: RSN.NONE, detail: 'Alarm active' }
  }

  // Want to turn ON but currently OFF
  if (wantOn && !S.sys_isRelayOn) {
    if (canTurnOn(now)) {
      setRelay(true, now, tAir, tEvap, false)
      V.sys_status = V.trb_isActive ? ST.TURBO_COOL : ST.COOLING
      return { switched: true, blocked: false, reason: RSN.NONE, detail: null }
    } else {
      V.sys_status = ST.WANT_COOL
      V.sys_statusReason = RSN.PROT_MIN_OFF
      V.sys_detail = ri(getTimeUntilOnAllowed(now)) + 's'
      return { switched: false, blocked: true, reason: RSN.PROT_MIN_OFF, detail: V.sys_detail }
    }
  }

  // Want to turn OFF but currently ON
  if (!wantOn && S.sys_isRelayOn) {
    if (canTurnOff(now)) {
      setRelay(false, now, tAir, tEvap, false)
      V.sys_status = V.trb_isActive ? ST.TURBO_IDLE : ST.IDLE
      return { switched: true, blocked: false, reason: RSN.NONE, detail: null }
    } else {
      V.sys_status = ST.WANT_IDLE
      V.sys_statusReason = RSN.PROT_MIN_ON
      V.sys_detail = ri(getTimeUntilOffAllowed(now)) + 's'
      return { switched: false, blocked: true, reason: RSN.PROT_MIN_ON, detail: V.sys_detail }
    }
  }

  // No change needed
  return { switched: false, blocked: false, reason: RSN.NONE, detail: null }
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export {
  setIdleState,
  evaluateThermostat,
  setRelay,
  determineMode,
  executeSwitchDecision,
}
