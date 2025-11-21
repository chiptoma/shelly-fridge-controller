/**
 * Main logger coordinator
 *
 * Combines filtering, formatting, and output sinks into a unified logging system.
 * The logger routes messages through filters and formatters before writing to sinks.
 *
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARNING, CRITICAL)
 * - Auto-demotion of INFO logs after configurable uptime
 * - Multiple output sinks (console, Slack)
 * - Runtime level adjustment
 * - Async sink initialization
 */

import type { LogLevel, LogLevels, Logger, LoggerConfig, LoggerDependencies, InitMessage, SinkWithLevel } from './types';

/**
 * Create a logger instance
 *
 * The logger coordinates filtering, formatting, and output to multiple sinks.
 * Each message is:
 * 1. Checked against the current log level and auto-demotion rules
 * 2. Formatted with a level-appropriate tag
 * 3. Written to all configured sinks
 *
 * @param config - Logger configuration (level, demoteHours)
 * @param dependencies - External dependencies (timeSource, sinks)
 * @param logLevels - Log level constants object
 * @returns Logger instance with log methods
 *
 * @example
 * ```typescript
 * const logger = createLogger(
 *   { level: LOG_LEVELS.INFO, demoteHours: 24 },
 *   {
 *     timeSource: now,
 *     sinks: [
 *       { sink: consoleSink, minLevel: LOG_LEVELS.INFO },
 *       { sink: slackSink, minLevel: LOG_LEVELS.WARNING }
 *     ]
 *   },
 *   LOG_LEVELS
 * );
 *
 * logger.info("System started");    // Console only
 * logger.warning("Temperature high"); // Console + Slack
 * ```
 */
export function createLogger(
  config: LoggerConfig,
  dependencies: LoggerDependencies,
  logLevels: LogLevels
): Logger {
  let currentLevel = config.level;
  const demoteHours = config.demoteHours;
  const timeSource = dependencies.timeSource;
  const sinks: SinkWithLevel[] = dependencies.sinks || [];
  const startTime = timeSource(); // Track when logger was created for uptime calculation

  /**
   * Internal log function - inlined for minimal call stack depth on Shelly
   * @param level - Log level (0-3)
   * @param msg - Message to log
   */
  function log(level: LogLevel, msg: string) {
    // Inline level check (from shouldLog)
    if (level < currentLevel) {
      return;
    }

    // Inline auto-demotion check
    if (level === logLevels.INFO && currentLevel > logLevels.DEBUG && demoteHours > 0) {
      const uptime = timeSource() - startTime;
      if (uptime > demoteHours * 3600) {
        return;
      }
    }

    // Inline message formatting (from formatLogMessage)
    let tag = "[DEBUG]    ";
    if (level === logLevels.INFO) tag = "ℹ️ [INFO]     ";
    if (level === logLevels.WARNING) tag = "⚠️ [WARNING]  ";
    if (level === logLevels.CRITICAL) tag = "🚨 [CRITICAL] ";
    const formattedMessage = tag + msg;

    // Write to sinks that meet the level threshold
    for (let i = 0; i < sinks.length; i++) {
      if (level < sinks[i].minLevel) {
        continue;
      }

      try {
        sinks[i].sink.write(formattedMessage);
      } catch (err) {
        // Sink errors should not crash the logger
        console.warn('Logger sink error: ' + err);
      }
    }
  }

  /**
   * Log DEBUG level message
   * Use for detailed diagnostic information during development
   * @param msg - Message to log
   */
  function debug(msg: string): void {
    log(logLevels.DEBUG, msg);
  }

  /**
   * Log INFO level message
   * Use for general operational information
   * @param msg - Message to log
   */
  function info(msg: string): void {
    log(logLevels.INFO, msg);
  }

  /**
   * Log WARNING level message
   * Use for potentially harmful situations that need attention
   * @param msg - Message to log
   */
  function warning(msg: string): void {
    log(logLevels.WARNING, msg);
  }

  /**
   * Log CRITICAL level message
   * Use for serious errors that may cause system failure
   * @param msg - Message to log
   */
  function critical(msg: string): void {
    log(logLevels.CRITICAL, msg);
  }

  /**
   * Update log level at runtime
   * @param newLevel - New log level (0-3)
   */
  function setLevel(newLevel: LogLevel) {
    currentLevel = newLevel;
  }

  /**
   * Get current log level
   * @returns Current log level
   */
  function getLevel(): LogLevel {
    return currentLevel;
  }

  /**
   * Initialize all sinks
   * @param callback - Called with (success, messages[])
   */
  function initialize(callback: (success: boolean, messages: InitMessage[]) => void): void {
    const messages: InitMessage[] = [];
    let completed = 0;
    let total = 0;

    // Count sinks that need initialization
    for (let i = 0; i < sinks.length; i++) {
      if (sinks[i].sink.initialize) {
        total++;
      }
    }

    if (total === 0) {
      callback(true, messages);
      return;
    }

    // Initialize each sink
    for (let i = 0; i < sinks.length; i++) {
      if (sinks[i].sink.initialize) {
        sinks[i].sink.initialize!(function(success: boolean, message: string) {
          messages.push({ success: success, message: message });
          completed++;
          if (completed === total) {
            callback(true, messages);
          }
        });
      }
    }
  }

  return {
    log: log,
    debug: debug,
    info: info,
    warning: warning,
    critical: critical,
    setLevel: setLevel,
    getLevel: getLevel,
    initialize: initialize
  };
}
