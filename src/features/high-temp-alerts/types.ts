export interface AlertState {
  tracking: boolean;
  startTime: number;
  fired: boolean;
}

export interface AlertConfig {
  threshold: number;
  delaySec: number;
}
