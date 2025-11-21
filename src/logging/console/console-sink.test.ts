/**
 * Unit tests for console sink
 */

import { createConsoleSink } from './console-sink';

describe('createConsoleSink', () => {
  let mockTimer: any;
  let mockConsole: any;
  let timerCallback: (() => void) | null;

  beforeEach(() => {
    timerCallback = null;
    mockTimer = {
      set: jest.fn((_interval: number, _repeat: boolean, callback: () => void) => {
        timerCallback = callback;
        return 1;
      })
    };
    mockConsole = {
      log: jest.fn(),
      warn: jest.fn()
    };
  });

  describe('write', () => {
    test('should buffer messages', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.write('message 1');
      sink.write('message 2');

      expect(sink.getBufferSize()).toBe(2);
    });

    test('should not write to console immediately', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.write('message');

      expect(mockConsole.log).not.toHaveBeenCalled();
    });

    test('should drop messages when buffer is full', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 2,
        drainInterval: 100
      });

      sink.write('message 1');
      sink.write('message 2');
      sink.write('message 3'); // Should be dropped

      expect(sink.getBufferSize()).toBe(2);
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('buffer overflow')
      );
    });

    test('should warn with dropped message content', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 1,
        drainInterval: 100
      });

      sink.write('first');
      sink.write('dropped message');

      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('dropped message')
      );
    });
  });

  describe('initialize', () => {
    test('should set up timer with correct interval', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 150
      });

      sink.initialize((_success, _message) => {});

      expect(mockTimer.set).toHaveBeenCalledWith(150, true, expect.any(Function));
    });

    test('should be idempotent - only start once', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.initialize((_success, _message) => {});
      sink.initialize((_success, _message) => {});
      sink.initialize((_success, _message) => {});

      expect(mockTimer.set).toHaveBeenCalledTimes(1);
    });

    test('should drain one message per tick', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.write('message 1');
      sink.write('message 2');
      sink.initialize((_success, _message) => {});

      // Simulate first tick
      timerCallback!();
      expect(mockConsole.log).toHaveBeenCalledTimes(1);
      expect(mockConsole.log).toHaveBeenCalledWith('message 1');
      expect(sink.getBufferSize()).toBe(1);

      // Simulate second tick
      timerCallback!();
      expect(mockConsole.log).toHaveBeenCalledTimes(2);
      expect(mockConsole.log).toHaveBeenLastCalledWith('message 2');
      expect(sink.getBufferSize()).toBe(0);
    });

    test('should handle empty buffer gracefully', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.initialize((_success, _message) => {});

      // Simulate tick with empty buffer
      timerCallback!();

      expect(mockConsole.log).not.toHaveBeenCalled();
      expect(sink.getBufferSize()).toBe(0);
    });

    test('should drain in FIFO order', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.write('first');
      sink.write('second');
      sink.write('third');
      sink.initialize((_success, _message) => {});

      timerCallback!();
      expect(mockConsole.log).toHaveBeenLastCalledWith('first');

      timerCallback!();
      expect(mockConsole.log).toHaveBeenLastCalledWith('second');

      timerCallback!();
      expect(mockConsole.log).toHaveBeenLastCalledWith('third');
    });

    test('should call callback with success', (done) => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.initialize((success, message) => {
        expect(success).toBe(true);
        expect(message).toBe('Console sink initialized');
        done();
      });
    });
  });

  describe('getBufferSize', () => {
    test('should return 0 for empty buffer', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      expect(sink.getBufferSize()).toBe(0);
    });

    test('should return correct count after writes', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.write('1');
      sink.write('2');
      sink.write('3');

      expect(sink.getBufferSize()).toBe(3);
    });

    test('should return correct count after drain', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      sink.write('1');
      sink.write('2');
      sink.initialize((_success, _message) => {});

      timerCallback!();

      expect(sink.getBufferSize()).toBe(1);
    });
  });

  describe('edge cases', () => {
    test('should handle buffer size of 1', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 1,
        drainInterval: 100
      });

      sink.write('only one');
      expect(sink.getBufferSize()).toBe(1);

      sink.write('dropped');
      expect(sink.getBufferSize()).toBe(1);
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    test('should handle very small drain interval', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 1
      });

      sink.initialize((_success, _message) => {});
      expect(mockTimer.set).toHaveBeenCalledWith(1, true, expect.any(Function));
    });

    test('should preserve message content exactly', () => {
      const sink = createConsoleSink(mockTimer, mockConsole, {
        bufferSize: 10,
        drainInterval: 100
      });

      const msg = 'Special chars: !@#$%^&*() 温度 🌡️';
      sink.write(msg);
      sink.initialize((_success, _message) => {});
      timerCallback!();

      expect(mockConsole.log).toHaveBeenCalledWith(msg);
    });
  });
});
