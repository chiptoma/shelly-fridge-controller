/**
 * Slack webhook output sink with buffering and retry
 *
 * Sends log messages to Slack via webhook for remote monitoring.
 * Features:
 * - Loads webhook URL from Shelly KVS (Key-Value Store) at runtime
 * - Buffers failed messages for retry
 * - Exponential backoff retry (1s, 2s, 4s, 8s...)
 * - Drops oldest messages when buffer full
 * - Graceful failure (Slack issues don't crash controller)
 */

import type { ShellyAPI, KVSGetResult, TimerAPI } from '$types';
import type { SlackSink, SlackSinkConfig } from '../types';

/**
 * Message in the retry buffer
 */
interface BufferedMessage {
  text: string;
  retries: number;
}

/**
 * Load Slack webhook URL from Shelly KVS
 *
 * Retrieves the webhook URL from Shelly's Key-Value Store where it was
 * stored during setup. This keeps the webhook URL out of the code.
 *
 * @param shellyApi - Shelly API object
 * @param config - Slack configuration with KVS key name
 * @param callback - Called with webhook URL or null if not found
 *
 * @example
 * ```typescript
 * loadWebhookUrl(Shelly, config, function(url) {
 *   if (url) console.log('Loaded:', url);
 * });
 * ```
 */
export function loadWebhookUrl(
  shellyApi: ShellyAPI,
  config: SlackSinkConfig,
  callback: (url: string | null) => void
): void {
  if (!config.webhookKvsKey) {
    callback(null);
    return;
  }

  try {
    shellyApi.call<KVSGetResult>('KVS.Get', { key: config.webhookKvsKey }, function(result, error_code, _error_message) {
      if (error_code === 0 && result && result.value) {
        callback(result.value);
      } else {
        callback(null);
      }
    });
  } catch (_err) {
    callback(null);
  }
}

/**
 * Create a Slack sink with buffering and retry
 *
 * Creates a sink that sends log messages to Slack via webhook.
 * Failed messages are buffered and retried with exponential backoff.
 * The sink must be initialized before use to load the webhook URL from KVS.
 *
 * @param shellyApi - Shelly API object for KVS access and HTTP calls
 * @param timerApi - Timer API for retry scheduling
 * @param config - Slack sink configuration
 * @returns Slack sink instance
 *
 * @example
 * ```typescript
 * const slackSink = createSlackSink(Shelly, Timer, {
 *   enabled: true,
 *   webhookKvsKey: "slack_webhook",
 *   bufferSize: 10,
 *   retryDelayMs: 1000,
 *   maxRetries: 5
 * });
 *
 * slackSink.initialize((success, message) => {
 *   console.log(message);
 * });
 * ```
 */
export function createSlackSink(
  shellyApi: ShellyAPI,
  timerApi: TimerAPI,
  config: SlackSinkConfig
): SlackSink {
  let webhookUrl: string | null = null;
  let initialized = false;
  const buffer: BufferedMessage[] = [];
  let retryTimerActive = false;
  let currentRetryDelay = config.retryDelayMs;

  /**
   * Send a message to Slack
   * @param message - Message to send
   * @param onSuccess - Called on success
   * @param onFailure - Called on failure
   */
  function sendToSlack(
    message: BufferedMessage,
    onSuccess: () => void,
    onFailure: () => void
  ): void {
    if (!webhookUrl) {
      onFailure();
      return;
    }

    try {
      shellyApi.call('HTTP.POST', {
        url: webhookUrl,
        body: JSON.stringify({ text: message.text }),
        headers: { 'Content-Type': 'application/json' }
      }, function(_result: unknown, error_code: number, error_message: string) {
        if (error_code === 0) {
          onSuccess();
        } else {
          console.warn('Slack send failed: ' + error_message);
          onFailure();
        }
      });
    } catch (err) {
      console.warn('Slack send exception: ' + err);
      onFailure();
    }
  }

  /**
   * Process the retry buffer
   * Attempts to send the first message, schedules retry on failure
   */
  function processBuffer(): void {
    if (buffer.length === 0) {
      retryTimerActive = false;
      currentRetryDelay = config.retryDelayMs; // Reset delay
      return;
    }

    const message = buffer[0];

    sendToSlack(
      message,
      function onSuccess() {
        // Remove sent message
        buffer.shift();
        currentRetryDelay = config.retryDelayMs; // Reset delay on success

        // Process next message immediately
        if (buffer.length > 0) {
          processBuffer();
        } else {
          retryTimerActive = false;
        }
      },
      function onFailure() {
        message.retries++;

        if (message.retries >= config.maxRetries) {
          // Max retries reached, drop message
          console.warn('Slack message dropped after ' + config.maxRetries + ' retries');
          buffer.shift();
          currentRetryDelay = config.retryDelayMs; // Reset delay
        } else {
          // Schedule retry with exponential backoff
          currentRetryDelay = Math.min(currentRetryDelay * 2, 60000); // Cap at 60s
        }

        // Schedule next attempt
        if (buffer.length > 0) {
          timerApi.set(currentRetryDelay, false, processBuffer);
        } else {
          retryTimerActive = false;
        }
      }
    );
  }

  /**
   * Initialize the sink by loading webhook URL
   * @param callback - Called with (success, message)
   */
  function initialize(callback: (success: boolean, message: string) => void): void {
    if (!config.enabled) {
      initialized = true;
      callback(true, 'Slack disabled');
      return;
    }

    loadWebhookUrl(shellyApi, config, function(url) {
      webhookUrl = url;
      initialized = true;
      if (url) {
        callback(true, 'Slack webhook loaded from KVS');
      } else {
        callback(false, 'Slack enabled but webhook unavailable in KVS');
      }
    });
  }

  /**
   * Write formatted message to Slack
   * Messages are sent immediately if possible, or buffered for retry
   * @param formattedMessage - Pre-formatted log message (already filtered by level)
   */
  function write(formattedMessage: string): void {
    if (!config.enabled || !webhookUrl) {
      return;
    }

    const message: BufferedMessage = {
      text: formattedMessage,
      retries: 0
    };

    // Try to send immediately
    sendToSlack(
      message,
      function onSuccess() {
        // Sent successfully, nothing more to do
      },
      function onFailure() {
        // Add to buffer for retry
        if (buffer.length >= config.bufferSize) {
          // Buffer full, drop oldest
          const dropped = buffer.shift();
          console.warn('Slack buffer full, dropping oldest message: ' + (dropped ? dropped.text.substring(0, 50) : ''));
        }
        buffer.push(message);

        // Start retry timer if not already running
        if (!retryTimerActive) {
          retryTimerActive = true;
          timerApi.set(currentRetryDelay, false, processBuffer);
        }
      }
    );
  }

  /**
   * Check if sink is initialized
   * @returns True if initialized
   */
  function isInitialized(): boolean {
    return initialized;
  }

  /**
   * Get current buffer size (for testing/monitoring)
   * @returns Number of messages in retry buffer
   */
  function getBufferSize(): number {
    return buffer.length;
  }

  return {
    write: write,
    initialize: initialize,
    isInitialized: isInitialized,
    getBufferSize: getBufferSize
  };
}
