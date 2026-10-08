const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoMemoryServer } = require('mongodb-memory-server');

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('Missing required environment variable JWT_SECRET. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

async function resolveMongoUri() {
  if (process.env.MONGO_URI) return process.env.MONGO_URI;

  const memoryServer = await MongoMemoryServer.create();
  const uri = memoryServer.getUri();
  process.env.MONGO_URI = uri;
  console.log('No MONGO_URI set. Using an in-memory MongoDB instance for local development.');
  return uri;
}

const initSocket = require('./socket');

// CORS: the same allow-list protects REST and Socket.IO. (Socket.IO has its own CORS handling,
// so `app.use(cors())` alone never covered websockets/polling from the React app.)
const allowed = (process.env.CLIENT_URL || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
if (process.env.NODE_ENV !== 'production') allowed.push('http://localhost:3000', 'http://127.0.0.1:3000');
const corsOrigin = allowed.length ? allowed : true;
if (!allowed.length) console.warn('CLIENT_URL is not set: allowing requests from any origin.');

const app = express();
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = initSocket(server, { corsOrigin });
app.set('io', io);

app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/search', require('./routes/searchSkills'));
app.use('/api/connection', require('./routes/connection'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use('/api/chatbot', require('./routes/chatbot'));
app.use('/api/metrics', require('./routes/metrics'));
app.use('/api/reviews', require('./routes/reviews'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  console.error(err);
  res.status(err.status || 500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    const mongoUri = await resolveMongoUri();
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected');
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
})();
