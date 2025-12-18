// ==============================================================================
// FRIDGE CONTROLLER CONFIGURATION
// Default values, current config, KVS key mappings, and validation.
// All time values are in SECONDS unless otherwise noted.
// ==============================================================================

import { loadChunksSeq, syncToKvs, saveAllToKvs } from './utils/kvs.js'

// ----------------------------------------------------------
// DEFAULT CONFIGURATION
// Factory defaults - used when KVS has no value.
// ----------------------------------------------------------

let DEFAULT = {
  // SYS - Hardware & Loop
  sys_loopSec: 5,            // Main heartbeat interval
  sys_sensAirId: 101,        // Shelly Add-on ID for Air Sensor
  sys_sensEvpId: 100,       // Shelly Add-on ID for Coil Sensor
  sys_sensFailLimit: 5,      // Loops of bad data before Limp Mode
  sys_mqttTopic: 'fridge/status',
  sys_mqttCmd: 'fridge/command',

  // CTL - Thermostat Control
  ctl_targetDeg: 4.0,        // Target Temp (C)
  ctl_hystDeg: 1.0,          // Base Hysteresis (C)
  ctl_smoothAlpha: 0.08,     // EMA Smoothing Factor

  // ADT - Adaptive Hysteresis (Run-Time Based)
  adt_enable: true,
  adt_hystMinDeg: 0.5,       // Tightest allowed control
  adt_hystMaxDeg: 3.0,       // Loosest allowed control
  adt_targetMinSec: 600,     // Target min run: 10 min
  adt_targetMaxSec: 1200,    // Target max run: 20 min

  // CMP - Compressor Protection (Auto-Recovery)
  cmp_minOnSec: 180,         // Anti-short-cycle: Minimum Run Time
  cmp_minOffSec: 300,        // Anti-short-cycle: Minimum Rest Time
  cmp_maxRunSec: 7200,       // Max continuous run (2 Hours)
  cmp_freezeCutDeg: 0.5,     // Emergency cut if Air < 0.5C

  // LMP - Failsafe Mode (Blind Cycling)
  lmp_enable: true,
  lmp_onSec: 1800,           // 30 Minutes ON (66% Duty)
  lmp_offSec: 900,           // 15 Minutes OFF

  // DOR - Door Open Detection (dP/dt)
  dor_enable: true,
  dor_rateDegMin: 5.0,       // Trigger if temp rises > 5C per minute
  dor_pauseSec: 300,         // Stop cooling for 5 mins

  // DFR - Defrost Logic
  dfr_dynEnable: true,
  dfr_dynTrigDeg: -16.0,     // Start defrost if evap hits -16C
  dfr_dynEndDeg: -5.0,       // Stop melting if evap hits -5C
  dfr_dynDwellSec: 300,      // Must hold end temp for 5 mins

  dfr_schedEnable: true,
  dfr_schedHour: 1,          // 01:00 AM
  dfr_schedDurSec: 3600,     // 1 Hour duration

  // WLD - Relay Weld Detection (Physics)
  wld_enable: true,
  wld_waitSec: 600,          // Start checking 10 mins after OFF
  wld_winSec: 1800,          // Stop checking 30 mins after OFF
  wld_dropDeg: 0.2,          // Alarm if temp drops 0.2C while OFF

  // SNS - Sensor Health Monitoring
  sns_stuckEnable: true,
  sns_stuckTimeSec: 14400,   // 4 Hours stuck = Alarm
  sns_stuckEpsDeg: 0.2,      // Reset timer if moves > 0.2C

  // ALM - High Temp Alert
  alm_highEnable: true,
  alm_highDeg: 10.0,         // Critical Alert Threshold
  alm_highDelaySec: 600,     // Must persist for 10 Minutes

  // PWR - Power Monitoring
  pwr_enable: true,
  pwr_startMaskSec: 15,      // Ignore Inrush (15s)
  pwr_runMinW: 10,           // Ghost Run (<10W)
  pwr_runMaxW: 400,          // Locked Rotor (>400W)
  pwr_ghostTripSec: 60,      // Confirm Ghost for 60s
  pwr_ghostMaxCnt: 3,      // Escalate to fatal after N ghost runs

  // TRB - Turbo Mode
  trb_enable: true,
  trb_targetDeg: 1.0,
  trb_hystDeg: 0.5,
  trb_maxTimeSec: 10800,     // 3 Hours

  // GAS - Gas Leak Detection
  gas_checkSec: 900,         // Gas Leak Check Time
  gas_failDiff: 5.0,         // Gas Leak Diff (evap must be 5C colder than air)
}

// ----------------------------------------------------------
// CURRENT CONFIGURATION
// Mutable object loaded from KVS at boot.
// ----------------------------------------------------------

let C = {}

// ----------------------------------------------------------
// KVS KEY MAPPINGS - CONFIG
// Maps KVS key names to config field arrays.
// ----------------------------------------------------------

let CFG_KEYS = {
  'fridge_cfg_sys': ['sys_loopSec', 'sys_sensAirId', 'sys_sensEvpId', 'sys_sensFailLimit',
    'sys_mqttTopic', 'sys_mqttCmd'],
  'fridge_cfg_ctl': ['ctl_targetDeg', 'ctl_hystDeg', 'ctl_smoothAlpha'],
  'fridge_cfg_adt': ['adt_enable', 'adt_hystMinDeg', 'adt_hystMaxDeg',
    'adt_targetMinSec', 'adt_targetMaxSec'],
  'fridge_cfg_cmp': ['cmp_minOnSec', 'cmp_minOffSec', 'cmp_maxRunSec', 'cmp_freezeCutDeg'],
  'fridge_cfg_lmp': ['lmp_enable', 'lmp_onSec', 'lmp_offSec'],
  'fridge_cfg_dor': ['dor_enable', 'dor_rateDegMin', 'dor_pauseSec'],
  'fridge_cfg_dfr': ['dfr_dynEnable', 'dfr_dynTrigDeg', 'dfr_dynEndDeg', 'dfr_dynDwellSec',
    'dfr_schedEnable', 'dfr_schedHour', 'dfr_schedDurSec'],
  'fridge_cfg_wld': ['wld_enable', 'wld_waitSec', 'wld_winSec', 'wld_dropDeg'],
  'fridge_cfg_sns': ['sns_stuckEnable', 'sns_stuckTimeSec', 'sns_stuckEpsDeg'],
  'fridge_cfg_alm': ['alm_highEnable', 'alm_highDeg', 'alm_highDelaySec'],
  'fridge_cfg_pwr': ['pwr_enable', 'pwr_startMaskSec', 'pwr_runMinW', 'pwr_runMaxW', 'pwr_ghostTripSec', 'pwr_ghostMaxCnt'],
  'fridge_cfg_trb': ['trb_enable', 'trb_targetDeg', 'trb_hystDeg', 'trb_maxTimeSec'],
  'fridge_cfg_gas': ['gas_checkSec', 'gas_failDiff'],
}

// ----------------------------------------------------------
// CONFIGURATION VALIDATION
// Function-based validation to minimize runtime heap usage.
// Each function is code (not heap data like arrays would be).
// ----------------------------------------------------------

/**
 * validateNumber - Validate a single numeric config field
 * Resets to default if value is out of range.
 *
 * @param {string} f - Field name
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string[]} bad - Array to collect invalid field names
 * @mutates C[f] - Reset to DEFAULT[f] if invalid
 */
function validateNumber(f, min, max, bad) {
  let v = C[f]
  if (typeof v !== 'number' || v < min || v > max) {
    C[f] = DEFAULT[f]
    bad.push(f)
  }
}

/**
 * validateSystem - Validate system config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateSystem(bad) {
  validateNumber('sys_loopSec', 1, 60, bad)
}

/**
 * validateCtl - Validate control config fields (target, hysteresis)
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateCtl(bad) {
  validateNumber('ctl_targetDeg', -5, 15, bad)
  validateNumber('ctl_hystDeg', 0.1, 5, bad)
}

/**
 * validateCmp - Validate compressor protection config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateCmp(bad) {
  validateNumber('cmp_minOnSec', 60, 600, bad)
  validateNumber('cmp_minOffSec', 60, 900, bad)
  validateNumber('cmp_maxRunSec', 1800, 14400, bad)
  validateNumber('cmp_freezeCutDeg', -2, 2, bad)
}

/**
 * validateTrb - Validate turbo mode config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateTrb(bad) {
  validateNumber('trb_maxTimeSec', 1800, 21600, bad)
}

/**
 * validateAdt - Validate adaptive hysteresis config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateAdt(bad) {
  validateNumber('adt_hystMinDeg', 0.1, 5, bad)
  validateNumber('adt_hystMaxDeg', 0.1, 5, bad)
  validateNumber('adt_targetMinSec', 300, 3600, bad)
  validateNumber('adt_targetMaxSec', 600, 7200, bad)
}

/**
 * validateDor - Validate door detection config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateDor(bad) {
  validateNumber('dor_rateDegMin', 0.5, 20, bad)
  validateNumber('dor_pauseSec', 30, 3600, bad)
}

/**
 * validateDfr - Validate defrost config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateDfr(bad) {
  validateNumber('dfr_dynTrigDeg', -40, 0, bad)
  validateNumber('dfr_dynEndDeg', -20, 5, bad)
  validateNumber('dfr_dynDwellSec', 60, 7200, bad)
  validateNumber('dfr_schedHour', 0, 23, bad)
  validateNumber('dfr_schedDurSec', 300, 14400, bad)
}

/**
 * validateWld - Validate weld detection config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateWld(bad) {
  validateNumber('wld_waitSec', 60, 7200, bad)
  validateNumber('wld_winSec', 300, 14400, bad)
  validateNumber('wld_dropDeg', 0.05, 5, bad)
}

/**
 * validateSns - Validate sensor config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateSns(bad) {
  validateNumber('sns_stuckTimeSec', 300, 86400, bad)
  validateNumber('sns_stuckEpsDeg', 0.05, 5, bad)
}

/**
 * validateAlm - Validate alarm config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateAlm(bad) {
  validateNumber('alm_highDeg', 0, 40, bad)
  validateNumber('alm_highDelaySec', 60, 7200, bad)
}

/**
 * validatePower - Validate power monitoring config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validatePower(bad) {
  validateNumber('pwr_startMaskSec', 1, 120, bad)
  validateNumber('pwr_runMinW', 1, 1000, bad)
  validateNumber('pwr_runMaxW', 50, 2000, bad)
  validateNumber('pwr_ghostTripSec', 5, 600, bad)
  validateNumber('pwr_ghostMaxCnt', 1, 10, bad)
}

/**
 * validateGas - Validate gas leak detection config fields
 * @param {string[]} bad - Array to collect invalid field names
 */
function validateGas(bad) {
  validateNumber('gas_checkSec', 60, 7200, bad)
  validateNumber('gas_failDiff', 1, 20, bad)
}

/**
 * validateConfig - Validate and sanitize configuration
 * Checks critical config values, reverts invalid to defaults.
 *
 * @returns {string[]} - Array of field names that were reverted
 */
function validateConfig() {
  let bad = []
  validateSystem(bad)
  validateCtl(bad)
  validateCmp(bad)
  validateTrb(bad)
  validateAdt(bad)
  validateDor(bad)
  validateDfr(bad)
  validateWld(bad)
  validateSns(bad)
  validateAlm(bad)
  validatePower(bad)
  validateGas(bad)
  // Range checks: min must be < max
  if (C.adt_hystMinDeg >= C.adt_hystMaxDeg) {
    C.adt_hystMinDeg = DEFAULT.adt_hystMinDeg
    C.adt_hystMaxDeg = DEFAULT.adt_hystMaxDeg
    bad.push('adt_hyst_range')
  }
  if (C.adt_targetMinSec >= C.adt_targetMaxSec) {
    C.adt_targetMinSec = DEFAULT.adt_targetMinSec
    C.adt_targetMaxSec = DEFAULT.adt_targetMaxSec
    bad.push('adt_target_range')
  }
  if (bad.length > 0) print('⚠️ CONFIG: Reverted: ' + bad.join(','))
  return bad
}

// ----------------------------------------------------------
// LOAD CONFIG FROM KVS
// ----------------------------------------------------------

/**
 * loadConfig - Load configuration from KVS
 *
 * Fetches config chunks from KVS, merges with defaults, validates.
 * Smart sync: only writes if schema changed, never overwrites on load failure.
 *
 * @param {Function} onComplete - Called when config loading complete
 */
function loadConfig(onComplete) {
  print('➡️ CONFIG: Loading from KVS...')

  // Initialize defaults first
  let keys = Object.keys(DEFAULT)
  for (let i = 0; i < keys.length; i++) {
    let k = keys[i]
    C[k] = DEFAULT[k]
  }

  // Load chunks sequentially (reduces peak memory)
  loadChunksSeq(CFG_KEYS, C, function (cfgChunks) {
    validateConfig()

    // Smart sync: preserves KVS on load failure, only syncs schema changes
    syncToKvs(CFG_KEYS, DEFAULT, cfgChunks, function () {
      print('✅ CONFIG: Loaded')
      onComplete()
    }, 'Config')
  })
}

/**
 * persistConfig - Save current config to KVS
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
// EXPORTS
// ----------------------------------------------------------

export { DEFAULT, C, CFG_KEYS, validateConfig, loadConfig, persistConfig }
