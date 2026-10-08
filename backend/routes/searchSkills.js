const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { serializeUser, PUBLIC_FIELDS } = require('../utils/serialize');
const { escapeRegex, normalizeName } = require('../utils/skills');

const router = express.Router();

// GET /api/search/skills?skill=react
// Skills are sub-documents ({ name, proficiency… }); the old query compared the whole array
// to a regex, so it never matched anything.
router.get('/skills', requireAuth, async (req, res) => {
  const skill = String(req.query.skill || '').trim();
  if (!skill) return res.status(400).json({ message: 'Skill query is required' });

  try {
    const names = [...new Set([skill, normalizeName(skill)])].map(escapeRegex);
    const pattern = new RegExp(names.join('|'), 'i'); // substring: "react" finds "React Native" too
    const users = await User.find({ _id: { $ne: req.userId }, 'skills.name': pattern })
      .select(PUBLIC_FIELDS)
      .sort({ average_rating: -1 })
      .limit(50);

    if (users.length === 0) return res.status(404).json({ message: 'No users found with this skill' });
    res.json(users.map((u) => serializeUser(u, req.userId)));
  } catch (error) {
    console.error('Skill search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
