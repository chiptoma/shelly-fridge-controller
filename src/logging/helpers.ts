/**
 * Logging helper functions
 */

import type { TemperatureReading } from '$types/common';
import type { LogLevel, LogLevels, FilterContext } from './types';

/**
 * Format temperature with optional raw value display
 * @param value - Processed temperature value
 * @param raw - Raw temperature value
 * @param showRaw - Whether to show raw value
 * @returns Formatted temperature string
 */
export function fmtTemp(
  value: TemperatureReading,
  raw: TemperatureReading,
  showRaw: boolean
): string {
  if (value === null) return "n/a";

  let str = value.toFixed(1) + "C";

  if (showRaw && raw !== null && raw !== value) {
    str = str + " (raw=" + raw.toFixed(1) + "C)";
  }

  return str;
}

/**
 * Format log message with level tag
 *
 * Adds a prefix tag to the message based on log level:
 * - DEBUG: "[DEBUG]    "
 * - INFO: "ℹ️ [INFO]     "
 * - WARNING: "⚠️ [WARNING]  "
 * - CRITICAL: "🚨 [CRITICAL] "
 *
 * @param level - Log level (0=DEBUG, 1=INFO, 2=WARNING, 3=CRITICAL)
 * @param msg - Message to format
 * @param logLevels - Log level constants object
 * @returns Formatted log line with level tag prefix
 */
export function formatLogMessage(level: LogLevel, msg: string, logLevels: LogLevels): string {
  let tag = "[DEBUG]    ";
  if (level === logLevels.INFO) tag = "ℹ️ [INFO]     ";
  if (level === logLevels.WARNING) tag = "⚠️ [WARNING]  ";
  if (level === logLevels.CRITICAL) tag = "🚨 [CRITICAL] ";

  return tag + msg;
}

/**
 * Check if message should be logged based on level and auto-demotion
 *
 * Filtering rules:
 * 1. Basic level filtering: message level must be >= current level
 * 2. Auto-demotion: INFO logs are suppressed after demoteHours uptime
 *    (only when not in DEBUG mode, and demoteHours > 0)
 *
 * @param level - Log level to check (0=DEBUG, 1=INFO, 2=WARNING, 3=CRITICAL)
 * @param context - Filtering context with currentLevel, uptime, demoteHours
 * @param logLevels - Log level constants object
 * @returns True if message should be logged, false to suppress
 */
export function shouldLog(level: LogLevel, context: FilterContext, logLevels: LogLevels): boolean {
  // Basic level filtering - message level must meet or exceed current threshold
  if (level < context.currentLevel) {
    return false;
  }

  // Auto-demote INFO logs after configured uptime
  // Only applies when:
  // - Message is INFO level
  // - Not in DEBUG mode (would show everything anyway)
  // - Demotion is enabled (demoteHours > 0)
  // - Uptime exceeds threshold
  if (level === logLevels.INFO &&
      context.currentLevel > logLevels.DEBUG &&
      context.demoteHours > 0) {
    if (context.uptime > context.demoteHours * 3600) {
      return false;
    }
  }

  return true;
}
