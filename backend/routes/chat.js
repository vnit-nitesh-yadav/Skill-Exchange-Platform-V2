const express = require('express');
const mongoose = require('mongoose');
const DirectMessage = require('../models/DirectMessage');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { serializeUser } = require('../utils/serialize');
const files = require('../services/files');
const { createMessage, markRead, toClient } = require('../services/messages');

const router = express.Router();
router.use(requireAuth);

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const badId = (res) => res.status(400).json({ error: 'Invalid user id' });

// Emit a saved message to both participants (every open tab/device joins `user:<id>`).
const deliver = (req, message) => {
  const io = req.app.get('io');
  if (io) io.to(`user:${message.sender}`).to(`user:${message.receiver}`).emit('message:new', message);
};

// ---- conversation list: last message + unread count per partner ----------------------------
router.get('/conversations', async (req, res) => {
  try {
    const me = oid(req.userId);
    const rows = await DirectMessage.aggregate([
      { $match: { $or: [{ sender: me }, { receiver: me }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $cond: [{ $eq: ['$sender', me] }, '$receiver', '$sender'] },
          last: { $first: '$$ROOT' },
          unread: { $sum: { $cond: [{ $and: [{ $eq: ['$receiver', me] }, { $eq: ['$readAt', null] }] }, 1, 0] } },
        },
      },
      { $sort: { 'last.createdAt': -1 } },
      { $limit: 100 },
    ]);

    const users = await User.find({ _id: { $in: rows.map((r) => r._id) } })
      .select('username profilePicture department experience_level');
    const byId = new Map(users.map((u) => [String(u._id), u]));

    res.json(
      rows
        .filter((r) => byId.has(String(r._id)))
        .map((r) => ({
          user: serializeUser(byId.get(String(r._id)), req.userId),
          lastMessage: toClient(r.last),
          unread: r.unread,
        }))
    );
  } catch (error) {
    console.error('conversations error', error);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// ---- attachments -------------------------------------------------------------------------
// Upload is a raw body (no multipart dependency): POST /upload?name=notes.pdf  Content-Type: application/octet-stream
router.post(
  '/upload',
  express.raw({ type: () => true, limit: files.MAX_BYTES + 1024 }),
  async (req, res) => {
    try {
      const name = files.cleanFileName(req.query.name);
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const check = files.validate(name, buf);
      if (check.error) return res.status(400).json({ error: check.error });
      res.status(201).json(await files.store(req.userId, name, buf, check));
    } catch (error) {
      console.error('upload error', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
);

router.get('/files/:fileId', async (req, res) => {
  try {
    const file = await files.getFile(req.params.fileId);
    if (!file || !files.canAccess(file, req.userId)) return res.status(404).json({ error: 'File not found' });
    res.set({
      'Content-Type': file.metadata.mimeType || 'application/octet-stream',
      'Content-Length': file.length,
      'Content-Disposition': `${file.metadata.kind === 'image' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    });
    files.openDownload(file._id).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    console.error('download error', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ---- history / send / read ---------------------------------------------------------------
// GET /api/chat/:otherUserId?before=<ISO date>&limit=50  -> oldest-first page of messages
router.get('/:otherId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.otherId)) return badId(res);
    const me = oid(req.userId); const other = oid(req.params.otherId);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const filter = { $or: [{ sender: me, receiver: other }, { sender: other, receiver: me }] };
    if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) filter.createdAt = { $lt: new Date(req.query.before) };

    const page = await DirectMessage.find(filter).sort({ createdAt: -1 }).limit(limit + 1);
    res.json({ messages: page.slice(0, limit).reverse().map(toClient), hasMore: page.length > limit });
  } catch (error) {
    console.error('history error', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// REST fallback for sending (the UI normally uses the socket, which also gets an acknowledgement).
router.post('/:otherId', async (req, res) => {
  try {
    const message = await createMessage({ from: req.userId, to: req.params.otherId, content: req.body.content, fileId: req.body.fileId });
    deliver(req, message);
    res.status(201).json(message);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Failed to send message' });
  }
});

router.post('/:otherId/read', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.otherId)) return badId(res);
    const count = await markRead(req.userId, req.params.otherId);
    const io = req.app.get('io');
    if (io && count) io.to(`user:${req.params.otherId}`).emit('message:read', { by: req.userId });
    res.json({ updated: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

module.exports = router;
