/**
 * Control loop helper functions
 */

import CONFIG from '@boot/config';
import { updateMovingAverage, isBufferFull } from '@core/smoothing';
import { updateFreezeProtection } from '@core/freeze-protection';
import { applyTimingConstraints } from '@core/compressor-timing';
import { updateSensorHealth } from '@core/sensor-health';
import type { SensorHealthState } from '@core/sensor-health';
import { calculateAdaptiveShift } from '@features/adaptive-hysteresis';
import { setRelay } from '@hardware/relay';
import { getDutyPercent } from '@features/duty-cycle';
import { updateHighTempAlerts } from '@features/high-temp-alerts';
import { trackLoopExecution, formatPerformanceSummary } from '@features/performance-metrics';
import {
  shouldGenerateSummary,
  calculateSummary,
  formatDailySummary
} from '@features/daily-summary';
import { now } from '@utils/time';
import { fmtTemp } from '@logging';

import type { Logger } from '@logging';
import type { ControllerState } from '@system/state/types';

/**
 * Apply sensor health result to state fields
 */
export function applySensorHealthToState(
  state: ControllerState,
  sensor: 'air' | 'evap',
  health: SensorHealthState
): void {
  if (sensor === 'air') {
    state.airLastReadTime = health.lastReadTime;
    state.airLastChangeTime = health.lastChangeTime;
    state.airLastRaw = health.lastRaw;
    state.airNoReadingFired = health.noReadingFired;
    state.airCriticalFailure = health.criticalFailure;
    state.airStuckFired = health.stuckFired;
  } else {
    state.evapLastReadTime = health.lastReadTime;
    state.evapLastChangeTime = health.lastChangeTime;
    state.evapLastRaw = health.lastRaw;
    state.evapNoReadingFired = health.noReadingFired;
    state.evapCriticalFailure = health.criticalFailure;
    state.evapStuckFired = health.stuckFired;
  }
}

/**
 * Process sensor health monitoring
 * @returns true if critical failure occurred and control should be skipped
 */
export function processSensorHealth(
  state: ControllerState,
  sensors: { airRaw: number | null; evapRaw: number | null; relayOn: boolean },
  t: number,
  logger: Logger
): boolean {
  const sensorConfig = {
    SENSOR_NO_READING_SEC: CONFIG.SENSOR_NO_READING_SEC,
    SENSOR_CRITICAL_FAILURE_SEC: CONFIG.SENSOR_CRITICAL_FAILURE_SEC,
    SENSOR_STUCK_SEC: CONFIG.SENSOR_STUCK_SEC,
    SENSOR_STUCK_EPSILON_C: CONFIG.SENSOR_STUCK_EPSILON_C
  };

  // Air sensor
  const airHealth = updateSensorHealth('air', sensors.airRaw, t, {
    lastReadTime: state.airLastReadTime,
    lastChangeTime: state.airLastChangeTime,
    lastRaw: state.airLastRaw,
    noReadingFired: state.airNoReadingFired,
    criticalFailure: state.airCriticalFailure,
    stuckFired: state.airStuckFired
  }, sensorConfig);

  if (airHealth.noReadingFired && !state.airNoReadingFired) {
    logger.warning("Air sensor offline for " + airHealth.offlineDuration + "s");
  }
  if (airHealth.recovered) {
    logger.info("Air sensor recovered");
  }
  if (airHealth.stuckFired && !state.airStuckFired) {
    logger.warning("Air sensor stuck at " + airHealth.lastRaw + "C for " + airHealth.stuckDuration + "s");
  }
  if (airHealth.unstuck) {
    logger.info("Air sensor unstuck");
  }

  // Critical failure - safety shutdown
  if (airHealth.criticalFailure && !state.airCriticalFailure) {
    logger.critical("AIR SENSOR CRITICAL FAILURE - FORCING RELAY OFF");
    state.intendedOn = false;
    setRelay(false, Shelly);

    // Update state and force criticalFailure to true
    applySensorHealthToState(state, 'air', airHealth);
    state.airCriticalFailure = true;

    return true; // Signal to skip normal control
  }

  // Update air state
  applySensorHealthToState(state, 'air', airHealth);

  // Evap sensor (no safety shutdown)
  const evapHealth = updateSensorHealth('evap', sensors.evapRaw, t, {
    lastReadTime: state.evapLastReadTime,
    lastChangeTime: state.evapLastChangeTime,
    lastRaw: state.evapLastRaw,
    noReadingFired: state.evapNoReadingFired,
    criticalFailure: state.evapCriticalFailure,
    stuckFired: state.evapStuckFired
  }, sensorConfig);

  if (evapHealth.noReadingFired && !state.evapNoReadingFired) {
    logger.warning("Evap sensor offline for " + evapHealth.offlineDuration + "s");
  }
  if (evapHealth.recovered) {
    logger.info("Evap sensor recovered");
  }
  if (evapHealth.stuckFired && !state.evapStuckFired) {
    logger.warning("Evap sensor stuck at " + evapHealth.lastRaw + "C for " + evapHealth.stuckDuration + "s");
  }
  if (evapHealth.unstuck) {
    logger.info("Evap sensor unstuck");
  }

  // Update evap state
  applySensorHealthToState(state, 'evap', evapHealth);

  return false;
}

/**
 * Process temperature smoothing
 */
export function processSmoothing(
  state: ControllerState,
  sensors: { airRaw: number | null; evapRaw: number | null }
): { airDecision: number | null; evapDecision: number | null; airBufferFull: boolean; evapBufferFull: boolean } {
  let airSmoothed = state.airTempSmoothed;
  let evapSmoothed = state.evapTempSmoothed;

  const airConfig = { windowSizeSec: CONFIG.AIR_SENSOR_SMOOTHING_SEC, loopPeriodMs: CONFIG.LOOP_PERIOD_MS };
  const evapConfig = { windowSizeSec: CONFIG.EVAP_SENSOR_SMOOTHING_SEC, loopPeriodMs: CONFIG.LOOP_PERIOD_MS };

  // Use mutable buffers directly - no array copies
  const airBuffer = { samples: state.airTempBuffer };
  const evapBuffer = { samples: state.evapTempBuffer };

  let airBufferFull = false;
  let evapBufferFull = false;

  if (sensors.airRaw !== null) {
    const result = updateMovingAverage(airBuffer, sensors.airRaw, airConfig);
    airSmoothed = result.value;
    state.airTempSmoothed = airSmoothed;
    airBufferFull = result.bufferFull;
  } else {
    airBufferFull = isBufferFull(airBuffer, airConfig);
  }

  if (sensors.evapRaw !== null) {
    const result = updateMovingAverage(evapBuffer, sensors.evapRaw, evapConfig);
    evapSmoothed = result.value;
    state.evapTempSmoothed = evapSmoothed;
    evapBufferFull = result.bufferFull;
  } else {
    evapBufferFull = isBufferFull(evapBuffer, evapConfig);
  }

  const airDecision = airBufferFull ? airSmoothed : sensors.airRaw;
  const evapDecision = evapBufferFull ? evapSmoothed : sensors.evapRaw;

  return { airDecision: airDecision, evapDecision: evapDecision, airBufferFull: airBufferFull, evapBufferFull: evapBufferFull };
}

/**
 * Process freeze protection
 * @returns true if freeze protection was just activated
 */
export function processFreezeProtection(
  state: ControllerState,
  evapDecision: number | null,
  t: number
): boolean {
  const freezeUpdate = updateFreezeProtection(evapDecision, t, {
    locked: state.freezeLocked,
    lockCount: state.lockCount,
    unlockTime: state.unlockTime
  }, CONFIG);

  const previousLockCount = state.lockCount;
  state.freezeLocked = freezeUpdate.locked;
  state.lockCount = freezeUpdate.lockCount || 0;
  state.unlockTime = freezeUpdate.unlockTime;

  if (state.lockCount > previousLockCount) {
    state.dayFreezeCount++;
    return true;
  }
  return false;
}

/**
 * Process high temperature alerts
 */
export function processHighTempAlerts(
  state: ControllerState,
  airDecision: number | null,
  t: number,
  logger: Logger
): void {
  const alertConfig = {
    HIGH_TEMP_INSTANT_THRESHOLD_C: CONFIG.HIGH_TEMP_INSTANT_THRESHOLD_C,
    HIGH_TEMP_INSTANT_DELAY_SEC: CONFIG.HIGH_TEMP_INSTANT_DELAY_SEC,
    HIGH_TEMP_SUSTAINED_THRESHOLD_C: CONFIG.HIGH_TEMP_SUSTAINED_THRESHOLD_C,
    HIGH_TEMP_SUSTAINED_DELAY_SEC: CONFIG.HIGH_TEMP_SUSTAINED_DELAY_SEC
  };

  const prevInstant = state.instantFired;
  const prevSustained = state.sustainedFired;

  const result = updateHighTempAlerts(airDecision, t, {
    instant: { startTime: state.instantStart, fired: state.instantFired },
    sustained: { startTime: state.sustainedStart, fired: state.sustainedFired },
    justFired: false
  }, alertConfig);

  state.instantStart = result.instant.startTime;
  state.instantFired = result.instant.fired;
  state.sustainedStart = result.sustained.startTime;
  state.sustainedFired = result.sustained.fired;

  if (result.instant.fired && !prevInstant) {
    logger.warning("HIGH TEMP INSTANT: " + (airDecision !== null ? airDecision.toFixed(1) : "?") + "C exceeded " + CONFIG.HIGH_TEMP_INSTANT_THRESHOLD_C + "C for " + CONFIG.HIGH_TEMP_INSTANT_DELAY_SEC + "s");
    state.dayHighTempCount++;
  }

  if (result.sustained.fired && !prevSustained) {
    logger.warning("HIGH TEMP SUSTAINED: " + (airDecision !== null ? airDecision.toFixed(1) : "?") + "C exceeded " + CONFIG.HIGH_TEMP_SUSTAINED_THRESHOLD_C + "C for " + (CONFIG.HIGH_TEMP_SUSTAINED_DELAY_SEC / 60).toFixed(0) + "min");
    state.dayHighTempCount++;
  }

  if (!result.instant.fired && prevInstant) {
    logger.info("High temp instant alert recovered");
  }
  if (!result.sustained.fired && prevSustained) {
    logger.info("High temp sustained alert recovered");
  }
}

/**
 * Process adaptive hysteresis
 * @returns debug info if changed, null otherwise
 */
export function processAdaptiveHysteresis(
  state: ControllerState
): { dutyPercent: number; newShift: number } | null {
  const dutyPercent = getDutyPercent(state.dutyOnSec, state.dutyOffSec);
  const baseOnAbove = CONFIG.SETPOINT_C + CONFIG.HYSTERESIS_C;
  const baseOffBelow = CONFIG.SETPOINT_C - CONFIG.HYSTERESIS_C;
  const currentShift = state.dynOnAbove - baseOnAbove;

  const result = calculateAdaptiveShift(dutyPercent, currentShift, CONFIG);

  if (result.changed) {
    state.dynOnAbove = baseOnAbove + result.newShift;
    state.dynOffBelow = baseOffBelow - result.newShift;
    return { dutyPercent: dutyPercent, newShift: result.newShift };
  }
  return null;
}

/**
 * Execute relay state change
 */
export function executeRelayChange(
  state: ControllerState,
  sensors: { relayOn: boolean; airRaw: number | null; evapRaw: number | null },
  wantCool: boolean,
  t: number,
  airDecision: number | null,
  evapDecision: number | null,
  logger: Logger
): void {
  const timingCheck = applyTimingConstraints(sensors.relayOn, wantCool, t, state, CONFIG);

  if (!timingCheck.allow) {
    return;
  }

  state.intendedOn = wantCool;
  state.lastStateChangeCommand = t;
  state.minOnWaitLogged = false;
  state.minOffWaitLogged = false;

  const reason = "air=" + fmtTemp(airDecision, sensors.airRaw, true) + ", evap=" + fmtTemp(evapDecision, sensors.evapRaw, true);

  setRelay(wantCool, Shelly, function(error_code: number, error_message: string) {
    const callbackTime = now();
    if (error_code !== 0) {
      logger.critical("Relay control failed: " + error_message);
      state.consecutiveErrors++;
    } else {
      state.consecutiveErrors = 0;
      if (wantCool) {
        state.lastOnTime = callbackTime;
      } else {
        state.lastOffTime = callbackTime;
      }
    }
  });

  logger.info((wantCool ? "Compressor ON: " : "Compressor OFF: ") + reason);
}

/**
 * Process performance metrics
 */
export function processPerformanceMetrics(
  state: ControllerState,
  loopStartSec: number,
  logger: Logger
): void {
  const loopEndSec = now();
  const result = trackLoopExecution({
    loopCount: state.loopCount,
    loopTimeSum: state.loopTimeSum,
    loopTimeMax: state.loopTimeMax,
    loopTimeMin: state.loopTimeMin,
    slowLoopCount: state.slowLoopCount,
    lastPerfLog: state.lastPerfLog
  }, loopStartSec, loopEndSec, CONFIG.PERF_SLOW_LOOP_THRESHOLD_MS);

  state.loopCount = result.performance.loopCount;
  state.loopTimeSum = result.performance.loopTimeSum;
  state.loopTimeMax = result.performance.loopTimeMax;
  state.loopTimeMin = result.performance.loopTimeMin;
  state.slowLoopCount = result.performance.slowLoopCount;

  if (result.wasSlow && CONFIG.PERF_WARN_SLOW_LOOPS) {
    logger.warning("Slow loop: " + (result.loopTime * 1000).toFixed(2) + "ms");
  }

  if (loopEndSec - state.lastPerfLog >= CONFIG.PERF_LOG_INTERVAL_SEC) {
    logger.info(formatPerformanceSummary(result.performance));
    state.lastPerfLog = loopEndSec;
  }
}

/**
 * Process daily summary
 */
export function processDailySummary(
  state: ControllerState,
  t: number,
  logger: Logger
): void {
  const check = shouldGenerateSummary(t, state.lastDailySummaryDate || "", CONFIG.DAILY_SUMMARY_HOUR);

  if (!check.shouldGenerate) {
    return;
  }

  const summary = calculateSummary({
    dayOnSec: state.dayOnSec,
    dayOffSec: state.dayOffSec,
    dayAirMin: state.dayAirMin,
    dayAirMax: state.dayAirMax,
    dayAirSum: state.dayAirSum,
    dayAirCount: state.dayAirCount,
    dayEvapMin: state.dayEvapMin,
    dayEvapMax: state.dayEvapMax,
    dayEvapSum: state.dayEvapSum,
    dayEvapCount: state.dayEvapCount,
    freezeCount: state.dayFreezeCount,
    highTempCount: state.dayHighTempCount
  });

  logger.info(formatDailySummary(summary, check.currentDate));

  // Reset daily stats
  state.dayOnSec = 0;
  state.dayOffSec = 0;
  state.dayAirMin = null;
  state.dayAirMax = null;
  state.dayAirSum = 0;
  state.dayAirCount = 0;
  state.dayEvapMin = null;
  state.dayEvapMax = null;
  state.dayEvapSum = 0;
  state.dayEvapCount = 0;
  state.dayFreezeCount = 0;
  state.dayHighTempCount = 0;
  state.lastDailySummaryDate = check.currentDate;
}
