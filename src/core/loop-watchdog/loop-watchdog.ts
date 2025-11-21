/**
 * Loop watchdog feature
 * Monitors control loop health by tracking heartbeat timestamps
 */

import type { WatchdogState } from './types';

/**
 * Pet the watchdog (update heartbeat)
 * Called every control loop to prove the loop is still running
 * @param state - State object containing lastWatchdogPet
 * @param nowSec - Current timestamp in seconds
 */
export function petWatchdog(state: WatchdogState, nowSec: number): void {
  state.lastWatchdogPet = nowSec;
}

/**
 * Check if watchdog has been starved (loop not running)
 * @param lastWatchdogPet - Timestamp of last heartbeat
 * @param nowSec - Current timestamp in seconds
 * @param timeoutSec - Timeout threshold in seconds
 * @returns True if watchdog is starved (loop may have crashed)
 */
export function isWatchdogStarved(
  lastWatchdogPet: number,
  nowSec: number,
  timeoutSec: number
): boolean {
  return (nowSec - lastWatchdogPet) > timeoutSec;
}

/**
 * Get time since last watchdog pet
 * @param lastWatchdogPet - Timestamp of last heartbeat
 * @param nowSec - Current timestamp in seconds
 * @returns Seconds since last pet
 */
export function getTimeSinceLastPet(
  lastWatchdogPet: number,
  nowSec: number
): number {
  return nowSec - lastWatchdogPet;
}
