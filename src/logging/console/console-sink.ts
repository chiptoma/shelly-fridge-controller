/**
 * Console output sink with rate-limited buffering
 *
 * Prevents overwhelming Shelly's console with too many log messages by:
 * - Buffering messages up to a configurable limit
 * - Draining one message at a time at fixed intervals
 * - Dropping messages with warning when buffer overflows
 *
 * This is necessary because Shelly devices have limited console bandwidth
 * and can drop messages or become unresponsive if flooded.
 */

import type { TimerAPI } from '$types';
import type { ConsoleSink, ConsoleSinkConfig, ConsoleAPI } from '../types';

/**
 * Create a console sink with buffering
 *
 * The console sink buffers messages and drains them at a fixed interval
 * to prevent overwhelming the Shelly's limited console bandwidth.
 *
 * @param timerApi - Timer API for scheduling drain (global Timer object)
 * @param consoleApi - Console API for output (global console object)
 * @param config - Sink configuration (bufferSize, drainInterval)
 * @returns Console sink instance with write, startDrain, getBufferSize methods
 *
 * @example
 * ```typescript
 * const consoleSink = createConsoleSink(Timer, console, {
 *   bufferSize: 50,
 *   drainInterval: 100
 * });
 * consoleSink.startDrain();
 * consoleSink.write("Hello world");
 * ```
 */
export function createConsoleSink(
  timerApi: TimerAPI,
  consoleApi: ConsoleAPI,
  config: ConsoleSinkConfig
): ConsoleSink {
  const buffer: string[] = [];
  let drainStarted = false;

  /**
   * Drain one message from buffer
   * Called by timer at fixed interval
   */
  function drain() {
    if (buffer.length > 0) {
      consoleApi.log(buffer.splice(0, 1)[0]);
    }
  }

  /**
   * Start the drain timer (idempotent)
   */
  function startDrain() {
    if (!drainStarted) {
      drainStarted = true;
      timerApi.set(config.drainInterval, true, drain);
    }
  }

  /**
   * Write formatted message to buffer
   * @param formattedMessage - Pre-formatted log message
   */
  function write(formattedMessage: string) {
    if (buffer.length < config.bufferSize) {
      buffer.push(formattedMessage);
    } else {
      consoleApi.warn('Console log buffer overflow, dropping message: ' + formattedMessage);
    }
  }

  /**
   * Get current buffer size (for testing/monitoring)
   * @returns Current buffer size
   */
  function getBufferSize(): number {
    return buffer.length;
  }

  /**
   * Initialize the sink by starting the drain timer
   * @param callback - Called with (success, message)
   */
  function initialize(callback: (success: boolean, message: string) => void): void {
    startDrain();
    callback(true, 'Console sink initialized');
  }

  return {
    write: write,
    initialize: initialize,
    getBufferSize: getBufferSize
  };
}
