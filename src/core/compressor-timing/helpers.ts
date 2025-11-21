/**
 * Compressor timing helper functions
 * Internal logic for timing constraint enforcement
 */

import type { TimingCheckResult } from './types';

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

  return {
    allow: false,
    remainingSec: requiredTime - elapsedTime,
    [timestampField]: referenceTime + requiredTime
  };
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
  if (!Number.isFinite(now) || now < 0) {
    throw new Error(`${context}: now must be a non-negative finite number, got ${now}`);
  }
  if (!Number.isFinite(lastTime) || lastTime < 0) {
    throw new Error(`${context}: lastTime must be a non-negative finite number, got ${lastTime}`);
  }
  if (!Number.isFinite(minDuration) || minDuration <= 0) {
    throw new Error(`${context}: minDuration must be a positive finite number, got ${minDuration}`);
  }
}
