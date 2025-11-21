/**
 * Loop watchdog feature
 *
 * Monitors control loop health by tracking heartbeat timestamps.
 *
 * ## Business Context
 * The watchdog detects control loop failures:
 * - If the loop crashes, the watchdog won't be pet
 * - A starved watchdog triggers emergency procedures
 * - Ensures the fridge doesn't remain in an unsafe state
 *
 * Without watchdog monitoring, a crashed loop could leave the compressor
 * running indefinitely or prevent it from ever turning on.
 */

import type { WatchdogState } from './types';
import { validateWatchdogInputs, validateTimeout } from './helpers';

/**
 * Pet the watchdog (update heartbeat)
 *
 * Called every control loop iteration to prove the loop is still running.
 * Returns a new state object (immutable update pattern).
 *
 * @param state - State object containing lastWatchdogPet
 * @param nowSec - Current timestamp in seconds
 * @returns New state with updated timestamp
 * @throws {Error} If inputs are invalid
 */
export function petWatchdog(state: WatchdogState, nowSec: number): WatchdogState {
  validateWatchdogInputs(nowSec, state.lastWatchdogPet, 'petWatchdog');

  return {
    lastWatchdogPet: nowSec
  };
}

/**
 * Check if watchdog has been starved (loop not running)
 *
 * A starved watchdog indicates the control loop has crashed or stalled.
 * This should trigger emergency procedures (e.g., turn off compressor).
 *
 * @param lastWatchdogPet - Timestamp of last heartbeat
 * @param nowSec - Current timestamp in seconds
 * @param timeoutSec - Timeout threshold in seconds
 * @returns True if watchdog is starved (loop may have crashed)
 * @throws {Error} If inputs are invalid
 */
export function isWatchdogStarved(
  lastWatchdogPet: number,
  nowSec: number,
  timeoutSec: number
): boolean {
  validateWatchdogInputs(nowSec, lastWatchdogPet, 'isWatchdogStarved');
  validateTimeout(timeoutSec, 'isWatchdogStarved');

  return (nowSec - lastWatchdogPet) > timeoutSec;
}

/**
 * Get time since last watchdog pet
 *
 * @param lastWatchdogPet - Timestamp of last heartbeat
 * @param nowSec - Current timestamp in seconds
 * @returns Seconds since last pet
 * @throws {Error} If inputs are invalid
 */
export function getTimeSinceLastPet(
  lastWatchdogPet: number,
  nowSec: number
): number {
  validateWatchdogInputs(nowSec, lastWatchdogPet, 'getTimeSinceLastPet');

  return nowSec - lastWatchdogPet;
}
