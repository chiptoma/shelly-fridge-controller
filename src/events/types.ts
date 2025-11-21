/**
 * Event types for inter-script communication
 *
 * Core script emits state events, Features script processes and responds with commands.
 * This enables splitting the controller into two scripts that fit Shelly's 25KB limit.
 */

/**
 * State event emitted by Core to Features every control loop
 */
export interface FridgeStateEvent {
  // Temperatures
  airTemp: number | null;
  evapTemp: number | null;
  airRaw: number | null;
  evapRaw: number | null;

  // Relay state
  relayOn: boolean;
  freezeLocked: boolean;

  // Timing data for features
  dutyOnSec: number;
  dutyOffSec: number;
  dt: number;  // Time delta since last loop

  // Loop timing for performance metrics
  loopStartSec: number;

  // Timestamp
  timestamp: number;
}

/**
 * Alert event emitted by Core when critical events occur
 */
export interface FridgeAlertEvent {
  type: 'freeze_locked' | 'freeze_released' | 'sensor_failure' | 'sensor_recovered' | 'relay_stuck';
  message: string;
  timestamp: number;
}

/**
 * Command event sent from Features to Core
 */
export interface FridgeCommandEvent {
  type: 'log' | 'slack' | 'adjust_hysteresis' | 'daily_summary';

  // For 'log' type
  level?: number;  // 0=debug, 1=info, 2=warning, 3=critical
  message?: string;

  // For 'adjust_hysteresis' type
  onAbove?: number;
  offBelow?: number;

  // For 'daily_summary' type - formatted summary to log
  summary?: string;
}

/**
 * Event names used for Shelly.emitEvent()
 */
export const EVENT_NAMES = {
  STATE: 'fridge_state',
  ALERT: 'fridge_alert',
  COMMAND: 'fridge_command'
} as const;
