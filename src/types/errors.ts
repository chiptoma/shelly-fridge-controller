/**
 * Global error types for fridge controller
 * Custom errors for validation and constraint violations
 */

/**
 * Base validation error for all modules
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when timing input parameters are invalid
 */
export class TimingValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'TimingValidationError';
  }
}

/**
 * Error thrown when freeze protection configuration is invalid
 */
export class FreezeConfigValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'FreezeConfigValidationError';
  }
}

/**
 * Error thrown when sensor health configuration is invalid
 */
export class SensorHealthValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'SensorHealthValidationError';
  }
}

/**
 * Error thrown when smoothing configuration is invalid
 */
export class SmoothingValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'SmoothingValidationError';
  }
}

/**
 * Error thrown when thermostat configuration is invalid
 */
export class ThermostatValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'ThermostatValidationError';
  }
}

/**
 * Error thrown when watchdog configuration is invalid
 */
export class WatchdogValidationError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'WatchdogValidationError';
  }
}
