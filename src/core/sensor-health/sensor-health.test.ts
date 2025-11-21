import { checkNoReading, checkStuckSensor } from './helpers';
import { updateSensorHealth } from './sensor-health';
import type { SensorHealthState, SensorHealthConfig } from './types';

describe('sensor-health', () => {
  describe('checkNoReading', () => {
    it('should return not offline when sensor has value', () => {
      const result = checkNoReading(4.5, 1000, 990, 30);
      expect(result.offline).toBe(false);
      expect(result.duration).toBe(0);
    });

    it('should return not offline during grace period', () => {
      const result = checkNoReading(null, 1000, 0, 30);
      expect(result.offline).toBe(false);
      expect(result.duration).toBe(0);
    });

    it('should return not offline when within threshold', () => {
      const result = checkNoReading(null, 1000, 980, 30);
      expect(result.offline).toBe(false);
      expect(result.duration).toBe(20);
    });

    it('should return offline when exceeding threshold', () => {
      const result = checkNoReading(null, 1000, 960, 30);
      expect(result.offline).toBe(true);
      expect(result.duration).toBe(40);
    });
  });

  describe('checkStuckSensor', () => {
    it('should return not stuck when no reading', () => {
      const result = checkStuckSensor(null, 4.5, 1000, 900, 180, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.changed).toBe(false);
    });

    it('should return changed on first reading', () => {
      const result = checkStuckSensor(4.5, null, 1000, 0, 180, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.changed).toBe(true);
    });

    it('should return changed when value changes beyond epsilon', () => {
      const result = checkStuckSensor(4.6, 4.5, 1000, 900, 180, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.changed).toBe(true);
    });

    it('should return not changed when within epsilon', () => {
      const result = checkStuckSensor(4.52, 4.5, 1000, 900, 180, 0.05);
      expect(result.stuck).toBe(false);
      expect(result.changed).toBe(false);
      expect(result.duration).toBe(100);
    });

    it('should return stuck when exceeding threshold', () => {
      const result = checkStuckSensor(4.52, 4.5, 1000, 800, 180, 0.05);
      expect(result.stuck).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.duration).toBe(200);
    });
  });

  describe('updateSensorHealth', () => {
    const defaultConfig: SensorHealthConfig = {
      SENSOR_NO_READING_SEC: 30,
      SENSOR_CRITICAL_FAILURE_SEC: 600,
      SENSOR_STUCK_SEC: 180,
      SENSOR_STUCK_EPSILON_C: 0.05
    };

    const createDefaultState = (): SensorHealthState => ({
      lastReadTime: 1000,
      lastChangeTime: 1000,
      lastRaw: 4.5,
      noReadingFired: false,
      criticalFailure: false,
      stuckFired: false
    });

    it('should update lastReadTime on valid reading', () => {
      const state = createDefaultState();
      const result = updateSensorHealth('air', 4.6, 1005, state, defaultConfig);
      expect(result.lastReadTime).toBe(1005);
    });

    it('should fire no reading alert when offline', () => {
      const state = createDefaultState();
      const result = updateSensorHealth('air', null, 1040, state, defaultConfig);
      expect(result.noReadingFired).toBe(true);
      expect(result.offlineDuration).toBe(40);
    });

    it('should escalate to critical failure', () => {
      const state = createDefaultState();
      state.noReadingFired = true;
      const result = updateSensorHealth('air', null, 1700, state, defaultConfig);
      expect(result.criticalFailure).toBe(true);
    });

    it('should recover from offline state', () => {
      const state = createDefaultState();
      state.noReadingFired = true;
      state.criticalFailure = true;
      const result = updateSensorHealth('air', 4.5, 1800, state, defaultConfig);
      expect(result.recovered).toBe(true);
      expect(result.noReadingFired).toBe(false);
      expect(result.criticalFailure).toBe(false);
    });

    it('should fire stuck alert when value unchanged', () => {
      const state = createDefaultState();
      const result = updateSensorHealth('air', 4.52, 1200, state, defaultConfig);
      expect(result.stuckFired).toBe(true);
      expect(result.stuckDuration).toBe(200);
    });

    it('should recover from stuck state', () => {
      const state = createDefaultState();
      state.stuckFired = true;
      const result = updateSensorHealth('air', 4.6, 1005, state, defaultConfig);
      expect(result.unstuck).toBe(true);
      expect(result.stuckFired).toBe(false);
    });

    it('should update lastChangeTime and lastRaw on value change', () => {
      const state = createDefaultState();
      const result = updateSensorHealth('air', 4.6, 1005, state, defaultConfig);
      expect(result.lastChangeTime).toBe(1005);
      expect(result.lastRaw).toBe(4.6);
    });
  });
});
