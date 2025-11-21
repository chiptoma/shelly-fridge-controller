/**
 * Unit tests for logging helper functions
 */

import { formatLogMessage, shouldLog } from './helpers';
import type { LogLevels } from './types';

const LOG_LEVELS: LogLevels = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3
};

describe('formatLogMessage', () => {
  describe('level formatting', () => {
    test('should format DEBUG level with correct tag', () => {
      const result = formatLogMessage(LOG_LEVELS.DEBUG, 'test message', LOG_LEVELS);
      expect(result).toBe('[DEBUG]    test message');
    });

    test('should format INFO level with emoji and correct tag', () => {
      const result = formatLogMessage(LOG_LEVELS.INFO, 'test message', LOG_LEVELS);
      expect(result).toBe('ℹ️ [INFO]     test message');
    });

    test('should format WARNING level with emoji and correct tag', () => {
      const result = formatLogMessage(LOG_LEVELS.WARNING, 'test message', LOG_LEVELS);
      expect(result).toBe('⚠️ [WARNING]  test message');
    });

    test('should format CRITICAL level with emoji and correct tag', () => {
      const result = formatLogMessage(LOG_LEVELS.CRITICAL, 'test message', LOG_LEVELS);
      expect(result).toBe('🚨 [CRITICAL] test message');
    });
  });

  describe('message content', () => {
    test('should preserve message content exactly', () => {
      const msg = 'Temperature: 4.5°C, Setpoint: 4.0°C';
      const result = formatLogMessage(LOG_LEVELS.INFO, msg, LOG_LEVELS);
      expect(result).toContain(msg);
    });

    test('should handle empty message', () => {
      const result = formatLogMessage(LOG_LEVELS.INFO, '', LOG_LEVELS);
      expect(result).toBe('ℹ️ [INFO]     ');
    });

    test('should handle message with special characters', () => {
      const msg = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\';
      const result = formatLogMessage(LOG_LEVELS.DEBUG, msg, LOG_LEVELS);
      expect(result).toContain(msg);
    });

    test('should handle message with newlines', () => {
      const msg = 'Line 1\nLine 2\nLine 3';
      const result = formatLogMessage(LOG_LEVELS.INFO, msg, LOG_LEVELS);
      expect(result).toContain(msg);
    });

    test('should handle very long message', () => {
      const msg = 'x'.repeat(1000);
      const result = formatLogMessage(LOG_LEVELS.WARNING, msg, LOG_LEVELS);
      expect(result).toContain(msg);
    });

    test('should handle unicode characters', () => {
      const msg = '温度: 4.5°C 🌡️';
      const result = formatLogMessage(LOG_LEVELS.INFO, msg, LOG_LEVELS);
      expect(result).toContain(msg);
    });
  });

  describe('edge cases', () => {
    test('should handle unknown level as DEBUG', () => {
      const result = formatLogMessage(99 as any, 'test', LOG_LEVELS);
      expect(result).toBe('[DEBUG]    test');
    });

    test('should handle negative level as DEBUG', () => {
      const result = formatLogMessage(-1 as any, 'test', LOG_LEVELS);
      expect(result).toBe('[DEBUG]    test');
    });
  });
});

describe('shouldLog', () => {
  describe('basic level filtering', () => {
    test('should log when level equals current log level', () => {
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: 100,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should not log when level below current log level', () => {
      const result = shouldLog(LOG_LEVELS.DEBUG, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: 100,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(false);
    });

    test('should log when level above current log level', () => {
      const result = shouldLog(LOG_LEVELS.CRITICAL, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: 100,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should log DEBUG when current level is DEBUG', () => {
      const result = shouldLog(LOG_LEVELS.DEBUG, {
        currentLevel: LOG_LEVELS.DEBUG,
        uptime: 100,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should not log INFO when current level is WARNING', () => {
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.WARNING,
        uptime: 100,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(false);
    });

    test('should log WARNING when current level is WARNING', () => {
      const result = shouldLog(LOG_LEVELS.WARNING, {
        currentLevel: LOG_LEVELS.WARNING,
        uptime: 100,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should only log CRITICAL when current level is CRITICAL', () => {
      expect(shouldLog(LOG_LEVELS.DEBUG, {
        currentLevel: LOG_LEVELS.CRITICAL,
        uptime: 100,
        demoteHours: 0
      }, LOG_LEVELS)).toBe(false);

      expect(shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.CRITICAL,
        uptime: 100,
        demoteHours: 0
      }, LOG_LEVELS)).toBe(false);

      expect(shouldLog(LOG_LEVELS.WARNING, {
        currentLevel: LOG_LEVELS.CRITICAL,
        uptime: 100,
        demoteHours: 0
      }, LOG_LEVELS)).toBe(false);

      expect(shouldLog(LOG_LEVELS.CRITICAL, {
        currentLevel: LOG_LEVELS.CRITICAL,
        uptime: 100,
        demoteHours: 0
      }, LOG_LEVELS)).toBe(true);
    });
  });

  describe('auto-demotion of INFO logs', () => {
    test('should demote INFO logs after uptime threshold', () => {
      const uptime = 25 * 3600; // 25 hours
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: uptime,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(false);
    });

    test('should not demote INFO logs before uptime threshold', () => {
      const uptime = 23 * 3600; // 23 hours
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: uptime,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should demote INFO at exact threshold boundary', () => {
      const uptime = 24 * 3600 + 1; // Just over 24 hours
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: uptime,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(false);
    });

    test('should not demote INFO logs in DEBUG mode', () => {
      const uptime = 25 * 3600;
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.DEBUG,
        uptime: uptime,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should not demote when demoteHours is 0 (disabled)', () => {
      const uptime = 100000;
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: uptime,
        demoteHours: 0
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should not demote WARNING logs regardless of uptime', () => {
      const uptime = 100 * 3600; // 100 hours
      const result = shouldLog(LOG_LEVELS.WARNING, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: uptime,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should not demote CRITICAL logs regardless of uptime', () => {
      const uptime = 100 * 3600;
      const result = shouldLog(LOG_LEVELS.CRITICAL, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: uptime,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should not demote DEBUG logs (they are below INFO)', () => {
      const uptime = 100 * 3600;
      const result = shouldLog(LOG_LEVELS.DEBUG, {
        currentLevel: LOG_LEVELS.DEBUG,
        uptime: uptime,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should handle zero uptime', () => {
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: 0,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should handle negative uptime (clock skew)', () => {
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: -100,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(true);
    });

    test('should handle very large uptime', () => {
      const uptime = 365 * 24 * 3600; // 1 year
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: uptime,
        demoteHours: 24
      }, LOG_LEVELS);
      expect(result).toBe(false);
    });

    test('should handle fractional demoteHours', () => {
      const uptime = 1900; // ~31.7 minutes
      const result = shouldLog(LOG_LEVELS.INFO, {
        currentLevel: LOG_LEVELS.INFO,
        uptime: uptime,
        demoteHours: 0.5 // 30 minutes
      }, LOG_LEVELS);
      expect(result).toBe(false);
    });
  });
});
