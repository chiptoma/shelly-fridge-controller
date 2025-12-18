// ==============================================================================
// MAIN ENTRY POINT
// Initializes the fridge controller system.
// Loads config/state from KVS, recovers boot state, and starts main loop.
// ==============================================================================

import { C, loadConfig } from './config.js'
import { S, V, persistState, loadState } from './state.js'
import { ri, nowSec } from './utils/math.js'
import { setupMqttCommands } from './mqtt.js'
import { startMainLoop } from './loop.js'

// ----------------------------------------------------------
// BOOT RECOVERY
// ----------------------------------------------------------

/**
 * recoverBootState - Sync software state with hardware
 *
 * Handles discrepancies between KVS state and actual hardware.
 * Recovers missed runtime stats from unclean shutdowns.
 */
// eslint-disable-next-line complexity -- 12 branches for boot phase priority cascade (alarm/limp/recovery/normal)
// eslint-disable-next-line sonarjs/cognitive-complexity -- Each branch is a distinct boot state with specific handling
function recoverBootState() {
  let now = nowSec()
  let sw = Shelly.getComponentStatus('Switch', 0)
  let hwOn = (sw && sw.output === true)

  // Calculate total elapsed time since last save (includes both ON and OFF time)
  let elapsedTotal = 0
  if (S.sys_lastSaveTs > 0 && now > S.sys_lastSaveTs) {
    elapsedTotal = now - S.sys_lastSaveTs
    // Cap at 1 hour to prevent stats corruption from stale timestamps
    if (elapsedTotal > 3600) elapsedTotal = 3600
  }

  if (hwOn && S.sys_isRelayOn) {
    // Hardware ON, state says ON - compressor was running
    let runSec = now - S.sys_relayOnTs
    if (runSec < 0 || runSec > C.cmp_maxRunSec) {
      print('⚠️ BOOT  : Compressor ran ' + ri(runSec / 60) + 'm (limit ' + ri(C.cmp_maxRunSec / 60) + 'm) → turned OFF for protection')
      Shelly.call('Switch.Set', { id: 0, on: false })
      S.sys_isRelayOn = false
      S.sys_relayOffTs = ri(now)
      S.wld_airSnapDeg = 0
      persistState()
    } else if (elapsedTotal > 0) {
      // Add to BOTH hourly AND lifetime stats
      S.sts_hourRunSec += elapsedTotal
      S.sts_hourTotalSec += elapsedTotal
      S.sts_lifeRunSec += elapsedTotal
      S.sts_lifeTotalSec += elapsedTotal
      print('ℹ️ BOOT  : Script restarted while cooling → added ' + ri(elapsedTotal / 60) + 'm to runtime stats')
      persistState()
    }
  } else if (hwOn && !S.sys_isRelayOn) {
    // Hardware ON but state says OFF - unexpected state
    // Don't trust stale timestamps, sync to hardware and start fresh
    print('⚠️ BOOT  : Relay was ON but state said OFF (unexpected) → state updated to match')
    S.sys_isRelayOn = true
    S.sys_relayOnTs = ri(now)
    persistState()
  } else if (!hwOn && S.sys_isRelayOn) {
    // Hardware OFF but state says ON - crashed/stopped while cooling
    let estRunSec = now - S.sys_relayOnTs
    if (estRunSec > 0 && estRunSec < C.cmp_maxRunSec && elapsedTotal > 0) {
      // Use min of estimated run time and elapsed time
      let missedRun = (estRunSec < elapsedTotal) ? estRunSec : elapsedTotal
      S.sts_hourRunSec += missedRun
      S.sts_hourTotalSec += elapsedTotal
      S.sts_lifeRunSec += missedRun
      S.sts_lifeTotalSec += elapsedTotal
      S.sts_cycleCnt++
      print('⚠️ BOOT  : Script stopped while cooling → added ~' + ri(missedRun / 60) + 'm to runtime stats')
    }
    S.sys_isRelayOn = false
    S.sys_relayOffTs = ri(now)
    S.wld_airSnapDeg = 0
    persistState()
  } else {
    // Hardware OFF, state says OFF - clean idle state
    if (elapsedTotal > 0) {
      // Only add to time stats, not run stats (compressor was off)
      S.sts_hourTotalSec += elapsedTotal
      S.sts_lifeTotalSec += elapsedTotal
      print('ℹ️ BOOT  : Was idle for ' + ri(elapsedTotal / 60) + 'm → stats updated')
    }
    persistState()
  }

  V.hw_hasPM = (sw && sw.apower !== undefined)
  if (S.flt_fatalArr.length > 0) {
    let last = S.flt_fatalArr[0]
    let ago = ri((Date.now() / 1000 - last.t) / 3600)
    print('⚠️ BOOT  : Had fatal error ' + ago + 'h ago: ' + last.a + ' (' + last.d + ')')
  }
}

// ----------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------

/**
 * initialize - Main boot sequence
 */
function initialize() {
  V.sys_startMs = Shelly.getUptimeMs()
  print('➡️ BOOT  : Starting...')

  loadConfig(function () {
    loadState(function () {
      recoverBootState()
      setupMqttCommands()
      print('✅ BOOT  : Completed')
      startMainLoop()
    })
  })
}

// ----------------------------------------------------------
// START
// ----------------------------------------------------------

initialize()

// ----------------------------------------------------------
// EXPORTS (for testing)
// ----------------------------------------------------------

export { recoverBootState, initialize }
