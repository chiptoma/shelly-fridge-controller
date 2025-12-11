// ==============================================================================
// * CONTROL ENGINE
// ? Main decision engine for compressor control.
// ? Handles mode determination, thermostat logic, and relay switching.
// ==============================================================================

import { ST, RSN, ALM } from './constants.js'
import { C } from './config.js'
import { S, V, persistState } from './state.js'
import { ri, r1, r2, r3, formatXmYs } from './utils/math.js'
import { canTurnOn, canTurnOff, getTimeUntilOnAllowed, getTimeUntilOffAllowed, isMaxRunExceeded, isFreezeProtectionActive } from './protection.js'
import { getEffectiveHysteresis, handleTurboMode, handleLimpMode, handleDynamicDefrost, isScheduledDefrost, isDoorPauseActive } from './features.js'
import { incrementCycleCount } from './metrics.js'

// ----------------------------------------------------------
// * STATUS HELPERS
// ? Convenience functions for setting system status.
// ----------------------------------------------------------

/**
 * * SET IDLE STATE
 * ? Sets status to IDLE (or WANT_IDLE if relay on) with given reason.
 *
 * @param  {string} reason - Reason code from RSN
 *
 * @mutates V.sys_status - Set to ST.IDLE or ST.WANT_IDLE
 * @mutates V.sys_reason - Set to provided reason
 */
function setIdleState(reason) {
  V.sys_status = S.sys_relayState ? ST.WANT_IDLE : ST.IDLE
  V.sys_reason = reason
}

// ----------------------------------------------------------
// * THERMOSTAT LOGIC
// ? Hysteresis-based temperature control.
// ----------------------------------------------------------

/**
 * * EVALUATE THERMOSTAT
 * ? Determines if compressor should run based on temp and hysteresis band.
 *
 * @param  {number}  tCtrl  - Control temperature
 * @param  {number}  target - Target temperature
 * @param  {number}  hyst   - Hysteresis value (+/-)
 * @returns {boolean|null}   - true=cool, false=idle, null=no change
 */
function evaluateThermostat(tCtrl, target, hyst) {
  if (tCtrl > (target + hyst)) return true
  if (tCtrl < (target - hyst)) return false
  return null // Within band - no change
}

// ----------------------------------------------------------
// * RELAY CONTROL
// ? Direct relay switching with state management.
// ----------------------------------------------------------

/**
 * * SET RELAY
 * ? Switches relay and updates timestamps/snapshots.
 * ? Calculates health score on turn-off.
 * ? Verifies command success and retries for emergency shutdowns.
 *
 * @param  {boolean} state    - Desired relay state
 * @param  {number}  now      - Current timestamp (seconds)
 * @param  {number}  tAir     - Current air temperature (for snapshot)
 * @param  {number}  tEvap    - Current evap temperature (for snapshot)
 * @param  {boolean} skipSnap - Skip snapshot capture (for limp/emergency mode)
 *
 * @mutates S.sys_relayState   - Updated to match `state`
 * @mutates S.sys_tsRelayOn    - Set to `now` when turning ON
 * @mutates S.sys_tsRelayOff   - Set to `now` when turning OFF
 * @mutates S.weld_snapAir     - Captured for weld detection on OFF
 * @mutates V.health_startTemp - Captured for health scoring on ON
 * @mutates V.health_lastScore - Calculated on OFF (°C/min cooling rate)
 *
 * @sideeffect Calls Shelly.call('Switch.Set') - hardware relay control
 * @sideeffect Calls incrementCycleCount() on OFF transition
 * @sideeffect Calls persistState() - writes to KVS
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Inherent control logic complexity
function setRelay(state, now, tAir, tEvap, skipSnap) {
  // Log state change
  if (state && !S.sys_relayState) {
    let offSec = 0
    if (S.sys_tsRelayOff > 0 && now > S.sys_tsRelayOff) {
      offSec = now - S.sys_tsRelayOff
    }
    let msg = 'RELAY ON' + (V.turbo_active ? ' (TURBO)' : '')
    if (offSec > 0) {
      msg += ' (after ' + formatXmYs(offSec) + ' off)'
    }
    print(msg)
  } else if (!state && S.sys_relayState) {
    let onSec = 0
    if (S.sys_tsRelayOn > 0 && now > S.sys_tsRelayOn) {
      onSec = now - S.sys_tsRelayOn
    }
    print('RELAY OFF (after ' + formatXmYs(onSec) + ' on)')
  }

  // Update logical relay state to match commanded state
  S.sys_relayState = state

  // ? Pre-compute timestamp BEFORE Shelly.call to avoid mJS scoping bug
  // ? where callback parameters shadow outer scope functions (ri minified to same name)
  let tsNow = ri(now)

  // ? Track if this is an emergency shutdown (locked rotor, ghost, etc.)
  let isEmergency = skipSnap && !state

  // Execute hardware switch with verification callback
  // ? CRITICAL: Use $_ prefix for callback params to prevent Terser from minifying
  // ? to single letters that shadow math functions (ri, r1, r2) due to mJS scoping bug
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
    S.sys_tsRelayOn = tsNow
    if (!skipSnap && tAir !== null) {
      V.health_startTemp = tAir
    }
  } else {
    // Turning OFF - use pre-computed timestamp
    S.sys_tsRelayOff = tsNow
    incrementCycleCount()

    // Capture weld snapshot even on emergency/skipSnap to avoid stale value
    if (tAir !== null) {
      S.weld_snapAir = tAir
    }

    // Calculate health score (deg/min) when snapshots are taken in normal path
    if (!skipSnap && tAir !== null && V.health_startTemp > 0) {
      let runMins = (now - S.sys_tsRelayOn) / 60
      if (runMins > 5) {
        let delta = V.health_startTemp - tAir
        if (delta > 0) {
          V.health_lastScore = r3(delta / runMins)
        }
      }
    }
  }

  persistState()
}

// ----------------------------------------------------------
// * MODE DETERMINATION
// ? Returns object on-demand. Pre-allocation reverted due to
// ? initial heap constraints on Shelly's ~25KB limit.
// ----------------------------------------------------------

/**
 * * DETERMINE MODE
 * ? Main decision engine - evaluates priorities and returns desired state.
 * ? Priority order: Fatal > Limp > Defrost > Door > Freeze > MaxRun > Normal
 *
 * @param  {number} tCtrl - Control temperature (smoothed air)
 * @param  {number} tEvap - Evaporator temperature
 * @param  {number} now   - Current timestamp (seconds) - passed from caller
 * @returns {object}       - { wantOn, status, reason, detail }
 *
 * @mutates V.sens_wasError  - Set true when entering limp mode
 * @mutates S.defr_isActive  - Cleared during scheduled defrost
 *
 * @reads V.sys_alarm, V.turbo_active, S.sys_relayState
 * @reads C.ctrl_targetDeg and temperature bounds
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- State machine with many transitions
function determineMode(tCtrl, tEvap, now) {
  // Get base target and hysteresis
  let target = C.ctrl_targetDeg
  let hyst = getEffectiveHysteresis()

  // Priority 1: FATAL ALARMS (WELD, LOCKED)
  if (V.sys_alarm === ALM.WELD || V.sys_alarm === ALM.LOCKED) {
    return { wantOn: false, status: ST.IDLE, reason: RSN.NONE, detail: 'FATAL: ' + V.sys_alarm }
  }

  // Priority 2: LIMP MODE (Sensor failure)
  if (V.sys_alarm === ALM.FAIL || V.sys_alarm === ALM.STUCK) {
    V.sens_wasError = true
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
    return { wantOn: false, status: S.sys_relayState ? ST.WANT_IDLE : ST.IDLE, reason: RSN.PROT_DOOR, detail: 'Door pause' }
  }

  // Priority 5: SCHEDULED DEFROST
  if (isScheduledDefrost()) {
    S.defr_isActive = false  // Clear dynamic defrost flag during scheduled defrost
    return { wantOn: false, status: S.sys_relayState ? ST.WANT_IDLE : ST.IDLE, reason: RSN.DEFR_SCHED, detail: 'Scheduled defrost' }
  }

  // Priority 6: FREEZE PROTECTION
  if (isFreezeProtectionActive(tCtrl)) {
    return { wantOn: false, status: S.sys_relayState ? ST.WANT_IDLE : ST.IDLE, reason: RSN.PROT_AIR_FRZ, detail: 'Freeze cut' }
  }

  // Priority 7: MAX RUN PROTECTION
  if (isMaxRunExceeded(now)) {
    return { wantOn: false, status: ST.WANT_IDLE, reason: RSN.PROT_MAX_ON, detail: 'Max run exceeded' }
  }

  // Priority 8: DYNAMIC DEFROST
  if (handleDynamicDefrost(tEvap)) {
    return { wantOn: false, status: S.sys_relayState ? ST.WANT_IDLE : ST.IDLE, reason: RSN.DEFR_DYN, detail: 'Dynamic defrost' }
  }

  // Priority 9: NORMAL THERMOSTAT
  let thermostat = evaluateThermostat(tCtrl, target, hyst)
  let wantOn = (thermostat !== null) ? thermostat : S.sys_relayState

  // Determine status based on turbo and relay state
  let status
  if (V.turbo_active) {
    status = S.sys_relayState ? ST.TURBO_COOL : ST.TURBO_IDLE
  } else {
    status = S.sys_relayState ? ST.COOLING : ST.IDLE
  }

  return { wantOn: wantOn, status: status, reason: RSN.NONE, detail: detail }
}

// ----------------------------------------------------------
// * SWITCH DECISION
// ? Returns object on-demand. Pre-allocation reverted due to
// ? initial heap constraints on Shelly's ~25KB limit.
// ----------------------------------------------------------

/**
 * * EXECUTE SWITCH DECISION
 * ? Applies min ON/OFF timing guards and switches relay if allowed.
 *
 * @param  {boolean} wantOn  - Desired relay state
 * @param  {number}  now     - Current timestamp (seconds)
 * @param  {number}  tAir    - Air temperature (for snapshot)
 * @param  {number}  tEvap   - Evap temperature (for snapshot)
 * @param  {boolean} isLimp  - True if in limp mode (skip guards)
 * @returns {object}          - { switched, blocked, reason, detail }
 *
 * @mutates V.sys_status       - Updated based on relay action/blocking
 * @mutates V.sys_reason       - Set when blocked by timing guards
 * @mutates V.sys_statusDetail - Set to remaining wait time when blocked
 *
 * @sideeffect Calls setRelay() which triggers hardware and state changes
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Control orchestration with timing guards
function executeSwitchDecision(wantOn, now, tAir, tEvap, isLimp) {
  // In limp mode, switch immediately (no timing guards)
  if (isLimp) {
    if (wantOn !== S.sys_relayState) {
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
  if (wantOn && !S.sys_relayState) {
    if (canTurnOn(now)) {
      setRelay(true, now, tAir, tEvap, false)
      V.sys_status = V.turbo_active ? ST.TURBO_COOL : ST.COOLING
      return { switched: true, blocked: false, reason: RSN.NONE, detail: null }
    } else {
      V.sys_status = ST.WANT_COOL
      V.sys_reason = RSN.PROT_MIN_OFF
      V.sys_statusDetail = ri(getTimeUntilOnAllowed(now)) + 's'
      return { switched: false, blocked: true, reason: RSN.PROT_MIN_OFF, detail: V.sys_statusDetail }
    }
  }

  // Want to turn OFF but currently ON
  if (!wantOn && S.sys_relayState) {
    if (canTurnOff(now)) {
      setRelay(false, now, tAir, tEvap, false)
      V.sys_status = V.turbo_active ? ST.TURBO_IDLE : ST.IDLE
      return { switched: true, blocked: false, reason: RSN.NONE, detail: null }
    } else {
      V.sys_status = ST.WANT_IDLE
      V.sys_reason = RSN.PROT_MIN_ON
      V.sys_statusDetail = ri(getTimeUntilOffAllowed(now)) + 's'
      return { switched: false, blocked: true, reason: RSN.PROT_MIN_ON, detail: V.sys_statusDetail }
    }
  }

  // No change needed
  return { switched: false, blocked: false, reason: RSN.NONE, detail: null }
}

// ----------------------------------------------------------
// * EXPORTS
// ----------------------------------------------------------

export {
  setIdleState,
  evaluateThermostat,
  setRelay,
  determineMode,
  executeSwitchDecision,
}
