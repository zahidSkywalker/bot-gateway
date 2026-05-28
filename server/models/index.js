// ============================================
// Bot Gateway — Models Index
// Exports all Mongoose models + lean helper
// ============================================
const Token = require('./Token');
const Bot = require('./Bot');
const Channel = require('./Channel');
const Message = require('./Message');
const AuditLog = require('./AuditLog');

/**
 * Transform a lean document or array of lean documents
 * to add `id` (hex string from _id) and remove `_id` and `__v`.
 */
function cleanLean(doc) {
  if (!doc) return doc;
  if (Array.isArray(doc)) {
    return doc.map(cleanLean);
  }
  const obj = { ...doc };
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
}

module.exports = {
  Token,
  Bot,
  Channel,
  Message,
  AuditLog,
  cleanLean
};
