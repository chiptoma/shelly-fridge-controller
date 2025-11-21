/**
 * Type definitions for Shelly Plus 1/1PM device APIs
 * These are custom definitions as Shelly doesn't provide official TypeScript types
 */

/**
 * Callback function type for Shelly API calls
 */
export type ShellyCallback<T = any> = (
  result: T,
  error_code: number,
  error_message: string
) => void;

/**
 * Error callback function type (subset of ShellyCallback)
 */
export type ErrorCallback = (
  error_code: number,
  error_message: string
) => void;

/** Alias for ErrorCallback for shelly-specific contexts */
export type ShellyErrorCallback = ErrorCallback;

/**
 * Temperature sensor component data
 */
export interface TemperatureComponent {
  id: number;
  tC: number; // Temperature in Celsius
  tF?: number; // Temperature in Fahrenheit (optional)
}

/**
 * Switch/Relay component data
 */
export interface SwitchComponent {
  id: number;
  output: boolean;
  apower?: number; // Active power (watts)
  voltage?: number; // Voltage
  current?: number; // Current (amps)
  aenergy?: {
    total: number; // Total active energy in Wh
    by_minute: number[]; // Energy by minute
    minute_ts: number; // Timestamp of minute data
  };
}

/**
 * KVS (Key-Value Store) Get result
 */
export interface KVSGetResult {
  value: string;
  etag?: string;
}

/**
 * KVS Set parameters
 */
export interface KVSSetParams {
  key: string;
  value: string;
}

/**
 * Shelly API interface
 */
export interface ShellyAPI {
  /**
   * Get component status
   * @param component - Component type ('Temperature', 'switch', etc.)
   * @param id - Component ID number
   * @returns Component data or null if not found
   */
  getComponentStatus(component: 'Temperature', id: number): TemperatureComponent | null;
  getComponentStatus(component: 'switch', id: number): SwitchComponent | null;
  getComponentStatus(component: string, id: number): unknown;

  /**
   * Call a Shelly RPC method
   * @param method - RPC method name (e.g., 'Switch.Set', 'KVS.Get')
   * @param params - Method parameters
   * @param callback - Callback function with result
   */
  call<T = any>(
    method: string,
    params: Record<string, any>,
    callback: ShellyCallback<T>
  ): void;
}

/**
 * Timer API interface
 */
export interface TimerAPI {
  /**
   * Set a timer
   * @param intervalMs - Interval in milliseconds
   * @param repeat - Whether to repeat the timer
   * @param callback - Function to call when timer fires
   */
  set(intervalMs: number, repeat: boolean, callback: () => void): void;
}

/**
 * Global Shelly device APIs
 */
declare global {
  /**
   * Shelly device API - available globally on Shelly devices
   */
  const Shelly: ShellyAPI;

  /**
   * Timer API - available globally on Shelly devices
   */
  const Timer: TimerAPI;

  /**
   * Script start time - global variable set during init
   */
  let scriptStartTime: number;
}

export {};
