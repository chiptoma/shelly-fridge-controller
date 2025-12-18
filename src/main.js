// ==============================================================================
// * MAIN ENTRY POINT
// ? Initializes the fridge controller system.
// ? Loads config/state from KVS, recovers boot state, and starts main loop.
// ==============================================================================

import { C } from './config.js'
import { loadConfig } from './config.js'
import { S, V, persistState, loadState } from './state.js'
import { ri, nowSec } from './utils/math.js'
import { setupMqttCommands } from './mqtt.js'
import { startMainLoop } from './loop.js'

// ----------------------------------------------------------
// * BOOT RECOVERY
// ----------------------------------------------------------

/**
 * * recoverBootState - Sync software state with hardware
 *
 * Handles discrepancies between KVS state and actual hardware.
 * Recovers missed runtime stats from unclean shutdowns.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Boot recovery state machine
function recoverBootState() {
  let now = nowSec()
  let sw = Shelly.getComponentStatus('Switch', 0)
  let hwOn = (sw && sw.output === true)

  // ? Calculate total elapsed time since last save (includes both ON and OFF time)
  let elapsedTotal = 0
  if (S.sys_tsLastSave > 0 && now > S.sys_tsLastSave) {
    elapsedTotal = now - S.sys_tsLastSave
    // ? Cap at 1 hour to prevent stats corruption from stale timestamps
    if (elapsedTotal > 3600) elapsedTotal = 3600
  }

  if (hwOn && S.sys_relayState) {
    // ? Hardware ON, state says ON - compressor was running
    let runSec = now - S.sys_tsRelayOn
    if (runSec < 0 || runSec > C.comp_maxRunSec) {
      print('⚠️ BOOT  : Compressor overrun: ran ' + ri(runSec / 60) + 'm, forcing OFF for safety')
      Shelly.call('Switch.Set', { id: 0, on: false })
      S.sys_relayState = false
      S.sys_tsRelayOff = ri(now)
      S.weld_snapAir = 0
      persistState()
    } else if (elapsedTotal > 0) {
      // ? Add to BOTH hourly AND lifetime stats
      S.stats_hourRun += elapsedTotal
      S.stats_hourTime += elapsedTotal
      S.stats_lifeRun += elapsedTotal
      S.stats_lifeTime += elapsedTotal
      print('ℹ️ BOOT  : Compressor running: recovered ' + ri(elapsedTotal / 60) + 'm (run ' + ri(runSec / 60) + 'm total)')
      persistState()
    }
  } else if (hwOn && !S.sys_relayState) {
    // ? Hardware ON but state says OFF - unexpected state
    // ? Don't trust stale timestamps, sync to hardware and start fresh
    print('⚠️ BOOT  : State mismatch, Relay is ON but State is OFF, updating State to ON')
    S.sys_relayState = true
    S.sys_tsRelayOn = ri(now)
    persistState()
  } else if (!hwOn && S.sys_relayState) {
    // ? Hardware OFF but state says ON - crashed/stopped while cooling
    let estRunSec = now - S.sys_tsRelayOn
    if (estRunSec > 0 && estRunSec < C.comp_maxRunSec && elapsedTotal > 0) {
      // ? Use min of estimated run time and elapsed time
      let missedRun = (estRunSec < elapsedTotal) ? estRunSec : elapsedTotal
      S.stats_hourRun += missedRun
      S.stats_hourTime += elapsedTotal
      S.stats_lifeRun += missedRun
      S.stats_lifeTime += elapsedTotal
      S.stats_cycleCount++
      print('⚠️ BOOT  : Crash while cooling: recovered ~' + ri(missedRun / 60) + 'm run')
    }
    S.sys_relayState = false
    S.sys_tsRelayOff = ri(now)
    S.weld_snapAir = 0
    persistState()
  } else {
    // ? Hardware OFF, state says OFF - clean idle state
    if (elapsedTotal > 0) {
      // ? Only add to time stats, not run stats (compressor was off)
      S.stats_hourTime += elapsedTotal
      S.stats_lifeTime += elapsedTotal
      print('ℹ️ BOOT  : Clean idle: ' + ri(elapsedTotal / 60) + 'm elapsed')
    }
    persistState()
  }

  V.hw_hasPM = (sw && sw.apower !== undefined)
  if (S.fault_fatal.length > 0) {
    let last = S.fault_fatal[0]
    let ago = ri((Date.now() / 1000 - last.t) / 3600)
    print('⚠️ BOOT  : Last fatal: ' + last.a + ' (' + last.d + '), ' + ago + 'h ago')
  }
}

// ----------------------------------------------------------
// * INITIALIZATION
// ----------------------------------------------------------

/**
 * * initialize - Main boot sequence
 */
function initialize() {
  V.sys_scrUptimeMs = Shelly.getUptimeMs()
  print('➡️ BOOT  : Starting...')

  loadConfig(function () {
    loadState(function () {
      recoverBootState()
      setupMqttCommands()
      print('✅ BOOT  : Ready')
      startMainLoop()
    })
  })
}

// ----------------------------------------------------------
// * START
// ----------------------------------------------------------

initialize()

// ----------------------------------------------------------
// * EXPORTS (for testing)
// ----------------------------------------------------------

export { recoverBootState, initialize }
