/**
 * Features Script Entry Point
 *
 * This is Script 2 - contains optional analytics and tuning:
 * - Duty cycle tracking
 * - Daily summary calculation
 * - Adaptive hysteresis computation
 * - Performance metrics
 * - High temperature alert detection
 *
 * Listens to state events from core script.
 * Sends commands back to core for logging/Slack/hysteresis adjustments.
 */

import { getDutyPercent, shouldResetDutyCycle } from '@features/duty-cycle';
import { calculateAdaptiveShift } from '@features/adaptive-hysteresis';
import { updateHighTempAlerts } from '@features/high-temp-alerts';
import { trackLoopExecution, initPerformanceState, formatPerformanceSummary } from '@features/performance-metrics';
import {
  updateDailyStats,
  updateDailyRuntime,
  shouldGenerateSummary,
  calculateSummary,
  formatDailySummary
} from '@features/daily-summary';
import { now } from '@utils/time';

import type { FridgeStateEvent, FridgeCommandEvent } from '@events/types';
import { EVENT_NAMES } from '@events/types';

declare const Shelly: {
  emitEvent: (name: string, data: unknown) => void;
  addEventHandler: (callback: (event: { name: string; info: unknown }) => void) => void;
};

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION (subset needed by features)
// ═══════════════════════════════════════════════════════════════

const FEATURES_CONFIG = {
  // Setpoint and hysteresis for adaptive calculations
  SETPOINT_C: 4.0,
  HYSTERESIS_C: 1.0,

  // Adaptive hysteresis
  ADAPTIVE_LOW_DUTY_PCT: 30,
  ADAPTIVE_HIGH_DUTY_PCT: 70,
  ADAPTIVE_MAX_SHIFT_C: 0.5,
  ADAPTIVE_MIN_SHIFT_C: 0,
  ADAPTIVE_SHIFT_STEP_C: 0.1,

  // High temp alerts
  HIGH_TEMP_INSTANT_THRESHOLD_C: 10.0,
  HIGH_TEMP_INSTANT_DELAY_SEC: 180,
  HIGH_TEMP_SUSTAINED_THRESHOLD_C: 10.0,
  HIGH_TEMP_SUSTAINED_DELAY_SEC: 600,

  // Performance
  PERF_SLOW_LOOP_THRESHOLD_MS: 250,
  PERF_LOG_INTERVAL_SEC: 3600,
  PERF_WARN_SLOW_LOOPS: false,

  // Daily summary
  DAILY_SUMMARY_HOUR: 7,

  // Duty cycle
  DUTY_INTERVAL_SEC: 3600
};

// ═══════════════════════════════════════════════════════════════
// FEATURE STATE
// ═══════════════════════════════════════════════════════════════

// Daily summary state
const dailyState = {
  dayOnSec: 0,
  dayOffSec: 0,
  dayAirMin: null as number | null,
  dayAirMax: null as number | null,
  dayAirSum: 0,
  dayAirCount: 0,
  dayEvapMin: null as number | null,
  dayEvapMax: null as number | null,
  dayEvapSum: 0,
  dayEvapCount: 0,
  freezeCount: 0,
  highTempCount: 0
};

// Track daily summary separately
let lastDailySummaryDate: string | null = null;

// Adaptive hysteresis state
let currentShift = 0;
let dynOnAbove = FEATURES_CONFIG.SETPOINT_C + FEATURES_CONFIG.HYSTERESIS_C;
let dynOffBelow = FEATURES_CONFIG.SETPOINT_C - FEATURES_CONFIG.HYSTERESIS_C;

// High temp alerts state (pre-allocated for memory efficiency)
const alertState = {
  instant: { startTime: 0, fired: false },
  sustained: { startTime: 0, fired: false },
  justFired: false
};

// Performance metrics state
let perfState = initPerformanceState();
let lastPerfLog = 0;

// Duty cycle state
let dutyLastReset = 0;

// ═══════════════════════════════════════════════════════════════
// HELPER: Send command to core
// ═══════════════════════════════════════════════════════════════

function sendCommand(command: FridgeCommandEvent): void {
  Shelly.emitEvent(EVENT_NAMES.COMMAND, command);
}

function log(level: number, message: string): void {
  sendCommand({ type: 'log', level: level, message: message });
}

// ═══════════════════════════════════════════════════════════════
// PROCESS STATE EVENT
// ═══════════════════════════════════════════════════════════════

function processStateEvent(event: FridgeStateEvent): void {
  const t = event.timestamp;

  // ─────────────────────────────────────────────────────────────
  // Update daily statistics
  // ─────────────────────────────────────────────────────────────
  updateDailyStats(dailyState, event.airRaw, event.evapRaw);
  updateDailyRuntime(dailyState, event.dt, event.relayOn);

  // Track freeze events
  if (event.freezeLocked) {
    // This is simplified - would need state tracking for transitions
  }

  // ─────────────────────────────────────────────────────────────
  // High temperature alerts
  // ─────────────────────────────────────────────────────────────
  const alertConfig = {
    HIGH_TEMP_INSTANT_THRESHOLD_C: FEATURES_CONFIG.HIGH_TEMP_INSTANT_THRESHOLD_C,
    HIGH_TEMP_INSTANT_DELAY_SEC: FEATURES_CONFIG.HIGH_TEMP_INSTANT_DELAY_SEC,
    HIGH_TEMP_SUSTAINED_THRESHOLD_C: FEATURES_CONFIG.HIGH_TEMP_SUSTAINED_THRESHOLD_C,
    HIGH_TEMP_SUSTAINED_DELAY_SEC: FEATURES_CONFIG.HIGH_TEMP_SUSTAINED_DELAY_SEC
  };

  const prevInstant = alertState.instant.fired;
  const prevSustained = alertState.sustained.fired;

  // updateHighTempAlerts mutates alertState in place
  updateHighTempAlerts(event.airTemp, t, alertState, alertConfig);

  if (alertState.instant.fired && !prevInstant) {
    log(2, "HIGH TEMP INSTANT: " + (event.airTemp !== null ? event.airTemp.toFixed(1) : "?") + "C exceeded " + FEATURES_CONFIG.HIGH_TEMP_INSTANT_THRESHOLD_C + "C");
    dailyState.highTempCount++;
  }

  if (alertState.sustained.fired && !prevSustained) {
    log(2, "HIGH TEMP SUSTAINED: " + (event.airTemp !== null ? event.airTemp.toFixed(1) : "?") + "C exceeded " + FEATURES_CONFIG.HIGH_TEMP_SUSTAINED_THRESHOLD_C + "C");
    dailyState.highTempCount++;
  }

  if (!alertState.instant.fired && prevInstant) {
    log(1, "High temp instant alert recovered");
  }
  if (!alertState.sustained.fired && prevSustained) {
    log(1, "High temp sustained alert recovered");
  }

  // ─────────────────────────────────────────────────────────────
  // Adaptive hysteresis
  // ─────────────────────────────────────────────────────────────
  const dutyPercent = getDutyPercent(event.dutyOnSec, event.dutyOffSec);

  const adaptiveResult = calculateAdaptiveShift(dutyPercent, currentShift, FEATURES_CONFIG as any);

  if (adaptiveResult.changed) {
    currentShift = adaptiveResult.newShift;
    dynOnAbove = FEATURES_CONFIG.SETPOINT_C + FEATURES_CONFIG.HYSTERESIS_C + adaptiveResult.newShift;
    dynOffBelow = FEATURES_CONFIG.SETPOINT_C - FEATURES_CONFIG.HYSTERESIS_C - adaptiveResult.newShift;

    // Send updated thresholds to core
    sendCommand({
      type: 'adjust_hysteresis',
      onAbove: dynOnAbove,
      offBelow: dynOffBelow
    });

    log(0, "Adaptive: duty=" + dutyPercent.toFixed(1) + "%, shift=" + adaptiveResult.newShift.toFixed(2) + "C");
  }

  // ─────────────────────────────────────────────────────────────
  // Performance metrics
  // ─────────────────────────────────────────────────────────────
  const loopEndSec = now();
  const perfResult = trackLoopExecution(perfState, event.loopStartSec, loopEndSec, FEATURES_CONFIG.PERF_SLOW_LOOP_THRESHOLD_MS);

  perfState = perfResult.performance;

  if (perfResult.wasSlow && FEATURES_CONFIG.PERF_WARN_SLOW_LOOPS) {
    log(2, "Slow loop: " + (perfResult.loopTime * 1000).toFixed(2) + "ms");
  }

  if (loopEndSec - lastPerfLog >= FEATURES_CONFIG.PERF_LOG_INTERVAL_SEC) {
    log(1, formatPerformanceSummary(perfState));
    lastPerfLog = loopEndSec;
  }

  // ─────────────────────────────────────────────────────────────
  // Daily summary
  // ─────────────────────────────────────────────────────────────
  const summaryCheck = shouldGenerateSummary(t, lastDailySummaryDate || "", FEATURES_CONFIG.DAILY_SUMMARY_HOUR);

  if (summaryCheck.shouldGenerate) {
    const summary = calculateSummary({
      dayOnSec: dailyState.dayOnSec,
      dayOffSec: dailyState.dayOffSec,
      dayAirMin: dailyState.dayAirMin,
      dayAirMax: dailyState.dayAirMax,
      dayAirSum: dailyState.dayAirSum,
      dayAirCount: dailyState.dayAirCount,
      dayEvapMin: dailyState.dayEvapMin,
      dayEvapMax: dailyState.dayEvapMax,
      dayEvapSum: dailyState.dayEvapSum,
      dayEvapCount: dailyState.dayEvapCount,
      freezeCount: dailyState.freezeCount,
      highTempCount: dailyState.highTempCount
    });

    // Send formatted summary to core for logging
    sendCommand({
      type: 'daily_summary',
      summary: formatDailySummary(summary, summaryCheck.currentDate)
    });

    // Reset daily stats
    dailyState.dayOnSec = 0;
    dailyState.dayOffSec = 0;
    dailyState.dayAirMin = null;
    dailyState.dayAirMax = null;
    dailyState.dayAirSum = 0;
    dailyState.dayAirCount = 0;
    dailyState.dayEvapMin = null;
    dailyState.dayEvapMax = null;
    dailyState.dayEvapSum = 0;
    dailyState.dayEvapCount = 0;
    dailyState.freezeCount = 0;
    dailyState.highTempCount = 0;
    lastDailySummaryDate = summaryCheck.currentDate;
  }

  // ─────────────────────────────────────────────────────────────
  // Duty cycle reset check
  // ─────────────────────────────────────────────────────────────
  if (shouldResetDutyCycle(t, dutyLastReset, FEATURES_CONFIG.DUTY_INTERVAL_SEC)) {
    log(1, "Duty cycle: " + dutyPercent.toFixed(1) + "% (on=" + (event.dutyOnSec / 60).toFixed(1) + "m, off=" + (event.dutyOffSec / 60).toFixed(1) + "m)");
    dutyLastReset = t;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN: Setup event listener
// ═══════════════════════════════════════════════════════════════

Shelly.addEventHandler(function(event) {
  if (event.name === EVENT_NAMES.STATE) {
    processStateEvent(event.info as FridgeStateEvent);
  }
});

// Log startup
sendCommand({
  type: 'log',
  level: 1,
  message: 'Features script initialized'
});
