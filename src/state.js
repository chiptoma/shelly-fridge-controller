// ==============================================================================
// FRIDGE CONTROLLER STATE
// Persisted state (S) and volatile state (V) structures.
// Includes KVS key mappings and persistence operations.
// ==============================================================================

import { loadChunksSeq, syncToKvs, saveAllToKvs } from './utils/kvs.js'
import { ri } from './utils/math.js'

// ----------------------------------------------------------
// KVS KEY MAPPINGS - STATE
// ----------------------------------------------------------

let ST_KEYS = {
  'fridge_st_core': ['sys_relayOnTs', 'sys_relayOffTs', 'sys_isRelayOn', 'sys_lastSaveTs',
    'wld_airSnapDeg', 'adt_hystDeg', 'dfr_isActive'],
  'fridge_st_stats': ['sts_lifeTotalSec', 'sts_lifeRunSec', 'sts_hourTotalSec', 'sts_hourRunSec',
    'sts_histIdx', 'sts_cycleCnt'],
  'fridge_st_hist': ['sts_dutyHistArr'],
  'fridge_st_faults': ['flt_fatalArr', 'flt_critArr', 'flt_errorArr', 'flt_warnArr'],
}

// ----------------------------------------------------------
// PERSISTED STATE (S)
// ----------------------------------------------------------

let S = {
  sys_relayOnTs: 0,
  sys_relayOffTs: 0,
  sys_isRelayOn: false,
  sys_lastSaveTs: 0,
  wld_airSnapDeg: 0,
  adt_hystDeg: 1.0,

  sts_lifeTotalSec: 0,
  sts_lifeRunSec: 0,
  sts_hourTotalSec: 0,
  sts_hourRunSec: 0,
  sts_cycleCnt: 0,
  sts_dutyHistArr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  sts_histIdx: 0,
  dfr_isActive: false,

  flt_fatalArr: [],
  flt_critArr: [],
  flt_errorArr: [],
  flt_warnArr: [],
}

// ----------------------------------------------------------
// VOLATILE STATE (V)
// ----------------------------------------------------------

let V = {
  sys_status: 'BOOT',
  sys_statusReason: 'NONE',
  sys_alarm: 'NONE',
  sys_detail: 'NONE',
  sys_startMs: 0,

  sns_errCnt: 0,
  sns_wasErr: false,
  sns_airBuf: [0, 0, 0],
  sns_bufIdx: 0,
  sns_airSmoothDeg: null,

  sns_airStuckRefDeg: null,
  sns_airStuckTs: 0,
  sns_evpStuckRefDeg: null,
  sns_evpStuckTs: 0,

  dor_refDeg: 0,
  dor_refTs: 0,
  dor_pauseRemSec: 0,

  trb_isActive: false,
  trb_remSec: 0,
  trb_prevSw: false,

  adt_lastDir: null,
  adt_consecCnt: 0,

  hlt_startDeg: 0,
  hlt_lastScore: 0,

  hw_hasPM: false,
  pwr_ghostSec: 0,
  pwr_ghostCnt: 0,     // Tracks repeated ghost runs for escalation

  flt_pendCode: null,

  lop_lastSaveTs: 0,

  // CRITICAL: Timestamp captured at start of each loop tick.
  // Shelly mJS closures don't work correctly with Date.now() - must use global.
  lop_nowTs: 0,
}

// ----------------------------------------------------------
// STATE PERSISTENCE
// ----------------------------------------------------------

/**
 * persistState - Save current state to KVS
 */
function persistState() {
  // Record when state was saved (used for boot recovery)
  S.sys_lastSaveTs = Math.floor(Date.now() / 1000)
  saveAllToKvs(ST_KEYS, S, function () {
    V.lop_lastSaveTs = S.sys_lastSaveTs
  })
}

// ----------------------------------------------------------
// LOAD STATE FROM KVS
// ----------------------------------------------------------

/**
 * isTimestampInvalid - Check if timestamp is outside valid range
 * Returns true if timestamp is >60s in future or >1 year in past.
 *
 * @param {number} ts  - Timestamp to validate (seconds)
 * @param {number} now - Current time (seconds)
 * @returns {boolean} True if timestamp is invalid
 */
function isTimestampInvalid(ts, now) {
  return ts > now + 60 || ts < now - 31536000
}

/**
 * sanitizeLoadedState - Validate and fix corrupted state after KVS load
 * Orchestrates timestamp, stats, and fault sanitization.
 *
 * @param {number} now - Current time in seconds
 */
function sanitizeLoadedState(now) {
  sanitizeTimestamps(now)
  sanitizeStats()
  sanitizeFaults()
}

/**
 * sanitizeTimestamps - Reset relay timestamps if corrupted
 * Detects future timestamps or timestamps older than 1 year.
 *
 * @param {number} now - Current time in seconds
 */
function sanitizeTimestamps(now) {
  if (isTimestampInvalid(S.sys_relayOffTs, now) || isTimestampInvalid(S.sys_relayOnTs, now)) {
    print('⚠️ STATE : Invalid relay timestamps, resetting state to OFF')
    S.sys_relayOffTs = 0
    S.sys_relayOnTs = 0
    S.sys_isRelayOn = false
    S.sys_lastSaveTs = 0
  }
}

/**
 * sanitizeStats - Reset statistics if corrupted
 * Validates history array length (24h) and ensures counters are non-negative.
 */
function sanitizeStats() {
  if (!S.sts_dutyHistArr || S.sts_dutyHistArr.constructor !== Array || S.sts_dutyHistArr.length !== 24) {
    S.sts_dutyHistArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    S.sts_histIdx = 0
  } else if (S.sts_histIdx < 0 || S.sts_histIdx > 23) {
    S.sts_histIdx = 0
  }
  if (S.sts_hourTotalSec < 0) S.sts_hourTotalSec = 0
  if (S.sts_hourRunSec < 0) S.sts_hourRunSec = 0
  if (S.sts_cycleCnt < 0) S.sts_cycleCnt = 0
}

/**
 * sanitizeFaults - Reset fault arrays if corrupted
 * Ensures each fault severity level is a valid array.
 */
function sanitizeFaults() {
  if (!S.flt_fatalArr || S.flt_fatalArr.constructor !== Array) S.flt_fatalArr = []
  if (!S.flt_critArr || S.flt_critArr.constructor !== Array) S.flt_critArr = []
  if (!S.flt_errorArr || S.flt_errorArr.constructor !== Array) S.flt_errorArr = []
  if (!S.flt_warnArr || S.flt_warnArr.constructor !== Array) S.flt_warnArr = []
}

/**
 * loadState - Load persisted state from KVS
 *
 * Fetches state chunks from KVS and merges with defaults.
 * Validates timestamps and calls onComplete when done.
 * Smart sync: only writes if schema changed, never overwrites on load failure.
 *
 * @param {Function} onComplete - Called when state loading complete
 */
function loadState(onComplete) {
  print('➡️ STATE : Loading from KVS...')

  // Load chunks sequentially (reduces peak memory)
  loadChunksSeq(ST_KEYS, S, function (stChunks) {
    let now = Date.now() / 1000
    sanitizeLoadedState(now)

    // Smart sync: preserves KVS on load failure, only syncs schema changes
    syncToKvs(ST_KEYS, S, stChunks, function () {
      print('✅ STATE : Loaded')
      V.lop_lastSaveTs = ri(Date.now() / 1000)
      if (onComplete) onComplete()
    }, 'State')
  })
}

// ----------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------

export { S, V, ST_KEYS, persistState, loadState }
