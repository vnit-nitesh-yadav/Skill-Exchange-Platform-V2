const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Review = require('../models/Review');
const { requireAuth, requireSelf } = require('../middleware/auth');
const { serializeUser, PUBLIC_FIELDS } = require('../utils/serialize');
const { normalizeSkills, normalizeLearning, escapeRegex, normalizeName, skillName } = require('../utils/skills');

const router = express.Router();
router.use(requireAuth);

const validId = (req, res, next) =>
  mongoose.isValidObjectId(req.params.id) ? next() : res.status(400).json({ error: 'Invalid user id' });

const SELECT_SELF = '-password';

router.get('/profile/:id', validId, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(SELECT_SELF);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(serializeUser(user, req.userId));
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/profile-full/:id', validId, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(SELECT_SELF);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const reviews = await Review.find({ reviewed_user_id: req.params.id }).populate('reviewer_id', 'username profilePicture');
    res.json({
      ...serializeUser(user, req.userId),
      reviews,
      stats: {
        total_reviews: user.total_reviews,
        average_rating: user.average_rating,
        skills_teaching: user.skills.length,
        skills_learning: user.learning.length,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Fields a user may change on their own profile. Everything else (password, ratings, _id…) is ignored,
// which closes a mass-assignment hole in the old `findByIdAndUpdate(id, req.body)`.
const EDITABLE = ['username', 'bio', 'profilePicture', 'department', 'graduation_year', 'experience_level', 'timezone',
  'preferred_learning_format', 'github_profile', 'linkedin_profile', 'certifications'];

router.put('/profile/:id', validId, requireSelf('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    for (const key of EDITABLE) if (req.body[key] !== undefined) user.set(key, req.body[key]);
    if (req.body.email !== undefined) user.email = String(req.body.email).trim().toLowerCase();
    if (req.body.skills !== undefined) user.skills = normalizeSkills(req.body.skills, user.skills);
    if (req.body.learning !== undefined) user.learning = normalizeLearning(req.body.learning, user.learning);
    user.updatedAt = Date.now();

    await user.save(); // runs schema validation (enums etc.)
    res.json(serializeUser(user, req.userId));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'That username or email is already taken' });
    res.status(400).json({ error: error.message });
  }
});

router.post('/profile/:id/add-skill', validId, requireSelf('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.skills = normalizeSkills([...user.skills.map((s) => s.toObject()), req.body], user.skills);
    await user.save();
    res.json(serializeUser(user, req.userId));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/profile/:id/add-learning', validId, requireSelf('id'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.learning = normalizeLearning([...user.learning.map((s) => s.toObject()), req.body], user.learning);
    await user.save();
    res.json(serializeUser(user, req.userId));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Directory of existing members, used to start a new chat. GET /api/users/directory?q=ali&limit=20
router.get('/directory', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 40);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const filter = { _id: { $ne: req.userId } };
    if (q) filter.username = new RegExp(escapeRegex(q), 'i');
    const users = await User.find(filter).select(PUBLIC_FIELDS).sort({ username: 1 }).limit(limit);
    res.json(users.map((u) => serializeUser(u, req.userId)));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/search/filters', async (req, res) => {
  try {
    const { department, experience_level, skill } = req.query;
    const query = { _id: { $ne: req.userId } };
    if (department) query.department = String(department);
    if (experience_level) query.experience_level = String(experience_level);
    let users = await User.find(query).select(PUBLIC_FIELDS);
    if (skill) {
      const key = normalizeName(skill);
      users = users.filter((u) => u.skills.some((s) => normalizeName(skillName(s)).includes(key)));
    }
    res.json(users.map((u) => serializeUser(u, req.userId)));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/mentors/top-rated', async (req, res) => {
  try {
    const mentors = await User.find({ _id: { $ne: req.userId }, 'skills.0': { $exists: true } })
      .select(PUBLIC_FIELDS).sort({ average_rating: -1, total_reviews: -1 }).limit(10);
    res.json(mentors.map((u) => serializeUser(u, req.userId)));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/mentors/department/:department', async (req, res) => {
  try {
    const mentors = await User.find({ _id: { $ne: req.userId }, department: req.params.department })
      .select(PUBLIC_FIELDS).sort({ average_rating: -1 }).limit(20);
    res.json(mentors.map((u) => serializeUser(u, req.userId)));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
