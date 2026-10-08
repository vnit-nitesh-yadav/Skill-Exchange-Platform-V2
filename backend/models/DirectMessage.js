const mongoose = require('mongoose');

// One document per message (the old schema stored a whole conversation in one document,
// and the socket handler wrote to it with the wrong field names, so nothing was saved).
const directMessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '', maxlength: 4000 },
  attachment: {
    fileId: { type: mongoose.Schema.Types.ObjectId },
    name: String,
    size: Number,
    mimeType: String,
    kind: { type: String, enum: ['image', 'document'] },
  },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

directMessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
directMessageSchema.index({ receiver: 1, readAt: 1 });

directMessageSchema.pre('validate', function (next) {
  if (!this.content?.trim() && !this.attachment?.fileId) {
    return next(new Error('A message needs text or an attachment'));
  }
  next();
});

module.exports = mongoose.model('DirectMessage', directMessageSchema);
