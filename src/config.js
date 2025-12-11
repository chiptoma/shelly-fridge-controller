// ==============================================================================
// * FRIDGE CONTROLLER CONFIGURATION
// ? Default values, current config, KVS key mappings, and validation.
// ? All time values are in SECONDS unless otherwise noted.
// ==============================================================================

import { loadChunksSeq, syncToKvs, saveAllToKvs } from './utils/kvs.js'

// ----------------------------------------------------------
// * DEFAULT CONFIGURATION
// ? Factory defaults - used when KVS has no value.
// ----------------------------------------------------------

let DEFAULT = {
  // SYS - Hardware & Loop
  sys_loopSec: 5,            // Main heartbeat interval
  sys_sensAirId: 101,        // Shelly Add-on ID for Air Sensor
  sys_sensEvapId: 100,       // Shelly Add-on ID for Coil Sensor
  sys_sensFailLimit: 5,      // Loops of bad data before Limp Mode
  sys_mqttTopic: 'fridge/status',
  sys_mqttCmd: 'fridge/command',

  // CTRL - Thermostat Control
  ctrl_targetDeg: 4.0,       // Target Temp (C)
  ctrl_hystDeg: 1.0,         // Base Hysteresis (C)
  ctrl_smoothAlpha: 0.08,    // EMA Smoothing Factor

  // ADAPT - Adaptive Hysteresis (Run-Time Based)
  adapt_enable: true,
  adapt_hystMinDeg: 0.5,     // Tightest allowed control
  adapt_hystMaxDeg: 3.0,     // Loosest allowed control
  adapt_targetMinSec: 600,   // Target min run: 10 min
  adapt_targetMaxSec: 1200,  // Target max run: 20 min

  // COMP - Compressor Protection (Auto-Recovery)
  comp_minOnSec: 180,        // Anti-short-cycle: Minimum Run Time
  comp_minOffSec: 300,       // Anti-short-cycle: Minimum Rest Time
  comp_maxRunSec: 7200,      // Max continuous run (2 Hours)
  comp_freezeCutDeg: 0.5,    // Emergency cut if Air < 0.5C

  // LIMP - Failsafe Mode (Blind Cycling)
  limp_enable: true,
  limp_onSec: 1800,          // 30 Minutes ON (66% Duty)
  limp_offSec: 900,          // 15 Minutes OFF

  // DOOR - Door Open Detection (dP/dt)
  door_enable: true,
  door_rateDegMin: 5.0,      // Trigger if temp rises > 5C per minute
  door_pauseSec: 300,        // Stop cooling for 5 mins

  // DEFR - Defrost Logic
  defr_dynEnable: true,
  defr_dynTrigDeg: -16.0,    // Start defrost if evap hits -16C
  defr_dynEndDeg: -5.0,      // Stop melting if evap hits -5C
  defr_dynDwellSec: 300,     // Must hold end temp for 5 mins

  defr_schedEnable: true,
  defr_schedHour: 1,         // 01:00 AM
  defr_schedDurSec: 3600,    // 1 Hour duration

  // WELD - Relay Weld Detection (Physics)
  weld_enable: true,
  weld_waitSec: 600,         // Start checking 10 mins after OFF
  weld_winSec: 1800,         // Stop checking 30 mins after OFF
  weld_dropDeg: 0.2,         // Alarm if temp drops 0.2C while OFF

  // SENS - Sensor Health Monitoring
  sens_stuckEnable: true,
  sens_stuckTimeSec: 14400,  // 4 Hours stuck = Alarm
  sens_stuckEpsDeg: 0.2,     // Reset timer if moves > 0.2C

  // ALARM - High Temp Alert
  alarm_highEnable: true,
  alarm_highDeg: 10.0,       // Critical Alert Threshold
  alarm_highDelaySec: 600,   // Must persist for 10 Minutes

  // PWR - Power Monitoring
  pwr_enable: true,
  pwr_startMaskSec: 15,      // Ignore Inrush (15s)
  pwr_runMinW: 10,           // Ghost Run (<10W)
  pwr_runMaxW: 400,          // Locked Rotor (>400W)
  pwr_ghostTripSec: 60,      // Confirm Ghost for 60s
  pwr_ghostMaxCount: 3,      // Escalate to fatal after N ghost runs

  // TURBO - Turbo Mode
  turbo_enable: true,
  turbo_targetDeg: 1.0,
  turbo_hystDeg: 0.5,
  turbo_maxTimeSec: 10800,   // 3 Hours

  // GAS - Gas Leak Detection
  gas_checkSec: 900,         // Gas Leak Check Time
  gas_failDiff: 5.0,          // Gas Leak Diff (evap must be 5C colder than air)
}

// ----------------------------------------------------------
// * CURRENT CONFIGURATION
// ? Mutable object loaded from KVS at boot.
// ----------------------------------------------------------

let C = {}

// ----------------------------------------------------------
// * KVS KEY MAPPINGS - CONFIG
// ? Maps KVS key names to config field arrays.
// ----------------------------------------------------------

let CFG_KEYS = {
  'fridge_cfg_sys': ['sys_loopSec', 'sys_sensAirId', 'sys_sensEvapId', 'sys_sensFailLimit',
    'sys_mqttTopic', 'sys_mqttCmd'],
  'fridge_cfg_ctrl': ['ctrl_targetDeg', 'ctrl_hystDeg', 'ctrl_smoothAlpha'],
  'fridge_cfg_adapt': ['adapt_enable', 'adapt_hystMinDeg', 'adapt_hystMaxDeg',
    'adapt_targetMinSec', 'adapt_targetMaxSec'],
  'fridge_cfg_comp': ['comp_minOnSec', 'comp_minOffSec', 'comp_maxRunSec', 'comp_freezeCutDeg'],
  'fridge_cfg_limp': ['limp_enable', 'limp_onSec', 'limp_offSec'],
  'fridge_cfg_door': ['door_enable', 'door_rateDegMin', 'door_pauseSec'],
  'fridge_cfg_defr': ['defr_dynEnable', 'defr_dynTrigDeg', 'defr_dynEndDeg', 'defr_dynDwellSec',
    'defr_schedEnable', 'defr_schedHour', 'defr_schedDurSec'],
  'fridge_cfg_weld': ['weld_enable', 'weld_waitSec', 'weld_winSec', 'weld_dropDeg',
    'gas_checkSec', 'gas_failDiff'],
  'fridge_cfg_sens': ['sens_stuckEnable', 'sens_stuckTimeSec', 'sens_stuckEpsDeg'],
  'fridge_cfg_alarm': ['alarm_highEnable', 'alarm_highDeg', 'alarm_highDelaySec'],
  'fridge_cfg_pwr': ['pwr_enable', 'pwr_startMaskSec', 'pwr_runMinW', 'pwr_runMaxW', 'pwr_ghostTripSec', 'pwr_ghostMaxCount'],
  'fridge_cfg_turbo': ['turbo_enable', 'turbo_targetDeg', 'turbo_hystDeg', 'turbo_maxTimeSec'],
}

// ----------------------------------------------------------
// * CONFIGURATION VALIDATION
// ? Function-based validation to minimize runtime heap usage.
// ? Each function is code (not heap data like arrays would be).
// ----------------------------------------------------------

/**
 * * validateNumber - Validate a single numeric config field
 * @param {string} f - Field name
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateNumber(f, min, max, bad) {
  let v = C[f]
  if (typeof v !== 'number' || v < min || v > max) {
    C[f] = DEFAULT[f]
    bad.push(f)
  }
}

/**
 *
 */
function validateSystem(bad) {
  validateNumber('sys_loopSec', 1, 60, bad)
}

/**
 *
 */
function validateCtrl(bad) {
  validateNumber('ctrl_targetDeg', -5, 15, bad)
  validateNumber('ctrl_hystDeg', 0.1, 5, bad)
}

/**
 *
 */
function validateComp(bad) {
  validateNumber('comp_minOnSec', 60, 600, bad)
  validateNumber('comp_minOffSec', 60, 900, bad)
  validateNumber('comp_maxRunSec', 1800, 14400, bad)
  validateNumber('comp_freezeCutDeg', -2, 2, bad)
}

/**
 *
 */
function validateTurbo(bad) {
  validateNumber('turbo_maxTimeSec', 1800, 21600, bad)
}

/**
 *
 */
function validateAdapt(bad) {
  validateNumber('adapt_hystMinDeg', 0.1, 5, bad)
  validateNumber('adapt_hystMaxDeg', 0.1, 5, bad)
  validateNumber('adapt_targetMinSec', 300, 3600, bad)
  validateNumber('adapt_targetMaxSec', 600, 7200, bad)
}

/**
 *
 */
function validateDoor(bad) {
  validateNumber('door_rateDegMin', 0.5, 20, bad)
  validateNumber('door_pauseSec', 30, 3600, bad)
}

/**
 *
 */
function validateDefrost(bad) {
  validateNumber('defr_dynTrigDeg', -40, 0, bad)
  validateNumber('defr_dynEndDeg', -20, 5, bad)
  validateNumber('defr_dynDwellSec', 60, 7200, bad)
  validateNumber('defr_schedHour', 0, 23, bad)
  validateNumber('defr_schedDurSec', 300, 14400, bad)
}

/**
 *
 */
function validateWeld(bad) {
  validateNumber('weld_waitSec', 60, 7200, bad)
  validateNumber('weld_winSec', 300, 14400, bad)
  validateNumber('weld_dropDeg', 0.05, 5, bad)
}

/**
 *
 */
function validateSensors(bad) {
  validateNumber('sens_stuckTimeSec', 300, 86400, bad)
  validateNumber('sens_stuckEpsDeg', 0.05, 5, bad)
}

/**
 *
 */
function validateAlarm(bad) {
  validateNumber('alarm_highDeg', 0, 40, bad)
  validateNumber('alarm_highDelaySec', 60, 7200, bad)
}

/**
 *
 */
function validatePower(bad) {
  validateNumber('pwr_startMaskSec', 1, 120, bad)
  validateNumber('pwr_runMinW', 1, 1000, bad)
  validateNumber('pwr_runMaxW', 50, 2000, bad)
  validateNumber('pwr_ghostTripSec', 5, 600, bad)
  validateNumber('pwr_ghostMaxCount', 1, 10, bad)
}

/**
 *
 */
function validateGas(bad) {
  validateNumber('gas_checkSec', 60, 7200, bad)
  validateNumber('gas_failDiff', 1, 20, bad)
}

/**
 * * validateConfig - Validate and sanitize configuration
 * ? Checks critical config values, reverts invalid to defaults.
 *
 * @returns {string[]} - Array of field names that were reverted
 */
function validateConfig() {
  let bad = []
  validateSystem(bad)
  validateCtrl(bad)
  validateComp(bad)
  validateTurbo(bad)
  validateAdapt(bad)
  validateDoor(bad)
  validateDefrost(bad)
  validateWeld(bad)
  validateSensors(bad)
  validateAlarm(bad)
  validatePower(bad)
  validateGas(bad)
  // Range checks: min must be < max
  if (C.adapt_hystMinDeg >= C.adapt_hystMaxDeg) {
    C.adapt_hystMinDeg = DEFAULT.adapt_hystMinDeg
    C.adapt_hystMaxDeg = DEFAULT.adapt_hystMaxDeg
    bad.push('adapt_hyst_range')
  }
  if (C.adapt_targetMinSec >= C.adapt_targetMaxSec) {
    C.adapt_targetMinSec = DEFAULT.adapt_targetMinSec
    C.adapt_targetMaxSec = DEFAULT.adapt_targetMaxSec
    bad.push('adapt_target_range')
  }
  if (bad.length > 0) print('⚠️ CONFIG: Reverted: ' + bad.join(','))
  return bad
}

// ----------------------------------------------------------
// * LOAD CONFIG FROM KVS
// ----------------------------------------------------------

/**
 * * loadConfig - Load configuration from KVS
 *
 * Fetches config chunks from KVS, merges with defaults, validates.
 *
 * @param {Function} onComplete - Called when config loading complete
 */
function loadConfig(onComplete) {
  print('➡️ CONFIG: Loading from KVS...')

  // ? Initialize defaults first
  let keys = Object.keys(DEFAULT)
  for (let i = 0; i < keys.length; i++) {
    let k = keys[i]
    C[k] = DEFAULT[k]
  }

  // ? Load chunks sequentially (reduces peak memory)
  loadChunksSeq(CFG_KEYS, C, function (cfgChunks) {
    validateConfig()

    syncToKvs(CFG_KEYS, DEFAULT, cfgChunks, function () {
      print('✅ CONFIG: Loaded')
      onComplete()
    }, 'Config')
  })
}

/**
 * * persistConfig - Save current config to KVS
 *
 * Writes all config chunks to KVS using current values in C.
 *
 * @param {Function} onComplete - Called when save completes
 */
function persistConfig(onComplete) {
  // save all chunks unconditionally; memory footprint is low
  saveAllToKvs(CFG_KEYS, C, function () {
    if (onComplete) onComplete()
  })
}

// ----------------------------------------------------------
// * EXPORTS
// ----------------------------------------------------------

export { DEFAULT, C, CFG_KEYS, validateConfig, loadConfig, persistConfig }
