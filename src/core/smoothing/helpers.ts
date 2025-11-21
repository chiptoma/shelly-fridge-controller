/**
 * Smoothing helper functions
 */

import type { SmoothingConfig } from './types';

/**
 * Validate smoothing configuration
 * @throws {Error} If configuration is invalid
 */
export function validateSmoothingConfig(config: SmoothingConfig): void {
  if (!Number.isFinite(config.windowSizeSec) || config.windowSizeSec <= 0) {
    throw new Error(`windowSizeSec must be a positive finite number, got ${config.windowSizeSec}`);
  }
  if (!Number.isFinite(config.loopPeriodMs) || config.loopPeriodMs <= 0) {
    throw new Error(`loopPeriodMs must be a positive finite number, got ${config.loopPeriodMs}`);
  }
}

/**
 * Validate temperature value
 * @throws {Error} If value is not a valid number
 */
export function validateTemperatureValue(value: number, context: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${context}: temperature must be a finite number, got ${value}`);
  }
}
