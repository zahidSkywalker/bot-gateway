// ============================================
// Bot Gateway — WebSocket Manager
// Handles real-time bot connections
// ============================================
const { WebSocketServer } = require('ws');
const { validateToken, hasPermission } = require('./middleware/auth');
const { wsRateCheck, wsRemoveRateLimit } = require('./middleware/rateLimit');
const Bot = require('./models/Bot');
const Channel = require('./models/Channel');
const Message = require('./models/Message');
const AuditLog = require('./models/AuditLog');
const mongoose = require('mongoose');

let wss = null;
const connections = new Map(); // socketId -> { ws, tokenId, botName, channels }

function getWebSocketManager() {
  return wsm;
}

const wsm = {
  init(server) {
    wss = new WebSocketServer({ server, path: '/gateway' });

    console.log('[WS] WebSocket server initialized on /gateway');

    wss.on('connection', handleConnection);

    // Heartbeat: ping all clients every 30s
    setInterval(() => {
      wss.clients.forEach(ws => {
        if (ws.readyState === 1) {
          ws.ping();
        }
      });
    }, 30000);
  },

  broadcastToChannel(channelId, message) {
    if (!wss) return;

    const msgStr = JSON.stringify(message);
    wss.clients.forEach(ws => {
      const conn = connections.get(ws.id);
      if (conn && conn.channels.has(channelId) && ws.readyState === 1) {
        ws.send(msgStr);
      }
    });
  },

  disconnectByTokenId(tokenId) {
    if (!wss) return;
    wss.clients.forEach(ws => {
      const conn = connections.get(ws.id);
      if (conn && conn.tokenId === tokenId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Token revoked. Disconnecting.' }));
        ws.close(4001, 'Token revoked');
      }
    });
  },

  getStats() {
    return {
      totalConnections: wss?.clients?.size || 0,
      registeredBots: connections.size,
      connections: Array.from(connections.entries()).map(([id, c]) => ({
        id,
        botName: c.botName,
        channels: Array.from(c.channels),
        connectedAt: c.connectedAt
      }))
    };
  }
};

async function handleConnection(ws, req) {
  const socketId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  ws.id = socketId;

  // Authenticate via token query param
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing token. Connect with ?token=YOUR_TOKEN' }));
    ws.close(4001, 'Missing token');
    return;
  }

  const tokenData = await validateToken(token);
  if (!tokenData) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
    ws.close(4001, 'Invalid token');
    return;
  }

  // Initialize connection record
  connections.set(socketId, {
    ws,
    tokenId: tokenData.id,
    botName: 'unknown',
    channels: new Set(), // subscribed channels
    connectedAt: new Date().toISOString()
  });

  // Get or create bot record
  const tokenId = new mongoose.Types.ObjectId(tokenData.id);
  const bot = await Bot.findOne({ token_id: tokenId }).lean();

  if (bot) {
    connections.get(socketId).botName = bot.name;
    await Bot.findByIdAndUpdate(bot._id, {
      status: 'online',
      connected_at: new Date(),
      last_seen_at: new Date()
    });
  }

  // Subscribe to 'general' by default
  const generalCh = await Channel.findOne({ name: 'general', is_active: true }).lean();

  if (generalCh) {
    connections.get(socketId).channels.add(generalCh.id.toString());
  }

  ws.send(JSON.stringify({
    type: 'connected',
    message: `Connected as ${bot?.name || 'unknown'}`,
    socketId,
    defaultChannel: generalCh?.id?.toString() || null
  }));

  console.log(`[WS] Bot connected: ${bot?.name || 'unknown'} (${socketId})`);

  // Audit log
  await new AuditLog({
    action: 'bot.connected',
    actor: bot?.name || 'unknown',
    actor_type: 'bot',
    detail: { socket_id: socketId, token_prefix: tokenData.key_prefix }
  }).save().catch(() => {});

  // Handle messages
  ws.on('message', async (raw) => {
    // Rate check
    if (!wsRateCheck(socketId, 60, 60000)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'message': {
        // Bot sending a message to a channel
        if (!hasPermission(tokenData.permissions, 'write')) {
          ws.send(JSON.stringify({ type: 'error', message: 'Write permission required' }));
          return;
        }

        const channelId = msg.channel || generalCh?.id?.toString();
        if (!channelId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No channel specified' }));
          return;
        }

        const botName = connections.get(socketId)?.botName || 'unknown';

        // Store message
        const message = new Message({
          channel_id: channelId,
          bot_id: bot?._id?.toString(),
          bot_name: botName,
          content: msg.content,
          content_type: msg.content_type || 'text',
          source: 'websocket'
        });
        const saved = await message.save();

        // Broadcast to all subscribers of this channel
        wsm.broadcastToChannel(channelId, {
          type: 'message',
          id: saved.id,
          channel_id: channelId,
          bot_name: botName,
          content: msg.content,
          content_type: msg.content_type || 'text',
          source: 'websocket',
          created_at: saved.created_at
        });

        // Update bot message count
        if (bot) {
          await Bot.findByIdAndUpdate(bot._id, {
            $inc: { message_count: 1 },
            last_seen_at: new Date()
          });
        }

        break;
      }

      case 'subscribe': {
        // Subscribe to a channel
        const channelId = msg.channel;
        if (channelId) {
          connections.get(socketId).channels.add(channelId);
          ws.send(JSON.stringify({ type: 'subscribed', channel: channelId }));
        }
        break;
      }

      case 'unsubscribe': {
        const channelId = msg.channel;
        if (channelId) {
          connections.get(socketId).channels.delete(channelId);
          ws.send(JSON.stringify({ type: 'unsubscribed', channel: channelId }));
        }
        break;
      }

      case 'pong':
        // Heartbeat response
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  });

  ws.on('close', async () => {
    const conn = connections.get(socketId);
    if (conn) {
      console.log(`[WS] Bot disconnected: ${conn.botName} (${socketId})`);

      if (bot) {
        await Bot.findByIdAndUpdate(bot._id, {
          status: 'offline',
          last_seen_at: new Date()
        }).catch(() => {});
      }

      await new AuditLog({
        action: 'bot.disconnected',
        actor: conn.botName,
        actor_type: 'bot',
        detail: { socket_id: socketId }
      }).save().catch(() => {});

      connections.delete(socketId);
      wsRemoveRateLimit(socketId);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error (${socketId}):`, err.message);
  });
}

module.exports = { getWebSocketManager, wsm };
