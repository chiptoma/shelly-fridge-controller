/**
 * Tests for event types and communication protocol
 */

import { EVENT_NAMES } from './types';
import type { FridgeStateEvent, FridgeCommandEvent, FridgeAlertEvent } from './types';

describe('Event Types', () => {
  describe('EVENT_NAMES', () => {
    it('should have correct event names', () => {
      expect(EVENT_NAMES.STATE).toBe('fridge_state');
      expect(EVENT_NAMES.ALERT).toBe('fridge_alert');
      expect(EVENT_NAMES.COMMAND).toBe('fridge_command');
    });
  });

  describe('FridgeStateEvent', () => {
    it('should accept valid state event structure', () => {
      const event: FridgeStateEvent = {
        airTemp: 4.5,
        evapTemp: -8.0,
        airRaw: 4.6,
        evapRaw: -7.9,
        relayOn: true,
        freezeLocked: false,
        dutyOnSec: 3600,
        dutyOffSec: 1800,
        dt: 5,
        loopStartSec: 1000,
        timestamp: 1000
      };

      expect(event.airTemp).toBe(4.5);
      expect(event.evapTemp).toBe(-8.0);
      expect(event.relayOn).toBe(true);
      expect(event.freezeLocked).toBe(false);
      expect(event.dutyOnSec).toBe(3600);
      expect(event.dutyOffSec).toBe(1800);
    });

    it('should accept null temperatures', () => {
      const event: FridgeStateEvent = {
        airTemp: null,
        evapTemp: null,
        airRaw: null,
        evapRaw: null,
        relayOn: false,
        freezeLocked: false,
        dutyOnSec: 0,
        dutyOffSec: 0,
        dt: 5,
        loopStartSec: 1000,
        timestamp: 1000
      };

      expect(event.airTemp).toBeNull();
      expect(event.evapTemp).toBeNull();
    });
  });

  describe('FridgeCommandEvent', () => {
    it('should create log command', () => {
      const command: FridgeCommandEvent = {
        type: 'log',
        level: 1,
        message: 'Test message'
      };

      expect(command.type).toBe('log');
      expect(command.level).toBe(1);
      expect(command.message).toBe('Test message');
    });

    it('should create slack command', () => {
      const command: FridgeCommandEvent = {
        type: 'slack',
        message: 'Alert message'
      };

      expect(command.type).toBe('slack');
      expect(command.message).toBe('Alert message');
    });

    it('should create adjust_hysteresis command', () => {
      const command: FridgeCommandEvent = {
        type: 'adjust_hysteresis',
        onAbove: 5.5,
        offBelow: 3.5
      };

      expect(command.type).toBe('adjust_hysteresis');
      expect(command.onAbove).toBe(5.5);
      expect(command.offBelow).toBe(3.5);
    });

    it('should create daily_summary command', () => {
      const command: FridgeCommandEvent = {
        type: 'daily_summary',
        summary: 'Daily Summary: 45% duty cycle'
      };

      expect(command.type).toBe('daily_summary');
      expect(command.summary).toBe('Daily Summary: 45% duty cycle');
    });
  });

  describe('FridgeAlertEvent', () => {
    it('should create freeze_locked alert', () => {
      const alert: FridgeAlertEvent = {
        type: 'freeze_locked',
        message: 'Evaporator freeze detected',
        timestamp: 1000
      };

      expect(alert.type).toBe('freeze_locked');
      expect(alert.message).toBe('Evaporator freeze detected');
    });

    it('should create sensor_failure alert', () => {
      const alert: FridgeAlertEvent = {
        type: 'sensor_failure',
        message: 'Air sensor critical failure',
        timestamp: 1000
      };

      expect(alert.type).toBe('sensor_failure');
    });
  });
});
