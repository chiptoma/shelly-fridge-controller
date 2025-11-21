/**
 * Daily summary statistics tracking
 *
 * Aggregates temperature readings and compressor runtime over a 24-hour period
 * for monitoring and alerting purposes.
 */

import type { TemperatureReading } from '$types/common';
import type { DailyState, SummaryResult, SummaryCheckResult } from './types';
import { updateMinMax, formatDateISO, formatTemp } from './helpers';

const SECONDS_PER_HOUR = 3600;

/**
 * Update daily temperature statistics (MUTABLE)
 *
 * Mutates dailyState in-place for memory efficiency on constrained devices.
 *
 * @param dailyState - Current daily state (will be mutated)
 * @param airRaw - Raw air temperature
 * @param evapRaw - Raw evaporator temperature
 * @returns The same state object (for convenience)
 */
export function updateDailyStats(
  dailyState: DailyState,
  airRaw: TemperatureReading,
  evapRaw: TemperatureReading
): DailyState {
  if (!dailyState) return dailyState;

  const airStats = updateMinMax(airRaw, dailyState.dayAirMin, dailyState.dayAirMax);
  const evapStats = updateMinMax(evapRaw, dailyState.dayEvapMin, dailyState.dayEvapMax);

  dailyState.dayAirMin = airStats.min;
  dailyState.dayAirMax = airStats.max;
  dailyState.dayAirSum = dailyState.dayAirSum + (airRaw ?? 0);
  dailyState.dayAirCount = dailyState.dayAirCount + (airRaw !== null ? 1 : 0);
  dailyState.dayEvapMin = evapStats.min;
  dailyState.dayEvapMax = evapStats.max;
  dailyState.dayEvapSum = dailyState.dayEvapSum + (evapRaw ?? 0);
  dailyState.dayEvapCount = dailyState.dayEvapCount + (evapRaw !== null ? 1 : 0);

  return dailyState;
}

/**
 * Update daily runtime statistics (MUTABLE)
 *
 * Mutates dailyState in-place for memory efficiency on constrained devices.
 *
 * @param dailyState - Current daily state (will be mutated)
 * @param dt - Time delta in seconds
 * @param relayOn - Whether relay is ON
 * @returns The same state object (for convenience)
 */
export function updateDailyRuntime(
  dailyState: DailyState,
  dt: number,
  relayOn: boolean
): DailyState {
  if (!dailyState || dt <= 0) {
    return dailyState;
  }

  dailyState.dayOnSec = dailyState.dayOnSec + (relayOn ? dt : 0);
  dailyState.dayOffSec = dailyState.dayOffSec + (relayOn ? 0 : dt);

  return dailyState;
}

/**
 * Check if daily summary should be generated
 *
 * Summary is generated once per day at the configured hour to capture
 * the previous day's statistics before reset.
 *
 * @param now - Current timestamp in seconds
 * @param lastDate - Last summary date (YYYY-MM-DD format)
 * @param summaryHour - Hour of day to generate summary (0-23)
 * @returns Result with shouldGenerate flag and currentDate
 */
export function shouldGenerateSummary(
  now: number,
  lastDate: string,
  summaryHour: number
): SummaryCheckResult {
  const currentDate = formatDateISO(now);
  const currentHour = new Date(now * 1000).getHours();

  const shouldGenerate = currentHour === summaryHour && lastDate !== currentDate;

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
  const avgAir = dailyState.dayAirCount > 0
    ? dailyState.dayAirSum / dailyState.dayAirCount
    : null;
  const avgEvap = dailyState.dayEvapCount > 0
    ? dailyState.dayEvapSum / dailyState.dayEvapCount
    : null;

  return {
    onHours: dailyState.dayOnSec / SECONDS_PER_HOUR,
    offHours: dailyState.dayOffSec / SECONDS_PER_HOUR,
    dutyPct,
    airMin: dailyState.dayAirMin,
    airMax: dailyState.dayAirMax,
    airAvg: avgAir,
    evapMin: dailyState.dayEvapMin,
    evapMax: dailyState.dayEvapMax,
    evapAvg: avgEvap,
    freezeCount: dailyState.freezeCount,
    highTempCount: dailyState.highTempCount,
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
    highTempCount: 0,
  };
}

/**
 * Format daily summary for logging
 * @param summary - Calculated summary statistics
 * @param date - Date string (YYYY-MM-DD format)
 * @returns Formatted summary string
 */
export function formatDailySummary(summary: SummaryResult, date: string): string {
  return `Daily Summary (${date}): ` +
    `ON ${summary.onHours.toFixed(1)}h (${summary.dutyPct.toFixed(0)}%), ` +
    `Air ${formatTemp(summary.airMin)}/${formatTemp(summary.airMax)}/${formatTemp(summary.airAvg)}C, ` +
    `Evap ${formatTemp(summary.evapMin)}/${formatTemp(summary.evapMax)}/${formatTemp(summary.evapAvg)}C, ` +
    `Freeze ${summary.freezeCount}, HighTemp ${summary.highTempCount}`;
}
