// Tracks who is connected over Socket.IO and produces the live metrics shown on the home page.
// NOTE: state lives in this process. If you ever run more than one backend instance, add the
// Socket.IO Redis adapter and move this map to Redis, otherwise "online" counts will be per-instance.
const User = require('../models/User');

const online = new Map(); // userId -> Set<socketId>
let io = null;
let totalCache = { value: 0, at: 0 };
let broadcastTimer = null;

const setIo = (instance) => { io = instance; };

const getTotalUsers = async (force = false) => {
  if (!force && Date.now() - totalCache.at < 30_000) return totalCache.value;
  try {
    totalCache = { value: await User.countDocuments(), at: Date.now() };
  } catch (err) {
    console.error('metrics: could not count users', err.message);
  }
  return totalCache.value;
};

const getMetrics = async (force = false) => ({
  totalUsers: await getTotalUsers(force),
  onlineUsers: online.size,
  updatedAt: new Date().toISOString(),
});

// Debounced so a burst of connects/disconnects produces one broadcast.
const scheduleBroadcast = ({ force = false } = {}) => {
  if (!io) return;
  if (broadcastTimer) { if (force) totalCache.at = 0; return; }
  if (force) totalCache.at = 0;
  broadcastTimer = setTimeout(async () => {
    broadcastTimer = null;
    io.emit('metrics', await getMetrics());
  }, 400);
};

// returns true when this is the user's first live connection (they just came online)
const addSocket = (userId, socketId) => {
  const set = online.get(userId) || new Set();
  const wasOffline = set.size === 0;
  set.add(socketId);
  online.set(userId, set);
  return wasOffline;
};

// returns true when that was the user's last connection (they just went offline)
const removeSocket = (userId, socketId) => {
  const set = online.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) { online.delete(userId); return true; }
  return false;
};

const isOnline = (userId) => online.has(String(userId));
const onlineSubset = (ids = []) => ids.map(String).filter((id) => online.has(id));

module.exports = {
  setIo, getMetrics, scheduleBroadcast, addSocket, removeSocket, isOnline, onlineSubset,
};
