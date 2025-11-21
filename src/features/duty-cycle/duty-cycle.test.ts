/**
 * Unit tests for duty cycle functions
 */

import {
  updateDutyCycle,
  getDutyPercent,
  resetDutyCycle,
  shouldResetDutyCycle,
} from './duty-cycle';
import type { DutyCycleState } from './types';

describe('Duty Cycle', () => {
  // ═══════════════════════════════════════════════════════════════
  // updateDutyCycle()
  // ═══════════════════════════════════════════════════════════════

  describe('updateDutyCycle', () => {
    it('should accumulate ON time when relay is on', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, 10, true);

      expect(result.dutyOnSec).toBe(110);
      expect(result.dutyOffSec).toBe(50);
    });

    it('should accumulate OFF time when relay is off', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, 10, false);

      expect(result.dutyOnSec).toBe(100);
      expect(result.dutyOffSec).toBe(60);
    });

    it('should not mutate input state', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };
      const original = { ...state };

      updateDutyCycle(state, 10, true);

      expect(state).toEqual(original);
    });

    it('should return same state for zero delta', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, 0, true);

      expect(result).toBe(state);
    });

    it('should return same state for negative delta', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, -5, true);

      expect(result).toBe(state);
    });

    it('should return same state for NaN delta', () => {
      const state: DutyCycleState = {
        dutyOnSec: 100,
        dutyOffSec: 50,
        dutyLastReset: 1000,
      };

      const result = updateDutyCycle(state, NaN, true);

      expect(result).toBe(state);
    });

    it('should return same state for null dutyState', () => {
      const result = updateDutyCycle(null as unknown as DutyCycleState, 10, true);

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // getDutyPercent()
  // ═══════════════════════════════════════════════════════════════

  describe('getDutyPercent', () => {
    it('should calculate 50% duty cycle', () => {
      const result = getDutyPercent(100, 100);
      expect(result).toBe(50);
    });

    it('should calculate 100% duty cycle', () => {
      const result = getDutyPercent(100, 0);
      expect(result).toBe(100);
    });

    it('should calculate 0% duty cycle', () => {
      const result = getDutyPercent(0, 100);
      expect(result).toBe(0);
    });

    it('should return 0 for zero total', () => {
      const result = getDutyPercent(0, 0);
      expect(result).toBe(0);
    });

    it('should return 0 for NaN inputs', () => {
      expect(getDutyPercent(NaN, 100)).toBe(0);
      expect(getDutyPercent(100, NaN)).toBe(0);
    });

    it('should handle large numbers', () => {
      const result = getDutyPercent(86400, 86400);
      expect(result).toBe(50);
    });

    it('should handle fractional seconds', () => {
      const result = getDutyPercent(0.5, 0.5);
      expect(result).toBe(50);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // resetDutyCycle()
  // ═══════════════════════════════════════════════════════════════

  describe('resetDutyCycle', () => {
    it('should return fresh state with current timestamp', () => {
      const now = 1234567890;
      const result = resetDutyCycle(now);

      expect(result.dutyOnSec).toBe(0);
      expect(result.dutyOffSec).toBe(0);
      expect(result.dutyLastReset).toBe(now);
    });

    it('should handle zero timestamp', () => {
      const result = resetDutyCycle(0);
      expect(result.dutyLastReset).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // shouldResetDutyCycle()
  // ═══════════════════════════════════════════════════════════════

  describe('shouldResetDutyCycle', () => {
    it('should return true when interval has elapsed', () => {
      const result = shouldResetDutyCycle(1100, 1000, 100);
      expect(result).toBe(true);
    });

    it('should return true at exactly interval', () => {
      const result = shouldResetDutyCycle(1100, 1000, 100);
      expect(result).toBe(true);
    });

    it('should return false when interval not elapsed', () => {
      const result = shouldResetDutyCycle(1050, 1000, 100);
      expect(result).toBe(false);
    });

    it('should return false when lastReset is zero', () => {
      const result = shouldResetDutyCycle(1100, 0, 100);
      expect(result).toBe(false);
    });

    it('should return false when interval is zero', () => {
      const result = shouldResetDutyCycle(1100, 1000, 0);
      expect(result).toBe(false);
    });

    it('should return false when interval is negative', () => {
      const result = shouldResetDutyCycle(1100, 1000, -100);
      expect(result).toBe(false);
    });

    it('should handle large intervals', () => {
      const day = 86400;
      const result = shouldResetDutyCycle(day * 2, day, day);
      expect(result).toBe(true);
    });
  });
});
