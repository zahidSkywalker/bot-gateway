// ============================================
// Bot Gateway — Token Routes
// POST   /api/v1/tokens/generate  — Create new token (admin)
// GET    /api/v1/tokens           — List all tokens (admin)
// DELETE /api/v1/tokens/:id       — Revoke token (admin)
// ============================================
const express = require('express');
const { generateTokenKey, hashToken, getTokenPrefix, adminAuth } = require('../middleware/auth');
const Token = require('../models/Token');
const AuditLog = require('../models/AuditLog');
const { cleanLean } = require('../models');

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
      tokenData.expires_at = new Date(Date.now() + expires_in_days * 86400000);
    }

    const newToken = new Token(tokenData);
    const saved = await newToken.save();

    // Log to audit
    await new AuditLog({
      action: 'token.created',
      actor: 'admin',
      detail: { token_id: saved.id, token_name: name, prefix }
    }).save();

    // Return the plain token ONLY on creation
    res.json({
      success: true,
      token: tokenKey,  // This is the ONLY time the full token is shown
      token_data: {
        id: saved.id,
        name: saved.name,
        prefix: saved.key_prefix,
        permissions: saved.permissions,
        expires_at: saved.expires_at,
        created_at: saved.created_at
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
    const tokens = await Token.find()
      .sort({ created_at: -1 })
      .select('-key_hash')
      .lean();

    res.json({ success: true, tokens: cleanLean(tokens) });
  } catch (err) {
    console.error('[TOKENS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke a token
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    // Get token info before revoking
    const token = await Token.findById(req.params.id).select('name key_prefix');
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    await Token.findByIdAndUpdate(req.params.id, { is_active: false });

    // Audit
    await new AuditLog({
      action: 'token.revoked',
      actor: 'admin',
      detail: { token_id: req.params.id, token_name: token.name, prefix: token.key_prefix }
    }).save();

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
