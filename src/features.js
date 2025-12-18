// ==============================================================================
// OPTIONAL FEATURES
// Door detection, defrost, turbo mode, limp mode, and adaptive hysteresis.
// All features can be enabled/disabled via config.
// ==============================================================================

import { ST, ADAPT } from './constants.js'
import { C } from './config.js'
import { S, V, persistState } from './state.js'
import { r2 } from './utils/math.js'

// Module-local timer for defrost dwell period
let defr_dwellTimer = 0

// ----------------------------------------------------------
// ADAPTIVE HYSTERESIS
// Dynamically adjusts temperature band based on cycle metrics.
// ----------------------------------------------------------

/**
 * getEffectiveHysteresis - Get current hysteresis value
 * Returns base value when adaptive disabled, bounded adaptive otherwise.
 *
 * @returns {number} Current hysteresis value
 */
function getEffectiveHysteresis() {
  // When adaptive is disabled, use base hysteresis from config
  if (!C.adt_enable) return C.ctl_hystDeg
  // Adaptive mode: bound within configured limits
  if (S.adt_hystDeg > C.adt_hystMaxDeg) return C.adt_hystMaxDeg
  if (S.adt_hystDeg < C.adt_hystMinDeg) return C.adt_hystMinDeg
  return S.adt_hystDeg
}

/**
 * adaptHysteresis - Adjust hysteresis based on cycle times
 * Uses trend confirmation to prevent oscillation. Requires 2 consecutive signals.
 *
 * @param {number} avgOn - Average ON time in seconds
 * @param {number} avgOff - Average OFF time in seconds
 * @param {number} cycleCount - Number of cycles this hour
 * @returns {string|null} 'widen', 'tighten', 'blocked', or null
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Multi-zone adaptive algorithm
function adaptHysteresis(avgOn, avgOff, cycleCount) {
  // === GUARDS ===
  if (V.trb_isActive) return null
  if (!C.adt_enable) return null
  if (cycleCount < 1) return null

  // === METRICS ===
  let totalCycle = avgOn + avgOff
  let dutyCycle = totalCycle > 0 ? avgOn / totalCycle : 0.5

  // === THRESHOLDS (Wide Deadband) ===
  // Wide stable zone prevents oscillation
  // Uses cycle COUNT as additional signal for short/long cycling
  let minCycle = C.adt_targetMinSec * ADAPT.SHORT_MULT
  let maxCycle = C.adt_targetMaxSec + ADAPT.STABLE_PAD_SEC
  let dangerZone = C.adt_targetMinSec * ADAPT.DANGER_MULT

  // HIGH CYCLE COUNT = Short cycling (boundary effects hide true cycle time)
  if (cycleCount >= ADAPT.HIGH_CYCLE_COUNT && totalCycle < ADAPT.HIGH_CYCLE_MAX_SEC) {
    dangerZone = maxCycle  // Force into widen zone
  }

  // LOW CYCLE COUNT = Long cycles (system efficient, can tighten)
  if (cycleCount <= ADAPT.LOW_CYCLE_COUNT && totalCycle > ADAPT.LOW_CYCLE_MIN_SEC) {
    maxCycle = ADAPT.LOW_CYCLE_MIN_SEC  // Lower threshold to trigger tightening
  }

  // === FREEZE PROTECTION GUARD ===
  let canWiden = true
  let newLower = C.ctl_targetDeg - (S.adt_hystDeg + 0.1)
  if (newLower <= C.cmp_freezeCutDeg + ADAPT.FREEZE_MARGIN_DEG) {
    canWiden = false
  }

  // === DANGER ZONE: Immediate action (no confirmation needed) ===
  // Compressor protection takes priority over anti-oscillation
  if (totalCycle < dangerZone && canWiden && S.adt_hystDeg < C.adt_hystMaxDeg) {
    S.adt_hystDeg = r2(S.adt_hystDeg + ADAPT.DANGER_STEP_DEG)
    if (S.adt_hystDeg > C.adt_hystMaxDeg) {
      S.adt_hystDeg = C.adt_hystMaxDeg
    }
    V.adt_lastDir = 'widen'
    V.adt_consecCnt = 0
    print('⚠️ ADAPT Short cycling: widening hysteresis to ' + S.adt_hystDeg.toFixed(1)
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return 'widen'
  }

  // === DETERMINE DESIRED DIRECTION ===
  let wantDir = null
  if (totalCycle < minCycle && canWiden && S.adt_hystDeg < C.adt_hystMaxDeg) {
    wantDir = 'widen'
  } else if (totalCycle > maxCycle && avgOff > avgOn && S.adt_hystDeg > C.adt_hystMinDeg) {
    // Only tighten if system has idle headroom (OFF > ON means duty < 50%)
    // Prevents tightening when system is already struggling
    wantDir = 'tighten'
  }

  // === BLOCKED CHECK ===
  if (totalCycle < minCycle && !canWiden) {
    print('⚠️ ADAPT Widen blocked by freeze margin (would cross freeze limit)')
    return 'blocked'
  }

  // === STABLE ZONE ===
  if (wantDir === null) {
    // In stable zone - maintain trend tracking (don't reset)
    // This allows adaptation to resume after brief stable periods
    // Only opposite direction triggers will reset the counter
    return null
  }

  // === TREND CONFIRMATION ===
  if (wantDir === V.adt_lastDir) {
    V.adt_consecCnt++
  } else {
    // Direction changed - start new trend
    V.adt_lastDir = wantDir
    V.adt_consecCnt = 1
    print('ℹ️ ADAPT Tracking ' + wantDir + ', step 1 of 2'
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return null
  }

  // === REQUIRE 2 CONSECUTIVE ===
  if (V.adt_consecCnt < 2) {
    print('ℹ️ ADAPT Tracking ' + wantDir + ', step ' + V.adt_consecCnt + ' of 2'
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return null
  }

  // === EXECUTE ADAPTATION ===
  V.adt_consecCnt = 0  // Reset after acting

  if (wantDir === 'widen') {
    S.adt_hystDeg = r2(S.adt_hystDeg + ADAPT.NORMAL_STEP_DEG)
    if (S.adt_hystDeg > C.adt_hystMaxDeg) {
      S.adt_hystDeg = C.adt_hystMaxDeg
    }
    print('✅ ADAPT Widened hysteresis to ' + S.adt_hystDeg.toFixed(1)
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return 'widen'
  }

  if (wantDir === 'tighten') {
    S.adt_hystDeg = r2(S.adt_hystDeg - ADAPT.NORMAL_STEP_DEG)
    print('✅ ADAPT Tightened hysteresis to ' + S.adt_hystDeg.toFixed(1)
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return 'tighten'
  }

  return null
}

// ----------------------------------------------------------
// TURBO MODE
// Temporary deep cooling with higher target.
// ----------------------------------------------------------

/**
 * checkTurboSwitch - Detect rising edge on input switch
 * Activates turbo mode on low-to-high transition.
 *
 * @param {boolean} switchState - Current switch state
 * @returns {boolean} True if turbo just activated
 */
function checkTurboSwitch(switchState) {
  // Always track switch state (even when disabled) to detect edge correctly
  let wasLow = !V.trb_prevSw
  V.trb_prevSw = switchState

  if (!C.trb_enable) return false

  let activated = false
  if (switchState && wasLow) {
    V.trb_isActive = true
    V.trb_remSec = C.trb_maxTimeSec
    print('TURBO ⚡ Switch activated: turbo ON')
    activated = true
  }

  return activated
}

/**
 * handleTurboMode - Decrement timer and return overrides
 * Deactivates turbo when timer expires.
 *
 * @param {number} dt - Time delta (seconds)
 * @returns {object|null} { target, hyst, detail } or null if not active
 */
function handleTurboMode(dt) {
  if (!V.trb_isActive) return null

  if (V.trb_remSec > 0) {
    V.trb_remSec -= dt
    return {
      target: C.trb_targetDeg,
      hyst: C.trb_hystDeg,
      detail: 'TURBO: ' + (V.trb_remSec / 60).toFixed(0) + 'm left',
    }
  } else {
    V.trb_isActive = false
    print('ℹ️ TURBO Timer expired: turbo deactivated')
    return null
  }
}

// ----------------------------------------------------------
// DOOR DETECTION
// Detects rapid temperature rise indicating door open.
// ----------------------------------------------------------

/**
 * detectDoorOpen - Monitor temperature rise for door events
 * Triggers pause timer when rate exceeds threshold.
 *
 * @param {number} tAirMedian - Current median air temperature
 * @param {number} now - Current timestamp (seconds)
 * @returns {boolean} True if door event detected this call
 */
function detectDoorOpen(tAirMedian, now) {
  if (!C.dor_enable) return false

  let detected = false

  if (V.dor_refTs > 0 && V.dor_refDeg !== 0) {
    let dt = now - V.dor_refTs
    // Guard: Only calculate rate if dt is at least half the loop interval.
    // Prevents false positives from timer overlap or clock jitter.
    if (dt >= C.sys_loopSec * 0.5) {
      let rate = (tAirMedian - V.dor_refDeg) / dt * 60.0
      if (rate > C.dor_rateDegMin) {
        V.dor_pauseRemSec = C.dor_pauseSec
        print('DOOR 🚪 Event detected: +' + rate.toFixed(2) + ' deg/min')
        detected = true
      }
    }
  }

  V.dor_refDeg = r2(tAirMedian)
  V.dor_refTs = now

  // Decrement timer
  if (V.dor_pauseRemSec > 0) V.dor_pauseRemSec -= C.sys_loopSec

  return detected
}

/**
 * isDoorPauseActive - Check if in door-pause period
 *
 * @returns {boolean} True if door timer > 0
 */
function isDoorPauseActive() {
  return V.dor_pauseRemSec > 0
}

// ----------------------------------------------------------
// DEFROST
// Scheduled and dynamic defrost management.
// ----------------------------------------------------------

/**
 * isScheduledDefrost - Check if in scheduled defrost window
 * Creates fresh Date internally - mJS loses Date prototype in callbacks.
 *
 * @returns {boolean} True if in defrost window
 */
function isScheduledDefrost() {
  if (!C.dfr_schedEnable) return false
  let d = new Date()
  return d.getHours() === C.dfr_schedHour
         && d.getMinutes() * 60 < C.dfr_schedDurSec
}

/**
 * checkDefrostTrigger - Check if evap triggers dynamic defrost
 * Triggers when evaporator reaches defr_dynTrigDeg.
 *
 * @param {number} tEvap - Evaporator temperature
 * @returns {boolean} True if defrost should trigger
 */
function checkDefrostTrigger(tEvap) {
  if (!C.dfr_dynEnable) return false
  if (V.trb_isActive) return false
  if (S.dfr_isActive) return false

  if (tEvap <= C.dfr_dynTrigDeg) {
    S.dfr_isActive = true
    persistState()
    print('DEFR ❄️ Dynamic defrost: triggered at evap ' + tEvap.toFixed(1) + 'C')
    return true
  }

  return false
}

/**
 * handleDynamicDefrost - Manage defrost dwell and completion
 * Returns true while defrost is active.
 *
 * @param {number} tEvap - Evaporator temperature
 * @returns {boolean} True if defrost is active
 */
function handleDynamicDefrost(tEvap) {
  if (!C.dfr_dynEnable) return false
  if (!S.dfr_isActive) return false
  if (V.trb_isActive) return false

  // Check if evap has warmed up enough
  if (tEvap >= C.dfr_dynEndDeg) {
    defr_dwellTimer += C.sys_loopSec
    if (defr_dwellTimer >= C.dfr_dynDwellSec) {
      S.dfr_isActive = false
      defr_dwellTimer = 0
      persistState()
      print('✅ DEFR Dynamic defrost: complete')
      return false
    }
  } else {
    defr_dwellTimer = 0
  }

  return true
}

// ----------------------------------------------------------
// LIMP MODE
// Blind cycling when sensors have failed.
// ----------------------------------------------------------

/**
 * handleLimpMode - Execute blind duty cycling
 * Used when sensors have failed, cycles based on uptime.
 *
 * @returns {object} { wantOn, status, detail }
 */
function handleLimpMode() {
  if (!C.lmp_enable) {
    return {
      wantOn: false,
      status: ST.LIMP_IDLE,
      detail: 'Limp Disabled',
    }
  }

  let cycleSec = C.lmp_onSec + C.lmp_offSec
  let pos = (Shelly.getUptimeMs() / 1000) % cycleSec

  if (pos < C.lmp_onSec) {
    return {
      wantOn: true,
      status: ST.LIMP_COOL,
      detail: ((C.lmp_onSec - pos) / 60).toFixed(0) + 'm rem',
    }
  } else {
    return {
      wantOn: false,
      status: ST.LIMP_IDLE,
      detail: ((cycleSec - pos) / 60).toFixed(0) + 'm rem',
    }
  }
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export {
  // Adaptive Hysteresis
  getEffectiveHysteresis,
  adaptHysteresis,
  // Turbo Mode
  checkTurboSwitch,
  handleTurboMode,
  // Door Detection
  detectDoorOpen,
  isDoorPauseActive,
  // Defrost
  isScheduledDefrost,
  checkDefrostTrigger,
  handleDynamicDefrost,
  // Limp Mode
  handleLimpMode,
}
