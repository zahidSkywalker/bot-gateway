// ============================================
// Bot Gateway — Message Model (Mongoose)
// ============================================
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  channel_id: { type: String, index: true },
  bot_id: String,
  bot_name: { type: String, required: true },
  content: { type: String, required: true },
  content_type: {
    type: String,
    enum: ['text', 'json', 'embed'],
    default: 'text'
  },
  source: {
    type: String,
    enum: ['api', 'websocket', 'system'],
    default: 'api'
  },
  created_at: { type: Date, default: Date.now }
}, { strict: true });

// Index on created_at descending
messageSchema.index({ created_at: -1 });

// Virtual id getter
messageSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

messageSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

messageSchema.set('toObject', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Message', messageSchema);
