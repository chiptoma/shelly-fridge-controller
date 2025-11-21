/**
 * Relay control functions
 * Abstracts Shelly relay switching with error handling
 */

import type { ShellyAPI, SwitchComponent, ShellyErrorCallback } from '$types/shelly';
import { APP_CONSTANTS } from '@boot/config';

/**
 * Get current relay status from hardware
 *
 * Retrieves the current state and configuration of the relay from the
 * Shelly device. Returns null if the relay is unavailable or unreachable.
 *
 * @param shellyAPI - Shelly API object providing hardware access
 * @returns Switch component status or null if relay is offline
 */
export function getRelayStatus(shellyAPI: ShellyAPI): SwitchComponent | null {
  return shellyAPI.getComponentStatus(APP_CONSTANTS.COMPONENT_SWITCH, APP_CONSTANTS.RELAY_ID) as SwitchComponent | null;
}

/**
 * Command relay to turn ON or OFF
 *
 * Sends an asynchronous command to the Shelly relay. The relay state change
 * may take up to RELAY_RESPONSE_TIMEOUT_SEC to complete.
 *
 * @param desiredOn - Desired relay state (true = ON, false = OFF)
 * @param shellyAPI - Shelly API object providing hardware access
 * @param callback - Optional callback for error handling (error_code, error_message)
 */
export function setRelay(
  desiredOn: boolean,
  shellyAPI: ShellyAPI,
  callback?: ShellyErrorCallback
): void {
  shellyAPI.call(
    APP_CONSTANTS.METHOD_SWITCH_SET,
    { id: APP_CONSTANTS.RELAY_ID, on: desiredOn },
    function(_result, error_code, error_message) {
      if (error_code !== 0) {
        // Log errors if no callback provided
        if (!callback) {
          console.error("[Relay] Failed to set relay to " + (desiredOn ? "ON" : "OFF") + ": Error " + error_code + " - " + error_message);
        }
      }

      if (callback) {
        callback(error_code, error_message);
      }
    }
  );
}
