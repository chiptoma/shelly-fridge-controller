/**
 * Core features - essential functionality for fridge controller
 *
 * These features are always active and critical for proper operation:
 * - thermostat: Temperature control with hysteresis
 * - freeze-protection: Prevent evaporator from freezing
 * - smoothing: Temperature filtering/averaging
 * - sensor-health: Detect sensor failures
 * - compressor-timing: Protect compressor from short-cycling
 * - loop-watchdog: Detect control loop crashes
 */

export * from './thermostat';
export * from './freeze-protection';
export * from './smoothing';
export * from './sensor-health';
export * from './compressor-timing';
export * from './loop-watchdog';
