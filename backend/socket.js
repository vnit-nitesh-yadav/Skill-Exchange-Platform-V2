const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Connection = require('./models/Connection');
const { verifyToken } = require('./middleware/auth');
const presence = require('./services/presence');
const { createMessage, markRead } = require('./services/messages');

const initSocket = (server, { corsOrigin }) => {
  const io = new Server(server, {
    cors: { origin: corsOrigin, credentials: true },
    maxHttpBufferSize: 1e6,
  });
  presence.setIo(io);

  // Authenticate with the JWT sent in the handshake: io(url, { auth: { token } }).
  // Visitors without a (valid) token may still connect so the public home page gets live metrics,
  // but they cannot chat and are not counted as "online users".
  io.use((socket, next) => {
    socket.data.userId = verifyToken(socket.handshake.auth?.token) || null;
    next();
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId ? String(socket.data.userId) : null;

    if (userId) {
      socket.join(`user:${userId}`);
      if (presence.addSocket(userId, socket.id)) {
        io.to(`watch:${userId}`).emit('presence', { userId, online: true });
        presence.scheduleBroadcast();
      }
    }
    socket.emit('metrics', await presence.getMetrics());

    // ---- presence: "tell me when these users go on/offline" (used by the open chat) ----------
    socket.on('presence:watch', (ids, ack) => {
      const list = (Array.isArray(ids) ? ids : []).filter((id) => mongoose.isValidObjectId(id)).slice(0, 100).map(String);
      for (const room of socket.rooms) if (room.startsWith('watch:')) socket.leave(room);
      list.forEach((id) => socket.join(`watch:${id}`));
      if (typeof ack === 'function') ack({ online: presence.onlineSubset(list) });
    });

    if (userId) {
      // ---- send a message: persisted first, then pushed to both people, then acknowledged --------
      socket.on('message:send', async (payload = {}, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          // the sender comes from the authenticated socket, never from the payload
          const message = await createMessage({ from: userId, to: payload.to, content: payload.content, fileId: payload.fileId });
          // clientId lets the sender's UI swap its optimistic bubble for the saved message
          const clientId = typeof payload.clientId === 'string' ? payload.clientId.slice(0, 64) : undefined;
          io.to(`user:${message.sender}`).to(`user:${message.receiver}`).emit('message:new', { ...message, clientId });
          reply({ ok: true, message, clientId });
        } catch (error) {
          reply({ ok: false, error: error.status ? error.message : 'Could not send message', clientId: payload.clientId });
          if (!error.status) console.error('message:send error', error);
        }
      });

      socket.on('message:read', async ({ withUserId } = {}) => {
        try {
          const count = await markRead(userId, withUserId);
          if (count) io.to(`user:${withUserId}`).emit('message:read', { by: userId });
        } catch (error) { console.error('message:read error', error); }
      });

      socket.on('typing', ({ to, typing = true } = {}) => {
        if (mongoose.isValidObjectId(to)) io.to(`user:${to}`).emit('typing', { from: userId, typing: !!typing });
      });
    }

    socket.on('disconnect', () => {
      if (userId && presence.removeSocket(userId, socket.id)) {
        io.to(`watch:${userId}`).emit('presence', { userId, online: false });
        presence.scheduleBroadcast();
      }
    });
  });

  return io;
};

module.exports = initSocket;
