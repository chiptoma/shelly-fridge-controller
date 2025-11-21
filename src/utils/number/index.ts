/**
 * ES5-compatible number utilities
 *
 * Shelly devices run ES5 and don't have Number.isFinite() or Number.isInteger().
 * These functions provide equivalent functionality using ES5 primitives.
 */

/**
 * Check if a value is a finite number (ES5 compatible)
 *
 * Unlike global isFinite(), this does NOT coerce to number first.
 * - isFiniteNumber(null) = false
 * - isFiniteNumber("5") = false
 * - isFinite("5") = true (coerces to number)
 *
 * @param value - Value to check
 * @returns true if value is a finite number
 */
export function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Check if a value is an integer (ES5 compatible)
 *
 * @param value - Value to check
 * @returns true if value is an integer
 */
export function isInteger(value: unknown): boolean {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
}
