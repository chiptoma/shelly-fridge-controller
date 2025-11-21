/**
 * Logging type definitions
 *
 * Types for the logging system including:
 * - Logger interface and configuration
 * - Sink interfaces (console, slack)
 * - Filter context
 * - Initialization messages
 */

// ═══════════════════════════════════════════════════════════════
// LOG LEVEL TYPES
// Core log level type definitions
// ═══════════════════════════════════════════════════════════════

/**
 * Log level (matches CONFIG.LOG_LEVELS values)
 */
export type LogLevel = 0 | 1 | 2 | 3; // DEBUG | INFO | WARNING | CRITICAL

/**
 * Log level constants structure
 * Passed to pure functions instead of importing CONFIG
 */
export interface LogLevels {
  DEBUG: 0;
  INFO: 1;
  WARNING: 2;
  CRITICAL: 3;
}

// ═══════════════════════════════════════════════════════════════
// LOGGER TYPES
// Core logger interface and configuration
// ═══════════════════════════════════════════════════════════════

/**
 * Main logger interface
 * Provides leveled logging methods and runtime configuration
 */
export interface Logger {
  /** Log at specified level */
  log(level: LogLevel, msg: string): void;
  /** Log DEBUG level message */
  debug(msg: string): void;
  /** Log INFO level message */
  info(msg: string): void;
  /** Log WARNING level message */
  warning(msg: string): void;
  /** Log CRITICAL level message */
  critical(msg: string): void;
  /** Update log level at runtime */
  setLevel(newLevel: LogLevel): void;
  /** Get current log level */
  getLevel(): LogLevel;
  /** Initialize all sinks */
  initialize(callback: (success: boolean, messages: InitMessage[]) => void): void;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Current log level (0=DEBUG, 1=INFO, 2=WARNING, 3=CRITICAL) */
  level: LogLevel;
  /** Hours after which to auto-demote INFO logs (0 to disable) */
  demoteHours: number;
}

/**
 * Sink with its minimum log level
 * Logger filters messages before sending to each sink
 */
export interface SinkWithLevel {
  /** The output sink */
  sink: LogSink;
  /** Minimum level this sink receives (filters before buffering) */
  minLevel: LogLevel;
}

/**
 * Logger external dependencies
 */
export interface LoggerDependencies {
  /** Function returning current time in seconds */
  timeSource: () => number;
  /** Array of sinks with their minimum levels */
  sinks: SinkWithLevel[];
}

// ═══════════════════════════════════════════════════════════════
// SINK TYPES
// Output sink interfaces for console and Slack
// ═══════════════════════════════════════════════════════════════

/**
 * Base sink interface
 * All sinks must implement write (message only - no level)
 * Level filtering happens in logger before write() is called
 */
export interface LogSink {
  /** Write formatted message to sink (already filtered by level) */
  write(formattedMessage: string): void;
  /** Optional initialization (e.g., load webhook URL, start timers) */
  initialize?(callback: (success: boolean, message: string) => void): void;
}

/**
 * Console sink interface
 * Buffers messages and drains at fixed interval
 */
export interface ConsoleSink extends LogSink {
  /** Initialize by starting drain timer */
  initialize(callback: (success: boolean, message: string) => void): void;
  /** Get current buffer size (for testing/monitoring) */
  getBufferSize(): number;
}

/**
 * Console sink configuration
 */
export interface ConsoleSinkConfig {
  /** Maximum messages in buffer before dropping */
  bufferSize: number;
  /** Interval between draining messages (ms) */
  drainInterval: number;
}

/**
 * Console API interface
 * Abstraction over global console for testability
 */
export interface ConsoleAPI {
  /** Log message to console */
  log(message: string): void;
  /** Log warning to console */
  warn(message: string): void;
}

/**
 * Slack sink interface
 * Buffers messages and retries with exponential backoff
 */
export interface SlackSink extends LogSink {
  /** Initialize by loading webhook URL from KVS */
  initialize(callback: (success: boolean, message: string) => void): void;
  /** Check if sink is initialized */
  isInitialized(): boolean;
  /** Get current buffer size (for testing/monitoring) */
  getBufferSize(): number;
}

/**
 * Slack sink configuration
 */
export interface SlackSinkConfig {
  /** Whether Slack notifications are enabled */
  enabled: boolean;
  /** KVS key containing webhook URL */
  webhookKvsKey: string;
  /** Maximum messages in retry buffer before dropping oldest */
  bufferSize: number;
  /** Initial retry delay in ms (exponential: 1000 -> 2000 -> 4000...) */
  retryDelayMs: number;
  /** Maximum retry attempts before dropping message */
  maxRetries: number;
}

// ═══════════════════════════════════════════════════════════════
// FILTER TYPES
// Types for log filtering logic
// ═══════════════════════════════════════════════════════════════

/**
 * Context for log filtering decisions
 */
export interface FilterContext {
  /** Current minimum log level */
  currentLevel: LogLevel;
  /** System uptime in seconds */
  uptime: number;
  /** Hours after which to demote INFO logs */
  demoteHours: number;
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION TYPES
// Types for sink initialization feedback
// ═══════════════════════════════════════════════════════════════

/**
 * Initialization result message
 * Returned by sinks during initialization
 */
export interface InitMessage {
  /** Whether initialization succeeded */
  success: boolean;
  /** Human-readable status message */
  message: string;
}
