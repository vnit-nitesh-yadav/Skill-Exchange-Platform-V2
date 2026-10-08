const jwt = require('jsonwebtoken');

const { extractToken } = require('../utils/token');

const verifyToken = (raw) => {
  const token = extractToken(raw);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).id || null;
  } catch {
    return null;
  }
};

const requireAuth = (req, res, next) => {
  const userId = verifyToken(req.headers.authorization);
  if (!userId) return res.status(401).json({ error: 'Authentication required' });
  req.userId = String(userId);
  next();
};

// Ensures the :param (default "userId") in the URL is the logged-in user.
const requireSelf = (param = 'userId') => (req, res, next) => {
  if (String(req.params[param]) !== req.userId) {
    return res.status(403).json({ error: 'You can only access your own data' });
  }
  next();
};

module.exports = { requireAuth, requireSelf, verifyToken, extractToken };
