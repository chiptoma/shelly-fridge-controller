/**
 * Daily summary statistics tracking
 */

import type { TemperatureReading } from '$types/common';
import type { DailyState, SummaryResult, SummaryCheckResult } from './types';

/**
 * Update daily temperature statistics
 * @param dailyState - Current daily state
 * @param airRaw - Raw air temperature
 * @param evapRaw - Raw evaporator temperature
 * @returns Updated daily state
 */
export function updateDailyStats(
  dailyState: DailyState,
  airRaw: TemperatureReading,
  evapRaw: TemperatureReading
): DailyState {
  if (!dailyState) return dailyState;

  // Update air stats
  if (airRaw !== null) {
    if (dailyState.dayAirMin === null || airRaw < dailyState.dayAirMin) {
      dailyState.dayAirMin = airRaw;
    }
    if (dailyState.dayAirMax === null || airRaw > dailyState.dayAirMax) {
      dailyState.dayAirMax = airRaw;
    }
    dailyState.dayAirSum += airRaw;
    dailyState.dayAirCount += 1;
  }

  // Update evap stats
  if (evapRaw !== null) {
    if (dailyState.dayEvapMin === null || evapRaw < dailyState.dayEvapMin) {
      dailyState.dayEvapMin = evapRaw;
    }
    if (dailyState.dayEvapMax === null || evapRaw > dailyState.dayEvapMax) {
      dailyState.dayEvapMax = evapRaw;
    }
    dailyState.dayEvapSum += evapRaw;
    dailyState.dayEvapCount += 1;
  }

  return dailyState;
}

/**
 * Update daily runtime statistics
 * @param dailyState - Current daily state
 * @param dt - Time delta in seconds
 * @param relayOn - Whether relay is ON
 * @returns Updated daily state
 */
export function updateDailyRuntime(
  dailyState: DailyState,
  dt: number,
  relayOn: boolean
): DailyState {
  if (!dailyState || dt <= 0) {
    return dailyState;
  }

  if (relayOn) {
    dailyState.dayOnSec += dt;
  } else {
    dailyState.dayOffSec += dt;
  }

  return dailyState;
}

/**
 * Check if daily summary should be generated
 * @param now - Current timestamp
 * @param lastDate - Last summary date (YYYY-MM-DD format)
 * @param summaryHour - Hour of day to generate summary (0-23)
 * @returns Result with shouldGenerate flag and currentDate
 */
export function shouldGenerateSummary(
  now: number,
  lastDate: string,
  summaryHour: number
): SummaryCheckResult {
  const d = new Date(now * 1000);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const currentDate = d.getFullYear() + "-" +
                     (month < 10 ? "0" + month : month) + "-" +
                     (day < 10 ? "0" + day : day);
  const currentHour = d.getHours();

  const shouldGenerate = (currentHour === summaryHour && lastDate !== currentDate);

  return { shouldGenerate, currentDate };
}

/**
 * Calculate summary statistics
 * @param dailyState - Daily state object
 * @returns Calculated summary statistics
 */
export function calculateSummary(dailyState: DailyState): SummaryResult {
  const total = dailyState.dayOnSec + dailyState.dayOffSec;
  const dutyPct = total > 0 ? (dailyState.dayOnSec / total) * 100.0 : 0.0;
  const avgAir = dailyState.dayAirCount > 0 ? (dailyState.dayAirSum / dailyState.dayAirCount) : null;
  const avgEvap = dailyState.dayEvapCount > 0 ? (dailyState.dayEvapSum / dailyState.dayEvapCount) : null;

  return {
    onHours: dailyState.dayOnSec / 3600,
    offHours: dailyState.dayOffSec / 3600,
    dutyPct,
    airMin: dailyState.dayAirMin,
    airMax: dailyState.dayAirMax,
    airAvg: avgAir,
    evapMin: dailyState.dayEvapMin,
    evapMax: dailyState.dayEvapMax,
    evapAvg: avgEvap,
    freezeCount: dailyState.freezeCount,
    highTempCount: dailyState.highTempCount
  };
}

/**
 * Reset daily statistics
 * @returns Fresh daily state
 */
export function resetDailyStats(): DailyState {
  return {
    dayAirMin: null,
    dayAirMax: null,
    dayAirSum: 0,
    dayAirCount: 0,
    dayEvapMin: null,
    dayEvapMax: null,
    dayEvapSum: 0,
    dayEvapCount: 0,
    dayOnSec: 0,
    dayOffSec: 0,
    freezeCount: 0,
    highTempCount: 0
  };
}

/**
 * Format daily summary for logging
 * @param summary - Calculated summary statistics
 * @param date - Date string (YYYY-MM-DD format)
 * @returns Formatted summary string
 */
export function formatDailySummary(summary: SummaryResult, date: string): string {
  return "Daily Summary (" + date + "): " +
    "ON " + summary.onHours.toFixed(1) + "h (" + summary.dutyPct.toFixed(0) + "%), " +
    "Air " + (summary.airMin !== null ? summary.airMin.toFixed(1) : "n/a") + "/" +
    (summary.airMax !== null ? summary.airMax.toFixed(1) : "n/a") + "/" +
    (summary.airAvg !== null ? summary.airAvg.toFixed(1) : "n/a") + "C, " +
    "Evap " + (summary.evapMin !== null ? summary.evapMin.toFixed(1) : "n/a") + "/" +
    (summary.evapMax !== null ? summary.evapMax.toFixed(1) : "n/a") + "/" +
    (summary.evapAvg !== null ? summary.evapAvg.toFixed(1) : "n/a") + "C, " +
    "Freeze " + summary.freezeCount + ", HighTemp " + summary.highTempCount;
}
