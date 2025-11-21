/**
 * Tests for freeze protection helper functions
 */

import { validateFreezeConfig, shouldEngageFreezeLock, shouldReleaseFreezeLock } from './helpers';

describe('Freeze Protection Helpers', () => {
  describe('validateFreezeConfig', () => {
    const validConfig = {
      FREEZE_PROTECTION_START_C: -16.0,
      FREEZE_PROTECTION_STOP_C: -2.0,
      FREEZE_LOCK_HYSTERESIS_C: 0.3,
      FREEZE_RECOVERY_HYSTERESIS_C: 0.5,
      FREEZE_RECOVERY_DELAY_SEC: 300
    };

    it('should accept valid configuration', () => {
      expect(() => validateFreezeConfig(validConfig)).not.toThrow();
    });

    it('should throw when START_C equals STOP_C', () => {
      expect(() => validateFreezeConfig({
        ...validConfig,
        FREEZE_PROTECTION_START_C: -10.0,
        FREEZE_PROTECTION_STOP_C: -10.0
      })).toThrow('START_C (-10) must be less than STOP_C (-10)');
    });

    it('should throw when START_C greater than STOP_C', () => {
      expect(() => validateFreezeConfig({
        ...validConfig,
        FREEZE_PROTECTION_START_C: -5.0,
        FREEZE_PROTECTION_STOP_C: -10.0
      })).toThrow('START_C (-5) must be less than STOP_C (-10)');
    });

    it('should throw on negative FREEZE_LOCK_HYSTERESIS_C', () => {
      expect(() => validateFreezeConfig({
        ...validConfig,
        FREEZE_LOCK_HYSTERESIS_C: -0.1
      })).toThrow('Hysteresis values must be non-negative');
    });

    it('should throw on negative FREEZE_RECOVERY_HYSTERESIS_C', () => {
      expect(() => validateFreezeConfig({
        ...validConfig,
        FREEZE_RECOVERY_HYSTERESIS_C: -0.1
      })).toThrow('Hysteresis values must be non-negative');
    });

    it('should accept zero hysteresis values', () => {
      expect(() => validateFreezeConfig({
        ...validConfig,
        FREEZE_LOCK_HYSTERESIS_C: 0,
        FREEZE_RECOVERY_HYSTERESIS_C: 0
      })).not.toThrow();
    });

    it('should throw on zero recovery delay', () => {
      expect(() => validateFreezeConfig({
        ...validConfig,
        FREEZE_RECOVERY_DELAY_SEC: 0
      })).toThrow('Recovery delay must be positive');
    });

    it('should throw on negative recovery delay', () => {
      expect(() => validateFreezeConfig({
        ...validConfig,
        FREEZE_RECOVERY_DELAY_SEC: -100
      })).toThrow('Recovery delay must be positive');
    });
  });

  describe('shouldEngageFreezeLock', () => {
    const config = {
      FREEZE_PROTECTION_START_C: -16.0,
      FREEZE_PROTECTION_STOP_C: -2.0,
      FREEZE_LOCK_HYSTERESIS_C: 0.3,
      FREEZE_RECOVERY_HYSTERESIS_C: 0.5,
      FREEZE_RECOVERY_DELAY_SEC: 300
    };

    it('should not engage when already locked', () => {
      const result = shouldEngageFreezeLock(-20.0, { locked: true, lockCount: 1, unlockTime: 0 }, config);
      expect(result).toBe(false);
    });

    it('should not engage when sensor is null', () => {
      const result = shouldEngageFreezeLock(null, { locked: false, lockCount: 0, unlockTime: 0 }, config);
      expect(result).toBe(false);
    });

    it('should not engage when temp above threshold', () => {
      const result = shouldEngageFreezeLock(-10.0, { locked: false, lockCount: 0, unlockTime: 0 }, config);
      expect(result).toBe(false);
    });

    it('should engage when temp below threshold with hysteresis', () => {
      // Threshold is -16.0 - 0.3 = -16.3
      const result = shouldEngageFreezeLock(-16.4, { locked: false, lockCount: 0, unlockTime: 0 }, config);
      expect(result).toBe(true);
    });

    it('should engage at exactly threshold', () => {
      const result = shouldEngageFreezeLock(-16.3, { locked: false, lockCount: 0, unlockTime: 0 }, config);
      expect(result).toBe(true);
    });

    it('should not engage just above threshold', () => {
      const result = shouldEngageFreezeLock(-16.29, { locked: false, lockCount: 0, unlockTime: 0 }, config);
      expect(result).toBe(false);
    });
  });

  describe('shouldReleaseFreezeLock', () => {
    const config = {
      FREEZE_PROTECTION_START_C: -16.0,
      FREEZE_PROTECTION_STOP_C: -2.0,
      FREEZE_LOCK_HYSTERESIS_C: 0.3,
      FREEZE_RECOVERY_HYSTERESIS_C: 0.5,
      FREEZE_RECOVERY_DELAY_SEC: 300
    };

    it('should not release when not locked', () => {
      const result = shouldReleaseFreezeLock(-1.0, 1000, { locked: false, lockCount: 0, unlockTime: 0 }, config);
      expect(result).toEqual({ release: false, startRecovery: false, cancelRecovery: false });
    });

    it('should not release when sensor is null', () => {
      const result = shouldReleaseFreezeLock(null, 1000, { locked: true, lockCount: 1, unlockTime: 0 }, config);
      expect(result).toEqual({ release: false, startRecovery: false, cancelRecovery: false });
    });

    it('should start recovery when temp above threshold', () => {
      // Threshold is -2.0 + 0.5 = -1.5
      const result = shouldReleaseFreezeLock(-1.4, 1000, { locked: true, lockCount: 1, unlockTime: 0 }, config);
      expect(result).toEqual({ release: false, startRecovery: true, cancelRecovery: false });
    });

    it('should cancel recovery when temp drops below stop', () => {
      const result = shouldReleaseFreezeLock(-3.0, 1000, { locked: true, lockCount: 1, unlockTime: 700 }, config);
      expect(result).toEqual({ release: false, startRecovery: false, cancelRecovery: true });
    });

    it('should release after recovery delay', () => {
      const result = shouldReleaseFreezeLock(-1.4, 1000, { locked: true, lockCount: 1, unlockTime: 700 }, config);
      expect(result).toEqual({ release: true, startRecovery: false, cancelRecovery: false });
    });

    it('should not release before recovery delay', () => {
      const result = shouldReleaseFreezeLock(-1.4, 1000, { locked: true, lockCount: 1, unlockTime: 800 }, config);
      expect(result).toEqual({ release: false, startRecovery: false, cancelRecovery: false });
    });

    it('should stay locked when temp between start and stop', () => {
      const result = shouldReleaseFreezeLock(-10.0, 1000, { locked: true, lockCount: 1, unlockTime: 0 }, config);
      expect(result).toEqual({ release: false, startRecovery: false, cancelRecovery: false });
    });

    it('should stay locked at exactly stop threshold', () => {
      const result = shouldReleaseFreezeLock(-2.0, 1000, { locked: true, lockCount: 1, unlockTime: 0 }, config);
      expect(result).toEqual({ release: false, startRecovery: false, cancelRecovery: false });
    });

    it('should start recovery at exactly above threshold with hysteresis', () => {
      // Threshold is -2.0 + 0.5 = -1.5
      const result = shouldReleaseFreezeLock(-1.5, 1000, { locked: true, lockCount: 1, unlockTime: 0 }, config);
      expect(result).toEqual({ release: false, startRecovery: true, cancelRecovery: false });
    });
  });
});
