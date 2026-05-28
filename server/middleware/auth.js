// ============================================
// Bot Gateway — Token Auth Middleware
// ============================================
const crypto = require('crypto');
const { getSupabase } = require('./database');

// Generate a new bot token: bg_<32 random chars>
function generateTokenKey() {
  return 'bg_' + crypto.randomBytes(24).toString('hex');
}

// Hash a token for storage
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Extract prefix for display: bg_xK9mAb...
function getTokenPrefix(token) {
  return token.substring(0, 10) + '...';
}

// Validate a token and return its record
async function validateToken(token) {
  if (!token || !token.startsWith('bg_')) return null;
  
  const hash = hashToken(token);
  const supa = getSupabase();
  
  const { data, error } = await supa
    .from('tokens')
    .select('*')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .single();
  
  if (error || !data) return null;
  
  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Deactivate expired token
    await supa.from('tokens').update({ is_active: false }).eq('id', data.id);
    return null;
  }
  
  // Update last_used_at
  await supa.from('tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  
  return data;
}

// Express middleware for token auth
function tokenAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query?.token;
  
  if (!token) {
    return res.status(401).json({ error: 'Missing token. Use Authorization: Bearer <token>' });
  }
  
  validateToken(token).then(tokenData => {
    if (!tokenData) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.token = tokenData;
    req.botPermissions = tokenData.permissions;
    next();
  }).catch(err => {
    console.error('[AUTH] Error validating token:', err.message);
    res.status(500).json({ error: 'Authentication error' });
  });
}

// Admin auth middleware
function adminAuth(req, res, next) {
  const adminPass = req.headers['x-admin-password'] || req.query?.admin_password;
  
  if (adminPass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  
  req.isAdmin = true;
  next();
}

// Permission check helper
function hasPermission(permissions, action) {
  if (permissions.admin) return true;
  return permissions[action] === true;
}

module.exports = { generateTokenKey, hashToken, getTokenPrefix, validateToken, tokenAuth, adminAuth, hasPermission };
