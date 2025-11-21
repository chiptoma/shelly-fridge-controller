/**
 * Time utility functions
 */

/**
 * Get current Unix timestamp in seconds
 * @returns Current time in seconds since epoch
 */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get current timestamp in milliseconds
 * @returns Current time in milliseconds since epoch
 */
export function nowMs(): number {
  return Date.now();
}
