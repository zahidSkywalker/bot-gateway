// ============================================
// Bot Gateway — Main Server
// Express + WebSocket + REST API
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const path = require('path');
const { initDatabase } = require('./database');
const { apiLimiter } = require('./middleware/rateLimit');
const { getWebSocketManager } = require('./websocket');

// Routes
const tokensRoutes = require('./routes/tokens');
const botsRoutes = require('./routes/bots');
const channelsRoutes = require('./routes/channels');
const messagesRoutes = require('./routes/messages');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// Middleware
// ============================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()),
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(apiLimiter);

// ============================================
// API Routes
// ============================================
app.use('/api/v1/tokens', tokensRoutes);
app.use('/api/v1/bots', botsRoutes);
app.use('/api/v1/channels', channelsRoutes);
app.use('/api/v1/messages', messagesRoutes);

// Stats endpoint (admin)
app.get('/api/v1/stats', async (req, res) => {
  const adminPass = req.headers['x-admin-password'] || req.query?.admin_password;
  if (adminPass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Admin access required' });
  }
  
  const { getSupabase } = require('./database');
  const supa = getSupabase();
  const wsm = getWebSocketManager();
  
  const [tokensRes, botsRes, channelsRes, messagesRes, auditRes] = await Promise.all([
    supa.from('tokens').select('id', { count: 'exact', head: true }),
    supa.from('bots').select('id', { count: 'exact', head: true }).eq('status', 'online'),
    supa.from('channels').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supa.from('messages').select('id', { count: 'exact', head: true }),
    supa.from('audit_log').select('id', { count: 'exact', head: true })
  ]);
  
  res.json({
    success: true,
    stats: {
      totalTokens: tokensRes.count || 0,
      onlineBots: botsRes.count || 0,
      activeChannels: channelsRes.count || 0,
      totalMessages: messagesRes.count || 0,
      totalActions: auditRes.count || 0,
      websocketConnections: wsm?.getStats()?.totalConnections || 0
    }
  });
});

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '..', 'frontend', 'out');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ============================================
// Start Server
// ============================================
async function start() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║       Bot Gateway v1.0.0             ║');
  console.log('║   Token-based Bot Connection System  ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  
  await initDatabase();
  
  const server = http.createServer(app);
  
  // Initialize WebSocket
  const { wsm } = require('./websocket');
  wsm.init(server);
  
  server.listen(PORT, () => {
    console.log(`[SERVER] HTTP server running on port ${PORT}`);
    console.log(`[SERVER] WebSocket gateway at ws://localhost:${PORT}/gateway`);
    console.log(`[SERVER] API at http://localhost:${PORT}/api/v1`);
    console.log(`[SERVER] Admin password: ${process.env.ADMIN_PASSWORD ? '***configured***' : '***NOT SET***'}`);
    console.log('');
  });
}

start().catch(err => {
  console.error('[SERVER] Failed to start:', err);
  process.exit(1);
});

module.exports = app;
