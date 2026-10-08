const express = require('express');
const User = require('../models/User');
const Connection = require('../models/Connection');
const { requireAuth, requireSelf } = require('../middleware/auth');
const { recommend } = require('../services/recommender');

const router = express.Router();

// GET /api/recommendations/:userId  ->  { coldStart, hasGoals, recommendations: [...] }
router.get('/:userId', requireAuth, requireSelf('userId'), async (req, res) => {
  try {
    const me = await User.findById(req.userId).select('skills learning');
    if (!me) return res.status(404).json({ message: 'User not found' });

    const limit = Math.min(Number(req.query.limit) || 6, 20);
    const candidates = await User.find({ _id: { $ne: req.userId } })
      .select('username profilePicture bio department experience_level skills learning average_rating total_reviews')
      .limit(1000)
      .lean();

    const result = recommend(me.toObject(), candidates, { limit });

    // Tell the UI which people are already connected / requested so buttons survive a page reload.
    const links = await Connection.find({
      $or: [{ sender: req.userId }, { receiver: req.userId }],
      status: { $in: ['pending', 'accepted'] },
    }).lean();
    const status = new Map();
    links.forEach((l) => {
      const mine = String(l.sender) === req.userId;
      status.set(String(mine ? l.receiver : l.sender), l.status === 'accepted' ? 'connected' : mine ? 'pending_sent' : 'pending_received');
    });
    result.recommendations.forEach((r) => { r.connectionStatus = status.get(r._id) || 'none'; });

    res.json(result);
  } catch (error) {
    console.error('Recommendation Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
