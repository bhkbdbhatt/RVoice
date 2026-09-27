import { config, isKafkaMode } from '../config/env.js';

// ============================================================
// Message Queue Abstraction
// Two implementations:
//   1. MemoryQueue - local dev, no external dependencies
//   2. KafkaQueue  - production, uses Kafka producer/consumer
// ============================================================

class MemoryQueue {
  constructor() {
    this.topics = new Map();
    this.listeners = new Map();
    this.pendingMessages = 0;
  }

  /**
   * Publish a message to a topic.
   * @param {string} topic - Topic name
   * @param {Object} message - Message payload (must be JSON-serializable)
   * @returns {Promise<void>}
   */
  async publish(topic, message) {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, []);
    }
    this.topics.get(topic).push({
      value: JSON.stringify(message),
      timestamp: new Date().toISOString(),
    });
    this.pendingMessages++;

    // Notify listeners
    const topicListeners = this.listeners.get(topic) || [];
    for (const listener of topicListeners) {
      try {
        await listener(message);
      } catch (error) {
        console.error(`[queue:memory] Listener error on topic ${topic}:`, error.message);
      } finally {
        this.pendingMessages--;
      }
    }

    // If no listeners, keep the message in the buffer
    if (topicListeners.length === 0) {
      this.pendingMessages--;
    }
  }

  /**
   * Subscribe to a topic.
   * @param {string} topic - Topic name
   * @param {Function} handler - async (message) => {}
   * @returns {Promise<Function>} - Unsubscribe function
   */
  async subscribe(topic, handler) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, []);
    }
    this.listeners.get(topic).push(handler);

    // Replay buffered messages for this topic
    const buffered = this.topics.get(topic) || [];
    for (const bufferedMsg of buffered) {
      try {
        await handler(JSON.parse(bufferedMsg.value));
        this.pendingMessages--;
      } catch (error) {
        console.error(`[queue:memory] Replay error on topic ${topic}:`, error.message);
      }
    }

    return () => {
      const handlers = this.listeners.get(topic) || [];
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    };
  }

  /**
   * Get statistics about the in-memory queue.
   * @returns {Object}
   */
  stats() {
    const result = {};
    for (const [topic, messages] of this.topics) {
      result[topic] = {
        buffered: messages.length,
        listeners: (this.listeners.get(topic) || []).length,
      };
    }
    return result;
  }
}

// ============================================================
// Kafka Queue (production)
// Uses kafkajs for message publishing/subscription.
// Kafka is imported lazily so the package is optional.
// ============================================================

class KafkaQueue {
  constructor() {
    this._kafka = null;
    this._producer = null;
    this._consumers = new Map();
    this._ready = false;
  }

  /**
   * Initialize the Kafka client.
   * @private
   */
  async _init() {
    if (this._ready) return;

    const { Kafka } = await import('kafkajs');

    this._kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
    });

    this._producer = this._kafka.producer();
    await this._producer.connect();
    this._ready = true;
    console.log('[queue:kafka] Connected to Kafka');
  }

  /**
   * Publish a message to a Kafka topic.
   * @param {string} topic - Topic name
   * @param {Object} message - Message payload
   * @returns {Promise<void>}
   */
  async publish(topic, message) {
    await this._init();
    await this._producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
  }

  /**
   * Subscribe to a Kafka topic.
   * @param {string} topic - Topic name
   * @param {Function} handler - async (message) => {}
   * @returns {Promise<Function>} - Unsubscribe function
   */
  async subscribe(topic, handler) {
    await this._init();

    if (this._consumers.has(topic)) {
      return () => {};
    }

    const consumer = this._kafka.consumer({
      groupId: `voc-engine-${topic}`,
    });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    consumer.run({
      eachMessage: async ({ message }) => {
        try {
          await handler(JSON.parse(message.value.toString()));
        } catch (error) {
          console.error(`[queue:kafka] Handler error on topic ${topic}:`, error.message);
        }
      },
    });

    this._consumers.set(topic, consumer);
    return async () => {
      await consumer.disconnect();
      this._consumers.delete(topic);
    };
  }
}

// ============================================================
// Singleton queue instance
// ============================================================

let _instance = null;

/**
 * Get the message queue instance based on the configured mode.
 * @returns {MemoryQueue | KafkaQueue}
 */
export function getQueue() {
  if (_instance) return _instance;

  if (isKafkaMode()) {
    _instance = new KafkaQueue();
  } else {
    _instance = new MemoryQueue();
  }
  return _instance;
}

export { MemoryQueue, KafkaQueue };