/**
 * Adaptive hysteresis logic
 */

import type { FridgeConfig } from '$types/config';

export function calculateAdaptiveShift(
  dutyPercent: number,
  currentShift: number,
  config: FridgeConfig
): { changed: boolean; newShift: number } {
  let newShift = currentShift;
  let changed = false;

  if (dutyPercent > config.ADAPTIVE_HIGH_DUTY_PCT) {
    // High duty cycle: widen hysteresis to reduce cycling (save energy/compressor)
    if (currentShift < config.ADAPTIVE_MAX_SHIFT_C) {
      newShift += 0.1;
      changed = true;
    }
  } else if (dutyPercent < config.ADAPTIVE_LOW_DUTY_PCT) {
    // Low duty cycle: tighten hysteresis for better temperature stability
    if (currentShift > 0) {
      newShift -= 0.1;
      changed = true;
    }
  }

  // Clamp to valid range
  if (newShift > config.ADAPTIVE_MAX_SHIFT_C) newShift = config.ADAPTIVE_MAX_SHIFT_C;
  if (newShift < 0) newShift = 0;

  // Round to 1 decimal place to avoid float drift
  newShift = Math.round(newShift * 10) / 10;

  return { changed, newShift };
}
