/**
 * Relay validation result
 * Returned by validateRelayState to indicate whether relay state matches intent
 */
export interface RelayValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** True if still within grace period waiting for relay response */
  waitingForResponse?: boolean;
  /** True if relay is stuck (mismatch detected after timeout) */
  stuck?: boolean;
  /** Intended relay state (only present when stuck) */
  intended?: boolean;
  /** Reported relay state (only present when stuck) */
  reported?: boolean;
  /** Time elapsed since command was sent (only present when stuck) */
  elapsed?: number;
}
