const express = require('express');
const User = require('../models/User');
const Connection = require('../models/Connection');
const DirectMessage = require('../models/DirectMessage');
const { requireAuth } = require('../middleware/auth');
const { recommend } = require('../services/recommender');
const chatbot = require('../services/chatbot');

const router = express.Router();
router.use(requireAuth);

// tiny in-memory limiter: 15 questions / minute / user (protects the LLM bill)
const hits = new Map();
const limited = (userId) => {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 15;
};
setInterval(() => { const now = Date.now(); hits.forEach((v, k) => { if (!v.some((t) => now - t < 60_000)) hits.delete(k); }); }, 120_000).unref();

// POST /api/chatbot  { message, history: [{ role: 'user'|'assistant', content }] }
router.post('/', async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message is required' });
  if (message.length > 1000) return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
  if (limited(req.userId)) return res.status(429).json({ error: 'You are asking too fast — try again in a minute.' });

  try {
    const user = await User.findById(req.userId).select('-password').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [candidates, connections, pendingRequests, unreadMessages] = await Promise.all([
      User.find({ _id: { $ne: req.userId } })
        .select('username skills learning average_rating total_reviews profilePicture').limit(500).lean(),
      Connection.countDocuments({ $or: [{ sender: req.userId }, { receiver: req.userId }], status: 'accepted' }),
      Connection.countDocuments({ receiver: req.userId, status: 'pending' }),
      DirectMessage.countDocuments({ receiver: req.userId, readAt: null }),
    ]);

    const { recommendations } = recommend(user, candidates, { limit: 5 });
    const { reply, provider } = await chatbot.answer({
      user,
      recommendations,
      stats: { connections, pendingRequests, unreadMessages },
      history: req.body.history,
      message,
    });
    res.json({ reply, provider });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: 'The assistant is unavailable right now' });
  }
});

module.exports = router;
