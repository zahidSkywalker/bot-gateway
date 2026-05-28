// ============================================
// Bot Gateway — AuditLog Model (Mongoose)
// ============================================
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  actor: String,
  actor_type: {
    type: String,
    enum: ['system', 'admin', 'bot', 'token'],
    default: 'system'
  },
  detail: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  ip_address: String,
  created_at: { type: Date, default: Date.now }
}, { strict: true });

// Index on created_at descending
auditLogSchema.index({ created_at: -1 });

// Virtual id getter
auditLogSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

auditLogSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

auditLogSchema.set('toObject', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
