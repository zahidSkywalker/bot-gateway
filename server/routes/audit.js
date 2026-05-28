// ============================================
// Bot Gateway — Audit Log Routes
// GET /api/v1/audit  — List audit events (admin)
// ============================================
const express = require('express');
const { adminAuth } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');
const { cleanLean } = require('../models');

const router = express.Router();

// List audit log entries
router.get('/', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const [logs, total] = await Promise.all([
      AuditLog.find()
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments()
    ]);

    res.json({
      success: true,
      logs: cleanLean(logs) || [],
      total,
      limit,
      offset
    });
  } catch (err) {
    console.error('[AUDIT] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
