// ==============================================================================
// MAIN LOOP
// Orchestrates all modules per timer tick.
// Handles sensor reading, alarm evaluation, mode determination, and reporting.
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
// LOOP STATE
// Timer reference for cleanup.
// ----------------------------------------------------------

let loopTimer = null

// ----------------------------------------------------------
// MAIN LOOP TICK
// Single iteration of the control loop.
// ----------------------------------------------------------

/**
 * MAIN LOOP TICK
 * Executes one complete control cycle.
 * Called by Timer.set every sys_loopSec seconds.
 */
function mainLoopTick() {
  // CRITICAL: Store timestamp in GLOBAL state, not local variable.
  // Shelly mJS closures are broken - local variables become corrupted in async callbacks.
  V.lop_nowTs = nowSec()

  // 1. CHECK PHYSICAL INPUT (TURBO SWITCH)
  let inp = Shelly.getComponentStatus('Input', 0)
  if (inp) {
    checkTurboSwitch(inp.state)
  }

  // 2. READ SENSORS (Async chain)
  // CRITICAL: Use $_ prefix for callback params to prevent Terser from minifying
  // to single letters that shadow math functions (ri, r1, r2) due to mJS scoping bug
  Shelly.call('Temperature.GetStatus', { id: C.sys_sensAirId }, function ($_rAir) {
    // eslint-disable-next-line complexity -- 8 sequential phases: sensors/stuck/defrost/door/mode/switch/power/report
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Each phase has error handling and state coordination
    Shelly.call('Temperature.GetStatus', { id: C.sys_sensEvpId }, function ($_rEvap) {

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
        if (isFatal && !V.sns_wasErr) {
          // First time reaching failure threshold
          V.sns_wasErr = true
        }
      } else {
        // Valid readings
        tAirRaw = $_rAir.tC
        tEvap = $_rEvap.tC

        // Reset error count on valid reading
        resetSensorError()

        // Recovery from previous error state
        if (V.sns_wasErr) {
          handleSensorRecovery(tAirRaw)
        }

        // 4. PROCESS SENSOR DATA (Median + EMA)
        tAirMedian = processSensorData(tAirRaw)

        // 5. CHECK SENSOR STUCK (use raw values, not smoothed)
        airStuck = checkSensorStuck(tAirRaw, 'sns_airStuckRefDeg', 'sns_airStuckTs', V.lop_nowTs)
        evapStuck = checkSensorStuck(tEvap, 'sns_evpStuckRefDeg', 'sns_evpStuckTs', V.lop_nowTs)

        // 6. POWER MONITORING (if PM available)
        if (V.hw_hasPM && S.sys_isRelayOn) {
          let runDur = V.lop_nowTs - S.sys_relayOnTs
          // CRITICAL: setRelay must be called to update state on detection
          if (checkLockedRotor(swWatts, runDur)) {
            setRelay(false, V.lop_nowTs, 0, 0, true)
          } else if (checkGhostRun(swWatts, runDur)) {
            setRelay(false, V.lop_nowTs, 0, 0, true)
          } else if (runDur > C.pwr_startMaskSec && swWatts >= C.pwr_runMinW) {
            // Compressor running normally - reset ghost count
            resetGhostCount()
          }
        } else if (!S.sys_isRelayOn) {
          // Reset ghost timer when relay is OFF
          V.pwr_ghostSec = 0
        }

        // 7. COOLING HEALTH CHECK
        checkCoolingHealth(tEvap, V.lop_nowTs)

        // 8. DOOR DETECTION (only with valid sensors)
        detectDoorOpen(tAirMedian, V.lop_nowTs)

        // 9. DEFROST TRIGGER CHECK (only with valid sensors)
        checkDefrostTrigger(tEvap)

        // 10. HIGH TEMP ALARM CHECK (only with valid sensors)
        let isDeepDefrost = isScheduledDefrost()
        checkHighTempAlarm(V.sns_airSmoothDeg, isDeepDefrost)

        // 11. WELD DETECTION (only with valid sensors)
        checkWeldDetection(V.sns_airSmoothDeg, V.lop_nowTs)
      }

      // ============================================================
      // CRITICAL: The following steps MUST run regardless of sensor state
      // to ensure limp mode, metrics, and reporting continue working.
      // ============================================================

      // 12. ALARM STATE MANAGEMENT
      let alarmBefore = V.sys_alarm

      // Clear non-fatal alarms for re-evaluation
      clearNonFatalAlarms()
      V.sys_statusReason = RSN.NONE
      V.sys_detail = 'NONE'

      // Re-apply sensor alarms
      let alarmFail = (V.sns_errCnt >= C.sys_sensFailLimit)
      applySensorAlarms(alarmFail, airStuck || evapStuck)

      // 13. UPDATE METRICS
      updateMetrics(S.sys_isRelayOn, C.sys_loopSec)

      // 14. PROCESS ALARM EDGES (Fault logging)
      let alarmAfter = V.sys_alarm
      processAlarmEdges(alarmBefore, alarmAfter, swWatts, tAirRaw, tEvap)

      // 15. DETERMINE MODE
      let mode = determineMode(V.sns_airSmoothDeg, tEvap, V.lop_nowTs)

      // 16. EXECUTE SWITCH DECISION
      let isLimp = (V.sys_alarm === ALM.FAIL || V.sys_alarm === ALM.STUCK)
      let switchResult = executeSwitchDecision(mode.wantOn, V.lop_nowTs, V.sns_airSmoothDeg, tEvap, isLimp)

      // Update status from mode determination only if NO action was taken.
      // When blocked OR switched, executeSwitchDecision already set correct status.
      if (!switchResult.blocked && !switchResult.switched) {
        V.sys_status = mode.status
        if (mode.reason !== RSN.NONE) V.sys_statusReason = mode.reason
        if (mode.detail !== 'NONE') V.sys_detail = mode.detail
      }

      // 17. PERIODIC STATE SAVE (every 15 min max)
      if (V.lop_nowTs - V.lop_lastSaveTs > 900) {
        persistState()
      }

      // 18. REPORT STATUS
      publishStatus(V.sns_airSmoothDeg, tEvap, tAirRaw, swWatts, swTemp)
    })
  })
}

// ----------------------------------------------------------
// LOOP CONTROL
// Start and stop the main loop timer.
// ----------------------------------------------------------

/**
 * START MAIN LOOP
 * Initializes the repeating timer for main loop execution.
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
 * STOP MAIN LOOP
 * Clears the timer to stop loop execution.
 */
function stopMainLoop() {
  if (loopTimer !== null) {
    Timer.clear(loopTimer)
    loopTimer = null
    print('ℹ️ LOOP  : Main loop stopped')
  }
}

/**
 * IS LOOP RUNNING
 * Returns true if main loop timer is active.
 *
 * @returns {boolean} - True if running
 */
function isLoopRunning() {
  return loopTimer !== null
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export {
  mainLoopTick,
  startMainLoop,
  stopMainLoop,
  isLoopRunning,
}
