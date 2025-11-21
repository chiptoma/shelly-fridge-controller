/**
 * Sensor reading functions
 * Abstracts Shelly API for temperature sensor access
 */

import type { ShellyAPI } from '$types/shelly';
import type { SensorConfig, SensorReadings } from './types';

/**
 * Read all sensors from Shelly device
 * @param shellyAPI - Shelly API object
 * @param config - Configuration with sensor IDs
 * @returns Sensor readings
 */
export function readAllSensors(shellyAPI: ShellyAPI, config: SensorConfig): SensorReadings {
  const airComp = shellyAPI.getComponentStatus('Temperature', config.AIR_SENSOR_ID);
  const evapComp = shellyAPI.getComponentStatus('Temperature', config.EVAP_SENSOR_ID);
  const switchComp = shellyAPI.getComponentStatus('switch', config.RELAY_ID);

  return {
    airRaw: airComp ? airComp.tC : null,
    evapRaw: evapComp ? evapComp.tC : null,
    relayOn: switchComp ? switchComp.output === true : false
  };
}
