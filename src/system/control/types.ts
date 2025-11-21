/**
 * Control module type definitions
 */

import type { ControllerState } from '@system/state/types';
import type { Logger } from '@logging';

export interface Controller {
  state: ControllerState;
  logger: Logger;
  isDebug: boolean;
}
