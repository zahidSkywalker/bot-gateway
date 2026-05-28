// ============================================
// Bot Gateway — Bot Routes
// GET /api/v1/bots           — List all bots (admin)
// GET /api/v1/bots/me        — Get current bot info (token auth)
// POST /api/v1/bots/register — Register a bot (token auth)
// ============================================
const express = require('express');
const { getSupabase } = require('../database');
const { tokenAuth, adminAuth, hasPermission } = require('../middleware/auth');

const router = express.Router();

// Register current bot (called by bot on first connection)
router.post('/register', tokenAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const supa = getSupabase();
    
    if (!name) {
      return res.status(400).json({ error: 'Bot name is required' });
    }
    
    // Check if a bot with this token already exists
    const { data: existing } = await supa
      .from('bots')
      .select('id')
      .eq('token_id', req.token.id)
      .single();
    
    if (existing) {
      // Update existing bot
      const { data, error } = await supa
        .from('bots')
        .update({ name, description, status: 'online', last_seen_at: new Date().toISOString(), metadata: req.body.metadata || {} })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) return res.status(500).json({ error: 'Failed to update bot' });
      
      return res.json({ success: true, bot: data });
    }
    
    // Create new bot
    const { data, error } = await supa
      .from('bots')
      .insert({
        name,
        description,
        token_id: req.token.id,
        status: 'online',
        connected_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        metadata: req.body.metadata || {}
      })
      .select()
      .single();
    
    if (error) {
      return res.status(500).json({ error: 'Failed to register bot', detail: error.message });
    }
    
    // Audit
    await supa.from('audit_log').insert({
      action: 'bot.registered',
      actor: name,
      actor_type: 'bot',
      detail: { bot_id: data.id, token_prefix: req.token.key_prefix }
    });
    
    res.json({ success: true, bot: data });
  } catch (err) {
    console.error('[BOTS] Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current bot info
router.get('/me', tokenAuth, async (req, res) => {
  try {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('bots')
      .select('*')
      .eq('token_id', req.token.id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ error: 'Bot not registered. Call POST /api/v1/bots/register first.' });
    }
    
    res.json({ success: true, bot: data });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all bots (admin)
router.get('/', adminAuth, async (req, res) => {
  try {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('bots')
      .select('*, tokens(name, key_prefix, permissions)')
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: 'Failed to fetch bots' });
    
    res.json({ success: true, bots: data });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
