/**
 * Unit tests for logger coordinator
 */

import { createLogger } from './logger';
import type { LogLevels } from './types';

const LOG_LEVELS: LogLevels = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3
};

describe('createLogger', () => {
  let mockTimeSource: jest.Mock;
  let mockSink: any;

  beforeEach(() => {
    mockTimeSource = jest.fn(() => 100);
    // Create mock sink with 1-arg write function (level filtering done by logger)
    mockSink = {
      sink: { write: jest.fn() },
      minLevel: LOG_LEVELS.DEBUG
    };
  });

  describe('log level methods', () => {
    test('should log debug messages when level is DEBUG', () => {
      const logger = createLogger(
        { level: LOG_LEVELS.DEBUG, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.debug('test debug');

      expect(mockSink.sink.write).toHaveBeenCalledWith('[DEBUG]    test debug');
    });

    test('should log info messages when level is INFO', () => {
      mockSink.minLevel = LOG_LEVELS.INFO;
      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.info('test info');

      expect(mockSink.sink.write).toHaveBeenCalledWith('ℹ️ [INFO]     test info');
    });

    test('should log warning messages', () => {
      mockSink.minLevel = LOG_LEVELS.WARNING;
      const logger = createLogger(
        { level: LOG_LEVELS.WARNING, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.warning('test warning');

      expect(mockSink.sink.write).toHaveBeenCalledWith('⚠️ [WARNING]  test warning');
    });

    test('should log critical messages', () => {
      mockSink.minLevel = LOG_LEVELS.CRITICAL;
      const logger = createLogger(
        { level: LOG_LEVELS.CRITICAL, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.critical('test critical');

      expect(mockSink.sink.write).toHaveBeenCalledWith('🚨 [CRITICAL] test critical');
    });

    test('should log via generic log method', () => {
      mockSink.minLevel = LOG_LEVELS.INFO;
      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.log(LOG_LEVELS.WARNING, 'generic log');

      expect(mockSink.sink.write).toHaveBeenCalledWith('⚠️ [WARNING]  generic log');
    });
  });

  describe('level filtering', () => {
    test('should not log debug when level is INFO', () => {
      mockSink.minLevel = LOG_LEVELS.INFO;
      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.debug('should not appear');

      expect(mockSink.sink.write).not.toHaveBeenCalled();
    });

    test('should not log info when level is WARNING', () => {
      mockSink.minLevel = LOG_LEVELS.WARNING;
      const logger = createLogger(
        { level: LOG_LEVELS.WARNING, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.info('should not appear');

      expect(mockSink.sink.write).not.toHaveBeenCalled();
    });

    test('should log warning when level is INFO', () => {
      mockSink.minLevel = LOG_LEVELS.INFO;
      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.warning('should appear');

      expect(mockSink.sink.write).toHaveBeenCalled();
    });

    test('should always log critical regardless of level', () => {
      mockSink.minLevel = LOG_LEVELS.CRITICAL;
      const logger = createLogger(
        { level: LOG_LEVELS.CRITICAL, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.critical('always visible');

      expect(mockSink.sink.write).toHaveBeenCalled();
    });
  });

  describe('auto-demotion', () => {
    test('should demote INFO after demoteHours', () => {
      mockTimeSource.mockReturnValue(25 * 3600); // 25 hours
      mockSink.minLevel = LOG_LEVELS.INFO;

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 24 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.info('should be demoted');

      expect(mockSink.sink.write).not.toHaveBeenCalled();
    });

    test('should not demote WARNING after demoteHours', () => {
      mockTimeSource.mockReturnValue(25 * 3600);
      mockSink.minLevel = LOG_LEVELS.INFO;

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 24 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.warning('should not be demoted');

      expect(mockSink.sink.write).toHaveBeenCalled();
    });
  });

  describe('setLevel and getLevel', () => {
    test('should return initial level', () => {
      mockSink.minLevel = LOG_LEVELS.WARNING;
      const logger = createLogger(
        { level: LOG_LEVELS.WARNING, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      expect(logger.getLevel()).toBe(LOG_LEVELS.WARNING);
    });

    test('should update level at runtime', () => {
      mockSink.minLevel = LOG_LEVELS.WARNING;
      const logger = createLogger(
        { level: LOG_LEVELS.WARNING, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.setLevel(LOG_LEVELS.DEBUG);

      expect(logger.getLevel()).toBe(LOG_LEVELS.DEBUG);
    });

    test('should filter based on new level after setLevel', () => {
      mockSink.minLevel = LOG_LEVELS.INFO;
      const logger = createLogger(
        { level: LOG_LEVELS.WARNING, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      // Initially INFO should not appear (logger level is WARNING)
      logger.info('before setLevel');
      expect(mockSink.sink.write).not.toHaveBeenCalled();

      // Change to INFO level
      logger.setLevel(LOG_LEVELS.INFO);

      // Now INFO should appear
      logger.info('after setLevel');
      expect(mockSink.sink.write).toHaveBeenCalled();
    });
  });

  describe('multiple sinks', () => {
    test('should write to all sinks', () => {
      const sink1 = { sink: { write: jest.fn() }, minLevel: LOG_LEVELS.INFO };
      const sink2 = { sink: { write: jest.fn() }, minLevel: LOG_LEVELS.INFO };

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [sink1, sink2] },
        LOG_LEVELS
      );

      logger.info('test message');

      expect(sink1.sink.write).toHaveBeenCalled();
      expect(sink2.sink.write).toHaveBeenCalled();
    });

    test('should continue to other sinks if one throws', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const sink1 = {
        sink: {
          write: jest.fn(() => {
            throw new Error('Sink error');
          })
        },
        minLevel: LOG_LEVELS.INFO
      };
      const sink2 = { sink: { write: jest.fn() }, minLevel: LOG_LEVELS.INFO };

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [sink1, sink2] },
        LOG_LEVELS
      );

      logger.info('test message');

      // sink1 threw but sink2 should still be called
      expect(sink2.sink.write).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Logger sink error')
      );

      consoleSpy.mockRestore();
    });

    test('should handle empty sinks array', () => {
      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [] },
        LOG_LEVELS
      );

      // Should not throw
      expect(() => logger.info('test')).not.toThrow();
    });

    test('should filter by per-sink minLevel', () => {
      // Console sink receives INFO+, Slack sink receives WARNING+
      const consoleSink = { sink: { write: jest.fn() }, minLevel: LOG_LEVELS.INFO };
      const slackSink = { sink: { write: jest.fn() }, minLevel: LOG_LEVELS.WARNING };

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [consoleSink, slackSink] },
        LOG_LEVELS
      );

      // INFO should go to console only
      logger.info('test info');
      expect(consoleSink.sink.write).toHaveBeenCalledTimes(1);
      expect(slackSink.sink.write).not.toHaveBeenCalled();

      // WARNING should go to both
      logger.warning('test warning');
      expect(consoleSink.sink.write).toHaveBeenCalledTimes(2);
      expect(slackSink.sink.write).toHaveBeenCalledTimes(1);
    });

    test('should call write with only message argument', () => {
      const sink = { sink: { write: jest.fn() }, minLevel: LOG_LEVELS.INFO };

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [sink] },
        LOG_LEVELS
      );

      logger.warning('test');

      // Should be called with only message (no level argument)
      expect(sink.sink.write).toHaveBeenCalledTimes(1);
      expect(sink.sink.write.mock.calls[0].length).toBe(1);
      expect(sink.sink.write).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('initialize', () => {
    test('should call initialize on all sinks that have it', (done) => {
      const sink1 = {
        sink: {
          write: jest.fn(),
          initialize: jest.fn((cb: Function) => cb(true, 'Sink 1 ready'))
        },
        minLevel: LOG_LEVELS.INFO
      };
      const sink2 = {
        sink: {
          write: jest.fn(),
          initialize: jest.fn((cb: Function) => cb(true, 'Sink 2 ready'))
        },
        minLevel: LOG_LEVELS.INFO
      };

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [sink1, sink2] },
        LOG_LEVELS
      );

      logger.initialize((success, messages) => {
        expect(success).toBe(true);
        expect(messages).toHaveLength(2);
        expect(messages[0]).toEqual({ success: true, message: 'Sink 1 ready' });
        expect(messages[1]).toEqual({ success: true, message: 'Sink 2 ready' });
        expect(sink1.sink.initialize).toHaveBeenCalled();
        expect(sink2.sink.initialize).toHaveBeenCalled();
        done();
      });
    });

    test('should skip sinks without initialize', (done) => {
      const sink1 = { sink: { write: jest.fn() }, minLevel: LOG_LEVELS.INFO }; // No initialize
      const sink2 = {
        sink: {
          write: jest.fn(),
          initialize: jest.fn((cb: Function) => cb(true, 'Sink 2 ready'))
        },
        minLevel: LOG_LEVELS.INFO
      };

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [sink1, sink2] },
        LOG_LEVELS
      );

      logger.initialize((success, messages) => {
        expect(success).toBe(true);
        expect(messages).toHaveLength(1);
        expect(messages[0].message).toBe('Sink 2 ready');
        done();
      });
    });

    test('should call callback immediately if no sinks need initialization', (done) => {
      const sink = { sink: { write: jest.fn() }, minLevel: LOG_LEVELS.INFO };

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [sink] },
        LOG_LEVELS
      );

      logger.initialize((success, messages) => {
        expect(success).toBe(true);
        expect(messages).toHaveLength(0);
        done();
      });
    });

    test('should collect failure messages from sinks', (done) => {
      const sink = {
        sink: {
          write: jest.fn(),
          initialize: jest.fn((cb: Function) => cb(false, 'Failed to init'))
        },
        minLevel: LOG_LEVELS.INFO
      };

      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [sink] },
        LOG_LEVELS
      );

      logger.initialize((success, messages) => {
        expect(success).toBe(true); // Overall success even if sink fails
        expect(messages[0]).toEqual({ success: false, message: 'Failed to init' });
        done();
      });
    });
  });

  describe('edge cases', () => {
    test('should handle undefined sinks', () => {
      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: undefined as any },
        LOG_LEVELS
      );

      expect(() => logger.info('test')).not.toThrow();
    });

    test('should handle empty message', () => {
      mockSink.minLevel = LOG_LEVELS.INFO;
      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      logger.info('');

      expect(mockSink.sink.write).toHaveBeenCalledWith('ℹ️ [INFO]     ');
    });

    test('should handle special characters in message', () => {
      mockSink.minLevel = LOG_LEVELS.INFO;
      const logger = createLogger(
        { level: LOG_LEVELS.INFO, demoteHours: 0 },
        { timeSource: mockTimeSource, sinks: [mockSink] },
        LOG_LEVELS
      );

      const msg = 'Temperature: 4.5°C 🌡️ Status: OK';
      logger.info(msg);

      expect(mockSink.sink.write).toHaveBeenCalledWith(expect.stringContaining(msg));
    });
  });
});
