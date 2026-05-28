// ============================================
// Bot Gateway — Bot Routes
// GET /api/v1/bots           — List all bots (admin)
// GET /api/v1/bots/me        — Get current bot info (token auth)
// POST /api/v1/bots/register — Register a bot (token auth)
// ============================================
const express = require('express');
const { tokenAuth, adminAuth, hasPermission } = require('../middleware/auth');
const Bot = require('../models/Bot');
const AuditLog = require('../models/AuditLog');
const { cleanLean } = require('../models');
const mongoose = require('mongoose');

const router = express.Router();

// Register current bot (called by bot on first connection)
router.post('/register', tokenAuth, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Bot name is required' });
    }

    const tokenId = new mongoose.Types.ObjectId(req.token.id);

    // Check if a bot with this token already exists
    const existing = await Bot.findOne({ token_id: tokenId });

    if (existing) {
      // Update existing bot
      existing.name = name;
      existing.description = description;
      existing.status = 'online';
      existing.last_seen_at = new Date();
      existing.metadata = req.body.metadata || existing.metadata;
      const updated = await existing.save();

      return res.json({ success: true, bot: updated });
    }

    // Create new bot
    const newBot = new Bot({
      name,
      description,
      token_id: tokenId,
      status: 'online',
      connected_at: new Date(),
      last_seen_at: new Date(),
      metadata: req.body.metadata || {}
    });

    const saved = await newBot.save();

    // Audit
    await new AuditLog({
      action: 'bot.registered',
      actor: name,
      actor_type: 'bot',
      detail: { bot_id: saved.id, token_prefix: req.token.key_prefix }
    }).save();

    res.json({ success: true, bot: saved });
  } catch (err) {
    console.error('[BOTS] Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current bot info
router.get('/me', tokenAuth, async (req, res) => {
  try {
    const tokenId = new mongoose.Types.ObjectId(req.token.id);
    const bot = await Bot.findOne({ token_id: tokenId }).lean();

    if (!bot) {
      return res.status(404).json({ error: 'Bot not registered. Call POST /api/v1/bots/register first.' });
    }

    res.json({ success: true, bot: cleanLean(bot) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all bots (admin)
router.get('/', adminAuth, async (req, res) => {
  try {
    const bots = await Bot.find()
      .sort({ created_at: -1 })
      .populate('token_id', 'name key_prefix permissions')
      .lean();

    // Transform lean results to clean format
    const cleaned = cleanLean(bots).map(bot => ({
      ...bot,
      token_id: bot.token_id ? cleanLean(bot.token_id) : null
    }));

    res.json({ success: true, bots: cleaned });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
