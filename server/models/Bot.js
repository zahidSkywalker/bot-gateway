// ============================================
// Bot Gateway — Bot Model (Mongoose)
// ============================================
const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
  name: { type: String, required: true },
  token_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Token', index: true },
  description: String,
  status: {
    type: String,
    enum: ['online', 'offline', 'suspended'],
    default: 'offline',
    index: true
  },
  metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  last_seen_at: Date,
  connected_at: Date,
  message_count: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Virtual id getter
botSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

botSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

botSchema.set('toObject', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// Pre-save hook to update updated_at
botSchema.pre('save', function (next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('Bot', botSchema);
