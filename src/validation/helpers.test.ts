/**
 * Unit tests for validation helper functions
 */

import { addError, addWarning, validateBoolean, validateNumberRange, validateIntegerRange } from './helpers';
import type { ValidationError, ValidationWarning } from './types';

describe('Validation Helpers', () => {
  // ═══════════════════════════════════════════════════════════════
  // addError()
  // ═══════════════════════════════════════════════════════════════

  describe('addError', () => {
    it('should add error with CRITICAL level', () => {
      const errors: ValidationError[] = [];

      addError(errors, 'TEST_FIELD', 'Test error message');

      expect(errors).toHaveLength(1);
      expect(errors[0].level).toBe('CRITICAL');
    });

    it('should add error with correct field and message', () => {
      const errors: ValidationError[] = [];

      addError(errors, 'SETPOINT', 'Value out of range');

      expect(errors[0]).toEqual({
        level: 'CRITICAL',
        field: 'SETPOINT',
        message: 'Value out of range'
      });
    });

    it('should accumulate multiple errors', () => {
      const errors: ValidationError[] = [];

      addError(errors, 'FIELD1', 'Error 1');
      addError(errors, 'FIELD2', 'Error 2');
      addError(errors, 'FIELD3', 'Error 3');

      expect(errors).toHaveLength(3);
      expect(errors[0].field).toBe('FIELD1');
      expect(errors[1].field).toBe('FIELD2');
      expect(errors[2].field).toBe('FIELD3');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // addWarning()
  // ═══════════════════════════════════════════════════════════════

  describe('addWarning', () => {
    it('should add warning with WARNING level', () => {
      const warnings: ValidationWarning[] = [];

      addWarning(warnings, 'TEST_FIELD', 'Test warning message');

      expect(warnings).toHaveLength(1);
      expect(warnings[0].level).toBe('WARNING');
    });

    it('should add warning with correct field and message', () => {
      const warnings: ValidationWarning[] = [];

      addWarning(warnings, 'HYSTERESIS', 'Outside recommended range');

      expect(warnings[0]).toEqual({
        level: 'WARNING',
        field: 'HYSTERESIS',
        message: 'Outside recommended range'
      });
    });

    it('should accumulate multiple warnings', () => {
      const warnings: ValidationWarning[] = [];

      addWarning(warnings, 'FIELD1', 'Warning 1');
      addWarning(warnings, 'FIELD2', 'Warning 2');
      addWarning(warnings, 'FIELD3', 'Warning 3');

      expect(warnings).toHaveLength(3);
      expect(warnings[0].field).toBe('FIELD1');
      expect(warnings[1].field).toBe('FIELD2');
      expect(warnings[2].field).toBe('FIELD3');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // validateBoolean()
  // ═══════════════════════════════════════════════════════════════

  describe('validateBoolean', () => {
    describe('valid boolean values', () => {
      it('should accept true', () => {
        const errors: ValidationError[] = [];

        validateBoolean(true, 'TEST_FLAG', errors);

        expect(errors).toHaveLength(0);
      });

      it('should accept false', () => {
        const errors: ValidationError[] = [];

        validateBoolean(false, 'TEST_FLAG', errors);

        expect(errors).toHaveLength(0);
      });
    });

    describe('undefined handling', () => {
      it('should accept undefined without error', () => {
        const errors: ValidationError[] = [];

        validateBoolean(undefined, 'TEST_FLAG', errors);

        expect(errors).toHaveLength(0);
      });
    });

    describe('invalid types', () => {
      it('should add error for string value', () => {
        const errors: ValidationError[] = [];

        validateBoolean('true', 'FEATURE_FLAG', errors);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('FEATURE_FLAG');
        expect(errors[0].message).toContain('must be a boolean');
        expect(errors[0].message).toContain('got string');
      });

      it('should add error for number value', () => {
        const errors: ValidationError[] = [];

        validateBoolean(1, 'FEATURE_FLAG', errors);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('must be a boolean');
        expect(errors[0].message).toContain('got number');
      });

      it('should add error for object value', () => {
        const errors: ValidationError[] = [];

        validateBoolean({}, 'FEATURE_FLAG', errors);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('must be a boolean');
        expect(errors[0].message).toContain('got object');
      });

      it('should add error for array value', () => {
        const errors: ValidationError[] = [];

        validateBoolean([], 'FEATURE_FLAG', errors);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('must be a boolean');
        expect(errors[0].message).toContain('got object');
      });

      it('should add error for null value', () => {
        const errors: ValidationError[] = [];

        validateBoolean(null, 'FEATURE_FLAG', errors);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('must be a boolean');
        expect(errors[0].message).toContain('got object');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // validateNumberRange()
  // ═══════════════════════════════════════════════════════════════

  describe('validateNumberRange', () => {
    describe('undefined handling', () => {
      it('should return early without adding errors or warnings', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(undefined, 'TEST', 0, 10, errors, warnings, 2, 8);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
      });
    });

    describe('critical range violations', () => {
      it('should add error when value below minimum', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(0.5, 'SETPOINT', 1, 10, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('SETPOINT');
        expect(errors[0].message).toContain('must be between 1 and 10');
      });

      it('should add error when value above maximum', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(11, 'SETPOINT', 1, 10, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('SETPOINT');
        expect(errors[0].message).toContain('must be between 1 and 10');
      });

      it('should not add error when value at minimum boundary', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(1, 'SETPOINT', 1, 10, errors, warnings);

        expect(errors).toHaveLength(0);
      });

      it('should not add error when value at maximum boundary', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(10, 'SETPOINT', 1, 10, errors, warnings);

        expect(errors).toHaveLength(0);
      });

      it('should not add error when value within critical range', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(5, 'SETPOINT', 1, 10, errors, warnings);

        expect(errors).toHaveLength(0);
      });
    });

    describe('recommended range violations', () => {
      it('should add warning when value below recommended minimum', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(2, 'SETPOINT', 1, 10, errors, warnings, 3, 5);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].field).toBe('SETPOINT');
        expect(warnings[0].message).toContain('outside recommended range 3-5');
      });

      it('should add warning when value above recommended maximum', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(6, 'SETPOINT', 1, 10, errors, warnings, 3, 5);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].field).toBe('SETPOINT');
        expect(warnings[0].message).toContain('outside recommended range 3-5');
      });

      it('should not add warning when value at recommended minimum boundary', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(3, 'SETPOINT', 1, 10, errors, warnings, 3, 5);

        expect(warnings).toHaveLength(0);
      });

      it('should not add warning when value at recommended maximum boundary', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(5, 'SETPOINT', 1, 10, errors, warnings, 3, 5);

        expect(warnings).toHaveLength(0);
      });

      it('should not add warning when value within recommended range', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(4, 'SETPOINT', 1, 10, errors, warnings, 3, 5);

        expect(warnings).toHaveLength(0);
      });
    });

    describe('edge cases', () => {
      it('should not check recommended range when not provided', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Value within critical but no recommended range defined
        validateNumberRange(5, 'TEST', 0, 10, errors, warnings);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
      });

      it('should skip recommended check when critical validation fails', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Value below critical min (and also below recommended)
        validateNumberRange(0, 'SETPOINT', 1, 10, errors, warnings, 3, 5);

        expect(errors).toHaveLength(1);
        expect(warnings).toHaveLength(0); // No warning because critical failed
      });

      it('should handle negative numbers correctly', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(-16, 'FREEZE_PROTECTION_ON', -30, -5, errors, warnings, -18, -15);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
      });

      it('should handle decimal numbers correctly', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(0.5, 'HYSTERESIS', 0.3, 5, errors, warnings, 0.5, 2);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
      });

      it('should add error for NaN value', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(NaN, 'SETPOINT', 1, 10, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('SETPOINT');
        expect(errors[0].message).toContain('must be between 1 and 10');
      });

      it('should add error for positive Infinity', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(Infinity, 'SETPOINT', 1, 10, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('SETPOINT');
        expect(errors[0].message).toContain('must be between 1 and 10');
      });

      it('should add error for negative Infinity', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateNumberRange(-Infinity, 'SETPOINT', 1, 10, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('SETPOINT');
        expect(errors[0].message).toContain('must be between 1 and 10');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // validateIntegerRange()
  // ═══════════════════════════════════════════════════════════════

  describe('validateIntegerRange', () => {
    describe('undefined handling', () => {
      it('should return early without adding errors or warnings', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(undefined, 'TEST', 0, 100, errors, warnings, 20, 80);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
      });
    });

    describe('integer validation', () => {
      it('should add error when value is not an integer', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(3.14, 'MIN_ON', 120, 600, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('MIN_ON');
        expect(errors[0].message).toContain('must be an integer');
      });

      it('should add error for float with decimal part', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(180.5, 'MIN_ON', 120, 600, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('must be an integer');
      });

      it('should accept integer values', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(180, 'MIN_ON', 120, 600, errors, warnings);

        expect(errors).toHaveLength(0);
      });

      it('should accept 5.0 as integer (JavaScript quirk)', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(5.0, 'TEST', 0, 10, errors, warnings);

        expect(errors).toHaveLength(0);
      });

      it('should not proceed to range check when integer validation fails', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Float value that would be within range if it were an integer
        validateIntegerRange(5.5, 'TEST', 0, 10, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('must be an integer');
        expect(errors[0].message).not.toContain('must be between');
      });
    });

    describe('range validation after integer check', () => {
      it('should validate critical range for valid integers', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(50, 'MIN_ON', 120, 600, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('must be between 120 and 600');
      });

      it('should validate recommended range for valid integers', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(150, 'MIN_ON', 120, 600, errors, warnings, 180, 180);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain('outside recommended range');
      });

      it('should accept integer within both critical and recommended ranges', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(180, 'MIN_ON', 120, 600, errors, warnings, 180, 180);

        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
      });
    });

    describe('edge cases', () => {
      it('should add error for NaN value', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(NaN, 'MIN_ON', 120, 600, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('MIN_ON');
        expect(errors[0].message).toContain('must be an integer');
      });

      it('should add error for positive Infinity', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(Infinity, 'MIN_ON', 120, 600, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('MIN_ON');
        expect(errors[0].message).toContain('must be an integer');
      });

      it('should add error for negative Infinity', () => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        validateIntegerRange(-Infinity, 'MIN_ON', 120, 600, errors, warnings);

        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe('MIN_ON');
        expect(errors[0].message).toContain('must be an integer');
      });
    });
  });
});
