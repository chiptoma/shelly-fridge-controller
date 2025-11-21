/**
 * Controller initialization
 */

import CONFIG, { USER_CONFIG } from './config';
import { getRelayStatus } from '@hardware/relay';
import { createLogger, createConsoleSink, createSlackSink } from '@logging';
import { readAllSensors } from '@hardware/sensors';
import { createInitialState } from '@system/state';
import { now } from '@utils/time';
import { validateConfig } from '@validation';

import type { LogLevel, InitMessage } from '@logging';
// import type { ControllerState } from '@system/state/types';  // Unused with verbose logging commented out
import type { Controller } from './types';

/* istanbul ignore next - display-only formatting logic */
// COMMENTED OUT: Verbose init logging to reduce heap usage
// function generateConfigSections(state: ControllerState): { title: string; items: { label: string; value: string | number; unit: string }[] }[] {
//   return [
//     {
//       title: "State",
//       items: [
//         { label: "Relay", value: state.confirmedOn ? "ON" : "OFF", unit: "" }
//       ]
//     },
//     {
//       title: "Hardware",
//       items: [
//         { label: "Air Sensor ID", value: CONFIG.AIR_SENSOR_ID, unit: "" },
//         { label: "Evap Sensor ID", value: CONFIG.EVAP_SENSOR_ID, unit: "" }
//       ]
//     },
//     {
//       title: "Temperature Control",
//       items: [
//         { label: "Target", value: CONFIG.SETPOINT_C.toFixed(1), unit: "C" },
//         { label: "Tolerance", value: "+/- " + CONFIG.HYSTERESIS_C.toFixed(1), unit: "C" },
//         { label: "Control range", value: (CONFIG.SETPOINT_C - CONFIG.HYSTERESIS_C).toFixed(1) + "C to " + (CONFIG.SETPOINT_C + CONFIG.HYSTERESIS_C).toFixed(1), unit: "C" }
//       ]
//     },
//     {
//       title: "Compressor Safety",
//       items: [
//         { label: "Min ON time", value: CONFIG.MIN_ON_SEC, unit: "s" },
//         { label: "Min OFF time", value: CONFIG.MIN_OFF_SEC, unit: "s" }
//       ]
//     },
//     {
//       title: "Freeze Protection",
//       items: [
//         { label: "Lock threshold", value: (CONFIG.FREEZE_PROTECTION_START_C - CONFIG.FREEZE_LOCK_HYSTERESIS_C).toFixed(1), unit: "C" },
//         { label: "Release threshold", value: (CONFIG.FREEZE_PROTECTION_STOP_C + CONFIG.FREEZE_RECOVERY_HYSTERESIS_C).toFixed(1), unit: "C" },
//         { label: "Recovery delay", value: (CONFIG.FREEZE_RECOVERY_DELAY_SEC / 60).toFixed(0), unit: " min" }
//       ]
//     },
//     {
//       title: "High Temp Alerts",
//       items: [
//         { label: "Instant threshold", value: CONFIG.HIGH_TEMP_INSTANT_THRESHOLD_C.toFixed(1), unit: "C" },
//         { label: "Instant delay", value: CONFIG.HIGH_TEMP_INSTANT_DELAY_SEC, unit: "s" },
//         { label: "Sustained threshold", value: CONFIG.HIGH_TEMP_SUSTAINED_THRESHOLD_C.toFixed(1), unit: "C" },
//         { label: "Sustained delay", value: (CONFIG.HIGH_TEMP_SUSTAINED_DELAY_SEC / 60).toFixed(0), unit: " min" }
//       ]
//     },
//     {
//       title: "Adaptive Hysteresis",
//       items: [
//         { label: "Low duty threshold", value: CONFIG.ADAPTIVE_LOW_DUTY_PCT, unit: "%" },
//         { label: "High duty threshold", value: CONFIG.ADAPTIVE_HIGH_DUTY_PCT, unit: "%" },
//         { label: "Max shift", value: CONFIG.ADAPTIVE_MAX_SHIFT_C.toFixed(1), unit: "C" }
//       ]
//     },
//     {
//       title: "Scheduling",
//       items: [
//         { label: "Daily summary hour", value: CONFIG.DAILY_SUMMARY_HOUR, unit: ":00" },
//         { label: "Duty cycle interval", value: (CONFIG.DUTY_INTERVAL_SEC / 60).toFixed(0), unit: " min" }
//       ]
//     },
//     {
//       title: "Logging",
//       items: [
//         { label: "Level", value: CONFIG.GLOBAL_LOG_LEVEL, unit: "" },
//         { label: "Console", value: CONFIG.CONSOLE_ENABLED ? "On" : "Off", unit: "" },
//         { label: "Slack", value: CONFIG.SLACK_ENABLED ? "On" : "Off", unit: "" }
//       ]
//     },
//     {
//       title: "Sensor Smoothing",
//       items: [
//         { label: "Air", value: CONFIG.AIR_SENSOR_SMOOTHING_SEC, unit: "s" },
//         { label: "Evap", value: CONFIG.EVAP_SENSOR_SMOOTHING_SEC, unit: "s" }
//       ]
//     },
//     {
//       title: "Features",
//       items: [
//         { label: "Duty cycle", value: CONFIG.FEATURE_DUTY_CYCLE ? "Yes" : "No", unit: "" },
//         { label: "Daily summary", value: CONFIG.FEATURE_DAILY_SUMMARY ? "Yes" : "No", unit: "" },
//         { label: "Sensor failure", value: CONFIG.FEATURE_SENSOR_FAILURE ? "Yes" : "No", unit: "" },
//         { label: "High temp alerts", value: CONFIG.FEATURE_HIGH_TEMP_ALERTS ? "Yes" : "No", unit: "" },
//         { label: "Adaptive hysteresis", value: CONFIG.FEATURE_ADAPTIVE_HYSTERESIS ? "Yes" : "No", unit: "" },
//         { label: "Watchdog", value: CONFIG.FEATURE_WATCHDOG ? "Yes" : "No", unit: "" },
//         { label: "Performance metrics", value: CONFIG.FEATURE_PERFORMANCE_METRICS ? "Yes" : "No", unit: "" }
//       ]
//     }
//   ];
// }

// function logInitSummary(logger: Logger, state: ControllerState): void {
//   const sections = generateConfigSections(state);
//
//   logger.info("=== Fridge Controller Initialized ===");
//
//   sections.forEach(function(section) {
//     let line = section.title + ": ";
//     const values = section.items.map(function(item) {
//       return item.label + "=" + item.value + item.unit;
//     });
//     line += values.join(", ");
//     logger.info(line);
//   });
// }

export function initialize(onReady?: (controller: Controller) => void): Controller | null {
  const t = now();

  // Validate configuration
  const validation = validateConfig(USER_CONFIG);

  if (!validation.valid) {
    console.error("INIT FAIL: Invalid configuration");
    validation.errors.forEach(function(err) {
      console.error("  [" + err.field + "]: " + err.message);
    });
    return null;
  }

  if (validation.warnings.length > 0) {
    validation.warnings.forEach(function(warn) {
      console.warn("  [" + warn.field + "]: " + warn.message);
    });
  }

  // Check hardware
  const relay = getRelayStatus(Shelly);
  if (!relay) {
    console.error("INIT FAIL: Cannot communicate with relay");
    return null;
  }

  // Check Timer availability
  if (typeof Timer === 'undefined' || !Timer.set) {
    console.error("INIT FAIL: Timer API not available");
    return null;
  }

  const sensors = readAllSensors(Shelly, CONFIG);
  if (sensors.airRaw === null) {
    console.error("INIT FAIL: Air sensor not responding (ID=" + CONFIG.AIR_SENSOR_ID + ")");
    return null;
  }
  if (sensors.evapRaw === null) {
    console.error("INIT FAIL: Evap sensor not responding (ID=" + CONFIG.EVAP_SENSOR_ID + ")");
    return null;
  }

  // Initialize state
  const state = createInitialState(t, relay.output, CONFIG);

  // Setup logging
  const consoleSink = createConsoleSink(Timer, console, {
    bufferSize: CONFIG.CONSOLE_BUFFER_SIZE,
    drainInterval: CONFIG.CONSOLE_INTERVAL_MS
  });

  const slackSink = createSlackSink(Shelly, Timer, {
    enabled: CONFIG.SLACK_ENABLED,
    webhookKvsKey: CONFIG.SLACK_WEBHOOK_KEY,
    bufferSize: CONFIG.SLACK_BUFFER_SIZE,
    retryDelayMs: CONFIG.SLACK_RETRY_DELAY_SEC * 1000,
    maxRetries: 5
  });

  const sinks = [];
  if (CONFIG.CONSOLE_ENABLED) {
    sinks.push({ sink: consoleSink, minLevel: CONFIG.CONSOLE_LOG_LEVEL as LogLevel });
  }
  if (CONFIG.SLACK_ENABLED) {
    sinks.push({ sink: slackSink, minLevel: CONFIG.SLACK_LOG_LEVEL as LogLevel });
  }

  const logger = createLogger({
    level: CONFIG.GLOBAL_LOG_LEVEL as LogLevel,
    demoteHours: CONFIG.GLOBAL_LOG_AUTO_DEMOTE_HOURS
  }, {
    timeSource: now,
    sinks: sinks
  }, CONFIG.LOG_LEVELS);

  const isDebug = CONFIG.GLOBAL_LOG_LEVEL <= CONFIG.LOG_LEVELS.DEBUG;

  const controller: Controller = { state: state, logger: logger, isDebug: isDebug };

  // Initialize logger and call onReady when done
  logger.initialize(function(_success: boolean, messages: InitMessage[]) {
    // Log sink init messages
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].success) {
        logger.info(messages[i].message);
      } else {
        logger.warning(messages[i].message);
      }
    }

    // Log compact init summary now that sinks are ready
    logger.info("=== Fridge Controller Initialized ===");
    logger.info("Setpoint: " + CONFIG.SETPOINT_C + "C +/-" + CONFIG.HYSTERESIS_C + "C, Sensors: air=" + CONFIG.AIR_SENSOR_ID + " evap=" + CONFIG.EVAP_SENSOR_ID);
    logger.info("Compressor: minOn=" + CONFIG.MIN_ON_SEC + "s minOff=" + CONFIG.MIN_OFF_SEC + "s");
    logger.info("Freeze: lock<" + CONFIG.FREEZE_PROTECTION_START_C + "C release>" + CONFIG.FREEZE_PROTECTION_STOP_C + "C");
    logger.info("Relay: " + (state.confirmedOn ? "ON" : "OFF") + ", Air: " + (sensors.airRaw !== null ? sensors.airRaw.toFixed(1) + "C" : "n/a") + ", Evap: " + (sensors.evapRaw !== null ? sensors.evapRaw.toFixed(1) + "C" : "n/a"));

    // Call onReady callback if provided
    if (onReady) {
      onReady(controller);
    }
  });

  return controller;
}
