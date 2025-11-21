/**
 * Core control loop - stripped of features, emits events
 *
 * This is the minimal control loop that handles:
 * - Sensor reading and smoothing
 * - Thermostat control decisions
 * - Relay control with timing constraints
 * - Freeze protection
 * - Sensor health monitoring
 *
 * Features (duty cycle, daily summary, adaptive hysteresis, etc.)
 * are handled by a separate features script that listens to events.
 */

import CONFIG from '@boot/config';
import { decideCooling } from '@core/thermostat';
import { applyTimingConstraints } from '@core/compressor-timing';
import { validateRelayState } from '@hardware/relay';
import { readAllSensors } from '@hardware/sensors';
import { now, nowMs, calculateTimeDelta } from '@utils/time';
import { getDutyPercent } from '@features/duty-cycle';

import type { Controller } from './types';
import type { FridgeStateEvent, FridgeCommandEvent } from '@events/types';
import type { ShellyAPI } from '$types/shelly';
import { EVENT_NAMES } from '@events/types';

import {
  processSensorHealth,
  processSmoothing,
  processFreezeProtection,
  executeRelayChange
} from './helpers';

/**
 * Format uptime as human-readable string
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return Math.round(seconds) + "s";
  } else if (seconds < 3600) {
    return Math.round(seconds / 60) + "m";
  } else {
    return Math.round(seconds / 3600) + "h";
  }
}

/**
 * Format temperature with one decimal place (always shows .X for alignment)
 */
function fmtT(v: number | null): string {
  if (v === null) {
    return "-";
  }
  // Use toFixed(1) to always show decimal for alignment (e.g., 4.0 not 4)
  return (Math.round(v * 10) / 10).toFixed(1);
}

declare const Shelly: ShellyAPI & {
  emitEvent: (name: string, data: unknown) => void;
  addEventHandler: (callback: (event: { name: string; info: unknown }) => void) => void;
};

declare const Timer: {
  set: (ms: number, repeat: boolean, callback: () => void) => number;
  clear: (id: number) => void;
};

/**
 * Track duty cycle locally (needed for event emission)
 */
let dutyOnSec = 0;
let dutyOffSec = 0;

/**
 * Run core control loop and emit state event
 */
export function runCore(controller: Controller): void {
  const state = controller.state;
  const logger = controller.logger;
  const isDebug = controller.isDebug;

  try {
    const t = now();
    const loopStartSec = t;
    const loopStartMs = nowMs();

    // Read sensors
    const sensors = readAllSensors(Shelly, CONFIG);

    // Calculate time delta
    const dt = calculateTimeDelta(t, state.lastLoopTime, CONFIG.LOOP_PERIOD_MS);
    state.lastLoopTime = t;

    // Sensor health monitoring
    if (CONFIG.FEATURE_SENSOR_FAILURE) {
      if (processSensorHealth(state, sensors, t, logger)) {
        return; // Critical failure - skip normal control
      }
    }

    // Smoothing
    const smoothingResult = processSmoothing(state, sensors);
    const airDecision = smoothingResult.airDecision;
    const evapDecision = smoothingResult.evapDecision;

    // Freeze protection
    processFreezeProtection(state, evapDecision, t);

    // Validate relay state
    const validation = validateRelayState(state.intendedOn, sensors.relayOn, t, state.lastStateChangeCommand, CONFIG.RELAY_RESPONSE_TIMEOUT_SEC);

    if (!validation.valid) {
      if (validation.stuck) {
        logger.critical("RELAY STUCK: Intended=" + (validation.intended ? "ON" : "OFF") + ", Reported=" + (validation.reported ? "ON" : "OFF") + " for " + validation.elapsed + "s");
        state.consecutiveErrors++;
      }
    }

    // If waiting for response, don't make new decisions yet
    if (validation.waitingForResponse) {
       return;
    }

    state.confirmedOn = sensors.relayOn;

    // Control decision - use base thresholds (features script can adjust via events)
    const wantCool = decideCooling(airDecision, sensors.relayOn, {
      freezeLocked: state.freezeLocked,
      dynOnAbove: state.dynOnAbove,
      dynOffBelow: state.dynOffBelow
    });

    // Check timing constraints to determine wait state
    const timingCheck = applyTimingConstraints(sensors.relayOn, wantCool, t, state, CONFIG);

    // DEBUG: Comprehensive status every loop
    if (isDebug) {
      // Setpoint
      const sp = "SP:" + CONFIG.SETPOINT_C + "±" + CONFIG.HYSTERESIS_C;

      // Temperatures
      const temps = "Air:" + fmtT(sensors.airRaw) + "R/" + fmtT(state.airTempSmoothed) + "S Evap:" + fmtT(sensors.evapRaw) + "R/" + fmtT(state.evapTempSmoothed) + "S";

      // State transition with reason
      let stateStr = (sensors.relayOn ? "ON" : "OFF") + "→" + (wantCool ? "ON" : "OFF");
      if (!timingCheck.allow && timingCheck.reason) {
        const remaining = timingCheck.remainingSec !== undefined ? Math.round(timingCheck.remainingSec) : 0;
        stateStr = stateStr + "(" + timingCheck.reason + " " + remaining + "s)";
      }

      // Freeze protection
      const frz = "Frz:" + (state.freezeLocked ? "ON" : "OFF");

      // Sensor health
      let sns = "OK";
      if (state.airCriticalFailure || state.evapCriticalFailure) {
        sns = "CRIT";
      } else if (state.airNoReadingFired || state.evapNoReadingFired) {
        sns = "OFFLINE";
      } else if (state.airStuckFired || state.evapStuckFired) {
        sns = "STUCK";
      }
      const snsStr = "Sns:" + sns;

      // Duty cycle
      const duty = "Duty:" + Math.round(getDutyPercent(dutyOnSec, dutyOffSec)) + "%";

      // Adaptive hysteresis shift
      const baseOn = CONFIG.SETPOINT_C + CONFIG.HYSTERESIS_C;
      const shift = state.dynOnAbove - baseOn;
      const hystStr = "Hyst:" + (shift >= 0 ? "+" : "") + (Math.round(shift * 10) / 10);

      // Uptime
      const up = "Up:" + formatUptime(t - state.startTime);

      // Error count
      const err = "Err:" + state.consecutiveErrors;

      // Loop duration (rounded to integer)
      const loopMs = Math.round(nowMs() - loopStartMs);

      logger.debug(sp + " | " + temps + " | " + stateStr + " | " + frz + " | " + snsStr + " | " + duty + " | " + hystStr + " | " + up + " | " + err + " | " + loopMs + "ms");
    }

    // Execute relay change if needed
    if (wantCool !== sensors.relayOn) {
      // INFO: State change with emoji format (2 lines to avoid wrapping)
      const sp = "🎯 " + CONFIG.SETPOINT_C + "±" + CONFIG.HYSTERESIS_C + "C";
      const temps = "🌡️ Air:" + fmtT(sensors.airRaw) + "R/" + fmtT(state.airTempSmoothed) + "S Evap:" + fmtT(sensors.evapRaw) + "R/" + fmtT(state.evapTempSmoothed) + "S";

      let stateStr = "🔌 " + (sensors.relayOn ? "ON" : "OFF") + "→" + (wantCool ? "ON" : "OFF");
      if (!timingCheck.allow && timingCheck.reason) {
        stateStr = stateStr + " (" + timingCheck.reason + ")";
      }

      const frz = "❄️ " + (state.freezeLocked ? "ON" : "OFF");

      // Line 1: temps, state, freeze
      logger.info(sp + " | " + temps + " | " + stateStr + " | " + frz);

      let sns = "OK";
      if (state.airCriticalFailure || state.evapCriticalFailure) {
        sns = "CRIT";
      } else if (state.airNoReadingFired || state.evapNoReadingFired) {
        sns = "OFFLINE";
      } else if (state.airStuckFired || state.evapStuckFired) {
        sns = "STUCK";
      }
      const snsStr = "📡 " + sns;

      const duty = "📊 " + Math.round(getDutyPercent(dutyOnSec, dutyOffSec)) + "%";

      const baseOn = CONFIG.SETPOINT_C + CONFIG.HYSTERESIS_C;
      const shift = state.dynOnAbove - baseOn;
      const hystStr = "⚡ " + (shift >= 0 ? "+" : "") + (Math.round(shift * 10) / 10) + "C";

      const up = "Up:" + formatUptime(t - state.startTime);
      const err = "Err:" + state.consecutiveErrors;

      // Line 2: sensors, duty, hyst, up, err
      logger.info(snsStr + " | " + duty + " | " + hystStr + " | " + up + " | " + err);

      executeRelayChange(state, sensors, wantCool, t, airDecision, evapDecision, logger);
    }

    // Update local duty cycle tracking
    if (dt > 0) {
      if (sensors.relayOn) {
        dutyOnSec += dt;
      } else {
        dutyOffSec += dt;
      }
    }

    // Watchdog
    state.lastWatchdogPet = t;

    // Emit state event for features script
    const stateEvent: FridgeStateEvent = {
      airTemp: airDecision,
      evapTemp: evapDecision,
      airRaw: sensors.airRaw,
      evapRaw: sensors.evapRaw,
      relayOn: sensors.relayOn,
      freezeLocked: state.freezeLocked,
      dutyOnSec: dutyOnSec,
      dutyOffSec: dutyOffSec,
      dt: dt,
      loopStartSec: loopStartSec,
      timestamp: t
    };

    Shelly.emitEvent(EVENT_NAMES.STATE, stateEvent);

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    logger.critical("Control loop crashed: " + errorMsg);
    state.consecutiveErrors++;
  }
}

/**
 * Handle commands from features script
 */
export function handleFeatureCommand(controller: Controller, command: FridgeCommandEvent): void {
  const logger = controller.logger;
  const state = controller.state;

  switch (command.type) {
    case 'log':
      if (command.message) {
        const level = command.level !== undefined ? command.level : 1;
        if (level === 0) {
          if (controller.isDebug) {
            logger.debug(command.message);
          }
        } else if (level === 1) {
          logger.info(command.message);
        } else if (level === 2) {
          logger.warning(command.message);
        } else {
          logger.critical(command.message);
        }
      }
      break;

    case 'slack':
      // Slack messages go through the logger as info level
      if (command.message) {
        logger.info(command.message);
      }
      break;

    case 'adjust_hysteresis':
      if (typeof command.onAbove === 'number' && typeof command.offBelow === 'number') {
        state.dynOnAbove = command.onAbove;
        state.dynOffBelow = command.offBelow;
      }
      break;

    case 'daily_summary':
      if (command.summary) {
        logger.info(command.summary);
        // Note: dutyOnSec/dutyOffSec are NOT reset - they track overall duty for adaptive hysteresis
        // Daily summary uses separate dayOnSec/dayOffSec which are reset in processDailySummary
      }
      break;
  }
}

/**
 * Setup event handler for commands from features script
 */
export function setupCommandHandler(controller: Controller): void {
  Shelly.addEventHandler(function(event) {
    if (event.name === EVENT_NAMES.COMMAND) {
      handleFeatureCommand(controller, event.info as FridgeCommandEvent);
    }
  });
}
