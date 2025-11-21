/**
 * Validation helper functions
 * Provides reusable utilities for configuration validation
 */

import type { ValidationError, ValidationWarning } from './types';
import { isFiniteNumber, isInteger } from '@utils/number';

// ═══════════════════════════════════════════════════════════════
// ERROR AND WARNING BUILDERS
// ═══════════════════════════════════════════════════════════════

/**
 * Add a critical error to the errors list
 * @param errors - Array to append the error to
 * @param field - Field name that failed validation
 * @param message - Human-readable error message
 */
export function addError(errors: ValidationError[], field: string, message: string): void {
  errors.push({ level: 'CRITICAL', field: field, message: message });
}

/**
 * Add a warning to the warnings list
 * @param warnings - Array to append the warning to
 * @param field - Field name with sub-optimal value
 * @param message - Human-readable warning message
 */
export function addWarning(warnings: ValidationWarning[], field: string, message: string): void {
  warnings.push({ level: 'WARNING', field: field, message: message });
}

// ═══════════════════════════════════════════════════════════════
// TYPE VALIDATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Validate that a value is a boolean
 * @param value - Value to validate
 * @param field - Field name for error messages
 * @param errors - Array to append errors to
 */
export function validateBoolean(
  value: unknown,
  field: string,
  errors: ValidationError[]
): void {
  if (value !== undefined && typeof value !== 'boolean') {
    addError(errors, field, `${field} must be a boolean (got ${typeof value})`);
  }
}

// ═══════════════════════════════════════════════════════════════
// RANGE VALIDATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Validate a number against critical and recommended ranges
 *
 * Critical range violations produce errors (validation fails)
 * Recommended range violations produce warnings (validation passes)
 *
 * @param value - Value to validate (skips if undefined)
 * @param field - Field name for error messages
 * @param criticalMin - Minimum acceptable value (hard limit)
 * @param criticalMax - Maximum acceptable value (hard limit)
 * @param errors - Array to append errors to
 * @param warnings - Array to append warnings to
 * @param recommendedMin - Recommended minimum value (optional)
 * @param recommendedMax - Recommended maximum value (optional)
 */
export function validateNumberRange(
  value: number | undefined,
  field: string,
  criticalMin: number,
  criticalMax: number,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  recommendedMin?: number,
  recommendedMax?: number
): void {
  if (value === undefined) return;

  // Check for NaN and Infinity (invalid numeric values)
  if (!isFiniteNumber(value)) {
    addError(
      errors,
      field,
      `${field} must be between ${criticalMin} and ${criticalMax} (got ${value})`
    );
    return;
  }

  // Check critical range
  if (value < criticalMin || value > criticalMax) {
    addError(
      errors,
      field,
      `${field} must be between ${criticalMin} and ${criticalMax} (got ${value})`
    );
    return; // Don't check recommended if critical failed
  }

  // Check recommended range (only if provided)
  if (recommendedMin !== undefined && recommendedMax !== undefined) {
    if (value < recommendedMin || value > recommendedMax) {
      addWarning(
        warnings,
        field,
        `${field} is outside recommended range ${recommendedMin}-${recommendedMax} (got ${value})`
      );
    }
  }
}

/**
 * Validate an integer against critical and recommended ranges
 *
 * First checks if the value is an integer, then validates ranges
 *
 * @param value - Value to validate (skips if undefined)
 * @param field - Field name for error messages
 * @param criticalMin - Minimum acceptable value (hard limit)
 * @param criticalMax - Maximum acceptable value (hard limit)
 * @param errors - Array to append errors to
 * @param warnings - Array to append warnings to
 * @param recommendedMin - Recommended minimum value (optional)
 * @param recommendedMax - Recommended maximum value (optional)
 */
export function validateIntegerRange(
  value: number | undefined,
  field: string,
  criticalMin: number,
  criticalMax: number,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  recommendedMin?: number,
  recommendedMax?: number
): void {
  if (value === undefined) return;

  // Check if integer
  if (!isInteger(value)) {
    addError(errors, field, `${field} must be an integer (got ${value})`);
    return;
  }

  // Validate range using the number validator
  validateNumberRange(
    value,
    field,
    criticalMin,
    criticalMax,
    errors,
    warnings,
    recommendedMin,
    recommendedMax
  );
}
