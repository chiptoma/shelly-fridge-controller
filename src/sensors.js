// ==============================================================================
// * SENSOR MANAGEMENT
// ? Sensor reading, smoothing, and health monitoring.
// ? Handles median filtering, EMA smoothing, and stuck detection.
// ==============================================================================

import { C } from './config.js'
import { S, V } from './state.js'
import { r2, getMedian3, calcEMA } from './utils/math.js'

// ----------------------------------------------------------
// * SENSOR STUCK DETECTION
// ? Checks if a sensor value has been stuck for too long.
// ----------------------------------------------------------

/**
 * * checkSensorStuck - Check if sensor value is stuck
 * ? Updates reference value and timestamp if sensor moved.
 * ? Returns true if sensor stuck longer than threshold.
 *
 * @param {number} val - Current sensor value
 * @param {string} refKey - Key for reference value in V (e.g., 'sens_stuckRefAir')
 * @param {string} tsKey - Key for timestamp in V (e.g., 'sens_stuckTsAir')
 * @param {number} now - Current timestamp (seconds)
 * @returns {boolean} - True if sensor is stuck
 */
function checkSensorStuck(val, refKey, tsKey, now) {
  // Skip if stuck detection disabled
  if (!C.sens_stuckEnable) return false

  // Initialize reference on first call
  if (V[refKey] === null) {
    V[tsKey] = now
    V[refKey] = r2(val)
    return false
  }

  // Check if value moved enough to reset timer
  if (Math.abs(val - V[refKey]) > C.sens_stuckEpsDeg) {
    V[refKey] = r2(val)
    V[tsKey] = now
    return false
  }

  // Check if stuck too long
  return (now - V[tsKey]) > C.sens_stuckTimeSec
}

// ----------------------------------------------------------
// * SENSOR ERROR HANDLING
// ? Increments error count and checks against threshold.
// ----------------------------------------------------------

/**
 * * handleSensorError - Handle sensor read failure
 * ? Increments error counter and returns true if limit exceeded.
 *
 * @returns {boolean} - True if sensor fail limit exceeded
 */
function handleSensorError() {
  V.sens_errCount++
  return V.sens_errCount >= C.sys_sensFailLimit
}

// ----------------------------------------------------------
// * SENSOR RECOVERY
// ? Resets buffers and state after sensor recovery.
// ----------------------------------------------------------

/**
 * * handleSensorRecovery - Handle sensor recovery after errors
 * ? Resets buffers and re-initializes smoothing.
 *
 * @param {number} tAirRaw - Raw air temperature reading
 */
function handleSensorRecovery(tAirRaw) {
  V.sens_bufAir[0] = tAirRaw
  V.sens_bufAir[1] = tAirRaw
  V.sens_bufAir[2] = tAirRaw
  V.sens_bufIdx = 0
  V.sens_smoothAir = r2(tAirRaw)
  V.door_refTs = 0
  V.door_refTemp = 0
  // ? Reset stuck detection to prevent false alarms after recovery
  V.sens_stuckRefAir = null
  V.sens_stuckRefEvap = null
  V.sens_wasError = false
  print('ℹ️ SENS  : Sensors recovered after errors')
}

// ----------------------------------------------------------
// * SENSOR DATA PROCESSING
// ? Applies median filter and EMA smoothing to raw readings.
// ----------------------------------------------------------

/**
 * * processSensorData - Process raw sensor readings
 * ? Applies median filter for spike rejection, then EMA for smoothing.
 *
 * @param {number} tAirRaw - Raw air temperature reading
 * @returns {number} - Median-filtered air temperature (before EMA)
 */
function processSensorData(tAirRaw) {
  // First valid reading warmup: seed buffer and smoothing for clean startup
  if (V.sens_smoothAir === null) {
    V.sens_bufAir[0] = tAirRaw
    V.sens_bufAir[1] = tAirRaw
    V.sens_bufAir[2] = tAirRaw
    V.sens_bufIdx = 0
    V.sens_smoothAir = r2(tAirRaw)
    return tAirRaw
  }

  // Update circular buffer
  V.sens_bufAir[V.sens_bufIdx] = tAirRaw
  V.sens_bufIdx = (V.sens_bufIdx + 1) % 3

  // Calculate median of last 3 readings
  let tAirMedian = getMedian3(V.sens_bufAir[0], V.sens_bufAir[1], V.sens_bufAir[2])

  // Apply EMA smoothing
  V.sens_smoothAir = r2(calcEMA(tAirMedian, V.sens_smoothAir, C.ctrl_smoothAlpha))

  return tAirMedian
}

/**
 * * validateSensorReadings - Check if sensor readings are valid
 * ? Returns true if both air and evap readings are valid numbers.
 *
 * @param {object} rAir - Air sensor response from Shelly
 * @param {object} rEvap - Evap sensor response from Shelly
 * @returns {boolean} - True if readings are valid
 */
function validateSensorReadings(rAir, rEvap) {
  if (!rAir || !rEvap) return false
  // ? Use == null to catch both null and undefined
  // ? isNaN(null) returns false because Number(null) === 0
  if (rAir.tC == null || rEvap.tC == null) return false
  if (isNaN(rAir.tC) || isNaN(rEvap.tC)) return false
  return true
}

/**
 * * resetSensorError - Reset sensor error counter
 * ? Called when valid reading received.
 */
function resetSensorError() {
  V.sens_errCount = 0
}

// ----------------------------------------------------------
// * EXPORTS
// ? ES module exports for testing. Stripped during bundling.
// ----------------------------------------------------------

export {
  checkSensorStuck,
  handleSensorError,
  handleSensorRecovery,
  processSensorData,
  validateSensorReadings,
  resetSensorError,
}
