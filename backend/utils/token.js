// Accepts "Bearer <jwt>", a bare "<jwt>", and the legacy doubled "Bearer Bearer <jwt>"
// that older clients produced (the login endpoint used to return the token already prefixed).
const extractToken = (raw = '') => String(raw).trim().replace(/^(Bearer\s+)+/i, '').trim();

module.exports = { extractToken };
