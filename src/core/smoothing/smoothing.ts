/**
 * Temperature smoothing logic
 * Implements moving average filter for sensor readings
 */

/**
 * Update moving average buffer with new value
 * @param buffer - Circular buffer of temperature readings
 * @param newValue - New temperature reading to add
 * @param windowSizeSec - Window size in seconds
 * @param loopPeriodMs - Control loop period in milliseconds
 * @returns Smoothed temperature value
 */
export function updateMovingAverage(
  buffer: number[],
  newValue: number,
  windowSizeSec: number,
  loopPeriodMs: number
): number {
  const maxSamples = Math.ceil((windowSizeSec * 1000) / loopPeriodMs);

  // Add new value
  buffer.push(newValue);

  // Trim buffer
  while (buffer.length > maxSamples) {
    buffer.shift();
  }

  // Calculate average
  const sum = buffer.reduce((a, b) => a + b, 0);
  return sum / buffer.length;
}

/**
 * Check if buffer has reached full capacity
 * @param buffer - Circular buffer of temperature readings
 * @param windowSizeSec - Window size in seconds
 * @param loopPeriodMs - Control loop period in milliseconds
 * @returns True if buffer is full
 */
export function isBufferFull(
  buffer: number[],
  windowSizeSec: number,
  loopPeriodMs: number
): boolean {
  const maxSamples = Math.ceil((windowSizeSec * 1000) / loopPeriodMs);
  return buffer.length >= maxSamples;
}

/**
 * Calculate maximum samples for given configuration
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
