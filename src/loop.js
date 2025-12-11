// ==============================================================================
// * MAIN LOOP
// ? Orchestrates all modules per timer tick.
// ? Handles sensor reading, alarm evaluation, mode determination, and reporting.
// ==============================================================================

import { ALM, RSN } from './constants.js'
import { C } from './config.js'
import { S, V, persistState } from './state.js'
import { nowSec } from './utils/math.js'
import { processSensorData, validateSensorReadings, handleSensorError, handleSensorRecovery, checkSensorStuck, resetSensorError } from './sensors.js'
import { clearNonFatalAlarms, applySensorAlarms, processAlarmEdges, checkHighTempAlarm } from './alarms.js'
import { checkWeldDetection, checkCoolingHealth, checkLockedRotor, checkGhostRun, resetGhostCount } from './protection.js'
import { checkTurboSwitch, detectDoorOpen, checkDefrostTrigger, isScheduledDefrost } from './features.js'
import { updateMetrics } from './metrics.js'
import { determineMode, executeSwitchDecision, setRelay } from './control.js'
import { publishStatus } from './reporting.js'

// ----------------------------------------------------------
// * LOOP STATE
// ? Timer reference for cleanup.
// ----------------------------------------------------------

let loopTimer = null

// ----------------------------------------------------------
// * MAIN LOOP TICK
// ? Single iteration of the control loop.
// ----------------------------------------------------------

/**
 * * MAIN LOOP TICK
 * ? Executes one complete control cycle.
 * ? Called by Timer.set every sys_loopSec seconds.
 */
function mainLoopTick() {
  // ! CRITICAL: Store timestamp in GLOBAL state, not local variable.
  // ! Shelly mJS closures are broken - local variables become corrupted in async callbacks.
  V.loopNow = nowSec()

  // 1. CHECK PHYSICAL INPUT (TURBO SWITCH)
  let inp = Shelly.getComponentStatus('Input', 0)
  if (inp) {
    checkTurboSwitch(inp.state)
  }

  // 2. READ SENSORS (Async chain)
  // ? CRITICAL: Use $_ prefix for callback params to prevent Terser from minifying
  // ? to single letters that shadow math functions (ri, r1, r2) due to mJS scoping bug
  Shelly.call('Temperature.GetStatus', { id: C.sys_sensAirId }, function ($_rAir) {
    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Main loop orchestration
    Shelly.call('Temperature.GetStatus', { id: C.sys_sensEvapId }, function ($_rEvap) {

      let tAirRaw = null
      let tEvap = null
      let tAirMedian = 0

      // Get switch status for power monitoring
      let swStatus = Shelly.getComponentStatus('Switch', 0)
      let swWatts = (swStatus && swStatus.apower) ? swStatus.apower : 0
      let swTemp = (swStatus && swStatus.temperature) ? swStatus.temperature.tC : null

      // Check power monitor availability
      V.hw_hasPM = !!(swStatus && swStatus.apower !== undefined)

      // 3. VALIDATE SENSOR READINGS
      let airStuck = false
      let evapStuck = false

      if (!validateSensorReadings($_rAir, $_rEvap)) {
        // Sensor error handling - returns true when fatal threshold reached
        let isFatal = handleSensorError()
        if (isFatal && !V.sens_wasError) {
          // First time reaching failure threshold
          V.sens_wasError = true
        }
      } else {
        // Valid readings
        tAirRaw = $_rAir.tC
        tEvap = $_rEvap.tC

        // Reset error count on valid reading
        resetSensorError()

        // Recovery from previous error state
        if (V.sens_wasError) {
          handleSensorRecovery(tAirRaw)
        }

        // 4. PROCESS SENSOR DATA (Median + EMA)
        tAirMedian = processSensorData(tAirRaw)

        // 5. CHECK SENSOR STUCK (use raw values, not smoothed)
        airStuck = checkSensorStuck(tAirRaw, 'sens_stuckRefAir', 'sens_stuckTsAir', V.loopNow)
        evapStuck = checkSensorStuck(tEvap, 'sens_stuckRefEvap', 'sens_stuckTsEvap', V.loopNow)

        // 6. POWER MONITORING (if PM available)
        if (V.hw_hasPM && S.sys_relayState) {
          let runDur = V.loopNow - S.sys_tsRelayOn
          // ! CRITICAL: setRelay must be called to update state on detection
          if (checkLockedRotor(swWatts, runDur)) {
            setRelay(false, V.loopNow, 0, 0, true)
          } else if (checkGhostRun(swWatts, runDur)) {
            setRelay(false, V.loopNow, 0, 0, true)
          } else if (runDur > C.pwr_startMaskSec && swWatts >= C.pwr_runMinW) {
            // ? Compressor running normally - reset ghost count
            resetGhostCount()
          }
        } else if (!S.sys_relayState) {
          // Reset ghost timer when relay is OFF
          V.pwr_ghostTimer = 0
        }

        // 7. COOLING HEALTH CHECK
        checkCoolingHealth(tEvap, V.loopNow)

        // 8. DOOR DETECTION (only with valid sensors)
        detectDoorOpen(tAirMedian, V.loopNow)

        // 9. DEFROST TRIGGER CHECK (only with valid sensors)
        checkDefrostTrigger(tEvap)

        // 10. HIGH TEMP ALARM CHECK (only with valid sensors)
        let isDeepDefrost = isScheduledDefrost()
        checkHighTempAlarm(V.sens_smoothAir, isDeepDefrost)

        // 11. WELD DETECTION (only with valid sensors)
        checkWeldDetection(V.sens_smoothAir, V.loopNow)
      }

      // ============================================================
      // CRITICAL: The following steps MUST run regardless of sensor state
      // to ensure limp mode, metrics, and reporting continue working.
      // ============================================================

      // 12. ALARM STATE MANAGEMENT
      let alarmBefore = V.sys_alarm

      // Clear non-fatal alarms for re-evaluation
      clearNonFatalAlarms()
      V.sys_reason = RSN.NONE
      V.sys_statusDetail = 'NONE'

      // Re-apply sensor alarms
      let alarmFail = (V.sens_errCount >= C.sys_sensFailLimit)
      applySensorAlarms(alarmFail, airStuck || evapStuck)

      // 13. UPDATE METRICS
      updateMetrics(S.sys_relayState, C.sys_loopSec)

      // 14. PROCESS ALARM EDGES (Fault logging)
      let alarmAfter = V.sys_alarm
      processAlarmEdges(alarmBefore, alarmAfter, swWatts, tAirRaw, tEvap)

      // 15. DETERMINE MODE
      let mode = determineMode(V.sens_smoothAir, tEvap, V.loopNow)

      // 16. EXECUTE SWITCH DECISION
      let isLimp = (V.sys_alarm === ALM.FAIL || V.sys_alarm === ALM.STUCK)
      let switchResult = executeSwitchDecision(mode.wantOn, V.loopNow, V.sens_smoothAir, tEvap, isLimp)

      // ? Update status from mode determination only if NO action was taken.
      // ? When blocked OR switched, executeSwitchDecision already set correct status.
      if (!switchResult.blocked && !switchResult.switched) {
        V.sys_status = mode.status
        if (mode.reason !== RSN.NONE) V.sys_reason = mode.reason
        if (mode.detail !== 'NONE') V.sys_statusDetail = mode.detail
      }

      // 17. PERIODIC STATE SAVE
      if (V.loopNow - V.lastSave > 3600) {
        persistState()
      }

      // 18. REPORT STATUS
      publishStatus(V.sens_smoothAir, tEvap, tAirRaw, swWatts, swTemp)
    })
  })
}

// ----------------------------------------------------------
// * LOOP CONTROL
// ? Start and stop the main loop timer.
// ----------------------------------------------------------

/**
 * * START MAIN LOOP
 * ? Initializes the repeating timer for main loop execution.
 */
function startMainLoop() {
  if (loopTimer !== null) {
    print('⚠️ LOOP  : Already running')
    return
  }

  print('ℹ️ LOOP  : Starting main loop: interval ' + C.sys_loopSec + 's')
  loopTimer = Timer.set(C.sys_loopSec * 1000, true, mainLoopTick)
}

/**
 * * STOP MAIN LOOP
 * ? Clears the timer to stop loop execution.
 */
function stopMainLoop() {
  if (loopTimer !== null) {
    Timer.clear(loopTimer)
    loopTimer = null
    print('ℹ️ LOOP  : Main loop stopped')
  }
}

/**
 * * IS LOOP RUNNING
 * ? Returns true if main loop timer is active.
 *
 * @returns {boolean} - True if running
 */
function isLoopRunning() {
  return loopTimer !== null
}

// ----------------------------------------------------------
// * EXPORTS
// ----------------------------------------------------------

export {
  mainLoopTick,
  startMainLoop,
  stopMainLoop,
  isLoopRunning,
}
