/**
 * Adaptive hysteresis types
 */

/**
 * Result of adaptive hysteresis calculation
 */
export interface AdaptiveShiftResult {
  /** Whether the shift value changed */
  changed: boolean;
  /** New shift value in Celsius */
  newShift: number;
}
