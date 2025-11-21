/**
 * Relay helper functions
 */

import type { RelayValidationResult } from './types';

/**
 * Validate relay state matches intended state
 *
 * Checks if the relay's reported state matches what was commanded, accounting
 * for relay response time. Returns validation result with diagnostic information.
 *
 * @param intendedOn - Commanded relay state (true = ON, false = OFF)
 * @param reportedOn - Actual relay state from hardware (true = ON, false = OFF)
 * @param nowSec - Current timestamp in seconds
 * @param lastCommandTimeSec - Timestamp when command was sent in seconds (0 if no command sent)
 * @param timeoutSec - Grace period for relay to respond in seconds
 *   (typically RELAY_RESPONSE_TIMEOUT_SEC from config)
 *
 * @returns Validation result with:
 *   - `valid`: true if state matches or within grace period
 *   - `waitingForResponse`: true if still within timeout window
 *   - `stuck`: true if state mismatch detected after timeout
 *   - `intended/reported/elapsed`: diagnostic info when stuck
 */
export function validateRelayState(
  intendedOn: boolean,
  reportedOn: boolean,
  nowSec: number,
  lastCommandTimeSec: number,
  timeoutSec: number
): RelayValidationResult {
  // No command sent yet - nothing to validate
  if (lastCommandTimeSec === 0) {
    return { valid: true };
  }

  const elapsed = nowSec - lastCommandTimeSec;

  // Still within grace period - allow relay time to respond
  if (elapsed <= timeoutSec) {
    return { valid: true, waitingForResponse: true };
  }

  // Check for state mismatch after timeout
  if (intendedOn !== reportedOn) {
    return {
      valid: false,
      stuck: true,
      intended: intendedOn,
      reported: reportedOn,
      elapsed
    };
  }

  // States match - validation passed
  return { valid: true };
}
