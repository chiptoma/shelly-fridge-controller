import { checkMinOn, checkMinOff, applyTimingConstraints } from './compressor-timing';
import { TIMING_CONSTRAINTS } from './types';
import type { TimingState, TimingConfig } from './types';

describe('compressor-timing', () => {
  describe('checkMinOn', () => {
    it('should allow when relay is off', () => {
      const result = checkMinOn(false, false, 1000, 900, 180);
      expect(result.allow).toBe(true);
    });

    it('should allow when wanting to cool (not trying to turn off)', () => {
      const result = checkMinOn(true, true, 1000, 900, 180);
      expect(result.allow).toBe(true);
    });

    it('should allow when min on time has passed', () => {
      const result = checkMinOn(true, false, 1000, 800, 180);
      expect(result.allow).toBe(true);
    });

    it('should block when min on time has not passed', () => {
      const result = checkMinOn(true, false, 1000, 900, 180);
      expect(result.allow).toBe(false);
      expect(result.remainingSec).toBe(80);
      expect(result.canTurnOffAt).toBe(1080);
    });

    it('should allow at exactly min on time', () => {
      const result = checkMinOn(true, false, 1000, 820, 180);
      expect(result.allow).toBe(true);
    });

    // Edge cases
    it('should handle zero lastOnTime (never turned on)', () => {
      const result = checkMinOn(true, false, 1000, 0, 180);
      expect(result.allow).toBe(true);
    });

    // Validation tests
    it('should throw on negative timestamp', () => {
      expect(() => checkMinOn(true, false, -1, 0, 180)).toThrow();
    });

    it('should throw on NaN values', () => {
      expect(() => checkMinOn(true, false, NaN, 0, 180)).toThrow();
    });

    it('should throw on Infinity', () => {
      expect(() => checkMinOn(true, false, Infinity, 0, 180)).toThrow();
    });

    it('should throw on zero duration', () => {
      expect(() => checkMinOn(true, false, 1000, 900, 0)).toThrow();
    });

    it('should throw on negative duration', () => {
      expect(() => checkMinOn(true, false, 1000, 900, -180)).toThrow();
    });

    it('should throw on NaN lastTime', () => {
      expect(() => checkMinOn(true, false, 1000, NaN, 180)).toThrow();
    });

    it('should throw on negative lastTime', () => {
      expect(() => checkMinOn(true, false, 1000, -100, 180)).toThrow();
    });
  });

  describe('checkMinOff', () => {
    it('should allow when relay is on', () => {
      const result = checkMinOff(true, true, 1000, 900, 300);
      expect(result.allow).toBe(true);
    });

    it('should allow when not wanting to cool (not trying to turn on)', () => {
      const result = checkMinOff(false, false, 1000, 900, 300);
      expect(result.allow).toBe(true);
    });

    it('should allow when min off time has passed', () => {
      const result = checkMinOff(false, true, 1000, 600, 300);
      expect(result.allow).toBe(true);
    });

    it('should block when min off time has not passed', () => {
      const result = checkMinOff(false, true, 1000, 800, 300);
      expect(result.allow).toBe(false);
      expect(result.remainingSec).toBe(100);
      expect(result.canTurnOnAt).toBe(1100);
    });

    it('should allow at exactly min off time', () => {
      const result = checkMinOff(false, true, 1000, 700, 300);
      expect(result.allow).toBe(true);
    });

    // Edge cases
    it('should handle zero lastOffTime (never turned off)', () => {
      const result = checkMinOff(false, true, 1000, 0, 300);
      expect(result.allow).toBe(true);
    });
  });

  describe('applyTimingConstraints', () => {
    const defaultConfig: TimingConfig = {
      MIN_ON_SEC: 180,
      MIN_OFF_SEC: 300
    };

    it('should allow when no constraints violated', () => {
      const state: TimingState = { lastOnTime: 0, lastOffTime: 0 };
      const result = applyTimingConstraints(false, true, 1000, state, defaultConfig);
      expect(result.allow).toBe(true);
    });

    it('should block with MIN_ON reason', () => {
      const state: TimingState = { lastOnTime: 900, lastOffTime: 0 };
      const result = applyTimingConstraints(true, false, 1000, state, defaultConfig);
      expect(result.allow).toBe(false);
      expect(result.reason).toBe(TIMING_CONSTRAINTS.MIN_ON);
    });

    it('should block with MIN_OFF reason', () => {
      const state: TimingState = { lastOnTime: 0, lastOffTime: 800 };
      const result = applyTimingConstraints(false, true, 1000, state, defaultConfig);
      expect(result.allow).toBe(false);
      expect(result.reason).toBe(TIMING_CONSTRAINTS.MIN_OFF);
    });

    it('should allow state change when constraints satisfied', () => {
      const state: TimingState = { lastOnTime: 700, lastOffTime: 500 };
      const result = applyTimingConstraints(true, false, 1000, state, defaultConfig);
      expect(result.allow).toBe(true);
    });

    it('should preserve metadata from failed check', () => {
      const state: TimingState = { lastOnTime: 900, lastOffTime: 0 };
      const result = applyTimingConstraints(true, false, 1000, state, defaultConfig);
      expect(result.remainingSec).toBe(80);
      expect(result.canTurnOffAt).toBe(1080);
    });

    it('should prioritize MIN_ON when both would fail', () => {
      const state: TimingState = { lastOnTime: 950, lastOffTime: 950 };
      const result = applyTimingConstraints(true, false, 1000, state, defaultConfig);
      expect(result.reason).toBe(TIMING_CONSTRAINTS.MIN_ON);
    });
  });
});
