/**
 * Duty cycle tracking and calculation
 *
 * Tracks compressor on/off time to calculate duty cycle percentage.
 * Used by adaptive hysteresis and daily summary features.
 */

import type { DutyCycleState } from './types';
import { isFiniteNumber } from '@utils/number';

/**
 * Update duty cycle accumulators
 * @param dutyState - Current duty cycle state
 * @param dt - Time delta in seconds
 * @param relayOn - Whether relay is currently ON
 * @returns New duty state with updated accumulators (immutable)
 */
export function updateDutyCycle(
  dutyState: DutyCycleState,
  dt: number,
  relayOn: boolean
): DutyCycleState {
  if (!dutyState || dt <= 0 || !isFiniteNumber(dt)) {
    return dutyState;
  }

  return {
    ...dutyState,
    dutyOnSec: dutyState.dutyOnSec + (relayOn ? dt : 0),
    dutyOffSec: dutyState.dutyOffSec + (relayOn ? 0 : dt),
  };
}

/**
 * Calculate duty cycle percentage
 * @param onSec - Total ON time in seconds
 * @param offSec - Total OFF time in seconds
 * @returns Duty cycle percentage (0-100)
 */
export function getDutyPercent(onSec: number, offSec: number): number {
  if (!isFiniteNumber(onSec) || !isFiniteNumber(offSec)) {
    return 0;
  }

  const total = onSec + offSec;
  if (total <= 0) {
    return 0;
  }

  return (onSec / total) * 100.0;
}

/**
 * Reset duty cycle accumulators
 * @param now - Current timestamp
 * @returns Fresh duty state
 */
export function resetDutyCycle(now: number): DutyCycleState {
  return {
    dutyOnSec: 0,
    dutyOffSec: 0,
    dutyLastReset: now,
  };
}

/**
 * Check if duty cycle interval has elapsed
 * @param now - Current timestamp
 * @param lastReset - Last reset timestamp
 * @param intervalSec - Duty cycle interval in seconds
 * @returns True if interval has elapsed
 */
export function shouldResetDutyCycle(
  now: number,
  lastReset: number,
  intervalSec: number
): boolean {
  if (lastReset === 0 || intervalSec <= 0) {
    return false;
  }
  return (now - lastReset) >= intervalSec;
}
