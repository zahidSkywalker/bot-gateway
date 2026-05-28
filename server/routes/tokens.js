// ============================================
// Bot Gateway — Token Routes
// POST   /api/v1/tokens/generate  — Create new token (admin)
// GET    /api/v1/tokens           — List all tokens (admin)
// DELETE /api/v1/tokens/:id       — Revoke token (admin)
// ============================================
const express = require('express');
const { getSupabase } = require('../database');
const { generateTokenKey, hashToken, getTokenPrefix } = require('../middleware/auth');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// Generate a new token
router.post('/generate', adminAuth, async (req, res) => {
  try {
    const { name, permissions = {}, expires_in_days } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Token name is required' });
    }
    
    const tokenKey = generateTokenKey();
    const keyHash = hashToken(tokenKey);
    const prefix = getTokenPrefix(tokenKey);
    
    const tokenData = {
      name,
      key_hash: keyHash,
      key_prefix: prefix,
      permissions: {
        read: permissions.read !== false,
        write: permissions.write === true,
        admin: permissions.admin === true
      },
      created_by: req.isAdmin ? 'admin' : 'system',
      is_active: true
    };
    
    if (expires_in_days) {
      tokenData.expires_at = new Date(Date.now() + expires_in_days * 86400000).toISOString();
    }
    
    const supa = getSupabase();
    const { data, error } = await supa.from('tokens').insert(tokenData).select().single();
    
    if (error) {
      return res.status(500).json({ error: 'Failed to create token', detail: error.message });
    }
    
    // Log to audit
    await supa.from('audit_log').insert({
      action: 'token.created',
      actor: 'admin',
      detail: { token_id: data.id, token_name: name, prefix }
    });
    
    // Return the plain token ONLY on creation
    res.json({
      success: true,
      token: tokenKey,  // This is the ONLY time the full token is shown
      token_data: {
        id: data.id,
        name: data.name,
        prefix: data.key_prefix,
        permissions: data.permissions,
        expires_at: data.expires_at,
        created_at: data.created_at
      }
    });
    
  } catch (err) {
    console.error('[TOKENS] Generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List all tokens
router.get('/', adminAuth, async (req, res) => {
  try {
    const supa = getSupabase();
    const { data, error } = await supa
      .from('tokens')
      .select('id, name, key_prefix, permissions, created_by, expires_at, last_used_at, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch tokens', detail: error.message });
    }
    
    res.json({ success: true, tokens: data });
  } catch (err) {
    console.error('[TOKENS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke a token
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const supa = getSupabase();
    
    // Get token info before deleting
    const { data: token } = await supa.from('tokens').select('name, key_prefix').eq('id', req.params.id).single();
    
    const { error } = await supa.from('tokens').update({ is_active: false }).eq('id', req.params.id);
    
    if (error) {
      return res.status(404).json({ error: 'Token not found', detail: error.message });
    }
    
    // Log
    await supa.from('audit_log').insert({
      action: 'token.revoked',
      actor: 'admin',
      detail: { token_id: req.params.id, token_name: token?.name, prefix: token?.key_prefix }
    });
    
    // Notify connected bot using this token to disconnect
    const { getWebSocketManager } = require('../websocket');
    const wsm = getWebSocketManager();
    if (wsm) wsm.disconnectByTokenId(req.params.id);
    
    res.json({ success: true, message: 'Token revoked' });
  } catch (err) {
    console.error('[TOKENS] Revoke error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
