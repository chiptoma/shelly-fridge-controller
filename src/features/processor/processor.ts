/**
 * Features event processor
 *
 * Processes state events from core and generates commands.
 * Extracted from main-features.ts for testability.
 */

import { getDutyPercent, shouldResetDutyCycle } from '@features/duty-cycle';
import { calculateAdaptiveShift } from '@features/adaptive-hysteresis';
import { updateHighTempAlerts } from '@features/high-temp-alerts';
import { trackLoopExecution, initPerformanceState, formatPerformanceSummary } from '@features/performance-metrics';
import type { PerformanceState } from '@features/performance-metrics/types';
import {
  updateDailyStats,
  updateDailyRuntime,
  shouldGenerateSummary,
  calculateSummary,
  formatDailySummary
} from '@features/daily-summary';

import type { FridgeStateEvent, FridgeCommandEvent } from '@events/types';
import type { DailyState } from '@features/daily-summary/types';

export interface FeaturesConfig {
  SETPOINT_C: number;
  HYSTERESIS_C: number;
  ADAPTIVE_LOW_DUTY_PCT: number;
  ADAPTIVE_HIGH_DUTY_PCT: number;
  ADAPTIVE_MAX_SHIFT_C: number;
  ADAPTIVE_MIN_SHIFT_C: number;
  ADAPTIVE_SHIFT_STEP_C: number;
  HIGH_TEMP_INSTANT_THRESHOLD_C: number;
  HIGH_TEMP_INSTANT_DELAY_SEC: number;
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: number;
  HIGH_TEMP_SUSTAINED_DELAY_SEC: number;
  PERF_SLOW_LOOP_THRESHOLD_MS: number;
  PERF_LOG_INTERVAL_SEC: number;
  PERF_WARN_SLOW_LOOPS: boolean;
  DAILY_SUMMARY_HOUR: number;
  DUTY_INTERVAL_SEC: number;
}

export interface FeaturesState {
  // Daily summary - matches DailyState type plus extra fields
  dailyState: DailyState & {
    lastDailySummaryDate: string | null;
  };

  // Adaptive hysteresis
  currentShift: number;
  dynOnAbove: number;
  dynOffBelow: number;

  // High temp alerts
  alertState: {
    instantStart: number;
    instantFired: boolean;
    sustainedStart: number;
    sustainedFired: boolean;
  };

  // Performance
  perfState: PerformanceState;
  lastPerfLog: number;

  // Duty cycle
  dutyLastReset: number;
}

export interface ProcessResult {
  commands: FridgeCommandEvent[];
  state: FeaturesState;
}

/**
 * Create initial features state
 */
export function createInitialFeaturesState(config: FeaturesConfig): FeaturesState {
  return {
    dailyState: {
      dayOnSec: 0,
      dayOffSec: 0,
      dayAirMin: null,
      dayAirMax: null,
      dayAirSum: 0,
      dayAirCount: 0,
      dayEvapMin: null,
      dayEvapMax: null,
      dayEvapSum: 0,
      dayEvapCount: 0,
      freezeCount: 0,
      highTempCount: 0,
      lastDailySummaryDate: null
    },
    currentShift: 0,
    dynOnAbove: config.SETPOINT_C + config.HYSTERESIS_C,
    dynOffBelow: config.SETPOINT_C - config.HYSTERESIS_C,
    alertState: {
      instantStart: 0,
      instantFired: false,
      sustainedStart: 0,
      sustainedFired: false
    },
    perfState: initPerformanceState(),
    lastPerfLog: 0,
    dutyLastReset: 0
  };
}

/**
 * Process a state event and generate commands
 */
export function processStateEvent(
  event: FridgeStateEvent,
  state: FeaturesState,
  config: FeaturesConfig,
  nowFn: () => number
): ProcessResult {
  const commands: FridgeCommandEvent[] = [];
  const t = event.timestamp;

  // Clone state for immutability
  const newState = JSON.parse(JSON.stringify(state)) as FeaturesState;

  // Update daily statistics
  const statsUpdated = updateDailyStats(newState.dailyState, event.airRaw, event.evapRaw);
  const runtimeUpdated = updateDailyRuntime(statsUpdated, event.dt, event.relayOn);
  newState.dailyState = { ...runtimeUpdated, lastDailySummaryDate: newState.dailyState.lastDailySummaryDate };

  // High temperature alerts
  const alertConfig = {
    HIGH_TEMP_INSTANT_THRESHOLD_C: config.HIGH_TEMP_INSTANT_THRESHOLD_C,
    HIGH_TEMP_INSTANT_DELAY_SEC: config.HIGH_TEMP_INSTANT_DELAY_SEC,
    HIGH_TEMP_SUSTAINED_THRESHOLD_C: config.HIGH_TEMP_SUSTAINED_THRESHOLD_C,
    HIGH_TEMP_SUSTAINED_DELAY_SEC: config.HIGH_TEMP_SUSTAINED_DELAY_SEC
  };

  const prevInstant = newState.alertState.instantFired;
  const prevSustained = newState.alertState.sustainedFired;

  const alertResult = updateHighTempAlerts(event.airTemp, t, {
    instant: { startTime: newState.alertState.instantStart, fired: newState.alertState.instantFired },
    sustained: { startTime: newState.alertState.sustainedStart, fired: newState.alertState.sustainedFired },
    justFired: false
  }, alertConfig);

  newState.alertState.instantStart = alertResult.instant.startTime;
  newState.alertState.instantFired = alertResult.instant.fired;
  newState.alertState.sustainedStart = alertResult.sustained.startTime;
  newState.alertState.sustainedFired = alertResult.sustained.fired;

  if (alertResult.instant.fired && !prevInstant) {
    commands.push({
      type: 'log',
      level: 2,
      message: "HIGH TEMP INSTANT: " + (event.airTemp !== null ? event.airTemp.toFixed(1) : "?") + "C exceeded " + config.HIGH_TEMP_INSTANT_THRESHOLD_C + "C"
    });
    newState.dailyState.highTempCount++;
  }

  if (alertResult.sustained.fired && !prevSustained) {
    commands.push({
      type: 'log',
      level: 2,
      message: "HIGH TEMP SUSTAINED: " + (event.airTemp !== null ? event.airTemp.toFixed(1) : "?") + "C exceeded " + config.HIGH_TEMP_SUSTAINED_THRESHOLD_C + "C"
    });
    newState.dailyState.highTempCount++;
  }

  if (!alertResult.instant.fired && prevInstant) {
    commands.push({ type: 'log', level: 1, message: "High temp instant alert recovered" });
  }
  if (!alertResult.sustained.fired && prevSustained) {
    commands.push({ type: 'log', level: 1, message: "High temp sustained alert recovered" });
  }

  // Adaptive hysteresis
  const dutyPercent = getDutyPercent(event.dutyOnSec, event.dutyOffSec);

  const adaptiveResult = calculateAdaptiveShift(dutyPercent, newState.currentShift, config as any);

  if (adaptiveResult.changed) {
    newState.currentShift = adaptiveResult.newShift;
    newState.dynOnAbove = config.SETPOINT_C + config.HYSTERESIS_C + adaptiveResult.newShift;
    newState.dynOffBelow = config.SETPOINT_C - config.HYSTERESIS_C - adaptiveResult.newShift;

    commands.push({
      type: 'adjust_hysteresis',
      onAbove: newState.dynOnAbove,
      offBelow: newState.dynOffBelow
    });

    commands.push({
      type: 'log',
      level: 0,
      message: "Adaptive: duty=" + dutyPercent.toFixed(1) + "%, shift=" + adaptiveResult.newShift.toFixed(2) + "C"
    });
  }

  // Performance metrics
  const loopEndSec = nowFn();
  const perfResult = trackLoopExecution(newState.perfState, event.loopStartSec, loopEndSec, config.PERF_SLOW_LOOP_THRESHOLD_MS);

  newState.perfState = perfResult.performance;

  if (perfResult.wasSlow && config.PERF_WARN_SLOW_LOOPS) {
    commands.push({
      type: 'log',
      level: 2,
      message: "Slow loop: " + (perfResult.loopTime * 1000).toFixed(2) + "ms"
    });
  }

  if (loopEndSec - newState.lastPerfLog >= config.PERF_LOG_INTERVAL_SEC) {
    commands.push({
      type: 'log',
      level: 1,
      message: formatPerformanceSummary(newState.perfState)
    });
    newState.lastPerfLog = loopEndSec;
  }

  // Daily summary
  const summaryCheck = shouldGenerateSummary(t, newState.dailyState.lastDailySummaryDate || "", config.DAILY_SUMMARY_HOUR);

  if (summaryCheck.shouldGenerate) {
    const summary = calculateSummary({
      dayOnSec: newState.dailyState.dayOnSec,
      dayOffSec: newState.dailyState.dayOffSec,
      dayAirMin: newState.dailyState.dayAirMin,
      dayAirMax: newState.dailyState.dayAirMax,
      dayAirSum: newState.dailyState.dayAirSum,
      dayAirCount: newState.dailyState.dayAirCount,
      dayEvapMin: newState.dailyState.dayEvapMin,
      dayEvapMax: newState.dailyState.dayEvapMax,
      dayEvapSum: newState.dailyState.dayEvapSum,
      dayEvapCount: newState.dailyState.dayEvapCount,
      freezeCount: newState.dailyState.freezeCount,
      highTempCount: newState.dailyState.highTempCount
    });

    commands.push({
      type: 'daily_summary',
      summary: formatDailySummary(summary, summaryCheck.currentDate)
    });

    // Reset daily stats
    newState.dailyState.dayOnSec = 0;
    newState.dailyState.dayOffSec = 0;
    newState.dailyState.dayAirMin = null;
    newState.dailyState.dayAirMax = null;
    newState.dailyState.dayAirSum = 0;
    newState.dailyState.dayAirCount = 0;
    newState.dailyState.dayEvapMin = null;
    newState.dailyState.dayEvapMax = null;
    newState.dailyState.dayEvapSum = 0;
    newState.dailyState.dayEvapCount = 0;
    newState.dailyState.freezeCount = 0;
    newState.dailyState.highTempCount = 0;
    newState.dailyState.lastDailySummaryDate = summaryCheck.currentDate;
  }

  // Duty cycle reset check
  if (shouldResetDutyCycle(t, newState.dutyLastReset, config.DUTY_INTERVAL_SEC)) {
    commands.push({
      type: 'log',
      level: 1,
      message: "Duty cycle: " + dutyPercent.toFixed(1) + "% (on=" + (event.dutyOnSec / 60).toFixed(1) + "m, off=" + (event.dutyOffSec / 60).toFixed(1) + "m)"
    });
    newState.dutyLastReset = t;
  }

  return { commands, state: newState };
}
