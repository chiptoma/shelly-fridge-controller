import { shouldEngageFreezeLock, shouldReleaseFreezeLock } from './helpers';
import { updateFreezeProtection } from './freeze-protection';
import type { FreezeState, FreezeConfig } from './types';

describe('freeze-protection', () => {
  const defaultConfig: FreezeConfig = {
    FREEZE_PROTECTION_START_C: -16.0,
    FREEZE_LOCK_HYSTERESIS_C: 0.3,
    FREEZE_PROTECTION_STOP_C: -2.0,
    FREEZE_RECOVERY_HYSTERESIS_C: 0.5,
    FREEZE_RECOVERY_DELAY_SEC: 300
  };

  describe('shouldEngageFreezeLock', () => {
    it('should not engage when already locked', () => {
      const state: FreezeState = { locked: true, unlockTime: 0 };
      expect(shouldEngageFreezeLock(-20, state, defaultConfig)).toBe(false);
    });

    it('should not engage when sensor is null', () => {
      const state: FreezeState = { locked: false, unlockTime: 0 };
      expect(shouldEngageFreezeLock(null, state, defaultConfig)).toBe(false);
    });

    it('should not engage when temp is above threshold', () => {
      const state: FreezeState = { locked: false, unlockTime: 0 };
      expect(shouldEngageFreezeLock(-10, state, defaultConfig)).toBe(false);
    });

    it('should engage when temp drops below threshold with hysteresis', () => {
      const state: FreezeState = { locked: false, unlockTime: 0 };
      // -16.0 - 0.3 = -16.3
      expect(shouldEngageFreezeLock(-16.4, state, defaultConfig)).toBe(true);
    });

    it('should engage at exactly threshold', () => {
      const state: FreezeState = { locked: false, unlockTime: 0 };
      // Threshold is -16.0 - 0.3 = -16.3, and <= means at threshold it engages
      expect(shouldEngageFreezeLock(-16.3, state, defaultConfig)).toBe(true);
    });

    it('should not engage just above threshold', () => {
      const state: FreezeState = { locked: false, unlockTime: 0 };
      // -16.29 > -16.3 so should not engage
      expect(shouldEngageFreezeLock(-16.29, state, defaultConfig)).toBe(false);
    });
  });

  describe('shouldReleaseFreezeLock', () => {
    it('should not release when not locked', () => {
      const state: FreezeState = { locked: false, unlockTime: 0 };
      const result = shouldReleaseFreezeLock(-1.0, 1000, state, defaultConfig);
      expect(result.release).toBe(false);
    });

    it('should not release when sensor is null', () => {
      const state: FreezeState = { locked: true, unlockTime: 0 };
      const result = shouldReleaseFreezeLock(null, 1000, state, defaultConfig);
      expect(result.release).toBe(false);
    });

    it('should start recovery when temp above threshold', () => {
      const state: FreezeState = { locked: true, unlockTime: 0 };
      // -2.0 + 0.5 = -1.5
      const result = shouldReleaseFreezeLock(-1.4, 1000, state, defaultConfig);
      expect(result.startRecovery).toBe(true);
      expect(result.release).toBe(false);
    });

    it('should cancel recovery when temp drops below stop', () => {
      const state: FreezeState = { locked: true, unlockTime: 900 };
      const result = shouldReleaseFreezeLock(-3.0, 1000, state, defaultConfig);
      expect(result.cancelRecovery).toBe(true);
      expect(result.release).toBe(false);
    });

    it('should release after recovery delay', () => {
      const state: FreezeState = { locked: true, unlockTime: 700 };
      const result = shouldReleaseFreezeLock(-1.4, 1000, state, defaultConfig);
      expect(result.release).toBe(true);
    });

    it('should not release before recovery delay', () => {
      const state: FreezeState = { locked: true, unlockTime: 800 };
      const result = shouldReleaseFreezeLock(-1.4, 1000, state, defaultConfig);
      expect(result.release).toBe(false);
    });
  });

  describe('updateFreezeProtection', () => {
    it('should engage freeze lock and increment count', () => {
      const state: FreezeState = { locked: false, unlockTime: 0, lockCount: 0 };
      const result = updateFreezeProtection(-16.4, 1000, state, defaultConfig);

      expect(result.locked).toBe(true);
      expect(result.lockCount).toBe(1);
      expect(result.unlockTime).toBe(0);
    });

    it('should start recovery timer', () => {
      const state: FreezeState = { locked: true, unlockTime: 0 };
      const result = updateFreezeProtection(-1.4, 1000, state, defaultConfig);

      expect(result.locked).toBe(true);
      expect(result.unlockTime).toBe(1000);
    });

    it('should release lock after recovery', () => {
      const state: FreezeState = { locked: true, unlockTime: 700 };
      const result = updateFreezeProtection(-1.4, 1000, state, defaultConfig);

      expect(result.locked).toBe(false);
      expect(result.unlockTime).toBe(0);
    });

    it('should cancel recovery on temp drop', () => {
      const state: FreezeState = { locked: true, unlockTime: 900 };
      const result = updateFreezeProtection(-3.0, 1000, state, defaultConfig);

      expect(result.locked).toBe(true);
      expect(result.unlockTime).toBe(0);
    });

    it('should maintain state when no changes needed', () => {
      const state: FreezeState = { locked: true, unlockTime: 0 };
      const result = updateFreezeProtection(-10.0, 1000, state, defaultConfig);

      expect(result.locked).toBe(true);
      expect(result.unlockTime).toBe(0);
    });

    it('should handle missing lockCount', () => {
      const state: FreezeState = { locked: false, unlockTime: 0 };
      const result = updateFreezeProtection(-16.4, 1000, state, defaultConfig);

      expect(result.lockCount).toBe(1);
    });
  });
});
