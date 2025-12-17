// ==============================================================================
// * MQTT COMMAND HANDLER
// ? Subscribes to command topic for remote control.
// ? Handles turbo, status, reset, and setpoint commands via MQTT.
// ==============================================================================

import { ALM } from './constants.js'
import { C, persistConfig, validateConfig } from './config.js'
import { V } from './state.js'

// Rate limiting state (-2000 ensures first command always passes)
let mqttLastCmdMs = -2000

// ----------------------------------------------------------
// * SETUP MQTT COMMANDS
// ----------------------------------------------------------

/**
 * * setupMqttCommands - Register MQTT command handler
 *
 * Subscribes to command topic and processes validated commands.
 * Commands: turbo_on, turbo_off, status, reset_alarms, setpoint
 *
 * @mutates V.turbo_active  - For turbo commands
 * @mutates V.turbo_remSec  - For turbo commands
 * @mutates V.sys_alarm     - For reset_alarms
 * @mutates C.*             - For setpoint (validated)
 *
 * @sideeffect Calls MQTT.subscribe() to register handler
 * @sideeffect Calls persistConfig() after setpoint changes
 */
function setupMqttCommands() {
  MQTT.subscribe(C.sys_mqttCmd, handleMqttMessage)
}

// ----------------------------------------------------------
// * INTERNAL HANDLERS (not exported)
// ----------------------------------------------------------

/**
 * * handleTurbo - Activate turbo cooling mode via MQTT
 * @mutates V.turbo_active, V.turbo_remSec
 */
function handleTurbo() {
  if (!C.turbo_enable) { print('⚠️ MQTT Turbo disabled: ignoring command (feature disabled)'); return }
  V.turbo_active = true
  V.turbo_remSec = C.turbo_maxTimeSec
  print('✅ MQTT Turbo ON: timer started')
}

/**
 * * handleTurboOff - Deactivate turbo cooling mode via MQTT
 * @mutates V.turbo_active, V.turbo_remSec
 */
function handleTurboOff() {
  V.turbo_active = false
  V.turbo_remSec = 0
  print('✅ MQTT Turbo OFF: timer cleared')
}

/**
 * * handleStatus - Log status request via MQTT
 * ? Status is published automatically each loop tick.
 */
function handleStatus() {
  print('ℹ️ MQTT Status requested')
}

/**
 * * handleResetAlarms - Clear active alarm state via MQTT
 * @mutates V.sys_alarm
 */
function handleResetAlarms() {
  V.sys_alarm = ALM.NONE
  print('✅ MQTT Alarms reset: sys_alarm=NONE')
}

/**
 * * handleSetpoint - Update target temperature via MQTT
 * ? Validates new value and persists to KVS on success.
 *
 * @param {object} cmd - Command object with value field
 * @mutates C.ctrl_targetDeg
 */
function handleSetpoint(cmd) {
  // Apply setpoint via shared validator, rollback on failure
  let oldVal = C.ctrl_targetDeg
  C.ctrl_targetDeg = cmd.value
  let reverted = validateConfig()
  let ok = reverted.indexOf('ctrl_targetDeg') === -1
  if (!ok) {
    C.ctrl_targetDeg = oldVal
    print('⚠️ MQTT Setpoint rejected: validation failed')
    return
  }
  print('✅ MQTT Setpoint updated: target ' + cmd.value + 'C')
  persistConfig()
}

/**
 * * handleMqttMessage - Process incoming MQTT command
 * ? Rate-limited to 1 command per 2 seconds. Parses JSON and routes to handler.
 *
 * @param {string} topic   - MQTT topic
 * @param {string} message - JSON command payload
 */
function handleMqttMessage(topic, message) {
  // Rate limit: 1 command per 2 seconds (prevents flooding)
  let now = Shelly.getUptimeMs()
  if (now - mqttLastCmdMs < 2000) {
    print('⚠️ MQTT Rate limited: ignoring command')
    return
  }
  mqttLastCmdMs = now

  if (!message || message.length > 256) {
    print('⚠️ MQTT Rejected size: message empty or >256 bytes')
    return
  }

  let cmd = null
  try {
    cmd = JSON.parse(message)
  } catch (e) {
    print('⚠️ MQTT Parse failed: invalid JSON')
    return
  }

  if (typeof cmd !== 'object' || cmd === null || typeof cmd.cmd !== 'string') {
    print('⚠️ MQTT Invalid structure: message must be object with cmd string')
    return
  }

  let c = cmd.cmd

  if (c === 'turbo_on') { handleTurbo(); return }
  if (c === 'turbo_off') { handleTurboOff(); return }
  if (c === 'status') { handleStatus(); return }
  if (c === 'reset_alarms') { handleResetAlarms(); return }
  if (c === 'setpoint') { handleSetpoint(cmd); return }
  print('⚠️ MQTT Unknown cmd: ' + c)
}

// ----------------------------------------------------------
// * EXPORTS
// ----------------------------------------------------------

export { setupMqttCommands }
