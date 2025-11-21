/**
 * Loop watchdog helper functions
 */

/**
 * Validate watchdog input parameters
 * @throws {Error} If inputs are invalid
 */
export function validateWatchdogInputs(
  nowSec: number,
  lastWatchdogPet: number,
  context: string
): void {
  if (!Number.isFinite(nowSec) || nowSec < 0) {
    throw new Error(`${context}: nowSec must be a non-negative finite number, got ${nowSec}`);
  }
  if (!Number.isFinite(lastWatchdogPet) || lastWatchdogPet < 0) {
    throw new Error(`${context}: lastWatchdogPet must be a non-negative finite number, got ${lastWatchdogPet}`);
  }
}

/**
 * Validate timeout value
 * @throws {Error} If timeout is invalid
 */
export function validateTimeout(timeoutSec: number, context: string): void {
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new Error(`${context}: timeoutSec must be a positive finite number, got ${timeoutSec}`);
  }
}
