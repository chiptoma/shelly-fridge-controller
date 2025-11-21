/**
 * Sensor types
 */

import type { TemperatureReading } from '$types/common';

export interface SensorConfig {
  AIR_SENSOR_ID: number;
  EVAP_SENSOR_ID: number;
  RELAY_ID: number;
}

export interface SensorReadings {
  airRaw: TemperatureReading;
  evapRaw: TemperatureReading;
  relayOn: boolean;
}
