export interface InitMessage {
  success: boolean;
  message: string;
}

// Re-export Controller from control module
export type { Controller } from '@system/control/types';
