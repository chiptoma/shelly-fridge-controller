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

import type { SmoothingConfig, SmoothingBufferState } from './types';
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
 * Update moving average buffer with new value (MUTABLE)
 *
 * Mutates the buffer in-place for memory efficiency on constrained devices.
 *
 * @param buffer - Current buffer state (will be mutated)
 * @param newValue - New temperature reading to add
 * @param config - Smoothing configuration
 * @returns Object with smoothed value and buffer full status
 * @throws {Error} If inputs are invalid
 */
export function updateMovingAverage(
  buffer: SmoothingBufferState,
  newValue: number,
  config: SmoothingConfig
): { value: number; bufferFull: boolean } {
  validateSmoothingConfig(config);
  validateTemperatureValue(newValue, 'updateMovingAverage');

  const maxSamples = getMaxSamples(config.windowSizeSec, config.loopPeriodMs);

  // Add new value to end
  buffer.samples.push(newValue);

  // Remove from front if exceeding max - use splice since shift() not available in Shelly ES5
  while (buffer.samples.length > maxSamples) {
    buffer.samples.splice(0, 1);
  }

  // Calculate average - manual sum for Shelly compatibility
  let sum = 0;
  for (let j = 0; j < buffer.samples.length; j++) {
    sum += buffer.samples[j];
  }
  const average = sum / buffer.samples.length;

  return {
    value: average,
    bufferFull: buffer.samples.length >= maxSamples
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
