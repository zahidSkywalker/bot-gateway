// ============================================
// Bot Gateway — Channel Routes
// GET    /api/v1/channels        — List channels (token auth)
// POST   /api/v1/channels        — Create channel (admin)
// DELETE /api/v1/channels/:id    — Delete channel (admin)
// ============================================
const express = require('express');
const { tokenAuth, adminAuth } = require('../middleware/auth');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const AuditLog = require('../models/AuditLog');
const { cleanLean } = require('../models');

const router = express.Router();

// List channels
router.get('/', tokenAuth, async (req, res) => {
  try {
    const channels = await Channel.find({ is_active: true })
      .sort({ name: 1 })
      .lean();

    // Get message counts per channel using aggregate
    const counts = await Message.aggregate([
      { $group: { _id: '$channel_id', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    counts.forEach(c => {
      countMap[c._id] = c.count;
    });

    const cleanedChannels = cleanLean(channels);
    const channelsWithCounts = cleanedChannels.map(ch => ({
      ...ch,
      message_count: countMap[ch.id] || 0
    }));

    res.json({ success: true, channels: channelsWithCounts });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create channel
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Channel name is required' });

    const channelName = name.toLowerCase().replace(/\s+/g, '-');

    try {
      const channel = new Channel({
        name: channelName,
        description,
        created_by: 'admin'
      });
      const saved = await channel.save();

      await new AuditLog({
        action: 'channel.created',
        actor: 'admin',
        detail: { channel_id: saved.id, channel_name: channelName }
      }).save();

      res.status(201).json({ success: true, channel: saved });
    } catch (err) {
      // Handle duplicate key error
      if (err.code === 11000) {
        return res.status(409).json({ error: 'Channel already exists' });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete channel
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id).select('name');
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    await Channel.findByIdAndUpdate(req.params.id, { is_active: false });

    await new AuditLog({
      action: 'channel.deleted',
      actor: 'admin',
      detail: { channel_id: req.params.id, channel_name: channel.name }
    }).save();

    res.json({ success: true, message: 'Channel deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
