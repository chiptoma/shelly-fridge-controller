import { petWatchdog, isWatchdogStarved, getTimeSinceLastPet } from './loop-watchdog';
import type { WatchdogState } from './types';

describe('loop-watchdog', () => {
  describe('petWatchdog', () => {
    it('should update lastWatchdogPet timestamp', () => {
      const state: WatchdogState = { lastWatchdogPet: 1000 };
      petWatchdog(state, 1005);
      expect(state.lastWatchdogPet).toBe(1005);
    });

    it('should allow updating with same timestamp', () => {
      const state: WatchdogState = { lastWatchdogPet: 1000 };
      petWatchdog(state, 1000);
      expect(state.lastWatchdogPet).toBe(1000);
    });

    it('should work with initial zero state', () => {
      const state: WatchdogState = { lastWatchdogPet: 0 };
      petWatchdog(state, 100);
      expect(state.lastWatchdogPet).toBe(100);
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
