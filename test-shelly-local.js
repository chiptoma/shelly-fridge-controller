#!/usr/bin/env node
/**
 * Local test harness for Shelly script
 * Simulates Shelly environment to test the bundled script
 */

// Mock Shelly globals
global.Shelly = {
  call: function(method, params, callback) {
    console.log('[Shelly.call]', method, JSON.stringify(params));

    // Simulate responses
    if (method === 'Switch.GetStatus') {
      setTimeout(function() {
        callback({ output: false }, 0, '');
      }, 10);
    } else if (method === 'Temperature.GetStatus') {
      setTimeout(function() {
        // Simulate temperature sensor
        const temp = params.id === 101 ? 4.5 : -8.0; // Air vs Evap
        callback({ tC: temp }, 0, '');
      }, 10);
    } else if (method === 'Switch.Set') {
      setTimeout(function() {
        callback({}, 0, '');
      }, 10);
    } else if (method === 'KVS.Get') {
      setTimeout(function() {
        // Simulate no Slack webhook configured
        callback(null, -1, 'Key not found');
      }, 10);
    } else if (method === 'Sys.GetStatus') {
      setTimeout(function() {
        callback({ uptime: Date.now() / 1000 }, 0, '');
      }, 10);
    } else {
      setTimeout(function() {
        callback({}, 0, '');
      }, 10);
    }
  },

  getComponentStatus: function(component, id) {
    if (component === 'sys') {
      return { uptime: Date.now() / 1000 };
    }
    if (component === 'switch' || component === 'switch:0') {
      return { output: false };
    }
    if (component === 'Temperature') {
      // Return temperature based on sensor ID
      if (id === 101) return { tC: 4.5 };  // Air sensor
      if (id === 100) return { tC: -8.0 }; // Evap sensor
      return { tC: 20.0 };
    }
    return {};
  },

  getComponentConfig: function(component) {
    return {};
  },

  emitEvent: function(event, data) {
    console.log('[Shelly.emitEvent]', event, JSON.stringify(data));
  }
};

global.Timer = {
  set: function(ms, repeat, callback) {
    console.log('[Timer.set]', ms + 'ms, repeat=' + repeat);
    const id = setTimeout(callback, ms);
    return id;
  },
  clear: function(id) {
    clearTimeout(id);
  }
};

global.MQTT = {
  publish: function(topic, message) {
    console.log('[MQTT.publish]', topic, message);
  },
  subscribe: function(topic, callback) {
    console.log('[MQTT.subscribe]', topic);
  }
};

// Run the script
console.log('=== Loading Shelly Script ===\n');

try {
  require('./dist/main.js');
  console.log('\n=== Script loaded successfully ===');

  // Let it run for a few seconds to see if it crashes
  console.log('Running for 5 seconds to check for errors...\n');

  setTimeout(function() {
    console.log('\n=== Test completed ===');
    process.exit(0);
  }, 5000);

} catch (err) {
  console.error('\n=== SCRIPT ERROR ===');
  console.error(err.message);
  console.error(err.stack);
  process.exit(1);
}
