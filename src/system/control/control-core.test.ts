/**
 * Tests for core control loop command handling
 */

import { handleFeatureCommand } from './control-core';
import type { FridgeCommandEvent } from '@events/types';
import type { Controller } from './types';
import type { ControllerState } from '@system/state/types';

describe('handleFeatureCommand', () => {
  let mockController: Controller;
  let mockLogger: {
    debug: jest.Mock;
    info: jest.Mock;
    warning: jest.Mock;
    critical: jest.Mock;
    log: jest.Mock;
  };
  let mockState: Partial<ControllerState>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
      critical: jest.fn(),
      log: jest.fn()
    };

    mockState = {
      dynOnAbove: 5.0,
      dynOffBelow: 3.0
    };

    mockController = {
      state: mockState as ControllerState,
      logger: mockLogger as any,
      isDebug: false
    };
  });

  describe('log command', () => {
    it('should call debug for level 0 when isDebug is true', () => {
      mockController.isDebug = true;
      const command: FridgeCommandEvent = {
        type: 'log',
        level: 0,
        message: 'Debug message'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.debug).toHaveBeenCalledWith('Debug message');
    });

    it('should not call debug for level 0 when isDebug is false', () => {
      mockController.isDebug = false;
      const command: FridgeCommandEvent = {
        type: 'log',
        level: 0,
        message: 'Debug message'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should call info for level 1', () => {
      const command: FridgeCommandEvent = {
        type: 'log',
        level: 1,
        message: 'Info message'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.info).toHaveBeenCalledWith('Info message');
    });

    it('should call warning for level 2', () => {
      const command: FridgeCommandEvent = {
        type: 'log',
        level: 2,
        message: 'Warning message'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.warning).toHaveBeenCalledWith('Warning message');
    });

    it('should call critical for level 3', () => {
      const command: FridgeCommandEvent = {
        type: 'log',
        level: 3,
        message: 'Critical message'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.critical).toHaveBeenCalledWith('Critical message');
    });

    it('should default to info for undefined level', () => {
      const command: FridgeCommandEvent = {
        type: 'log',
        message: 'Default level message'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.info).toHaveBeenCalledWith('Default level message');
    });

    it('should not log if message is undefined', () => {
      const command: FridgeCommandEvent = {
        type: 'log',
        level: 1
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('slack command', () => {
    it('should log message as info', () => {
      const command: FridgeCommandEvent = {
        type: 'slack',
        message: 'Slack alert'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.info).toHaveBeenCalledWith('Slack alert');
    });

    it('should not log if message is undefined', () => {
      const command: FridgeCommandEvent = {
        type: 'slack'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('adjust_hysteresis command', () => {
    it('should update state thresholds', () => {
      const command: FridgeCommandEvent = {
        type: 'adjust_hysteresis',
        onAbove: 5.5,
        offBelow: 3.5
      };

      handleFeatureCommand(mockController, command);

      expect(mockState.dynOnAbove).toBe(5.5);
      expect(mockState.dynOffBelow).toBe(3.5);
    });

    it('should not update if onAbove is undefined', () => {
      const command: FridgeCommandEvent = {
        type: 'adjust_hysteresis',
        offBelow: 3.5
      };

      handleFeatureCommand(mockController, command);

      expect(mockState.dynOnAbove).toBe(5.0); // unchanged
      expect(mockState.dynOffBelow).toBe(3.0); // unchanged
    });

    it('should not update if offBelow is undefined', () => {
      const command: FridgeCommandEvent = {
        type: 'adjust_hysteresis',
        onAbove: 5.5
      };

      handleFeatureCommand(mockController, command);

      expect(mockState.dynOnAbove).toBe(5.0); // unchanged
      expect(mockState.dynOffBelow).toBe(3.0); // unchanged
    });
  });

  describe('daily_summary command', () => {
    it('should log summary message', () => {
      const command: FridgeCommandEvent = {
        type: 'daily_summary',
        summary: 'Daily Summary: 45% duty cycle'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.info).toHaveBeenCalledWith('Daily Summary: 45% duty cycle');
    });

    it('should not log if summary is undefined', () => {
      const command: FridgeCommandEvent = {
        type: 'daily_summary'
      };

      handleFeatureCommand(mockController, command);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });
});
