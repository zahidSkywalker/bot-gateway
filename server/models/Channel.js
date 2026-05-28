// ============================================
// Bot Gateway — Channel Model (Mongoose)
// ============================================
const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true },
  description: String,
  is_active: { type: Boolean, default: true },
  created_by: { type: String, default: 'system' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Virtual id getter
channelSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

channelSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

channelSchema.set('toObject', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// Pre-save hook to update updated_at
channelSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('Channel', channelSchema);
