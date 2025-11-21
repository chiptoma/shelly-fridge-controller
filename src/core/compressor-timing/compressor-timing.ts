/**
 * Compressor timing safety logic
 *
 * Enforces MIN_ON and MIN_OFF constraints to protect compressor from damage.
 *
 * ## Business Context
 * Compressors can be damaged by "short-cycling" - rapid ON/OFF transitions:
 * - **MIN_ON** ensures oil circulates back to lubricate compressor internals
 * - **MIN_OFF** allows high/low pressure sides to equalize before restart
 *
 * These constraints take precedence over thermostat decisions.
 */

import type { TimingCheckResult, TimingState, TimingConfig } from './types';
import { TIMING_CONSTRAINTS } from './types';
import { checkTimingConstraint, validateTimingInputs } from './helpers';

/**
 * Check if MIN_ON constraint is satisfied
 *
 * Prevents turning OFF a compressor that hasn't run long enough.
 * This ensures proper oil circulation to lubricate the compressor,
 * preventing mechanical wear and potential seizure.
 *
 * @param relayOn - Current relay state (true = compressor running)
 * @param wantCool - Desired cooling state from thermostat
 * @param now - Current timestamp in seconds (Unix epoch)
 * @param lastOnTime - Timestamp when compressor was last turned ON
 * @param minOnSec - Minimum ON time in seconds (typically 180s)
 * @returns Result with allow flag and optional metadata
 * @throws {Error} If inputs are invalid (negative, NaN, etc.)
 */
export function checkMinOn(
  relayOn: boolean,
  wantCool: boolean,
  now: number,
  lastOnTime: number,
  minOnSec: number
): TimingCheckResult {
  validateTimingInputs(now, lastOnTime, minOnSec, 'checkMinOn');

  const shouldEnforce = relayOn && !wantCool;
  const onTime = now - lastOnTime;

  return checkTimingConstraint(
    shouldEnforce,
    onTime,
    minOnSec,
    'canTurnOffAt',
    lastOnTime
  );
}

/**
 * Check if MIN_OFF constraint is satisfied
 *
 * Prevents turning ON a compressor that hasn't been off long enough.
 * This allows high/low pressure sides to equalize, preventing
 * startup damage from excessive head pressure.
 *
 * @param relayOn - Current relay state (true = compressor running)
 * @param wantCool - Desired cooling state from thermostat
 * @param now - Current timestamp in seconds (Unix epoch)
 * @param lastOffTime - Timestamp when compressor was last turned OFF
 * @param minOffSec - Minimum OFF time in seconds (typically 300s)
 * @returns Result with allow flag and optional metadata
 * @throws {Error} If inputs are invalid (negative, NaN, etc.)
 */
export function checkMinOff(
  relayOn: boolean,
  wantCool: boolean,
  now: number,
  lastOffTime: number,
  minOffSec: number
): TimingCheckResult {
  validateTimingInputs(now, lastOffTime, minOffSec, 'checkMinOff');

  const shouldEnforce = !relayOn && wantCool;
  const offTime = now - lastOffTime;

  return checkTimingConstraint(
    shouldEnforce,
    offTime,
    minOffSec,
    'canTurnOnAt',
    lastOffTime
  );
}

/**
 * Apply both MIN_ON and MIN_OFF timing constraints
 *
 * Main entry point for timing constraint checks. Both constraints
 * must be satisfied for a state change to be allowed.
 *
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

  if (!minOnCheck.allow) {
    return {
      ...minOnCheck,
      allow: false,
      reason: TIMING_CONSTRAINTS.MIN_ON
    };
  }

  if (!minOffCheck.allow) {
    return {
      ...minOffCheck,
      allow: false,
      reason: TIMING_CONSTRAINTS.MIN_OFF
    };
  }

  return { allow: true };
}
