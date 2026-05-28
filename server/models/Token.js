// ============================================
// Bot Gateway — Token Model (Mongoose)
// ============================================
const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  name: { type: String, required: true },
  key_hash: { type: String, required: true, unique: true, index: true },
  key_prefix: { type: String, required: true },
  permissions: {
    read: { type: Boolean, default: true },
    write: { type: Boolean, default: false },
    admin: { type: Boolean, default: false }
  },
  created_by: { type: String, default: 'system' },
  expires_at: Date,
  last_used_at: Date,
  is_active: { type: Boolean, default: true, index: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Virtual id getter
tokenSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

tokenSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

tokenSchema.set('toObject', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// Pre-save hook to update updated_at
tokenSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('Token', tokenSchema);
