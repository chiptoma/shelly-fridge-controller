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
import { validateRelayState } from '@hardware/relay';
import { readAllSensors } from '@hardware/sensors';
import { now, calculateTimeDelta } from '@utils/time';

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

    // Single consolidated debug message to minimize memory
    if (isDebug) {
      const aRaw = sensors.airRaw !== null ? sensors.airRaw.toFixed(1) : "-";
      const eRaw = sensors.evapRaw !== null ? sensors.evapRaw.toFixed(1) : "-";
      const aDec = airDecision !== null ? airDecision.toFixed(1) : "-";
      const eDec = evapDecision !== null ? evapDecision.toFixed(1) : "-";
      const aType = smoothingResult.airBufferFull ? "S" : "R";
      const eType = smoothingResult.evapBufferFull ? "S" : "R";
      logger.debug("t=" + t + " air:" + aRaw + "->" + aDec + aType + " evap:" + eRaw + "->" + eDec + eType + " relay=" + (sensors.relayOn ? "ON" : "OFF"));
    }

    // Freeze protection
    const freezeActivated = processFreezeProtection(state, evapDecision, t);
    if (freezeActivated && isDebug) {
      logger.debug("Freeze protection activated: count=" + state.dayFreezeCount);
    }

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

    // Execute relay change if needed
    if (wantCool !== sensors.relayOn) {
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
        // Reset duty cycle after daily summary
        dutyOnSec = 0;
        dutyOffSec = 0;
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
