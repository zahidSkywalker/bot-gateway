// ============================================
// Bot Gateway — WebSocket Manager
// Handles real-time bot connections
// ============================================
const { WebSocketServer } = require('ws');
const { validateToken, hasPermission } = require('./middleware/auth');
const { wsRateCheck, wsRemoveRateLimit } = require('./middleware/rateLimit');
const { getSupabase } = require('./database');

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
  
  const supa = getSupabase();
  
  // Get or create bot record
  const { data: bot } = await supa
    .from('bots')
    .select('id, name')
    .eq('token_id', tokenData.id)
    .single();
  
  if (bot) {
    connections.get(socketId).botName = bot.name;
    await supa.from('bots').update({
      status: 'online',
      connected_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    }).eq('id', bot.id);
  }
  
  // Subscribe to 'general' by default
  const { data: generalCh } = await supa
    .from('channels')
    .select('id')
    .eq('name', 'general')
    .eq('is_active', true)
    .single();
  
  if (generalCh) {
    connections.get(socketId).channels.add(generalCh.id);
  }
  
  ws.send(JSON.stringify({
    type: 'connected',
    message: `Connected as ${bot?.name || 'unknown'}`,
    socketId,
    defaultChannel: generalCh?.id || null
  }));
  
  console.log(`[WS] Bot connected: ${bot?.name || 'unknown'} (${socketId})`);
  
  // Audit log
  await supa.from('audit_log').insert({
    action: 'bot.connected',
    actor: bot?.name || 'unknown',
    actor_type: 'bot',
    detail: { socket_id: socketId, token_prefix: tokenData.key_prefix }
  }).catch(() => {});
  
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
        
        const channelId = msg.channel || generalCh?.id;
        if (!channelId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No channel specified' }));
          return;
        }
        
        const botName = connections.get(socketId)?.botName || 'unknown';
        
        // Store message
        const { data, error } = await supa.from('messages').insert({
          channel_id: channelId,
          bot_id: bot?.id,
          bot_name: botName,
          content: msg.content,
          content_type: msg.content_type || 'text',
          source: 'websocket'
        }).select().single();
        
        if (error) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to send message' }));
          return;
        }
        
        // Broadcast to all subscribers of this channel
        wsm.broadcastToChannel(channelId, {
          type: 'message',
          id: data.id,
          channel_id: channelId,
          bot_name: botName,
          content: msg.content,
          content_type: msg.content_type || 'text',
          source: 'websocket',
          created_at: data.created_at
        });
        
        // Update bot message count
        if (bot) {
          await supa.from('bots').update({
            message_count: (bot.message_count || 0) + 1,
            last_seen_at: new Date().toISOString()
          }).eq('id', bot.id);
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
        await supa.from('bots').update({
          status: 'offline',
          last_seen_at: new Date().toISOString()
        }).eq('id', bot.id).catch(() => {});
      }
      
      await supa.from('audit_log').insert({
        action: 'bot.disconnected',
        actor: conn.botName,
        actor_type: 'bot',
        detail: { socket_id: socketId }
      }).catch(() => {});
      
      connections.delete(socketId);
      wsRemoveRateLimit(socketId);
    }
  });
  
  ws.on('error', (err) => {
    console.error(`[WS] Error (${socketId}):`, err.message);
  });
}

module.exports = { getWebSocketManager, wsm };
