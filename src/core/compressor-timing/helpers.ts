/**
 * Compressor timing helper functions
 * Internal logic for timing constraint enforcement
 */

import type { TimingCheckResult } from './types';
import { isFiniteNumber } from '@utils/number';

/**
 * Generic timing constraint checker
 * Abstracts common pattern from checkMinOn and checkMinOff
 *
 * @internal
 */
export function checkTimingConstraint(
  shouldEnforce: boolean,
  elapsedTime: number,
  requiredTime: number,
  timestampField: 'canTurnOffAt' | 'canTurnOnAt',
  referenceTime: number
): TimingCheckResult {
  if (!shouldEnforce) {
    return { allow: true };
  }

  if (elapsedTime >= requiredTime) {
    return { allow: true };
  }

  // Build result object without computed property name for Shelly ES5 compatibility
  const result: TimingCheckResult = {
    allow: false,
    remainingSec: requiredTime - elapsedTime
  };
  if (timestampField === 'canTurnOffAt') {
    result.canTurnOffAt = referenceTime + requiredTime;
  } else {
    result.canTurnOnAt = referenceTime + requiredTime;
  }
  return result;
}

/**
 * Validate timing input parameters
 * Ensures timestamps and durations are valid numbers
 *
 * @throws {Error} If inputs are invalid
 */
export function validateTimingInputs(
  now: number,
  lastTime: number,
  minDuration: number,
  context: string
): void {
  if (!isFiniteNumber(now) || now < 0) {
    throw new Error(context + ": now must be a non-negative finite number, got " + now);
  }
  if (!isFiniteNumber(lastTime) || lastTime < 0) {
    throw new Error(context + ": lastTime must be a non-negative finite number, got " + lastTime);
  }
  if (!isFiniteNumber(minDuration) || minDuration <= 0) {
    throw new Error(context + ": minDuration must be a positive finite number, got " + minDuration);
  }
}
