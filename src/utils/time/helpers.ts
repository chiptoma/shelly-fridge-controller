/**
 * Time helper functions
 */

/**
 * Calculate time delta with bounds checking
 * @param currentTime - Current timestamp
 * @param lastTime - Last timestamp
 * @param loopPeriodMs - Expected loop period in milliseconds
 * @returns Time delta in seconds
 */
export function calculateTimeDelta(
  currentTime: number,
  lastTime: number,
  loopPeriodMs: number
): number {
  if (lastTime === 0) {
    return loopPeriodMs / 1000;
  }

  const dt = currentTime - lastTime;

  // Handle clock issues
  if (dt <= 0) {
    return loopPeriodMs / 1000; // Use estimated timing
  }

  return dt;
}
