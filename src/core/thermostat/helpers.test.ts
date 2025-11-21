/**
 * Tests for thermostat helper functions
 */

import { validateThermostatConfig, validateThermostatState, validateTemperature } from './helpers';

describe('Thermostat Helpers', () => {
  describe('validateThermostatConfig', () => {
    it('should accept valid configuration', () => {
      expect(() => validateThermostatConfig({
        SETPOINT_C: 4.0,
        HYSTERESIS_C: 1.0
      })).not.toThrow();
    });

    it('should throw on NaN SETPOINT_C', () => {
      expect(() => validateThermostatConfig({
        SETPOINT_C: NaN,
        HYSTERESIS_C: 1.0
      })).toThrow('SETPOINT_C must be a finite number');
    });

    it('should throw on Infinity SETPOINT_C', () => {
      expect(() => validateThermostatConfig({
        SETPOINT_C: Infinity,
        HYSTERESIS_C: 1.0
      })).toThrow('SETPOINT_C must be a finite number');
    });

    it('should throw on negative Infinity SETPOINT_C', () => {
      expect(() => validateThermostatConfig({
        SETPOINT_C: -Infinity,
        HYSTERESIS_C: 1.0
      })).toThrow('SETPOINT_C must be a finite number');
    });

    it('should throw on NaN HYSTERESIS_C', () => {
      expect(() => validateThermostatConfig({
        SETPOINT_C: 4.0,
        HYSTERESIS_C: NaN
      })).toThrow('HYSTERESIS_C must be a non-negative finite number');
    });

    it('should throw on negative HYSTERESIS_C', () => {
      expect(() => validateThermostatConfig({
        SETPOINT_C: 4.0,
        HYSTERESIS_C: -1.0
      })).toThrow('HYSTERESIS_C must be a non-negative finite number');
    });

    it('should accept zero HYSTERESIS_C', () => {
      expect(() => validateThermostatConfig({
        SETPOINT_C: 4.0,
        HYSTERESIS_C: 0
      })).not.toThrow();
    });

    it('should accept negative SETPOINT_C', () => {
      expect(() => validateThermostatConfig({
        SETPOINT_C: -5.0,
        HYSTERESIS_C: 1.0
      })).not.toThrow();
    });
  });

  describe('validateThermostatState', () => {
    it('should accept valid thresholds', () => {
      expect(() => validateThermostatState({
        freezeLocked: false,
        dynOnAbove: 5.0,
        dynOffBelow: 3.0
      })).not.toThrow();
    });

    it('should throw when dynOnAbove equals dynOffBelow', () => {
      expect(() => validateThermostatState({
        freezeLocked: false,
        dynOnAbove: 4.0,
        dynOffBelow: 4.0
      })).toThrow('must be greater than');
    });

    it('should throw when dynOnAbove is less than dynOffBelow', () => {
      expect(() => validateThermostatState({
        freezeLocked: false,
        dynOnAbove: 3.0,
        dynOffBelow: 5.0
      })).toThrow('must be greater than');
    });

    it('should accept minimal gap', () => {
      expect(() => validateThermostatState({
        freezeLocked: false,
        dynOnAbove: 4.01,
        dynOffBelow: 4.0
      })).not.toThrow();
    });
  });

  describe('validateTemperature', () => {
    it('should accept valid temperature', () => {
      expect(() => validateTemperature(5.0, 'test')).not.toThrow();
    });

    it('should accept null temperature', () => {
      expect(() => validateTemperature(null, 'test')).not.toThrow();
    });

    it('should accept zero temperature', () => {
      expect(() => validateTemperature(0, 'test')).not.toThrow();
    });

    it('should accept negative temperature', () => {
      expect(() => validateTemperature(-20.0, 'test')).not.toThrow();
    });

    it('should throw on NaN temperature', () => {
      expect(() => validateTemperature(NaN, 'test')).toThrow('test: temperature must be finite or null');
    });

    it('should throw on Infinity temperature', () => {
      expect(() => validateTemperature(Infinity, 'test')).toThrow('test: temperature must be finite or null');
    });

    it('should throw on negative Infinity temperature', () => {
      expect(() => validateTemperature(-Infinity, 'test')).toThrow('test: temperature must be finite or null');
    });

    it('should include context in error message', () => {
      expect(() => validateTemperature(NaN, 'air sensor')).toThrow('air sensor:');
    });
  });
});
