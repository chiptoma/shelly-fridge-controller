/**
 * Tests for sensor reading functions
 */

import { readAllSensors } from './sensors';
import type { ShellyAPI } from '../../types/shelly';

describe('readAllSensors', () => {
  let mockShellyAPI: ShellyAPI;

  const defaultConfig = {
    AIR_SENSOR_ID: 101,
    EVAP_SENSOR_ID: 100,
    RELAY_ID: 0
  };

  beforeEach(() => {
    mockShellyAPI = {
      call: jest.fn(),
      getComponentStatus: jest.fn(),
      emitEvent: jest.fn()
    } as ShellyAPI;
  });

  describe('successful sensor readings', () => {
    it('should read all sensors successfully', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 101) {
            return { tC: 5.5 };
          }
          if (type === 'Temperature' && id === 100) {
            return { tC: -10.2 };
          }
          if (type === 'switch' && id === 0) {
            return { output: true };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.airRaw).toBe(5.5);
      expect(result.evapRaw).toBe(-10.2);
      expect(result.relayOn).toBe(true);
    });

    it('should return relay off when output is false', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 101) {
            return { tC: 4.0 };
          }
          if (type === 'Temperature' && id === 100) {
            return { tC: -5.0 };
          }
          if (type === 'switch' && id === 0) {
            return { output: false };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.relayOn).toBe(false);
    });

    it('should handle different sensor IDs', () => {
      const customConfig = {
        AIR_SENSOR_ID: 50,
        EVAP_SENSOR_ID: 51,
        RELAY_ID: 1
      };

      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 50) {
            return { tC: 3.0 };
          }
          if (type === 'Temperature' && id === 51) {
            return { tC: -8.0 };
          }
          if (type === 'switch' && id === 1) {
            return { output: true };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, customConfig);

      expect(result.airRaw).toBe(3.0);
      expect(result.evapRaw).toBe(-8.0);
      expect(result.relayOn).toBe(true);
    });
  });

  describe('missing sensor readings', () => {
    it('should return null for missing air sensor', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 100) {
            return { tC: -10.0 };
          }
          if (type === 'switch' && id === 0) {
            return { output: false };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.airRaw).toBeNull();
      expect(result.evapRaw).toBe(-10.0);
    });

    it('should return null for missing evap sensor', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 101) {
            return { tC: 5.0 };
          }
          if (type === 'switch' && id === 0) {
            return { output: true };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.airRaw).toBe(5.0);
      expect(result.evapRaw).toBeNull();
    });

    it('should return null for both sensors when missing', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'switch' && id === 0) {
            return { output: false };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.airRaw).toBeNull();
      expect(result.evapRaw).toBeNull();
    });

    it('should return relay off when switch component is missing', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 101) {
            return { tC: 5.0 };
          }
          if (type === 'Temperature' && id === 100) {
            return { tC: -5.0 };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.relayOn).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle zero temperature', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 101) {
            return { tC: 0 };
          }
          if (type === 'Temperature' && id === 100) {
            return { tC: 0 };
          }
          if (type === 'switch' && id === 0) {
            return { output: false };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.airRaw).toBe(0);
      expect(result.evapRaw).toBe(0);
    });

    it('should handle negative temperatures', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 101) {
            return { tC: -20.5 };
          }
          if (type === 'Temperature' && id === 100) {
            return { tC: -55.0 };
          }
          if (type === 'switch' && id === 0) {
            return { output: true };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.airRaw).toBe(-20.5);
      expect(result.evapRaw).toBe(-55.0);
    });

    it('should handle high temperatures', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'Temperature' && id === 101) {
            return { tC: 125.0 };
          }
          if (type === 'Temperature' && id === 100) {
            return { tC: 100.0 };
          }
          if (type === 'switch' && id === 0) {
            return { output: false };
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      expect(result.airRaw).toBe(125.0);
      expect(result.evapRaw).toBe(100.0);
    });

    it('should call getComponentStatus with correct parameters', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock).mockReturnValue(null);

      readAllSensors(mockShellyAPI, defaultConfig);

      expect(mockShellyAPI.getComponentStatus).toHaveBeenCalledWith('Temperature', 101);
      expect(mockShellyAPI.getComponentStatus).toHaveBeenCalledWith('Temperature', 100);
      expect(mockShellyAPI.getComponentStatus).toHaveBeenCalledWith('switch', 0);
      expect(mockShellyAPI.getComponentStatus).toHaveBeenCalledTimes(3);
    });

    it('should handle relay output as strictly boolean', () => {
      (mockShellyAPI.getComponentStatus as jest.Mock)
        .mockImplementation((type: string, id: number) => {
          if (type === 'switch' && id === 0) {
            return { output: 1 }; // truthy but not true
          }
          return null;
        });

      const result = readAllSensors(mockShellyAPI, defaultConfig);

      // output === true is strict comparison, so 1 !== true
      expect(result.relayOn).toBe(false);
    });
  });
});
