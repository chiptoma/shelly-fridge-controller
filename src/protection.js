// ==============================================================================
// * PROTECTION SYSTEMS
// ? Compressor timing guards, freeze protection, weld detection, and cooling health.
// ? Safety-critical code - handles protection against hardware damage.
// ==============================================================================

import { ALM } from './constants.js'
import { C } from './config.js'
import { S, V } from './state.js'
import { recordFault } from './alarms.js'

// ----------------------------------------------------------
// * COMPRESSOR TIMING GUARDS
// ? Prevents short-cycling to protect compressor.
// ----------------------------------------------------------

/**
 * * CAN TURN ON
 * ? Checks if minimum OFF time has elapsed to allow turning ON.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {boolean}    - True if safe to turn on
 */
function canTurnOn(now) {
  return (now - S.sys_tsRelayOff) >= C.comp_minOffSec
}

/**
 * * CAN TURN OFF
 * ? Checks if minimum ON time has elapsed to allow turning OFF.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {boolean}    - True if safe to turn off
 */
function canTurnOff(now) {
  let elapsed = now - S.sys_tsRelayOn
  return elapsed >= C.comp_minOnSec
}

/**
 * * GET TIME UNTIL ON ALLOWED
 * ? Returns seconds remaining until turn-on is allowed.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {number}     - Seconds remaining (0 if already allowed)
 */
function getTimeUntilOnAllowed(now) {
  let remaining = C.comp_minOffSec - (now - S.sys_tsRelayOff)
  return remaining > 0 ? remaining : 0
}

/**
 * * GET TIME UNTIL OFF ALLOWED
 * ? Returns seconds remaining until turn-off is allowed.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {number}     - Seconds remaining (0 if already allowed)
 */
function getTimeUntilOffAllowed(now) {
  let remaining = C.comp_minOnSec - (now - S.sys_tsRelayOn)
  return remaining > 0 ? remaining : 0
}

// ----------------------------------------------------------
// * MAX RUN PROTECTION
// ? Forces compressor off after max run time exceeded.
// ----------------------------------------------------------

/**
 * * IS MAX RUN EXCEEDED
 * ? Checks if compressor has exceeded maximum continuous run time.
 *
 * @param  {number} now - Current timestamp (seconds)
 * @returns {boolean}    - True if max run exceeded
 */
function isMaxRunExceeded(now) {
  if (!S.sys_relayState) return false
  if (V.turbo_active) return false
  return (now - S.sys_tsRelayOn) > C.comp_maxRunSec
}

// ----------------------------------------------------------
// * FREEZE PROTECTION
// ? Prevents air temperature from dropping too low.
// ----------------------------------------------------------

/**
 * * IS FREEZE PROTECTION ACTIVE
 * ? Checks if air temp is below freeze cut threshold.
 *
 * @param  {number} tCtrl - Control temperature (smoothed air)
 * @returns {boolean}      - True if freeze cut should engage
 */
function isFreezeProtectionActive(tCtrl) {
  return tCtrl < C.comp_freezeCutDeg
}

// ----------------------------------------------------------
// * WELD DETECTION
// ? Detects relay weld by monitoring temp drop after turn-off.
// ----------------------------------------------------------

/**
 * * CHECK WELD DETECTION
 * ? Monitors for relay weld: if temp drops after turn-off, relay is stuck.
 * ? Only checks during detection window (waitSec < t < winSec).
 *
 * @param  {number} tCtrl - Control temperature (smoothed air)
 * @param  {number} now   - Current timestamp (seconds)
 * @returns {boolean}      - True if weld detected
 *
 * @mutates V.sys_alarm - Set to ALM.WELD if weld detected
 *
 * @sideeffect Calls recordFault('fatal', 'WELD', ...) on detection
 */
function checkWeldDetection(tCtrl, now) {
  if (!C.weld_enable) return false
  if (S.sys_relayState) return false

  let offDur = now - S.sys_tsRelayOff
  let inWindow = (offDur > C.weld_waitSec && offDur < C.weld_winSec)

  if (!inWindow) return false

  // If temp dropped more than threshold while "off", relay is welded
  if (tCtrl < (S.weld_snapAir - C.weld_dropDeg)) {
    V.sys_alarm = ALM.WELD
    recordFault('fatal', 'WELD', S.weld_snapAir + '>' + tCtrl)
    print('PROT 🚨 Relay weld: temp dropped ' + S.weld_snapAir.toFixed(1) + '>' + tCtrl.toFixed(1) + ' while OFF')
    return true
  }

  return false
}

// ----------------------------------------------------------
// * COOLING HEALTH
// ? Detects gas leak / valve failure via evap-air differential.
// ----------------------------------------------------------

/**
 * * CHECK COOLING HEALTH
 * ? If evap temp is too close to air temp while running, suspect gas leak.
 * ? Only checks after minimum run time to allow evap to cool.
 *
 * @param  {number} tEvap - Evaporator temperature
 * @param  {number} now   - Current timestamp (seconds)
 * @returns {boolean}      - True if cooling failure suspected
 *
 * @mutates V.sys_alarm - Set to ALM.COOL if gas leak suspected
 */
function checkCoolingHealth(tEvap, now) {
  // Only check while running, after minimum check time
  if (!S.sys_relayState) return false
  if ((now - S.sys_tsRelayOn) <= C.gas_checkSec) return false
  if (V.turbo_active) return false

  // ? Skip check if fridge already at/below target - minimal thermal load
  // ? When cold, evap-air differential is naturally small (equilibrium)
  if (V.sens_smoothAir <= C.ctrl_targetDeg) return false

  // Evap should be colder than air. If not, suspect gas leak
  if (tEvap > (V.sens_smoothAir - C.gas_failDiff)) {
    V.sys_alarm = ALM.COOL
    print('PROT 🚨 Cooling failure: air=' + V.sens_smoothAir.toFixed(1) + ' evap=' + tEvap.toFixed(1))
    return true
  }

  return false
}

// ----------------------------------------------------------
// * POWER MONITORING PROTECTION
// ? Detects locked rotor and ghost run conditions via power draw.
// ----------------------------------------------------------

/**
 * * CHECK LOCKED ROTOR
 * ? Detects excessive power draw indicating seized motor.
 * ! CRITICAL: Caller must call setRelay(false) when this returns true.
 *
 * @param  {number} watts   - Current power consumption
 * @param  {number} runDur  - How long relay has been on (seconds)
 * @returns {boolean}        - True if locked rotor detected
 *
 * @mutates V.sys_alarm - Set to ALM.LOCKED if rotor locked
 *
 * @sideeffect Calls recordFault('fatal', 'LOCKED', ...) on detection
 */
function checkLockedRotor(watts, runDur) {
  if (!C.pwr_enable) return false
  if (!V.hw_hasPM) return false
  if (!S.sys_relayState) return false
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
 * * CHECK GHOST RUN
 * ? Detects unexpectedly low power indicating motor not running.
 * ? Escalates to fatal after pwr_ghostMaxCount repeated occurrences.
 * ! CRITICAL: Caller must call setRelay(false) when this returns true.
 *
 * @param  {number} watts   - Current power consumption
 * @param  {number} runDur  - How long relay has been on (seconds)
 * @returns {boolean}        - True if ghost run detected
 *
 * @mutates V.pwr_ghostTimer - Accumulated low-power duration
 * @mutates V.pwr_ghostCount - Incremented on each ghost trip
 * @mutates V.sys_alarm      - Set to ALM.GHOST or ALM.LOCKED (escalated)
 *
 * @sideeffect Calls recordFault('fatal', 'GHOST_ESC', ...) on escalation
 */
function checkGhostRun(watts, runDur) {
  if (!V.hw_hasPM) return false
  if (!S.sys_relayState) {
    V.pwr_ghostTimer = 0
    return false
  }
  if (runDur < C.pwr_startMaskSec) return false

  if (watts < C.pwr_runMinW) {
    V.pwr_ghostTimer += C.sys_loopSec
    if (V.pwr_ghostTimer >= C.pwr_ghostTripSec) {
      V.pwr_ghostCount++
      // ? Check for escalation to fatal after repeated ghost runs
      if (V.pwr_ghostCount >= C.pwr_ghostMaxCount) {
        V.sys_alarm = ALM.LOCKED
        recordFault('fatal', 'GHOST_ESC', V.pwr_ghostCount + 'x')
        print('🚨 PROT Ghost run #' + V.pwr_ghostCount + ' (fatal): motor not drawing power')
        return true
      }
      V.sys_alarm = ALM.GHOST
      print('⚠️ PROT Ghost run #' + V.pwr_ghostCount + ': motor drawing <' + C.pwr_runMinW + 'W')
      return true
    }
  } else {
    V.pwr_ghostTimer = 0
  }

  return false
}

/**
 * * RESET GHOST COUNT
 * ? Resets ghost run counter after successful compressor operation.
 * ? Call this after compressor runs normally for a period.
 */
function resetGhostCount() {
  V.pwr_ghostCount = 0
}

// ----------------------------------------------------------
// * EXPORTS
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
