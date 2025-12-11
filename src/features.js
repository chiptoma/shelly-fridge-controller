// ==============================================================================
// * OPTIONAL FEATURES
// ? Door detection, defrost, turbo mode, limp mode, and adaptive hysteresis.
// ? All features can be enabled/disabled via config.
// ==============================================================================

import { ST, ADAPT } from './constants.js'
import { C } from './config.js'
import { S, V, persistState } from './state.js'
import { r2 } from './utils/math.js'

// ? Module-local timer for defrost dwell period
let defr_dwellTimer = 0

// ----------------------------------------------------------
// * ADAPTIVE HYSTERESIS
// ? Dynamically adjusts temperature band based on cycle metrics.
// ----------------------------------------------------------

/**
 * * GET EFFECTIVE HYSTERESIS
 * ? Returns base hysteresis when adaptive disabled, otherwise bounded adaptive value.
 *
 * @returns {number} - Current hysteresis value
 */
function getEffectiveHysteresis() {
  // ? When adaptive is disabled, use base hysteresis from config
  if (!C.adapt_enable) return C.ctrl_hystDeg
  // ? Adaptive mode: bound within configured limits
  if (S.adapt_hystCurrent > C.adapt_hystMaxDeg) return C.adapt_hystMaxDeg
  if (S.adapt_hystCurrent < C.adapt_hystMinDeg) return C.adapt_hystMinDeg
  return S.adapt_hystCurrent
}

/**
 * * ADAPT HYSTERESIS - Trend-Confirmed Cycle-Time Seeking
 * ? Uses TOTAL cycle time (ON + OFF) with trend confirmation to prevent oscillation.
 * ? Uses CYCLE COUNT as secondary signal to compensate for boundary effects.
 *
 * ? Design Philosophy (anti-oscillation, uses ADAPT constants):
 * ?   < DANGER_MULT (15min)  = DANGER zone (immediate widen, no confirmation)
 * ?   < SHORT_MULT (18min)   = Short-cycling → pending WIDEN (needs confirmation)
 * ?   18-28 min cycle        = STABLE zone (prevents flip-flop)
 * ?   > STABLE_PAD (28min)   = Long cycles → pending TIGHTEN (needs confirmation)
 *
 * ? Cycle Count Signals (compensates for hourly averaging distortion):
 * ?   cycleCount >= HIGH_CYCLE_COUNT && totalCycle < HIGH_CYCLE_MAX_SEC → danger
 * ?   cycleCount <= LOW_CYCLE_COUNT && totalCycle > LOW_CYCLE_MIN_SEC → tighten
 *
 * ? Trend Confirmation (sticky tracking survives stable zone):
 * ?   - Tracks V.adapt_lastDir ('widen'|'tighten'|null) and V.adapt_consecCount
 * ?   - First trigger: count=1, track direction
 * ?   - Second consecutive: count=2, ACT
 * ?   - Stable zone: maintain tracking (don't reset)
 * ?   - Direction change: reset counter, start new direction
 *
 * @param  {number} avgOn      - Average ON time in seconds
 * @param  {number} avgOff     - Average OFF time in seconds
 * @param  {number} cycleCount - Number of cycles this hour
 * @returns {string|null}       - 'widen', 'tighten', 'blocked', or null
 *
 * @mutates S.adapt_hystCurrent - Updated hysteresis value (±DANGER_STEP or ±NORMAL_STEP)
 * @mutates V.adapt_lastDir     - Tracking direction ('widen'|'tighten'|null)
 * @mutates V.adapt_consecCount - Consecutive same-direction count (0-2)
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Multi-zone adaptive algorithm
function adaptHysteresis(avgOn, avgOff, cycleCount) {
  // === GUARDS ===
  if (V.turbo_active) return null
  if (!C.adapt_enable) return null
  if (cycleCount < 1) return null

  // === METRICS ===
  let totalCycle = avgOn + avgOff
  let dutyCycle = totalCycle > 0 ? avgOn / totalCycle : 0.5

  // === THRESHOLDS (Wide Deadband) ===
  // ? Wide stable zone prevents oscillation
  // ? Uses cycle COUNT as additional signal for short/long cycling
  let minCycle = C.adapt_targetMinSec * ADAPT.SHORT_MULT
  let maxCycle = C.adapt_targetMaxSec + ADAPT.STABLE_PAD_SEC
  let dangerZone = C.adapt_targetMinSec * ADAPT.DANGER_MULT

  // ? HIGH CYCLE COUNT = Short cycling (boundary effects hide true cycle time)
  if (cycleCount >= ADAPT.HIGH_CYCLE_COUNT && totalCycle < ADAPT.HIGH_CYCLE_MAX_SEC) {
    dangerZone = maxCycle  // Force into widen zone
  }

  // ? LOW CYCLE COUNT = Long cycles (system efficient, can tighten)
  if (cycleCount <= ADAPT.LOW_CYCLE_COUNT && totalCycle > ADAPT.LOW_CYCLE_MIN_SEC) {
    maxCycle = ADAPT.LOW_CYCLE_MIN_SEC  // Lower threshold to trigger tightening
  }

  // === FREEZE PROTECTION GUARD ===
  let canWiden = true
  let newLower = C.ctrl_targetDeg - (S.adapt_hystCurrent + 0.1)
  if (newLower <= C.comp_freezeCutDeg + ADAPT.FREEZE_MARGIN_DEG) {
    canWiden = false
  }

  // === DANGER ZONE: Immediate action (no confirmation needed) ===
  // ? Compressor protection takes priority over anti-oscillation
  if (totalCycle < dangerZone && canWiden && S.adapt_hystCurrent < C.adapt_hystMaxDeg) {
    S.adapt_hystCurrent = r2(S.adapt_hystCurrent + ADAPT.DANGER_STEP_DEG)
    if (S.adapt_hystCurrent > C.adapt_hystMaxDeg) {
      S.adapt_hystCurrent = C.adapt_hystMaxDeg
    }
    V.adapt_lastDir = 'widen'
    V.adapt_consecCount = 0
    print('⚠️ ADAPT Short cycling: widening hysteresis to ' + S.adapt_hystCurrent.toFixed(1)
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return 'widen'
  }

  // === DETERMINE DESIRED DIRECTION ===
  let wantDir = null
  if (totalCycle < minCycle && canWiden && S.adapt_hystCurrent < C.adapt_hystMaxDeg) {
    wantDir = 'widen'
  } else if (totalCycle > maxCycle && dutyCycle < 0.75 && S.adapt_hystCurrent > C.adapt_hystMinDeg) {
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
    // ? This allows adaptation to resume after brief stable periods
    // ? Only opposite direction triggers will reset the counter
    return null
  }

  // === TREND CONFIRMATION ===
  if (wantDir === V.adapt_lastDir) {
    V.adapt_consecCount++
  } else {
    // Direction changed - start new trend
    V.adapt_lastDir = wantDir
    V.adapt_consecCount = 1
    print('ℹ️ ADAPT Tracking ' + wantDir + ', step 1 of 2'
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return null
  }

  // === REQUIRE 2 CONSECUTIVE ===
  if (V.adapt_consecCount < 2) {
    print('ℹ️ ADAPT Tracking ' + wantDir + ', step ' + V.adapt_consecCount + ' of 2'
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return null
  }

  // === EXECUTE ADAPTATION ===
  V.adapt_consecCount = 0  // Reset after acting

  if (wantDir === 'widen') {
    S.adapt_hystCurrent = r2(S.adapt_hystCurrent + ADAPT.NORMAL_STEP_DEG)
    if (S.adapt_hystCurrent > C.adapt_hystMaxDeg) {
      S.adapt_hystCurrent = C.adapt_hystMaxDeg
    }
    print('✅ ADAPT Widened hysteresis to ' + S.adapt_hystCurrent.toFixed(1)
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return 'widen'
  }

  if (wantDir === 'tighten') {
    S.adapt_hystCurrent = r2(S.adapt_hystCurrent - ADAPT.NORMAL_STEP_DEG)
    print('✅ ADAPT Tightened hysteresis to ' + S.adapt_hystCurrent.toFixed(1)
          + ' (cycle ' + (totalCycle / 60).toFixed(0) + 'm'
          + ', duty ' + (dutyCycle * 100).toFixed(0) + '%)')
    return 'tighten'
  }

  return null
}

// ----------------------------------------------------------
// * TURBO MODE
// ? Temporary deep cooling with higher target.
// ----------------------------------------------------------

/**
 * * CHECK TURBO SWITCH
 * ? Detects rising edge on physical input switch to activate turbo.
 *
 * @param  {boolean} switchState - Current switch state
 * @returns {boolean}             - True if turbo just activated
 *
 * @mutates V.turbo_lastSw  - Previous switch state for edge detection
 * @mutates V.turbo_active  - Set true on rising edge (if enabled)
 * @mutates V.turbo_remSec  - Reset to turbo_maxTimeSec on activation
 */
function checkTurboSwitch(switchState) {
  // Always track switch state (even when disabled) to detect edge correctly
  let wasLow = !V.turbo_lastSw
  V.turbo_lastSw = switchState

  if (!C.turbo_enable) return false

  let activated = false
  if (switchState && wasLow) {
    V.turbo_active = true
    V.turbo_remSec = C.turbo_maxTimeSec
    print('TURBO ⚡ Switch activated: turbo ON')
    activated = true
  }

  return activated
}

/**
 * * HANDLE TURBO MODE
 * ? Decrements timer and returns overridden target/hysteresis.
 * ? Deactivates turbo when timer expires.
 *
 * @param  {number} dt - Time delta (seconds)
 * @returns {object|null} - { target, hyst, detail } or null if not active
 *
 * @mutates V.turbo_remSec - Decremented by dt each call
 * @mutates V.turbo_active - Set false when timer expires
 */
function handleTurboMode(dt) {
  if (!V.turbo_active) return null

  if (V.turbo_remSec > 0) {
    V.turbo_remSec -= dt
    return {
      target: C.turbo_targetDeg,
      hyst: C.turbo_hystDeg,
      detail: 'TURBO: ' + (V.turbo_remSec / 60).toFixed(0) + 'm left',
    }
  } else {
    V.turbo_active = false
    print('ℹ️ TURBO Timer expired: turbo deactivated')
    return null
  }
}

// ----------------------------------------------------------
// * DOOR DETECTION
// ? Detects rapid temperature rise indicating door open.
// ----------------------------------------------------------

/**
 * * DETECT DOOR OPEN
 * ? Monitors rate of temperature rise to detect door events.
 * ? Triggers pause timer when rate exceeds threshold.
 *
 * @param  {number} tAirMedian - Current median air temperature
 * @param  {number} now        - Current timestamp (seconds)
 * @returns {boolean}           - True if door event detected this call
 *
 * @mutates V.door_refTemp - Reference temperature for rate calculation
 * @mutates V.door_refTs   - Reference timestamp for rate calculation
 * @mutates V.door_timer   - Set to door_pauseSec on detection, decremented each call
 */
function detectDoorOpen(tAirMedian, now) {
  if (!C.door_enable) return false

  let detected = false

  if (V.door_refTs > 0 && V.door_refTemp !== 0) {
    let dt = now - V.door_refTs
    // ? Guard: Only calculate rate if dt is at least half the loop interval.
    // ? Prevents false positives from timer overlap or clock jitter.
    if (dt >= C.sys_loopSec * 0.5) {
      let rate = (tAirMedian - V.door_refTemp) / dt * 60.0
      if (rate > C.door_rateDegMin) {
        V.door_timer = C.door_pauseSec
        print('DOOR 🚪 Event detected: +' + rate.toFixed(2) + ' deg/min')
        detected = true
      }
    }
  }

  V.door_refTemp = r2(tAirMedian)
  V.door_refTs = now

  // Decrement timer
  if (V.door_timer > 0) V.door_timer -= C.sys_loopSec

  return detected
}

/**
 * * IS DOOR PAUSE ACTIVE
 * ? Returns true if currently in door-pause period.
 *
 * @returns {boolean} - True if door timer > 0
 */
function isDoorPauseActive() {
  return V.door_timer > 0
}

// ----------------------------------------------------------
// * DEFROST
// ? Scheduled and dynamic defrost management.
// ----------------------------------------------------------

/**
 * * IS SCHEDULED DEFROST
 * ? Checks if currently in scheduled defrost window.
 * ! Note: Creates fresh Date internally - mJS loses Date prototype
 * ! when passed as function argument through async callbacks.
 *
 * @returns {boolean} - True if in defrost window
 */
function isScheduledDefrost() {
  if (!C.defr_schedEnable) return false
  let d = new Date()
  return d.getHours() === C.defr_schedHour
         && d.getMinutes() * 60 < C.defr_schedDurSec
}

/**
 * * CHECK DEFROST TRIGGER
 * ? Checks if evaporator is cold enough to trigger dynamic defrost.
 *
 * @param  {number} tEvap - Evaporator temperature
 * @returns {boolean}      - True if defrost should trigger
 *
 * @mutates S.defr_isActive - Set true when evap <= defr_dynTrigDeg
 *
 * @sideeffect Calls persistState() on defrost trigger
 */
function checkDefrostTrigger(tEvap) {
  if (!C.defr_dynEnable) return false
  if (V.turbo_active) return false
  if (S.defr_isActive) return false

  if (tEvap <= C.defr_dynTrigDeg) {
    S.defr_isActive = true
    persistState()
    print('DEFR ❄️ Dynamic defrost: triggered at evap ' + tEvap.toFixed(1) + 'C')
    return true
  }

  return false
}

/**
 * * HANDLE DYNAMIC DEFROST
 * ? Manages defrost dwell timer and completion.
 * ? Returns true while defrost is active.
 *
 * @param  {number} tEvap - Evaporator temperature
 * @returns {boolean}      - True if defrost is active
 *
 * @mutates S.defr_isActive   - Set false when defrost completes
 * @mutates defr_dwellTimer   - Module-local timer incremented/reset
 *
 * @sideeffect Calls persistState() on defrost completion
 */
function handleDynamicDefrost(tEvap) {
  if (!C.defr_dynEnable) return false
  if (!S.defr_isActive) return false
  if (V.turbo_active) return false

  // Check if evap has warmed up enough
  if (tEvap >= C.defr_dynEndDeg) {
    defr_dwellTimer += C.sys_loopSec
    if (defr_dwellTimer >= C.defr_dynDwellSec) {
      S.defr_isActive = false
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
// * LIMP MODE
// ? Blind cycling when sensors have failed.
// ----------------------------------------------------------

/**
 * * HANDLE LIMP MODE
 * ? Executes blind duty cycling based on uptime.
 * ? Returns status for display.
 *
 * @returns {object} - { wantOn, status, detail }
 */
function handleLimpMode() {
  if (!C.limp_enable) {
    return {
      wantOn: false,
      status: ST.LIMP_IDLE,
      detail: 'Limp Disabled',
    }
  }

  let cycleSec = C.limp_onSec + C.limp_offSec
  let pos = (Shelly.getUptimeMs() / 1000) % cycleSec

  if (pos < C.limp_onSec) {
    return {
      wantOn: true,
      status: ST.LIMP_COOL,
      detail: ((C.limp_onSec - pos) / 60).toFixed(0) + 'm rem',
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
// * EXPORTS
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
