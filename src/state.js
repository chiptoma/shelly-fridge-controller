// ==============================================================================
// * FRIDGE CONTROLLER STATE
// ? Persisted state (S) and volatile state (V) structures.
// ? Includes KVS key mappings and persistence operations.
// ==============================================================================

import { loadChunksSeq, syncToKvs, saveAllToKvs } from './utils/kvs.js'
import { ri } from './utils/math.js'

// ----------------------------------------------------------
// * KVS KEY MAPPINGS - STATE
// ----------------------------------------------------------

let ST_KEYS = {
  'fridge_st_core': ['sys_tsRelayOn', 'sys_tsRelayOff', 'sys_relayState', 'sys_tsLastSave',
    'weld_snapAir', 'adapt_hystCurrent', 'defr_isActive'],
  'fridge_st_stats': ['stats_lifeTime', 'stats_lifeRun', 'stats_hourTime', 'stats_hourRun',
    'stats_history', 'stats_hourIdx', 'stats_cycleCount'],
  'fridge_st_faults': ['fault_fatal', 'fault_critical', 'fault_error', 'fault_warning'],
}

// ----------------------------------------------------------
// * PERSISTED STATE (S)
// ----------------------------------------------------------

let S = {
  sys_tsRelayOn: 0,
  sys_tsRelayOff: 0,
  sys_relayState: false,
  sys_tsLastSave: 0,
  weld_snapAir: 0,
  adapt_hystCurrent: 1.0,

  stats_lifeTime: 0,
  stats_lifeRun: 0,
  stats_hourTime: 0,
  stats_hourRun: 0,
  stats_cycleCount: 0,
  stats_history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  stats_hourIdx: 0,
  defr_isActive: false,

  fault_fatal: [],
  fault_critical: [],
  fault_error: [],
  fault_warning: [],
}

// ----------------------------------------------------------
// * VOLATILE STATE (V)
// ----------------------------------------------------------

let V = {
  sys_status: 'BOOT',
  sys_reason: 'NONE',
  sys_alarm: 'NONE',
  sys_statusDetail: 'NONE',
  sys_scrUptimeMs: 0,

  sens_errCount: 0,
  sens_wasError: true,
  sens_bufAir: [0, 0, 0],
  sens_bufIdx: 0,
  sens_smoothAir: null,

  sens_stuckRefAir: null,
  sens_stuckTsAir: 0,
  sens_stuckRefEvap: null,
  sens_stuckTsEvap: 0,

  door_refTemp: 0,
  door_refTs: 0,
  door_timer: 0,

  turbo_active: false,
  turbo_remSec: 0,
  turbo_lastSw: false,

  adapt_lastDir: null,
  adapt_consecCount: 0,

  health_startTemp: 0,
  health_lastScore: 0,

  hw_hasPM: false,
  pwr_ghostTimer: 0,
  pwr_ghostCount: 0,     // ? Tracks repeated ghost runs for escalation

  fault_pending: null,

  lastSave: 0,

  // ! CRITICAL: Timestamp captured at start of each loop tick.
  // ! Shelly mJS closures don't work correctly with Date.now() - must use global.
  loopNow: 0,
}

// ----------------------------------------------------------
// * STATE PERSISTENCE
// ----------------------------------------------------------

/**
 * * persistState - Save current state to KVS
 */
function persistState() {
  // Record when state was saved (used for boot recovery)
  S.sys_tsLastSave = Math.floor(Date.now() / 1000)
  saveAllToKvs(ST_KEYS, S, function () {
    V.lastSave = S.sys_tsLastSave
  })
}

// ----------------------------------------------------------
// * LOAD STATE FROM KVS
// ----------------------------------------------------------

/**
 *
 */
function isTimestampInvalid(ts, now) {
  return ts > now + 60 || ts < now - 31536000
}

/**
 *
 */
function sanitizeLoadedState(now) {
  sanitizeTimestamps(now)
  sanitizeStats()
  sanitizeFaults()
}

/**
 *
 */
function sanitizeTimestamps(now) {
  if (isTimestampInvalid(S.sys_tsRelayOff, now) || isTimestampInvalid(S.sys_tsRelayOn, now)) {
    print('⚠️ STATE : Invalid relay timestamps, resetting state to OFF')
    S.sys_tsRelayOff = 0
    S.sys_tsRelayOn = 0
    S.sys_relayState = false
    S.sys_tsLastSave = 0
  }
}

/**
 *
 */
function sanitizeStats() {
  if (!S.stats_history || S.stats_history.constructor !== Array || S.stats_history.length !== 24) {
    S.stats_history = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    S.stats_hourIdx = 0
  } else if (S.stats_hourIdx < 0 || S.stats_hourIdx > 23) {
    S.stats_hourIdx = 0
  }
  if (S.stats_hourTime < 0) S.stats_hourTime = 0
  if (S.stats_hourRun < 0) S.stats_hourRun = 0
  if (S.stats_cycleCount < 0) S.stats_cycleCount = 0
}

/**
 *
 */
function sanitizeFaults() {
  if (!S.fault_fatal || S.fault_fatal.constructor !== Array) S.fault_fatal = []
  if (!S.fault_critical || S.fault_critical.constructor !== Array) S.fault_critical = []
  if (!S.fault_error || S.fault_error.constructor !== Array) S.fault_error = []
  if (!S.fault_warning || S.fault_warning.constructor !== Array) S.fault_warning = []
}

/**
 * * loadState - Load persisted state from KVS
 *
 * Fetches state chunks from KVS and merges with defaults.
 * Validates timestamps and calls onComplete when done.
 *
 * @param {Function} onComplete - Called when state loading complete
 */
function loadState(onComplete) {
  print('➡️ STATE : Loading state from KVS...')

  // ? Load chunks sequentially (reduces peak memory)
  loadChunksSeq(ST_KEYS, S, function (stChunks) {
    let now = Date.now() / 1000
    sanitizeLoadedState(now)

    syncToKvs(ST_KEYS, S, stChunks, function () {
      print('✅ STATE : Loaded')
      V.lastSave = ri(Date.now() / 1000)
      if (onComplete) onComplete()
    }, 'State')
  })
}

// ----------------------------------------------------------
// * EXPORTS
// ----------------------------------------------------------

export { S, V, ST_KEYS, persistState, loadState }
