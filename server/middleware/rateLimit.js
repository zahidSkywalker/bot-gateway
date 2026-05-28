// ============================================
// Bot Gateway — Rate Limiter
// ============================================
const rateLimit = require('express-rate-limit');

// General API rate limit: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Token-based rate limit: 30 requests per minute per token
const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.token?.id || req.ip,
  message: { error: 'Token rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Message rate limit: 60 per minute (for bot messaging)
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.token?.id || req.ip,
  message: { error: 'Message rate limit exceeded. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});

// WebSocket rate limiter (in-memory, per connection)
const wsRateLimits = new Map();

function wsRateCheck(socketId, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const record = wsRateLimits.get(socketId);
  
  if (!record || now - record.startTime > windowMs) {
    wsRateLimits.set(socketId, { count: 1, startTime: now });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

function wsRemoveRateLimit(socketId) {
  wsRateLimits.delete(socketId);
}

module.exports = { apiLimiter, tokenLimiter, messageLimiter, wsRateCheck, wsRemoveRateLimit };
