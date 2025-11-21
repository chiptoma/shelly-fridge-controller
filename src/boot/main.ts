import CONFIG from './config';
import { initialize } from './init';
import { run } from '@system/control';

const controller = initialize();

if (controller) {
  // Run once immediately to set initial state
  run(controller);

  // Schedule periodic loop
  Timer.set(CONFIG.LOOP_PERIOD_MS, true, function() {
    run(controller);
  });
}
