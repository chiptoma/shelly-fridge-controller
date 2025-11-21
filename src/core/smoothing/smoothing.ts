/**
 * Temperature smoothing logic
 *
 * Implements moving average filter for sensor readings.
 *
 * ## Business Context
 * Raw sensor readings contain noise from:
 * - Electrical interference
 * - Sensor resolution limits
 * - Air currents near sensor
 *
 * Smoothing prevents false thermostat triggers by averaging readings
 * over a time window. Longer windows = more stable but slower response.
 */

import type { SmoothingConfig, SmoothingBufferState, SmoothingResult } from './types';
import { validateSmoothingConfig, validateTemperatureValue } from './helpers';

/**
 * Calculate maximum samples for given configuration
 *
 * @param windowSizeSec - Window size in seconds
 * @param loopPeriodMs - Control loop period in milliseconds
 * @returns Maximum number of samples in buffer
 */
export function getMaxSamples(
  windowSizeSec: number,
  loopPeriodMs: number
): number {
  return Math.ceil((windowSizeSec * 1000) / loopPeriodMs);
}

/**
 * Create empty buffer state
 *
 * @returns Empty buffer state
 */
export function createEmptyBuffer(): SmoothingBufferState {
  return { samples: [] };
}

/**
 * Update moving average buffer with new value (IMMUTABLE)
 *
 * Returns a new buffer and smoothed value without mutating the input.
 *
 * @param buffer - Current buffer state
 * @param newValue - New temperature reading to add
 * @param config - Smoothing configuration
 * @returns Smoothing result with new buffer and value
 * @throws {Error} If inputs are invalid
 */
export function updateMovingAverage(
  buffer: SmoothingBufferState,
  newValue: number,
  config: SmoothingConfig
): SmoothingResult {
  validateSmoothingConfig(config);
  validateTemperatureValue(newValue, 'updateMovingAverage');

  const maxSamples = getMaxSamples(config.windowSizeSec, config.loopPeriodMs);

  // Create new samples array (immutable)
  let newSamples = [...buffer.samples, newValue];

  // Trim from front if exceeding max
  if (newSamples.length > maxSamples) {
    newSamples = newSamples.slice(newSamples.length - maxSamples);
  }

  // Calculate average
  const sum = newSamples.reduce((a, b) => a + b, 0);
  const average = sum / newSamples.length;

  return {
    buffer: { samples: newSamples },
    value: average,
    sampleCount: newSamples.length,
    bufferFull: newSamples.length >= maxSamples
  };
}

/**
 * Check if buffer has reached full capacity
 *
 * @param buffer - Current buffer state
 * @param config - Smoothing configuration
 * @returns True if buffer is full
 */
export function isBufferFull(
  buffer: SmoothingBufferState,
  config: SmoothingConfig
): boolean {
  validateSmoothingConfig(config);
  const maxSamples = getMaxSamples(config.windowSizeSec, config.loopPeriodMs);
  return buffer.samples.length >= maxSamples;
}
