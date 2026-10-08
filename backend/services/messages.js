const mongoose = require('mongoose');
const DirectMessage = require('../models/DirectMessage');
const User = require('../models/User');
const files = require('./files');

const toClient = (m) => {
  const o = typeof m.toObject === 'function' ? m.toObject() : m;
  return {
    _id: String(o._id),
    sender: String(o.sender),
    receiver: String(o.receiver),
    content: o.content || '',
    attachment: o.attachment?.fileId
      ? { ...o.attachment, fileId: String(o.attachment.fileId) }
      : null,
    readAt: o.readAt || null,
    createdAt: o.createdAt,
  };
};

// Shared by the Socket.IO handler and the REST fallback so both paths behave identically.
const createMessage = async ({ from, to, content, fileId }) => {
  if (!mongoose.isValidObjectId(to)) throw Object.assign(new Error('Invalid recipient'), { status: 400 });
  if (String(from) === String(to)) throw Object.assign(new Error('You cannot message yourself'), { status: 400 });
  if (!(await User.exists({ _id: to }))) throw Object.assign(new Error('User not found'), { status: 404 });

  const text = String(content || '').trim();
  if (text.length > 4000) throw Object.assign(new Error('Message too long (max 4000 characters)'), { status: 400 });

  let attachment;
  if (fileId) {
    const file = await files.getFile(fileId);
    if (!file || file.metadata?.owner !== String(from)) {
      throw Object.assign(new Error('Attachment not found'), { status: 400 });
    }
    attachment = { fileId: file._id, name: file.filename, size: file.length, mimeType: file.metadata.mimeType, kind: file.metadata.kind };
  }
  if (!text && !attachment) throw Object.assign(new Error('Message is empty'), { status: 400 });

  const message = await DirectMessage.create({ sender: from, receiver: to, content: text, attachment });
  if (attachment) await files.attachToConversation(attachment.fileId, from, to);
  return toClient(message);
};

const markRead = async (readerId, otherId) => {
  if (!mongoose.isValidObjectId(otherId)) return 0;
  const res = await DirectMessage.updateMany(
    { sender: otherId, receiver: readerId, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return res.modifiedCount;
};

module.exports = { createMessage, markRead, toClient };
