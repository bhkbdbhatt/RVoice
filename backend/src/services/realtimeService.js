// backend/src/services/realtimeService.js
// Real-time WebSocket streaming service.
// Bridges the in-memory/Kafka message queue to WebSocket clients so the
// dashboard receives live feedback ingestion events without polling.
//
// The `ws` package is an OPTIONAL dependency. When not installed or when
// REALTIME_ENABLED is 'false', the server degrades gracefully and all
// other functionality continues unchanged.

import { config } from '../config/env.js';

let wss = null;
let wsAvailable = false;
const connectedClients = new Set();
const unsubscribers = [];
let heartbeatTimer = null;

async function loadWs() {
  if (!config.rt.enabled) return null;
  try {
    return await import('ws');
  } catch (error) {
    console.warn('[realtime] `ws` package not available, WebSocket disabled:', error.message);
    return null;
  }
}

export async function initWebSocketServer(httpServer) {
  if (wss) return { available: true, path: config.rt.wsPath };

  const wsModule = await loadWs();
  if (!wsModule || !httpServer) {
    console.log('[realtime] WebSocket streaming disabled');
    return { available: false, path: config.rt.wsPath };
  }

  try {
    wss = new wsModule.WebSocketServer({
      server: httpServer,
      path: config.rt.wsPath,
      maxPayload: config.rt.maxPayloadBytes,
    });
    wsAvailable = true;

    wss.on('connection', (socket) => {
      connectedClients.add(socket);
      console.log(`[realtime] Client connected (${connectedClients.size} total)`);

      socket.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
        message: 'RVoice real-time feed active',
      }));

      socket.on('close', () => {
        connectedClients.delete(socket);
        console.log(`[realtime] Client disconnected (${connectedClients.size} total)`);
      });

      socket.on('error', () => {
        connectedClients.delete(socket);
      });

      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          }
        } catch { /* ignore malformed messages */ }
      });
    });

    return { available: true, path: config.rt.wsPath };
  } catch (error) {
    console.warn('[realtime] Failed to initialize WebSocket server:', error.message);
    wsAvailable = false;
    wss = null;
    return { available: false, path: config.rt.wsPath };
  }

/**
 * Subscribe the WebSocket server to message queue topics.
 * Called after initWebSocketServer to wire up event broadcasting.
 */
 async function subscribeQueueToWebSocket() {
  if (!wsAvailable || !wss) return;

  const queue = (await import('../queue/messageQueue.js')).getQueue();

  const unsubRaw = await queue.subscribe(config.kafka.topics.rawFeedback, (message) => {
    broadcast({
      type: 'feedback.ingested',
      timestamp: new Date().toISOString(),
      data: {
        id: message.id || message.externalId || null,
        source: message.source,
        origin: message.origin,
        product: message.product,
        store: message.store,
        journeyStage: message.journeyStage,
        text: typeof message.text === 'string' ? message.text.substring(0, 200) : '',
        rating: message.rating,
        batchId: message._batchId || null,
        language: message.language || 'en',
      },
    });
  });
  unsubscribers.push(unsubRaw);

  heartbeatTimer = setInterval(() => {
    for (const client of connectedClients) {
      if (client.readyState === 1) client.ping();
      else connectedClients.delete(client);
    }
  }, config.rt.heartbeatIntervalMs);

  console.log('[realtime] Subscribed to queue topics for broadcasting');
}

/**
 * Broadcast a JSON message to all connected WebSocket clients.
 */
 function broadcast(payload) {
  if (!wsAvailable || !wss || connectedClients.size === 0) return;

  let data;
  try {
    data = JSON.stringify(payload);
  } catch (error) {
    console.error('[realtime] Broadcast serialization failed:', error.message);
    return;
  }

  for (const client of connectedClients) {
    if (client.readyState === 1) client.send(data);
  }
}

/**
 * Get real-time service status and statistics.
 * @returns {{available: boolean, enabled: boolean, path: string, connectedClients: number}}
 */
 function getRealtimeStats() {
  return {
    available: wsAvailable,
    enabled: config.rt.enabled,
    path: config.rt.wsPath,
    connectedClients: connectedClients.size,
  };
}

/**
 * Shut down the WebSocket server and clean up subscriptions.
 */
 async function shutdownWebSocketServer() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  for (const unsub of unsubscribers) {
    try { await unsub(); } catch { /* ignore */ }
  }
  unsubscribers.length = 0;
  if (wss) {
    for (const client of connectedClients) {
      try { client.close(); } catch { /* ignore */ }
    }
    connectedClients.clear();
    await new Promise((resolve) => wss.close(resolve));
    wss = null;
    wsAvailable = false;
  }
}

}
