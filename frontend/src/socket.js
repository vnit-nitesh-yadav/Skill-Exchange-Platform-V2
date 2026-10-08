// One shared Socket.IO connection for the whole app (metrics, chat, presence).
// The previous code created a socket at import time in Chat.jsx, before login, and never authenticated it.
import { io } from 'socket.io-client';
import API_URL from './api';
import { getToken } from './lib/session';

export const socket = io(API_URL, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
  // evaluated on every (re)connect, so it always carries the current token
  auth: (cb) => cb({ token: getToken() }),
});

// Call after login/logout so the server re-identifies this connection.
export const reconnectSocket = () => {
  if (socket.connected) socket.disconnect();
  socket.connect();
};

export const ensureSocket = () => {
  if (!socket.connected && !socket.active) socket.connect();
};
