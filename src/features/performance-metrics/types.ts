/**
 * Performance metrics state
 *
 * Tracks control loop execution statistics for performance monitoring and
 * slow loop detection.
 */
export interface PerformanceState {
  /** Total number of control loops executed since boot */
  loopCount: number;

  /** Cumulative loop execution time (seconds) for average calculation */
  loopTimeSum: number;

  /** Maximum loop execution time (seconds) recorded */
  loopTimeMax: number;

  /** Minimum loop execution time (seconds) recorded */
  loopTimeMin: number;

  /** Count of loops that exceeded PERF_SLOW_LOOP_THRESHOLD_MS */
  slowLoopCount: number;

  /** Timestamp (seconds) when performance metrics were last logged */
  lastPerfLog: number;
}

/**
 * Result of loop execution tracking
 *
 * Contains updated performance state after tracking a single loop execution.
 */
export interface LoopTrackingResult {
  /** Updated performance state */
  performance: PerformanceState;

  /** Whether this loop was slow (exceeded threshold) */
  wasSlow: boolean;

  /** Execution time of this loop (seconds) */
  loopTime: number;
}
