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

  // High temp alerts (pre-allocated for memory efficiency)
  alertState: {
    instant: { startTime: number; fired: boolean };
    sustained: { startTime: number; fired: boolean };
    justFired: boolean;
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
      instant: { startTime: 0, fired: false },
      sustained: { startTime: 0, fired: false },
      justFired: false
    },
    perfState: initPerformanceState(),
    lastPerfLog: 0,
    dutyLastReset: 0
  };
}

/**
 * Process a state event and generate commands (MUTABLE)
 *
 * Mutates state in-place for memory efficiency on constrained devices.
 */
export function processStateEvent(
  event: FridgeStateEvent,
  state: FeaturesState,
  config: FeaturesConfig,
  nowFn: () => number
): ProcessResult {
  const commands: FridgeCommandEvent[] = [];
  const t = event.timestamp;

  // Update daily statistics (mutates state.dailyState in place)
  updateDailyStats(state.dailyState, event.airRaw, event.evapRaw);
  updateDailyRuntime(state.dailyState, event.dt, event.relayOn);

  // High temperature alerts
  const alertConfig = {
    HIGH_TEMP_INSTANT_THRESHOLD_C: config.HIGH_TEMP_INSTANT_THRESHOLD_C,
    HIGH_TEMP_INSTANT_DELAY_SEC: config.HIGH_TEMP_INSTANT_DELAY_SEC,
    HIGH_TEMP_SUSTAINED_THRESHOLD_C: config.HIGH_TEMP_SUSTAINED_THRESHOLD_C,
    HIGH_TEMP_SUSTAINED_DELAY_SEC: config.HIGH_TEMP_SUSTAINED_DELAY_SEC
  };

  const prevInstant = state.alertState.instant.fired;
  const prevSustained = state.alertState.sustained.fired;

  // updateHighTempAlerts mutates alertState in place
  updateHighTempAlerts(event.airTemp, t, state.alertState, alertConfig);

  if (state.alertState.instant.fired && !prevInstant) {
    commands.push({
      type: 'log',
      level: 2,
      message: "HIGH TEMP INSTANT: " + (event.airTemp !== null ? event.airTemp.toFixed(1) : "?") + "C exceeded " + config.HIGH_TEMP_INSTANT_THRESHOLD_C + "C"
    });
    state.dailyState.highTempCount++;
  }

  if (state.alertState.sustained.fired && !prevSustained) {
    commands.push({
      type: 'log',
      level: 2,
      message: "HIGH TEMP SUSTAINED: " + (event.airTemp !== null ? event.airTemp.toFixed(1) : "?") + "C exceeded " + config.HIGH_TEMP_SUSTAINED_THRESHOLD_C + "C"
    });
    state.dailyState.highTempCount++;
  }

  if (!state.alertState.instant.fired && prevInstant) {
    commands.push({ type: 'log', level: 1, message: "High temp instant alert recovered" });
  }
  if (!state.alertState.sustained.fired && prevSustained) {
    commands.push({ type: 'log', level: 1, message: "High temp sustained alert recovered" });
  }

  // Adaptive hysteresis
  const dutyPercent = getDutyPercent(event.dutyOnSec, event.dutyOffSec);

  const adaptiveResult = calculateAdaptiveShift(dutyPercent, state.currentShift, config as any);

  if (adaptiveResult.changed) {
    state.currentShift = adaptiveResult.newShift;
    state.dynOnAbove = config.SETPOINT_C + config.HYSTERESIS_C + adaptiveResult.newShift;
    state.dynOffBelow = config.SETPOINT_C - config.HYSTERESIS_C - adaptiveResult.newShift;

    commands.push({
      type: 'adjust_hysteresis',
      onAbove: state.dynOnAbove,
      offBelow: state.dynOffBelow
    });

    commands.push({
      type: 'log',
      level: 0,
      message: "Adaptive: duty=" + dutyPercent.toFixed(1) + "%, shift=" + adaptiveResult.newShift.toFixed(2) + "C"
    });
  }

  // Performance metrics
  const loopEndSec = nowFn();
  const perfResult = trackLoopExecution(state.perfState, event.loopStartSec, loopEndSec, config.PERF_SLOW_LOOP_THRESHOLD_MS);

  state.perfState = perfResult.performance;

  if (perfResult.wasSlow && config.PERF_WARN_SLOW_LOOPS) {
    commands.push({
      type: 'log',
      level: 2,
      message: "Slow loop: " + (perfResult.loopTime * 1000).toFixed(2) + "ms"
    });
  }

  if (loopEndSec - state.lastPerfLog >= config.PERF_LOG_INTERVAL_SEC) {
    commands.push({
      type: 'log',
      level: 1,
      message: formatPerformanceSummary(state.perfState)
    });
    state.lastPerfLog = loopEndSec;
  }

  // Daily summary
  const summaryCheck = shouldGenerateSummary(t, state.dailyState.lastDailySummaryDate || "", config.DAILY_SUMMARY_HOUR);

  if (summaryCheck.shouldGenerate) {
    const summary = calculateSummary({
      dayOnSec: state.dailyState.dayOnSec,
      dayOffSec: state.dailyState.dayOffSec,
      dayAirMin: state.dailyState.dayAirMin,
      dayAirMax: state.dailyState.dayAirMax,
      dayAirSum: state.dailyState.dayAirSum,
      dayAirCount: state.dailyState.dayAirCount,
      dayEvapMin: state.dailyState.dayEvapMin,
      dayEvapMax: state.dailyState.dayEvapMax,
      dayEvapSum: state.dailyState.dayEvapSum,
      dayEvapCount: state.dailyState.dayEvapCount,
      freezeCount: state.dailyState.freezeCount,
      highTempCount: state.dailyState.highTempCount
    });

    commands.push({
      type: 'daily_summary',
      summary: formatDailySummary(summary, summaryCheck.currentDate)
    });

    // Reset daily stats
    state.dailyState.dayOnSec = 0;
    state.dailyState.dayOffSec = 0;
    state.dailyState.dayAirMin = null;
    state.dailyState.dayAirMax = null;
    state.dailyState.dayAirSum = 0;
    state.dailyState.dayAirCount = 0;
    state.dailyState.dayEvapMin = null;
    state.dailyState.dayEvapMax = null;
    state.dailyState.dayEvapSum = 0;
    state.dailyState.dayEvapCount = 0;
    state.dailyState.freezeCount = 0;
    state.dailyState.highTempCount = 0;
    state.dailyState.lastDailySummaryDate = summaryCheck.currentDate;
  }

  // Duty cycle reset check
  if (shouldResetDutyCycle(t, state.dutyLastReset, config.DUTY_INTERVAL_SEC)) {
    commands.push({
      type: 'log',
      level: 1,
      message: "Duty cycle: " + dutyPercent.toFixed(1) + "% (on=" + (event.dutyOnSec / 60).toFixed(1) + "m, off=" + (event.dutyOffSec / 60).toFixed(1) + "m)"
    });
    state.dutyLastReset = t;
  }

  return { commands, state: state };
}
