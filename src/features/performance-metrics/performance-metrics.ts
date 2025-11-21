/**
 * Performance metrics tracking
 * Tracks control loop execution time and detects slow loops
 */

import type { PerformanceState, LoopTrackingResult } from './types';

/**
 * Track loop execution and update performance metrics
 *
 * Records loop execution time and updates cumulative performance statistics.
 * Detects slow loops based on configured threshold.
 *
 * @param performance - Current performance state
 * @param loopStartSec - Loop start timestamp in seconds
 * @param loopEndSec - Loop end timestamp in seconds
 * @param slowThresholdMs - Slow loop threshold in milliseconds (PERF_SLOW_LOOP_THRESHOLD_MS)
 * @returns Updated performance state with tracking result
 *
 * @remarks
 * **Loop Time Calculation**: `loopTime = loopEndSec - loopStartSec` (in seconds)
 *
 * **Slow Loop Detection**: Loop is "slow" if `loopTime * 1000 > slowThresholdMs`
 *
 * **Min/Max Tracking**: Updates `loopTimeMin` and `loopTimeMax` if new extremes found.
 * Initial `loopTimeMin` should be set to `Infinity` so first loop sets it correctly.
 *
 * @example
 * ```typescript
 * const result = trackLoopExecution(
 *   state.performance,
 *   loopStartSec,
 *   nowSec(),
 *   500  // 500ms threshold
 * );
 *
 * state.performance = result.performance;
 *
 * if (result.wasSlow) {
 *   console.log(`Slow loop detected: ${(result.loopTime * 1000).toFixed(2)}ms`);
 * }
 * ```
 */
export function trackLoopExecution(
  performance: PerformanceState,
  loopStartSec: number,
  loopEndSec: number,
  slowThresholdMs: number
): LoopTrackingResult {
  // Calculate loop execution time in seconds
  const loopTime = loopEndSec - loopStartSec;
  const loopTimeMs = loopTime * 1000;

  // Check if this loop was slow
  const wasSlow = loopTimeMs > slowThresholdMs;

  // Update performance metrics
  const newPerformance: PerformanceState = {
    loopCount: performance.loopCount + 1,
    loopTimeSum: performance.loopTimeSum + loopTime,
    loopTimeMax: Math.max(performance.loopTimeMax, loopTime),
    loopTimeMin: Math.min(performance.loopTimeMin, loopTime),
    slowLoopCount: performance.slowLoopCount + (wasSlow ? 1 : 0),
    lastPerfLog: performance.lastPerfLog
  };

  return {
    performance: newPerformance,
    wasSlow,
    loopTime
  };
}

/**
 * Generate performance summary string for logging
 *
 * Creates a formatted summary of performance metrics including average, min, max
 * loop times and slow loop count.
 *
 * @param performance - Current performance state
 * @returns Formatted performance summary string
 *
 * @remarks
 * **Average Calculation**: `avgTime = loopTimeSum / loopCount` (in milliseconds)
 *
 * **Slow Loop Percentage**: `slowPct = (slowLoopCount / loopCount) * 100`
 *
 * @example
 * ```typescript
 * const summary = formatPerformanceSummary(state.performance);
 * console.log(summary);
 * // Output: "Performance: 1234 loops, avg=4.2ms, min=2.1ms, max=15.3ms, slow=5 (0.4%)"
 * ```
 */
export function formatPerformanceSummary(performance: PerformanceState): string {
  if (performance.loopCount === 0) {
    return 'Performance: No loops executed yet';
  }

  const avgTimeMs = (performance.loopTimeSum / performance.loopCount) * 1000;
  const minTimeMs = performance.loopTimeMin * 1000;
  const maxTimeMs = performance.loopTimeMax * 1000;
  const slowPct = (performance.slowLoopCount / performance.loopCount) * 100;

  return `Performance: ${performance.loopCount} loops, ` +
    `avg=${avgTimeMs.toFixed(1)}ms, ` +
    `min=${minTimeMs.toFixed(1)}ms, ` +
    `max=${maxTimeMs.toFixed(1)}ms, ` +
    `slow=${performance.slowLoopCount} (${slowPct.toFixed(1)}%)`;
}
