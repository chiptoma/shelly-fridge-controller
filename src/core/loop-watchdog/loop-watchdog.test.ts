import { petWatchdog, isWatchdogStarved, getTimeSinceLastPet } from './loop-watchdog';
import type { WatchdogState } from './types';

describe('loop-watchdog', () => {
  describe('petWatchdog', () => {
    it('should return new state with updated timestamp', () => {
      const state: WatchdogState = { lastWatchdogPet: 1000 };
      const newState = petWatchdog(state, 1005);

      expect(newState.lastWatchdogPet).toBe(1005);
      expect(newState).not.toBe(state); // Immutable update
      expect(state.lastWatchdogPet).toBe(1000); // Original unchanged
    });

    it('should work with initial zero state', () => {
      const state: WatchdogState = { lastWatchdogPet: 0 };
      const newState = petWatchdog(state, 100);
      expect(newState.lastWatchdogPet).toBe(100);
    });

    it('should throw on negative timestamp', () => {
      const state: WatchdogState = { lastWatchdogPet: 0 };
      expect(() => petWatchdog(state, -1)).toThrow();
    });

    it('should throw on NaN', () => {
      const state: WatchdogState = { lastWatchdogPet: 0 };
      expect(() => petWatchdog(state, NaN)).toThrow();
    });
  });

  describe('isWatchdogStarved', () => {
    it('should return false when within timeout', () => {
      expect(isWatchdogStarved(1000, 1010, 30)).toBe(false);
    });

    it('should return false at exactly timeout', () => {
      expect(isWatchdogStarved(1000, 1030, 30)).toBe(false);
    });

    it('should return true when exceeding timeout', () => {
      expect(isWatchdogStarved(1000, 1031, 30)).toBe(true);
    });

    it('should handle large time differences', () => {
      expect(isWatchdogStarved(1000, 2000, 30)).toBe(true);
    });

    it('should handle zero lastPet (never pet)', () => {
      expect(isWatchdogStarved(0, 100, 30)).toBe(true);
    });

    it('should throw on zero timeout', () => {
      expect(() => isWatchdogStarved(1000, 1010, 0)).toThrow();
    });

    it('should throw on negative timeout', () => {
      expect(() => isWatchdogStarved(1000, 1010, -30)).toThrow();
    });
  });

  describe('getTimeSinceLastPet', () => {
    it('should calculate correct time difference', () => {
      expect(getTimeSinceLastPet(1000, 1025)).toBe(25);
    });

    it('should return zero for same timestamps', () => {
      expect(getTimeSinceLastPet(1000, 1000)).toBe(0);
    });

    it('should handle initial zero state', () => {
      expect(getTimeSinceLastPet(0, 100)).toBe(100);
    });
  });
});
