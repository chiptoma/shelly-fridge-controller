/**
 * Tests for error types
 */

import {
  ValidationError,
  TimingValidationError,
  FreezeConfigValidationError,
  SensorHealthValidationError,
  SmoothingValidationError,
  ThermostatValidationError,
  WatchdogValidationError
} from './errors';

describe('Error Types', () => {
  describe('ValidationError', () => {
    it('should create error with correct message', () => {
      const error = new ValidationError('Test error message');
      expect(error.message).toBe('Test error message');
    });

    it('should have correct name', () => {
      const error = new ValidationError('Test');
      expect(error.name).toBe('ValidationError');
    });

    it('should be instance of Error', () => {
      const error = new ValidationError('Test');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be instance of ValidationError', () => {
      const error = new ValidationError('Test');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should handle empty message', () => {
      const error = new ValidationError('');
      expect(error.message).toBe('');
    });

    it('should handle special characters in message', () => {
      const msg = 'Error: value < 0 && value > 100';
      const error = new ValidationError(msg);
      expect(error.message).toBe(msg);
    });
  });

  describe('TimingValidationError', () => {
    it('should create error with correct message', () => {
      const error = new TimingValidationError('Timing is invalid');
      expect(error.message).toBe('Timing is invalid');
    });

    it('should have correct name', () => {
      const error = new TimingValidationError('Test');
      expect(error.name).toBe('TimingValidationError');
    });

    it('should be instance of ValidationError', () => {
      const error = new TimingValidationError('Test');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should be instance of Error', () => {
      const error = new TimingValidationError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('FreezeConfigValidationError', () => {
    it('should create error with correct message', () => {
      const error = new FreezeConfigValidationError('Freeze config invalid');
      expect(error.message).toBe('Freeze config invalid');
    });

    it('should have correct name', () => {
      const error = new FreezeConfigValidationError('Test');
      expect(error.name).toBe('FreezeConfigValidationError');
    });

    it('should be instance of ValidationError', () => {
      const error = new FreezeConfigValidationError('Test');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should be instance of Error', () => {
      const error = new FreezeConfigValidationError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('SensorHealthValidationError', () => {
    it('should create error with correct message', () => {
      const error = new SensorHealthValidationError('Sensor health config invalid');
      expect(error.message).toBe('Sensor health config invalid');
    });

    it('should have correct name', () => {
      const error = new SensorHealthValidationError('Test');
      expect(error.name).toBe('SensorHealthValidationError');
    });

    it('should be instance of ValidationError', () => {
      const error = new SensorHealthValidationError('Test');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should be instance of Error', () => {
      const error = new SensorHealthValidationError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('SmoothingValidationError', () => {
    it('should create error with correct message', () => {
      const error = new SmoothingValidationError('Smoothing config invalid');
      expect(error.message).toBe('Smoothing config invalid');
    });

    it('should have correct name', () => {
      const error = new SmoothingValidationError('Test');
      expect(error.name).toBe('SmoothingValidationError');
    });

    it('should be instance of ValidationError', () => {
      const error = new SmoothingValidationError('Test');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should be instance of Error', () => {
      const error = new SmoothingValidationError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ThermostatValidationError', () => {
    it('should create error with correct message', () => {
      const error = new ThermostatValidationError('Thermostat config invalid');
      expect(error.message).toBe('Thermostat config invalid');
    });

    it('should have correct name', () => {
      const error = new ThermostatValidationError('Test');
      expect(error.name).toBe('ThermostatValidationError');
    });

    it('should be instance of ValidationError', () => {
      const error = new ThermostatValidationError('Test');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should be instance of Error', () => {
      const error = new ThermostatValidationError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('WatchdogValidationError', () => {
    it('should create error with correct message', () => {
      const error = new WatchdogValidationError('Watchdog config invalid');
      expect(error.message).toBe('Watchdog config invalid');
    });

    it('should have correct name', () => {
      const error = new WatchdogValidationError('Test');
      expect(error.name).toBe('WatchdogValidationError');
    });

    it('should be instance of ValidationError', () => {
      const error = new WatchdogValidationError('Test');
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should be instance of Error', () => {
      const error = new WatchdogValidationError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('Error inheritance chain', () => {
    it('all custom errors should extend ValidationError', () => {
      const errors = [
        new TimingValidationError('Test'),
        new FreezeConfigValidationError('Test'),
        new SensorHealthValidationError('Test'),
        new SmoothingValidationError('Test'),
        new ThermostatValidationError('Test'),
        new WatchdogValidationError('Test')
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error).toBeInstanceOf(Error);
      });
    });

    it('errors can be caught as ValidationError', () => {
      let caughtError: Error | null = null;

      try {
        throw new TimingValidationError('Test timing error');
      } catch (e) {
        if (e instanceof ValidationError) {
          caughtError = e;
        }
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError?.message).toBe('Test timing error');
    });
  });
});
