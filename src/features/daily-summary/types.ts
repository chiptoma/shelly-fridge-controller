import type { TemperatureReading } from '$types/common';

export interface DailyState {
  dayAirMin: TemperatureReading;
  dayAirMax: TemperatureReading;
  dayAirSum: number;
  dayAirCount: number;
  dayEvapMin: TemperatureReading;
  dayEvapMax: TemperatureReading;
  dayEvapSum: number;
  dayEvapCount: number;
  dayOnSec: number;
  dayOffSec: number;
  freezeCount: number;
  highTempCount: number;
}

export interface SummaryResult {
  onHours: number;
  offHours: number;
  dutyPct: number;
  airMin: TemperatureReading;
  airMax: TemperatureReading;
  airAvg: TemperatureReading;
  evapMin: TemperatureReading;
  evapMax: TemperatureReading;
  evapAvg: TemperatureReading;
  freezeCount: number;
  highTempCount: number;
}

export interface SummaryCheckResult {
  shouldGenerate: boolean;
  currentDate: string;
}
