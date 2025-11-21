/**
 * Tests for sensor health helper functions
 */

import { validateSensorHealthConfig, checkNoReading, checkStuckSensor } from './helpers';

describe('Sensor Health Helpers', () => {
  describe('validateSensorHealthConfig', () => {
    const validConfig = {
      SENSOR_NO_READING_SEC: 30,
      SENSOR_CRITICAL_FAILURE_SEC: 600,
      SENSOR_STUCK_SEC: 300,
      SENSOR_STUCK_EPSILON_C: 0.05
    };

    it('should accept valid configuration', () => {
      expect(() => validateSensorHealthConfig(validConfig)).not.toThrow();
    });

    it('should throw on zero SENSOR_NO_READING_SEC', () => {
      expect(() => validateSensorHealthConfig({
        ...validConfig,
        SENSOR_NO_READING_SEC: 0
      })).toThrow('SENSOR_NO_READING_SEC must be positive');
    });

    it('should throw on negative SENSOR_NO_READING_SEC', () => {
      expect(() => validateSensorHealthConfig({
        ...validConfig,
        SENSOR_NO_READING_SEC: -10
      })).toThrow('SENSOR_NO_READING_SEC must be positive');
    });

    it('should throw when CRITICAL equals NO_READING', () => {
      expect(() => validateSensorHealthConfig({
        ...validConfig,
        SENSOR_CRITICAL_FAILURE_SEC: 30,
        SENSOR_NO_READING_SEC: 30
      })).toThrow('SENSOR_CRITICAL_FAILURE_SEC (30) must be greater than SENSOR_NO_READING_SEC (30)');
    });

    it('should throw when CRITICAL less than NO_READING', () => {
      expect(() => validateSensorHealthConfig({
        ...validConfig,
        SENSOR_CRITICAL_FAILURE_SEC: 10,
        SENSOR_NO_READING_SEC: 30
      })).toThrow('SENSOR_CRITICAL_FAILURE_SEC (10) must be greater than SENSOR_NO_READING_SEC (30)');
    });

    it('should throw on zero SENSOR_STUCK_SEC', () => {
      expect(() => validateSensorHealthConfig({
        ...validConfig,
        SENSOR_STUCK_SEC: 0
      })).toThrow('SENSOR_STUCK_SEC must be positive');
    });

    it('should throw on negative SENSOR_STUCK_SEC', () => {
      expect(() => validateSensorHealthConfig({
        ...validConfig,
        SENSOR_STUCK_SEC: -100
      })).toThrow('SENSOR_STUCK_SEC must be positive');
    });

    it('should throw on negative SENSOR_STUCK_EPSILON_C', () => {
      expect(() => validateSensorHealthConfig({
        ...validConfig,
        SENSOR_STUCK_EPSILON_C: -0.01
      })).toThrow('SENSOR_STUCK_EPSILON_C must be non-negative');
    });

    it('should accept zero SENSOR_STUCK_EPSILON_C', () => {
      expect(() => validateSensorHealthConfig({
        ...validConfig,
        SENSOR_STUCK_EPSILON_C: 0
      })).not.toThrow();
    });
  });

  describe('checkNoReading', () => {
    it('should return not offline when sensor provides reading', () => {
      const result = checkNoReading(5.0, 1000, 990, 30);
      expect(result.offline).toBe(false);
      expect(result.duration).toBe(0);
    });

    it('should return not offline for first reading (grace period)', () => {
      const result = checkNoReading(null, 1000, 0, 30);
      expect(result.offline).toBe(false);
      expect(result.duration).toBe(0);
    });

    it('should return offline when no reading exceeds threshold', () => {
      const result = checkNoReading(null, 1000, 960, 30);
      expect(result.offline).toBe(true);
      expect(result.duration).toBe(40);
    });

    it('should return not offline when no reading under threshold', () => {
      const result = checkNoReading(null, 1000, 990, 30);
      expect(result.offline).toBe(false);
      expect(result.duration).toBe(10);
    });

    it('should return offline at exactly threshold', () => {
      const result = checkNoReading(null, 1000, 969, 30);
      expect(result.offline).toBe(true);
      expect(result.duration).toBe(31);
    });

    it('should return not offline just under threshold', () => {
      const result = checkNoReading(null, 1000, 971, 30);
      expect(result.offline).toBe(false);
      expect(result.duration).toBe(29);
    });
  });

  describe('checkStuckSensor', () => {
    it('should return not stuck when no reading', () => {
      const result = checkStuckSensor(null, 5.0, 1000, 700, 300, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.duration).toBe(0);
      expect(result.changed).toBe(false);
    });

    it('should return changed for first reading', () => {
      const result = checkStuckSensor(5.0, null, 1000, 1000, 300, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.duration).toBe(0);
      expect(result.changed).toBe(true);
    });

    it('should return changed when value changes beyond epsilon', () => {
      const result = checkStuckSensor(5.1, 5.0, 1000, 700, 300, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.duration).toBe(0);
      expect(result.changed).toBe(true);
    });

    it('should return stuck when value unchanged beyond threshold', () => {
      const result = checkStuckSensor(5.0, 5.0, 1000, 600, 300, 0.05);
      expect(result.stuck).toBe(true);
      expect(result.duration).toBe(400);
      expect(result.changed).toBe(false);
    });

    it('should return not stuck when value unchanged under threshold', () => {
      const result = checkStuckSensor(5.0, 5.0, 1000, 900, 300, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.duration).toBe(100);
      expect(result.changed).toBe(false);
    });

    it('should consider change within epsilon as unchanged', () => {
      const result = checkStuckSensor(5.04, 5.0, 1000, 600, 300, 0.05);
      expect(result.stuck).toBe(true);
      expect(result.changed).toBe(false);
    });

    it('should consider change at exactly epsilon as unchanged', () => {
      const result = checkStuckSensor(5.05, 5.0, 1000, 600, 300, 0.05);
      expect(result.stuck).toBe(true);
      expect(result.changed).toBe(false);
    });

    it('should consider change just above epsilon as changed', () => {
      const result = checkStuckSensor(5.051, 5.0, 1000, 600, 300, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.changed).toBe(true);
    });

    it('should handle negative temperature changes', () => {
      const result = checkStuckSensor(-10.1, -10.0, 1000, 700, 300, 0.05);
      expect(result.changed).toBe(true);
    });
  });
});
