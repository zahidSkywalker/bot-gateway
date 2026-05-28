// ============================================
// Bot Gateway — Message Routes
// POST   /api/v1/messages           — Send message (token auth + write)
// GET    /api/v1/messages/:channel — Get channel messages (token auth + read)
// ============================================
const express = require('express');
const { tokenAuth, hasPermission } = require('../middleware/auth');
const { messageLimiter } = require('../middleware/rateLimit');
const Channel = require('../models/Channel');
const Bot = require('../models/Bot');
const Message = require('../models/Message');
const { cleanLean } = require('../models');
const mongoose = require('mongoose');

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

    // Resolve channel
    let targetChannelId = channel_id;

    if (!targetChannelId && channel) {
      const ch = await Channel.findOne({
        name: channel.toLowerCase().replace(/\s+/g, '-'),
        is_active: true
      });
      targetChannelId = ch?.id?.toString();
    }

    if (!targetChannelId) {
      return res.status(400).json({ error: 'Valid channel required (channel_id or channel name)' });
    }

    // Get bot info
    const tokenId = new mongoose.Types.ObjectId(req.token.id);
    const bot = await Bot.findOne({ token_id: tokenId }).lean();

    const botName = bot?.name || 'anonymous';

    // Insert message
    const message = new Message({
      channel_id: targetChannelId,
      bot_id: bot?._id?.toString(),
      bot_name: botName,
      content,
      content_type,
      source: 'api'
    });
    const saved = await message.save();

    // Update bot message count
    if (bot) {
      await Bot.findByIdAndUpdate(bot._id, { $inc: { message_count: 1 } });
    }

    // Broadcast to WebSocket clients
    const { getWebSocketManager } = require('../websocket');
    const wsm = getWebSocketManager();
    if (wsm) {
      wsm.broadcastToChannel(targetChannelId, {
        type: 'message',
        id: saved.id,
        channel_id: targetChannelId,
        bot_name: botName,
        content,
        content_type,
        source: 'api',
        created_at: saved.created_at
      });
    }

    res.status(201).json({ success: true, message: saved });
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

    // If channelId looks like a name (not a valid ObjectId), resolve it
    let targetId = channelId;
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      const ch = await Channel.findOne({
        name: channelId.toLowerCase(),
        is_active: true
      });
      targetId = ch?.id?.toString();
    }

    if (!targetId) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const messages = await Message.find({ channel_id: targetId })
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    // Reverse to get chronological order
    res.json({ success: true, messages: cleanLean(messages.reverse()), count: messages.length });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
