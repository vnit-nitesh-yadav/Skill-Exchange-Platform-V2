const express = require('express');
const presence = require('../services/presence');

const router = express.Router();

// Public, cheap, cacheable: used for the first paint; live updates then arrive over Socket.IO.
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=5');
  res.json(await presence.getMetrics());
});

module.exports = router;
