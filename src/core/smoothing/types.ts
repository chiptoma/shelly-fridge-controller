/**
 * Smoothing feature type definitions
 *
 * Temperature smoothing reduces sensor noise using a moving average filter.
 * This prevents false thermostat triggers from momentary temperature spikes.
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
 * Smoothing buffer state (mutable for memory efficiency)
 */
export interface SmoothingBufferState {
  /** Array of temperature readings */
  samples: number[];
}

/**
 * Result of smoothing operation
 */
export interface SmoothingResult {
  /** New buffer state (immutable) */
  buffer: SmoothingBufferState;

  /** Smoothed temperature value */
  value: number;

  /** Number of samples currently in buffer */
  sampleCount: number;

  /** Whether buffer has reached full capacity */
  bufferFull: boolean;
}
