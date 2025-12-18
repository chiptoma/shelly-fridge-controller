// ==============================================================================
// PROTECTION SYSTEMS
// Compressor timing guards, freeze protection, weld detection, and cooling health.
// Safety-critical code - handles protection against hardware damage.
// ==============================================================================

import { ALM } from './constants.js'
import { C } from './config.js'
import { S, V } from './state.js'
import { recordFault } from './alarms.js'

// ----------------------------------------------------------
// COMPRESSOR TIMING GUARDS
// Prevents short-cycling to protect compressor.
// ----------------------------------------------------------

/**
 * canTurnOn - Check if minimum OFF time elapsed
 * Checks if minimum OFF time has elapsed to allow turning ON.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {boolean}    - True if safe to turn on
 */
function canTurnOn(now) {
  return (now - S.sys_relayOffTs) >= C.cmp_minOffSec
}

/**
 * canTurnOff - Check if minimum ON time elapsed
 * Checks if minimum ON time has elapsed to allow turning OFF.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {boolean}    - True if safe to turn off
 */
function canTurnOff(now) {
  let elapsed = now - S.sys_relayOnTs
  return elapsed >= C.cmp_minOnSec
}

/**
 * getTimeUntilOnAllowed - Time until turn-on allowed
 * Returns seconds remaining until turn-on is allowed.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {number}     - Seconds remaining (0 if already allowed)
 */
function getTimeUntilOnAllowed(now) {
  let remaining = C.cmp_minOffSec - (now - S.sys_relayOffTs)
  return remaining > 0 ? remaining : 0
}

/**
 * getTimeUntilOffAllowed - Time until turn-off allowed
 * Returns seconds remaining until turn-off is allowed.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {number}     - Seconds remaining (0 if already allowed)
 */
function getTimeUntilOffAllowed(now) {
  let remaining = C.cmp_minOnSec - (now - S.sys_relayOnTs)
  return remaining > 0 ? remaining : 0
}

// ----------------------------------------------------------
// MAX RUN PROTECTION
// Forces compressor off after max run time exceeded.
// ----------------------------------------------------------

/**
 * isMaxRunExceeded - Check if max run time exceeded
 * Checks if compressor has exceeded maximum continuous run time.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {boolean}    - True if max run exceeded
 */
function isMaxRunExceeded(now) {
  if (!S.sys_isRelayOn) return false
  if (V.trb_isActive) return false
  return (now - S.sys_relayOnTs) > C.cmp_maxRunSec
}

// ----------------------------------------------------------
// FREEZE PROTECTION
// Prevents air temperature from dropping too low.
// ----------------------------------------------------------

/**
 * isFreezeProtectionActive - Check if freeze cut engaged
 * Checks if air temp is below freeze cut threshold.
 *
 * @param  {number} tCtrl - Control temperature (smoothed air)
 * @returns {boolean}      - True if freeze cut should engage
 */
function isFreezeProtectionActive(tCtrl) {
  return tCtrl < C.cmp_freezeCutDeg
}

// ----------------------------------------------------------
// WELD DETECTION
// Detects relay weld by monitoring temp drop after turn-off.
// ----------------------------------------------------------

/**
 * checkWeldDetection - Monitor for relay weld
 * Monitors for relay weld: if temp drops after turn-off, relay is stuck.
 * Only checks during detection window (waitSec < t < winSec).
 *
 * @param  {number} tCtrl - Control temperature (smoothed air)
 * @param  {number} now   - Current timestamp (seconds)
 * @returns {boolean}      - True if weld detected
 */
function checkWeldDetection(tCtrl, now) {
  if (!C.wld_enable) return false
  if (S.sys_isRelayOn) return false

  let offDur = now - S.sys_relayOffTs
  let inWindow = (offDur > C.wld_waitSec && offDur < C.wld_winSec)

  if (!inWindow) return false

  // If temp dropped more than threshold while "off", relay is welded
  if (tCtrl < (S.wld_airSnapDeg - C.wld_dropDeg)) {
    V.sys_alarm = ALM.WELD
    recordFault('fatal', 'WELD', S.wld_airSnapDeg + '>' + tCtrl)
    print('PROT 🚨 Relay weld: temp dropped ' + S.wld_airSnapDeg.toFixed(1) + '>' + tCtrl.toFixed(1) + ' while OFF')
    return true
  }

  return false
}

// ----------------------------------------------------------
// COOLING HEALTH
// Detects gas leak / valve failure via evap-air differential.
// ----------------------------------------------------------

/**
 * checkCoolingHealth - Monitor for gas leak
 * If evap temp is too close to air temp while running, suspect gas leak.
 * Only checks after minimum run time to allow evap to cool.
 *
 * @param  {number} tEvap - Evaporator temperature
 * @param  {number} now   - Current timestamp (seconds)
 * @returns {boolean}      - True if cooling failure suspected
 */
function checkCoolingHealth(tEvap, now) {
  // Only check while running, after minimum check time
  if (!S.sys_isRelayOn) return false
  if ((now - S.sys_relayOnTs) <= C.gas_checkSec) return false
  if (V.trb_isActive) return false

  // Skip check if fridge already at/below target - minimal thermal load
  // When cold, evap-air differential is naturally small (equilibrium)
  if (V.sns_airSmoothDeg <= C.ctl_targetDeg) return false

  // Evap should be colder than air. If not, suspect gas leak
  if (tEvap > (V.sns_airSmoothDeg - C.gas_failDiff)) {
    V.sys_alarm = ALM.COOL
    print('PROT 🚨 Cooling failure: air=' + V.sns_airSmoothDeg.toFixed(1) + ' evap=' + tEvap.toFixed(1))
    return true
  }

  return false
}

// ----------------------------------------------------------
// POWER MONITORING PROTECTION
// Detects locked rotor and ghost run conditions via power draw.
// ----------------------------------------------------------

/**
 * checkLockedRotor - Detect seized motor
 * Detects excessive power draw indicating seized motor.
 * CRITICAL: Caller must call setRelay(false) when this returns true.
 *
 * @param  {number} watts   - Current power consumption
 * @param  {number} runDur  - How long relay has been on (seconds)
 * @returns {boolean}        - True if locked rotor detected
 */
function checkLockedRotor(watts, runDur) {
  if (!C.pwr_enable) return false
  if (!V.hw_hasPM) return false
  if (!S.sys_isRelayOn) return false
  if (runDur < C.pwr_startMaskSec) return false

  if (watts > C.pwr_runMaxW) {
    V.sys_alarm = ALM.LOCKED
    recordFault('fatal', 'LOCKED', Math.floor(watts) + 'W')
    print('PROT 🚨 Locked rotor: ' + Math.floor(watts) + 'W exceeds ' + C.pwr_runMaxW + 'W limit')
    return true
  }

  return false
}

/**
 * checkGhostRun - Detect motor not running
 * Detects unexpectedly low power indicating motor not running.
 * Escalates to fatal after pwr_ghostMaxCnt repeated occurrences.
 * CRITICAL: Caller must call setRelay(false) when this returns true.
 *
 * @param  {number} watts   - Current power consumption
 * @param  {number} runDur  - How long relay has been on (seconds)
 * @returns {boolean}        - True if ghost run detected
 */
function checkGhostRun(watts, runDur) {
  if (!V.hw_hasPM) return false
  if (!S.sys_isRelayOn) {
    V.pwr_ghostSec = 0
    return false
  }
  if (runDur < C.pwr_startMaskSec) return false

  if (watts < C.pwr_runMinW) {
    V.pwr_ghostSec += C.sys_loopSec
    if (V.pwr_ghostSec >= C.pwr_ghostTripSec) {
      V.pwr_ghostCnt++
      // Check for escalation to fatal after repeated ghost runs
      if (V.pwr_ghostCnt >= C.pwr_ghostMaxCnt) {
        V.sys_alarm = ALM.LOCKED
        recordFault('fatal', 'GHOST_ESC', V.pwr_ghostCnt + 'x')
        print('🚨 PROT Ghost run #' + V.pwr_ghostCnt + ' (fatal): motor not drawing power')
        return true
      }
      V.sys_alarm = ALM.GHOST
      print('⚠️ PROT Ghost run #' + V.pwr_ghostCnt + ': motor drawing <' + C.pwr_runMinW + 'W')
      return true
    }
  } else {
    V.pwr_ghostSec = 0
  }

  return false
}

/**
 * resetGhostCount - Reset ghost run counter
 * Resets ghost run counter after successful compressor operation.
 * Call this after compressor runs normally for a period.
 */
function resetGhostCount() {
  V.pwr_ghostCnt = 0
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export {
  canTurnOn,
  canTurnOff,
  getTimeUntilOnAllowed,
  getTimeUntilOffAllowed,
  isMaxRunExceeded,
  isFreezeProtectionActive,
  checkWeldDetection,
  checkCoolingHealth,
  checkLockedRotor,
  checkGhostRun,
  resetGhostCount,
}
