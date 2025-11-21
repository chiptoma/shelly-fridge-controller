/**
 * Adaptive hysteresis logic
 *
 * Automatically adjusts temperature hysteresis based on compressor duty cycle.
 * High duty cycles widen hysteresis to reduce cycling and save energy.
 * Low duty cycles tighten hysteresis for better temperature stability.
 */

import type { FridgeConfig } from '$types/config';
import type { AdaptiveShiftResult } from './types';

/**
 * Calculate adaptive hysteresis shift based on duty cycle
 *
 * @param dutyPercent - Current duty cycle percentage (0-100)
 * @param currentShift - Current hysteresis shift in Celsius
 * @param config - Fridge configuration with adaptive thresholds
 * @returns Result containing whether shift changed and new shift value
 *
 * @remarks
 * **Business Logic**: The adaptive algorithm balances two concerns:
 * - High duty (>ADAPTIVE_HIGH_DUTY_PCT): Compressor runs too often, widen hysteresis
 * - Low duty (<ADAPTIVE_LOW_DUTY_PCT): Room for tighter control, narrow hysteresis
 *
 * **Shift Range**: [ADAPTIVE_MIN_SHIFT_C, ADAPTIVE_MAX_SHIFT_C]
 * **Step Size**: ADAPTIVE_SHIFT_STEP_C per adjustment
 *
 * @example
 * ```typescript
 * const result = calculateAdaptiveShift(75, 0.3, config);
 * if (result.changed) {
 *   console.log(`Hysteresis adjusted to ${result.newShift}°C`);
 * }
 * ```
 */
export function calculateAdaptiveShift(
  dutyPercent: number,
  currentShift: number,
  config: FridgeConfig
): AdaptiveShiftResult {
  // Validate inputs
  if (!Number.isFinite(dutyPercent) || !Number.isFinite(currentShift)) {
    return { changed: false, newShift: currentShift };
  }

  const minShift = config.ADAPTIVE_MIN_SHIFT_C ?? 0;
  const maxShift = config.ADAPTIVE_MAX_SHIFT_C;
  const stepSize = config.ADAPTIVE_SHIFT_STEP_C ?? 0.1;

  // High duty cycle: widen hysteresis to reduce cycling
  if (dutyPercent > config.ADAPTIVE_HIGH_DUTY_PCT && currentShift < maxShift) {
    const newShift = roundToDecimal(
      Math.min(currentShift + stepSize, maxShift)
    );
    return { changed: true, newShift };
  }

  // Low duty cycle: tighten hysteresis for better stability
  if (dutyPercent < config.ADAPTIVE_LOW_DUTY_PCT && currentShift > minShift) {
    const newShift = roundToDecimal(
      Math.max(currentShift - stepSize, minShift)
    );
    return { changed: true, newShift };
  }

  return { changed: false, newShift: currentShift };
}

/**
 * Round number to one decimal place to avoid float drift
 */
function roundToDecimal(value: number): number {
  const DECIMAL_PRECISION = 10;
  return Math.round(value * DECIMAL_PRECISION) / DECIMAL_PRECISION;
}
