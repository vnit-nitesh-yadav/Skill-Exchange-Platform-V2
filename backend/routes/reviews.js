const express = require('express');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const recalc = async (userId) => {
  const reviews = await Review.find({ reviewed_user_id: userId });
  const avg = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  await User.findByIdAndUpdate(userId, { average_rating: avg, total_reviews: reviews.length });
};

// POST: create a review. The reviewer is the logged-in user (the old API trusted `reviewer_id` from
// the body, so anyone could post as anyone, or review themselves).
router.post('/', requireAuth, async (req, res) => {
  try {
    const { reviewed_user_id, skill_id, rating, comment, review_type, detailed_ratings } = req.body;
    if (!reviewed_user_id || !rating || !review_type) return res.status(400).json({ error: 'Missing required fields' });
    if (!mongoose.isValidObjectId(reviewed_user_id)) return res.status(400).json({ error: 'Invalid user id' });
    if (String(reviewed_user_id) === req.userId) return res.status(400).json({ error: 'You cannot review yourself' });
    if (!(await User.exists({ _id: reviewed_user_id }))) return res.status(404).json({ error: 'User not found' });

    const review = await Review.create({
      reviewed_user_id, reviewer_id: req.userId, skill_id, rating, comment, review_type, detailed_ratings,
    });
    await recalc(reviewed_user_id);
    res.status(201).json(review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewed_user_id: req.params.userId })
      .populate('reviewer_id', 'username profilePicture')
      .populate('skill_id', 'name')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/reviews-by/:reviewerId', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewer_id: req.params.reviewerId })
      .populate('reviewed_user_id', 'username profilePicture')
      .populate('skill_id', 'name');
    res.json(reviews);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:reviewId', async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId)
      .populate('reviewed_user_id', 'username profilePicture')
      .populate('reviewer_id', 'username profilePicture')
      .populate('skill_id', 'name');
    if (!review) return res.status(404).json({ error: 'Review not found' });
    res.json(review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Only the author can edit / delete their review.
const loadOwn = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (String(review.reviewer_id) !== req.userId) return res.status(403).json({ error: 'You can only change your own reviews' });
    req.review = review;
    next();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

router.put('/:reviewId', requireAuth, loadOwn, async (req, res) => {
  try {
    for (const key of ['rating', 'comment', 'review_type', 'detailed_ratings']) {
      if (req.body[key] !== undefined) req.review.set(key, req.body[key]);
    }
    req.review.updatedAt = Date.now();
    await req.review.save();
    await recalc(req.review.reviewed_user_id);
    res.json(req.review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:reviewId', requireAuth, loadOwn, async (req, res) => {
  try {
    await req.review.deleteOne();
    await recalc(req.review.reviewed_user_id);
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
