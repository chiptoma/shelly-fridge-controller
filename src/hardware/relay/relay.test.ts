/**
 * Unit tests for relay control functions
 */

import { getRelayStatus, setRelay } from './relay';
import { validateRelayState } from './helpers';
import type { RelayValidationResult } from './types';
import type { ShellyAPI, SwitchComponent } from '$types/shelly';
import { APP_CONSTANTS } from '@boot/config';

describe('Relay Control', () => {
  // ═══════════════════════════════════════════════════════════════
  // getRelayStatus()
  // ═══════════════════════════════════════════════════════════════

  describe('getRelayStatus', () => {
    it('should return relay status from Shelly API', () => {
      const mockStatus: SwitchComponent = { output: true, id: 0 };
      const mockShelly = {
        getComponentStatus: jest.fn().mockReturnValue(mockStatus)
      } as unknown as ShellyAPI;

      const result = getRelayStatus(mockShelly);

      expect(mockShelly.getComponentStatus).toHaveBeenCalledWith(
        APP_CONSTANTS.COMPONENT_SWITCH,
        APP_CONSTANTS.RELAY_ID
      );
      expect(result).toEqual(mockStatus);
    });

    it('should return null when relay unavailable', () => {
      const mockShelly = {
        getComponentStatus: jest.fn().mockReturnValue(null)
      } as unknown as ShellyAPI;

      const result = getRelayStatus(mockShelly);

      expect(result).toBeNull();
    });

    it('should return relay with power data', () => {
      const mockStatus: SwitchComponent = {
        output: true,
        id: 0,
        apower: 150.5,
        voltage: 230.2,
        current: 0.65
      };
      const mockShelly = {
        getComponentStatus: jest.fn().mockReturnValue(mockStatus)
      } as unknown as ShellyAPI;

      const result = getRelayStatus(mockShelly);

      expect(result).toEqual(mockStatus);
      expect(result?.apower).toBe(150.5);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // setRelay()
  // ═══════════════════════════════════════════════════════════════

  describe('setRelay', () => {
    describe('successful operations', () => {
      it('should call Shelly API to turn relay ON', () => {
        const mockShelly = {
          call: jest.fn((_method, _params, callback) => {
            callback(null, 0, '');
          })
        } as unknown as ShellyAPI;

        setRelay(true, mockShelly);

        expect(mockShelly.call).toHaveBeenCalledWith(
          APP_CONSTANTS.METHOD_SWITCH_SET,
          { id: APP_CONSTANTS.RELAY_ID, on: true },
          expect.any(Function)
        );
      });

      it('should call Shelly API to turn relay OFF', () => {
        const mockShelly = {
          call: jest.fn((_method, _params, callback) => {
            callback(null, 0, '');
          })
        } as unknown as ShellyAPI;

        setRelay(false, mockShelly);

        expect(mockShelly.call).toHaveBeenCalledWith(
          APP_CONSTANTS.METHOD_SWITCH_SET,
          { id: APP_CONSTANTS.RELAY_ID, on: false },
          expect.any(Function)
        );
      });

      it('should invoke callback on success', () => {
        const mockCallback = jest.fn();
        const mockShelly = {
          call: jest.fn((_method, _params, callback) => {
            callback(null, 0, '');
          })
        } as unknown as ShellyAPI;

        setRelay(true, mockShelly, mockCallback);

        expect(mockCallback).toHaveBeenCalledWith(0, '');
      });
    });

    describe('error handling', () => {
      it('should invoke callback with error code and message', () => {
        const mockCallback = jest.fn();
        const mockShelly = {
          call: jest.fn((_method, _params, callback) => {
            callback(null, -103, 'Device not found');
          })
        } as unknown as ShellyAPI;

        setRelay(true, mockShelly, mockCallback);

        expect(mockCallback).toHaveBeenCalledWith(-103, 'Device not found');
      });

      it('should log error to console when no callback provided', () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const mockShelly = {
          call: jest.fn((_method, _params, callback) => {
            callback(null, -103, 'Device not found');
          })
        } as unknown as ShellyAPI;

        setRelay(true, mockShelly);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Relay] Failed to set relay to ON: Error -103 - Device not found')
        );

        consoleErrorSpy.mockRestore();
      });

      it('should log error with OFF state when no callback provided', () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const mockShelly = {
          call: jest.fn((_method, _params, callback) => {
            callback(null, -103, 'Device not found');
          })
        } as unknown as ShellyAPI;

        setRelay(false, mockShelly);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Relay] Failed to set relay to OFF: Error -103 - Device not found')
        );

        consoleErrorSpy.mockRestore();
      });

      it('should not log error when success and no callback', () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        const mockShelly = {
          call: jest.fn((_method, _params, callback) => {
            callback(null, 0, '');
          })
        } as unknown as ShellyAPI;

        setRelay(true, mockShelly);

        expect(consoleErrorSpy).not.toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // validateRelayState()
  // ═══════════════════════════════════════════════════════════════

  describe('validateRelayState', () => {
    describe('no command sent', () => {
      it('should return valid when lastCommandTimeSec is zero', () => {
        const result = validateRelayState(true, false, 1000, 0, 2);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBeUndefined();
        expect(result.stuck).toBeUndefined();
      });
    });

    describe('waiting for response', () => {
      it('should return valid while waiting within timeout', () => {
        const result = validateRelayState(true, false, 1001, 1000, 2);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBe(true);
      });

      it('should return valid at exact timeout boundary', () => {
        const result = validateRelayState(true, false, 1002, 1000, 2);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBe(true);
      });

      it('should indicate waiting even when states match', () => {
        const result = validateRelayState(true, true, 1001, 1000, 2);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBe(true);
      });
    });

    describe('state matches after timeout', () => {
      it('should return valid when states match after timeout', () => {
        const result = validateRelayState(true, true, 1003, 1000, 2);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBeUndefined();
        expect(result.stuck).toBeUndefined();
      });

      it('should return valid for OFF→OFF match', () => {
        const result = validateRelayState(false, false, 1005, 1000, 2);

        expect(result.valid).toBe(true);
      });
    });

    describe('state mismatch after timeout', () => {
      it('should detect mismatch for ON→OFF after timeout', () => {
        const result = validateRelayState(true, false, 1003, 1000, 2);

        expect(result.valid).toBe(false);
        expect(result.stuck).toBe(true);
        expect(result.intended).toBe(true);
        expect(result.reported).toBe(false);
        expect(result.elapsed).toBe(3);
      });

      it('should detect mismatch for OFF→ON after timeout', () => {
        const result = validateRelayState(false, true, 1005, 1000, 2);

        expect(result.valid).toBe(false);
        expect(result.stuck).toBe(true);
        expect(result.intended).toBe(false);
        expect(result.reported).toBe(true);
        expect(result.elapsed).toBe(5);
      });
    });

    describe('edge cases', () => {
      it('should handle very short timeout (< 1 second)', () => {
        const result = validateRelayState(true, false, 1000.5, 1000, 0.5);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBe(true);
      });

      it('should handle very long timeout', () => {
        const result = validateRelayState(true, false, 1050, 1000, 120);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBe(true);
      });

      it('should handle zero elapsed time', () => {
        const result = validateRelayState(true, false, 1000, 1000, 2);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBe(true);
      });

      it('should handle negative elapsed time (clock skew)', () => {
        // This shouldn't happen in practice, but test defensive behavior
        const result = validateRelayState(true, false, 999, 1000, 2);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBe(true);
      });

      it('should handle fractional timeout values', () => {
        const result = validateRelayState(true, false, 1001.5, 1000, 1.5);

        expect(result.valid).toBe(true);
        expect(result.waitingForResponse).toBe(true);

        const result2 = validateRelayState(true, false, 1001.6, 1000, 1.5);

        expect(result2.valid).toBe(false);
        expect(result2.stuck).toBe(true);
      });
    });

    describe('type compliance', () => {
      it('should return RelayValidationResult interface', () => {
        const result: RelayValidationResult = validateRelayState(true, true, 1000, 0, 2);

        expect(result).toHaveProperty('valid');
        expect(typeof result.valid).toBe('boolean');
      });

      it('should include all diagnostic fields when stuck', () => {
        const result = validateRelayState(true, false, 1005, 1000, 2);

        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('stuck');
        expect(result).toHaveProperty('intended');
        expect(result).toHaveProperty('reported');
        expect(result).toHaveProperty('elapsed');
      });
    });
  });
});
