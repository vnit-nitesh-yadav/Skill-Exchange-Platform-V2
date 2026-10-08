// One-off, non-destructive migration of legacy chat data into the new per-message collection.
// Old shape: { participants: [id, id], messages: [{ sender, receiver, content, timestamp }] } in `messages`.
// Run:  npm run migrate:messages     (safe to run twice: already-migrated messages are skipped)
require('dotenv').config();
const mongoose = require('mongoose');
const DirectMessage = require('../models/DirectMessage');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const legacy = mongoose.connection.collection('messages');
  let copied = 0; let skipped = 0;

  for await (const conv of legacy.find({ 'messages.0': { $exists: true } })) {
    for (const m of conv.messages) {
      if (!mongoose.isValidObjectId(m.sender) || !mongoose.isValidObjectId(m.receiver) || !m.content) { skipped++; continue; }
      const createdAt = m.timestamp || new Date();
      const exists = await DirectMessage.exists({ sender: m.sender, receiver: m.receiver, content: m.content, createdAt });
      if (exists) { skipped++; continue; }
      await DirectMessage.create({ sender: m.sender, receiver: m.receiver, content: m.content, createdAt, readAt: createdAt });
      copied++;
    }
  }
  console.log(`Migrated ${copied} messages (${skipped} skipped). The old "messages" collection was left untouched.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
