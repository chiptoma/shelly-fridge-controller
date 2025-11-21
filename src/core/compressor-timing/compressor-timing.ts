/**
 * Compressor timing safety logic
 * Enforces MIN_ON and MIN_OFF constraints to protect compressor
 */

import type { TimingCheckResult, TimingState, TimingConfig } from './types';

/**
 * Check if MIN_ON constraint is satisfied
 * @param relayOn - Current relay state
 * @param wantCool - Desired cooling state
 * @param now - Current timestamp in seconds
 * @param lastOnTime - Timestamp when compressor was last turned ON
 * @param minOnSec - Minimum ON time in seconds
 * @returns Result with allow flag and optional metadata
 */
export function checkMinOn(
  relayOn: boolean,
  wantCool: boolean,
  now: number,
  lastOnTime: number,
  minOnSec: number
): TimingCheckResult {
  // Only enforce when trying to turn OFF an ON compressor
  if (!relayOn || wantCool) {
    return { allow: true };
  }

  const onTime = now - lastOnTime;

  if (onTime >= minOnSec) {
    return { allow: true };
  }

  return {
    allow: false,
    remainingSec: minOnSec - onTime,
    canTurnOffAt: lastOnTime + minOnSec
  };
}

/**
 * Check if MIN_OFF constraint is satisfied
 * @param relayOn - Current relay state
 * @param wantCool - Desired cooling state
 * @param now - Current timestamp in seconds
 * @param lastOffTime - Timestamp when compressor was last turned OFF
 * @param minOffSec - Minimum OFF time in seconds
 * @returns Result with allow flag and optional metadata
 */
export function checkMinOff(
  relayOn: boolean,
  wantCool: boolean,
  now: number,
  lastOffTime: number,
  minOffSec: number
): TimingCheckResult {
  // Only enforce when trying to turn ON an OFF compressor
  if (relayOn || !wantCool) {
    return { allow: true };
  }

  const offTime = now - lastOffTime;

  if (offTime >= minOffSec) {
    return { allow: true };
  }

  return {
    allow: false,
    remainingSec: minOffSec - offTime,
    canTurnOnAt: lastOffTime + minOffSec
  };
}

/**
 * Apply both MIN_ON and MIN_OFF timing constraints
 * @param relayOn - Current relay state
 * @param wantCool - Desired cooling state
 * @param now - Current timestamp in seconds
 * @param state - Controller state with timing information
 * @param config - Configuration with MIN_ON and MIN_OFF values
 * @returns Result with final allow decision and metadata
 */
export function applyTimingConstraints(
  relayOn: boolean,
  wantCool: boolean,
  now: number,
  state: TimingState,
  config: TimingConfig
): TimingCheckResult {
  const minOnCheck = checkMinOn(relayOn, wantCool, now, state.lastOnTime, config.MIN_ON_SEC);
  const minOffCheck = checkMinOff(relayOn, wantCool, now, state.lastOffTime, config.MIN_OFF_SEC);

  // Both constraints must be satisfied
  if (!minOnCheck.allow) {
    return Object.assign({
      allow: false,
      reason: 'MIN_ON' as const
    }, minOnCheck);
  }

  if (!minOffCheck.allow) {
    return Object.assign({
      allow: false,
      reason: 'MIN_OFF' as const
    }, minOffCheck);
  }

  return { allow: true };
}
