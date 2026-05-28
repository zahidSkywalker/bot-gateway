// ============================================
// Bot Gateway — Channel Routes
// GET    /api/v1/channels        — List channels (token auth)
// POST   /api/v1/channels        — Create channel (admin)
// DELETE /api/v1/channels/:id    — Delete channel (admin)
// ============================================
const express = require('express');
const { getSupabase } = require('../database');
const { tokenAuth, adminAuth } = require('../middleware/auth');

const router = express.Router();

// List channels
router.get('/', tokenAuth, async (req, res) => {
  try {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('channels')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) return res.status(500).json({ error: 'Failed to fetch channels' });
    
    // Get message counts per channel
    const { data: msgCounts } = await supa
      .from('messages')
      .select('channel_id')
      .order('created_at', { ascending: false });
    
    const channelCounts = {};
    if (msgCounts) {
      msgCounts.forEach(m => {
        channelCounts[m.channel_id] = (channelCounts[m.channel_id] || 0) + 1;
      });
    }
    
    const channelsWithCounts = data.map(ch => ({
      ...ch,
      message_count: channelCounts[ch.id] || 0
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
    
    const supa = getSupabase();
    const { data, error } = await supa
      .from('channels')
      .insert({ name: name.toLowerCase().replace(/\s+/g, '-'), description, created_by: 'admin' })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Channel already exists' });
      }
      return res.status(500).json({ error: 'Failed to create channel' });
    }
    
    await supa.from('audit_log').insert({
      action: 'channel.created',
      actor: 'admin',
      detail: { channel_id: data.id, channel_name: name }
    });
    
    res.status(201).json({ success: true, channel: data });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete channel
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const supa = getSupabase();
    const { data: channel } = await supa.from('channels').select('name').eq('id', req.params.id).single();
    
    const { error } = await supa.from('channels').update({ is_active: false }).eq('id', req.params.id);
    if (error) return res.status(404).json({ error: 'Channel not found' });
    
    await supa.from('audit_log').insert({
      action: 'channel.deleted',
      actor: 'admin',
      detail: { channel_id: req.params.id, channel_name: channel?.name }
    });
    
    res.json({ success: true, message: 'Channel deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
