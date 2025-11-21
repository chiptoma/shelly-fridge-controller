/**
 * Smoothing helper functions
 */

import type { SmoothingConfig } from './types';
import { isFiniteNumber } from '@utils/number';

/**
 * Validate smoothing configuration
 * @throws {Error} If configuration is invalid
 */
export function validateSmoothingConfig(config: SmoothingConfig): void {
  if (!isFiniteNumber(config.windowSizeSec) || config.windowSizeSec <= 0) {
    throw new Error("windowSizeSec must be a positive finite number, got " + config.windowSizeSec);
  }
  if (!isFiniteNumber(config.loopPeriodMs) || config.loopPeriodMs <= 0) {
    throw new Error("loopPeriodMs must be a positive finite number, got " + config.loopPeriodMs);
  }
}

/**
 * Validate temperature value
 * @throws {Error} If value is not a valid number
 */
export function validateTemperatureValue(value: number, context: string): void {
  if (!isFiniteNumber(value)) {
    throw new Error(context + ": temperature must be a finite number, got " + value);
  }
}
