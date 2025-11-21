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
import type { Controller } from './types';

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
    // Log startup message FIRST
    logger.info("🚀 Fridge Controller v3.0");
    logger.info("🎯 " + CONFIG.SETPOINT_C + "±" + CONFIG.HYSTERESIS_C + "C | 🔌 " + (state.confirmedOn ? "ON" : "OFF") + " | ⏱️ ON:" + CONFIG.MIN_ON_SEC + "s OFF:" + CONFIG.MIN_OFF_SEC + "s | ❄️ " + CONFIG.FREEZE_PROTECTION_START_C + "/" + CONFIG.FREEZE_PROTECTION_STOP_C + "C REC:" + CONFIG.FREEZE_RECOVERY_DELAY_SEC + "s");
    logger.info("⚙️ DC:" + (CONFIG.FEATURE_DUTY_CYCLE ? "ON" : "OFF") + " | AH:" + (CONFIG.FEATURE_ADAPTIVE_HYSTERESIS ? "ON" : "OFF") + " | HT:" + (CONFIG.FEATURE_HIGH_TEMP_ALERTS ? "ON" : "OFF") + " | SF:" + (CONFIG.FEATURE_SENSOR_FAILURE ? "ON" : "OFF") + " | WD:" + (CONFIG.FEATURE_WATCHDOG ? "ON" : "OFF"));

    // Log sink init warnings AFTER title (skip success messages)
    // Use console.log directly to avoid recursion during initialization
    for (let i = 0; i < messages.length; i++) {
      if (!messages[i].success) {
        console.log('⚠️ [WARNING]  ' + messages[i].message);
      }
    }

    // Call onReady callback if provided
    if (onReady) {
      onReady(controller);
    }
  });

  return controller;
}
