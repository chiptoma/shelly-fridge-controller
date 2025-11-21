/**
 * Logging module barrel export
 *
 * Exports all logging functions and types for the fridge controller.
 * The logging system includes:
 * - Logger coordinator (createLogger)
 * - Console sink with buffering (createConsoleSink)
 * - Slack sink with KVS webhook (createSlackSink)
 * - Pure filter and format functions
 */

export { formatLogMessage, shouldLog, fmtTemp } from './helpers';
export { createConsoleSink } from './console';
export { createSlackSink, loadWebhookUrl } from './slack';
export { createLogger } from './logger';

// Export types
export type {
  LogLevel,
  LogLevels,
  Logger,
  LoggerConfig,
  LoggerDependencies,
  SinkWithLevel,
  LogSink,
  ConsoleSink,
  ConsoleSinkConfig,
  ConsoleAPI,
  SlackSink,
  SlackSinkConfig,
  FilterContext,
  InitMessage
} from './types';
