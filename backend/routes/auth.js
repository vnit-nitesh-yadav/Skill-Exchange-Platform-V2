const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const presence = require('../services/presence');
const { escapeRegex } = require('../utils/skills');

const router = express.Router();
const EMAIL_RE = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9-]+\.)+[A-Z]{2,}$/i;

// Returns the raw JWT. The client adds the "Bearer " prefix (the old API returned it pre-prefixed,
// which made every client send "Bearer Bearer <token>").
const authPayload = (user) => ({ token: generateToken(user._id), id: user._id, username: user.username });

router.post('/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (username.length < 2 || username.length > 40) return res.status(400).json({ error: 'Username must be 2-40 characters' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = await User.create({ username, email, password: await bcrypt.hash(password, 10) });
    presence.scheduleBroadcast({ force: true }); // update "total joined" for everyone watching the home page
    res.status(201).json(authPayload(user));
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'account';
      return res.status(409).json({ error: `That ${field} is already registered` });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });

    // case-insensitive so accounts created before emails were lower-cased still work
    const user = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') });
    const ok = user && (await bcrypt.compare(password, user.password));
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    res.json(authPayload(user));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
