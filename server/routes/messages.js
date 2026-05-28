// ============================================
// Bot Gateway — Message Routes
// POST   /api/v1/messages           — Send message (token auth + write)
// GET    /api/v1/messages/:channel — Get channel messages (token auth + read)
// ============================================
const express = require('express');
const { getSupabase } = require('../database');
const { tokenAuth, hasPermission } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Send a message (REST mode)
router.post('/', tokenAuth, messageLimiter, async (req, res) => {
  try {
    if (!hasPermission(req.botPermissions, 'write')) {
      return res.status(403).json({ error: 'Write permission required' });
    }
    
    const { channel_id, channel, content, content_type = 'text' } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    const supa = getSupabase();
    
    // Resolve channel
    let targetChannelId = channel_id;
    
    if (!targetChannelId && channel) {
      const { data: ch } = await supa
        .from('channels')
        .select('id')
        .eq('name', channel.toLowerCase().replace(/\s+/g, '-'))
        .eq('is_active', true)
        .single();
      targetChannelId = ch?.id;
    }
    
    if (!targetChannelId) {
      return res.status(400).json({ error: 'Valid channel required (channel_id or channel name)' });
    }
    
    // Get bot info
    const { data: bot } = await supa
      .from('bots')
      .select('id, name')
      .eq('token_id', req.token.id)
      .single();
    
    const botName = bot?.name || 'anonymous';
    
    // Insert message
    const { data, error } = await supa
      .from('messages')
      .insert({
        channel_id: targetChannelId,
        bot_id: bot?.id,
        bot_name: botName,
        content,
        content_type,
        source: 'api'
      })
      .select()
      .single();
    
    if (error) {
      return res.status(500).json({ error: 'Failed to send message', detail: error.message });
    }
    
    // Update bot message count
    if (bot) {
      await supa.rpc('', {}).catch(() => {}); // ignore
      await supa
        .from('bots')
        .update({ message_count: (bot.message_count || 0) + 1 })
        .eq('id', bot.id);
    }
    
    // Broadcast to WebSocket clients
    const { getWebSocketManager } = require('../websocket');
    const wsm = getWebSocketManager();
    if (wsm) {
      wsm.broadcastToChannel(targetChannelId, {
        type: 'message',
        id: data.id,
        channel_id: targetChannelId,
        bot_name: botName,
        content,
        content_type,
        source: 'api',
        created_at: data.created_at
      });
    }
    
    res.status(201).json({ success: true, message: data });
  } catch (err) {
    console.error('[MESSAGES] Send error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages from a channel
router.get('/:channelId', tokenAuth, async (req, res) => {
  try {
    if (!hasPermission(req.botPermissions, 'read')) {
      return res.status(403).json({ error: 'Read permission required' });
    }
    
    const { channelId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    
    const supa = getSupabase();
    
    // If channelId looks like a name (not UUID), resolve it
    let targetId = channelId;
    if (!channelId.match(/^[0-9a-f]{8}-/)) {
      const { data: ch } = await supa
        .from('channels')
        .select('id')
        .eq('name', channelId.toLowerCase())
        .eq('is_active', true)
        .single();
      targetId = ch?.id;
    }
    
    if (!targetId) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    const { data, error } = await supa
      .from('messages')
      .select('*')
      .eq('channel_id', targetId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }
    
    res.json({ success: true, messages: data.reverse(), count: data.length });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
