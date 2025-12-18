// ==============================================================================
// MQTT COMMAND HANDLER
// Subscribes to command topic for remote control.
// Handles turbo, status, reset, and setpoint commands via MQTT.
// ==============================================================================

import { ALM } from './constants.js'
import { C, persistConfig, validateConfig } from './config.js'
import { V } from './state.js'

// Rate limiting state (-2000 ensures first command always passes)
let mqttLastCmdMs = -2000

// ----------------------------------------------------------
// SETUP MQTT COMMANDS
// ----------------------------------------------------------

/**
 * setupMqttCommands - Register MQTT command handler
 * Subscribes to command topic and processes validated commands.
 */
function setupMqttCommands() {
  MQTT.subscribe(C.sys_mqttCmd, handleMqttMessage)
}

// ----------------------------------------------------------
// INTERNAL HANDLERS (not exported)
// ----------------------------------------------------------

/**
 * handleTurbo - Activate turbo cooling mode via MQTT
 */
function handleTurbo() {
  if (!C.trb_enable) { print('⚠️ MQTT Turbo disabled: ignoring command (feature disabled)'); return }
  V.trb_isActive = true
  V.trb_remSec = C.trb_maxTimeSec
  print('✅ MQTT Turbo ON: timer started')
}

/**
 * handleTurboOff - Deactivate turbo cooling mode via MQTT
 */
function handleTurboOff() {
  V.trb_isActive = false
  V.trb_remSec = 0
  print('✅ MQTT Turbo OFF: timer cleared')
}

/**
 * handleStatus - Log status request via MQTT
 * Status is published automatically each loop tick.
 */
function handleStatus() {
  print('ℹ️ MQTT Status requested')
}

/**
 * handleResetAlarms - Clear active alarm state via MQTT
 */
function handleResetAlarms() {
  V.sys_alarm = ALM.NONE
  print('✅ MQTT Alarms reset: sys_alarm=NONE')
}

/**
 * handleSetpoint - Update target temperature via MQTT
 * Validates new value and persists to KVS on success.
 *
 * @param {object} cmd - Command object with value field
 */
function handleSetpoint(cmd) {
  // Type check before any mutation
  if (typeof cmd.value !== 'number') {
    print('⚠️ MQTT Setpoint rejected: value must be number')
    return
  }
  // Apply setpoint via shared validator, rollback on failure
  let oldVal = C.ctl_targetDeg
  C.ctl_targetDeg = cmd.value
  let reverted = validateConfig()
  let ok = reverted.indexOf('ctl_targetDeg') === -1
  if (!ok) {
    C.ctl_targetDeg = oldVal
    print('⚠️ MQTT Setpoint rejected: validation failed')
    return
  }
  print('✅ MQTT Setpoint updated: target ' + cmd.value + 'C')
  persistConfig()
}

/**
 * handleMqttMessage - Process incoming MQTT command
 * Rate-limited to 1 command per 2 seconds. Parses JSON and routes to handler.
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
// EXPORTS
// ----------------------------------------------------------

export { setupMqttCommands }
