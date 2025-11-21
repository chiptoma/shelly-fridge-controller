/**
 * Control loop implementation
 */

import CONFIG from '@boot/config';
import { decideCooling } from '@core/thermostat';
import { validateRelayState } from '@hardware/relay';
import { updateDutyCycle } from '@features/duty-cycle';
import {
  updateDailyStats,
  updateDailyRuntime
} from '@features/daily-summary';
import type { DutyCycleState } from '@features/duty-cycle/types';
import type { DailyState } from '@features/daily-summary/types';
import { readAllSensors } from '@hardware/sensors';
import { now, calculateTimeDelta } from '@utils/time';

import type { Controller } from './types';

import {
  processSensorHealth,
  processSmoothing,
  processFreezeProtection,
  processHighTempAlerts,
  processAdaptiveHysteresis,
  executeRelayChange,
  processPerformanceMetrics,
  processDailySummary
} from './helpers';

export function run(controller: Controller): void {
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

    if (isDebug) {
      logger.debug("Loop: t=" + t + "s, airRaw=" + (sensors.airRaw !== null ? sensors.airRaw.toFixed(1) : "n/a") + ", evapRaw=" + (sensors.evapRaw !== null ? sensors.evapRaw.toFixed(1) : "n/a") + ", relay=" + (sensors.relayOn ? "ON" : "OFF"));
    }

    // Sensor health monitoring
    if (CONFIG.FEATURE_SENSOR_FAILURE) {
      if (processSensorHealth(state, sensors, t, logger)) {
        return; // Critical failure - skip normal control
      }
    }

    // Smoothing
    const smoothingResult = processSmoothing(state, sensors, isDebug, logger);
    const airDecision = smoothingResult.airDecision;
    const evapDecision = smoothingResult.evapDecision;

    // Freeze protection
    processFreezeProtection(state, evapDecision, t, isDebug, logger);

    // High temp alerts
    if (CONFIG.FEATURE_HIGH_TEMP_ALERTS) {
      processHighTempAlerts(state, airDecision, t, logger);
    }

    // Adaptive hysteresis
    if (CONFIG.FEATURE_ADAPTIVE_HYSTERESIS) {
      processAdaptiveHysteresis(state, isDebug, logger);
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

    // Control decision
    const wantCool = decideCooling(airDecision, sensors.relayOn, {
      freezeLocked: state.freezeLocked,
      dynOnAbove: state.dynOnAbove,
      dynOffBelow: state.dynOffBelow
    });

    // Execute relay change if needed
    if (wantCool !== sensors.relayOn) {
      executeRelayChange(state, sensors, wantCool, t, airDecision, evapDecision, logger);
    }

    // Update tracking
    updateDutyCycle(state as unknown as DutyCycleState, dt, sensors.relayOn);
    updateDailyStats(state as unknown as DailyState, sensors.airRaw, sensors.evapRaw);
    updateDailyRuntime(state as unknown as DailyState, dt, sensors.relayOn);

    // Performance metrics
    if (CONFIG.FEATURE_PERFORMANCE_METRICS) {
      processPerformanceMetrics(state, loopStartSec, logger);
    }

    // Daily summary
    if (CONFIG.FEATURE_DAILY_SUMMARY) {
      processDailySummary(state, t, logger);
    }

    // Watchdog
    state.lastWatchdogPet = t;

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    logger.critical("Control loop crashed: " + errorMsg);
    state.consecutiveErrors++;
  }
}
