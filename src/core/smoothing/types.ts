/**
 * Smoothing feature type definitions
 */

/**
 * Configuration for smoothing algorithm
 */
export interface SmoothingConfig {
  /** Window size in seconds for moving average */
  windowSizeSec: number;

  /** Control loop period in milliseconds */
  loopPeriodMs: number;
}

/**
 * Result of smoothing operation
 */
export interface SmoothingResult {
  /** Smoothed temperature value */
  value: number;

  /** Number of samples currently in buffer */
  sampleCount: number;

  /** Whether buffer has reached full capacity */
  bufferFull: boolean;
}
