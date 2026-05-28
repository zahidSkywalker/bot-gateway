// ============================================
// Bot Gateway — Audit Log Routes
// GET /api/v1/audit  — List audit events (admin)
// ============================================
const express = require('express');
const { getSupabase } = require('../database');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// List audit log entries
router.get('/', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const supa = getSupabase();

    const { data, error, count } = await supa
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch audit log', detail: error.message });
    }

    res.json({
      success: true,
      logs: data || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (err) {
    console.error('[AUDIT] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
