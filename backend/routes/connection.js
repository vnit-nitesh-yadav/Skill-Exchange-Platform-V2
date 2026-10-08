const express = require('express');
const mongoose = require('mongoose');
const Connection = require('../models/Connection');
const User = require('../models/User');
const { requireAuth, requireSelf } = require('../middleware/auth');
const { serializeUser } = require('../utils/serialize');

const router = express.Router();
router.use(requireAuth);

const CARD_FIELDS = 'username profilePicture department experience_level skills average_rating';

// The sender is always the logged-in user (the old API trusted `senderId` from the body).
router.post('/send-request', async (req, res) => {
  try {
    const senderId = req.userId;
    const { receiverId } = req.body;
    if (!mongoose.isValidObjectId(receiverId)) return res.status(400).json({ message: 'Invalid receiver.' });
    if (senderId === String(receiverId)) return res.status(400).json({ message: 'You cannot send a request to yourself.' });
    if (!(await User.exists({ _id: receiverId }))) return res.status(404).json({ message: 'User not found.' });

    // look at both directions, so A->B and B->A can't create two parallel requests
    const existing = await Connection.findOne({
      $or: [{ sender: senderId, receiver: receiverId }, { sender: receiverId, receiver: senderId }],
      status: { $in: ['pending', 'accepted'] },
    });
    if (existing) {
      if (existing.status === 'accepted') return res.status(409).json({ message: 'You are already connected.' });
      if (String(existing.sender) === senderId) return res.status(409).json({ message: 'Connection request already sent.' });
      return res.status(409).json({ message: 'This user already sent you a request — check your requests.' });
    }

    await Connection.create({ sender: senderId, receiver: receiverId, status: 'pending' });
    res.status(200).json({ message: 'Connection request sent.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Only the receiver may accept / reject.
router.post('/update-status', async (req, res) => {
  try {
    const { senderId, status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });
    if (!mongoose.isValidObjectId(senderId)) return res.status(400).json({ message: 'Invalid sender.' });

    const connection = await Connection.findOne({ sender: senderId, receiver: req.userId, status: 'pending' });
    if (!connection) return res.status(404).json({ message: 'Connection request not found.' });

    connection.status = status;
    await connection.save();
    res.status(200).json({ message: `Connection request ${status}.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/pending-requests/:receiverId', requireSelf('receiverId'), async (req, res) => {
  try {
    const requests = await Connection.find({ receiver: req.userId, status: 'pending' })
      .populate('sender', CARD_FIELDS)
      .sort({ createdAt: -1 });
    res.json(requests.filter((r) => r.sender).map((r) => ({ ...r.toObject(), sender: serializeUser(r.sender, req.userId) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching requests' });
  }
});

router.get('/connected-users/:userId', requireSelf('userId'), async (req, res) => {
  try {
    const connections = await Connection.find({
      $or: [{ sender: req.userId }, { receiver: req.userId }],
      status: 'accepted',
    }).populate('sender receiver', CARD_FIELDS);

    const users = connections
      .map((c) => (String(c.sender._id) === req.userId ? c.receiver : c.sender))
      .filter(Boolean)
      .map((u) => serializeUser(u, req.userId));
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching connected users' });
  }
});

module.exports = router;
