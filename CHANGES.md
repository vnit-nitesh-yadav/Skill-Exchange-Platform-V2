# What changed

## 0. Do this first
1. **Rotate your MongoDB Atlas database password now.** `backend/.env` was committed with a real connection string
   (and a `MONGO_URI` that was malformed). It has been removed from this copy, but it is still in your Git history and
   on GitHub. Change the password in Atlas, also change `JWT_SECRET`, and consider purging history (`git filter-repo`).
2. `cd backend && cp .env.example .env` and fill it in, then `npm install` (a new dependency, `cors`, was missing;
   the old `package-lock.json` was removed so it regenerates). `cd ../frontend && npm install`.
3. Existing users: run `npm run migrate:messages` once to copy old chat history into the new message collection
   (non-destructive).

## 1. Integration bugs fixed
| Area | Problem | Fix |
|---|---|---|
| Real-time chat | Client sent `joinRoom` a string, server expected `{user1,user2}`; everyone ended up in one room, so nothing was delivered live. `typing`/`leaveRoom` had no server handlers. | Per-user rooms, authenticated sockets, `message:send` with acknowledgement, typing, read receipts. |
| Chat persistence | Socket handler saved `{sender,receiver,content}` into a schema of `{participants,messages[]}`, so fields were dropped; messages were also written twice (REST + socket). | One `DirectMessage` document per message; one send path used by socket and REST. |
| Socket CORS | `new Server(server)` had no CORS config, so the Vercel frontend could not connect. | Shared allow-list (`CLIENT_URL`) for REST and Socket.IO. |
| Missing dependency | `server.js` required `cors`, absent from `package.json`. | Added. |
| Auth tokens | Login returned `"Bearer <jwt>"` and clients prefixed `Bearer ` again (`Bearer Bearer …`); the server verified nothing. | Raw JWT returned; one axios interceptor adds the header; `requireAuth` on every private route (tolerates old sessions). |
| Page refresh | `isLoggedIn` started `false` and was fixed in an effect, so refreshing any protected page bounced to `/login`. | State initialised from storage; session synced across tabs; 401 logs out. |
| Edit Profile | Sent skills as strings, but the model stores objects, so saving failed with a cast error; the form displayed `[object Object]`. | API accepts strings or objects and keeps existing proficiency/years; UI uses `skillNames`. |
| Skill search | Queried `skills` with a regex, but skills are sub-documents, so it never matched; UI printed objects. | Queries `skills.name` (substring, alias-aware). 404 shown as "no results". |
| Recommendations | Called `.toLowerCase()` on objects (crashed / matched nothing); read non-existent `avatar`. | Rewritten (see §2). |
| Security | Password hashes returned by profile endpoints; `PUT /profile/:id` accepted any body for any user; connection/review endpoints trusted IDs from the body. | Passwords never serialised; others' emails hidden; field whitelist + ownership checks; sender/reviewer taken from the JWT. |
| Connections | Duplicate check ignored the reverse direction; "Open Conversations" linked to a non-existent route; `/chat` was not guarded. | Both directions checked; routes fixed; unknown routes redirect home. |
| Config | Frontend defaulted to the production API even in local dev. | Defaults to `http://localhost:5000` in development. |

## 2. AI recommendations + context-aware chatbot
* `backend/services/recommender.js`: content-based ranking. Score = 70% how well their skills cover your learning goals
  (fuzzy/alias name match × their proficiency × your goal priority) + 20% reciprocity (they want what you teach, i.e. a real
  swap) + 10% Bayesian-smoothed rating. Returns the reasons shown on each card. Falls back to top-rated mentors when
  you have no goals. Pure functions, unit-tested.
* `POST /api/chatbot` + floating **SkillBuddy** widget. Each request is grounded in the user's skills, goals, top matches,
  and counts of requests/unread messages, plus a guide to the platform's features. It is restricted to skill-exchange
  topics, treats profile text as data (prompt-injection guard), is rate-limited (15/min/user) and uses the Anthropic API when
  `ANTHROPIC_API_KEY` is set. Without a key (or on an API error) it uses a built-in rule-based helper and the widget says
  "Basic mode".

## 3. Live metrics
* `GET /api/metrics` for first paint and a `metrics` Socket.IO event pushed (debounced) whenever someone registers, connects or
  disconnects. **Members joined** = user count; **Online now** = distinct logged-in users with an open connection
  (several tabs count once). Shown on the home page, replacing the hard-coded "12k+ members".
* Online counts live in server memory. Fine for one instance; if you scale to several, add the Socket.IO Redis adapter.

## 4. Direct chat + study material sharing
* `/chat` and `/chat/:userId`: conversation list with unread badges and last-message preview, **search any registered member
  to start a chat** (no connection required; the Message buttons on search results and recommendations deep-link here),
  online/offline presence, typing indicator, sent/read receipts, load-earlier pagination, retry on failed sends.
* Attach files with 📎 or drag-and-drop: PDF, Word/PowerPoint/Excel, text/markdown/CSV, source code, notebooks, zip and
  images, up to `MAX_UPLOAD_MB` (10). Files are stored in MongoDB GridFS (they survive redeploys on Render), checked by
  extension **and** magic bytes, SVG/executables are rejected, and only the two people in the conversation can download
  them. Links in messages are clickable.

## API / socket reference (new or changed)
```
POST /api/auth/register | /login        -> { token (raw JWT), id, username }
GET  /api/metrics                        -> { totalUsers, onlineUsers }
GET  /api/recommendations/:userId        -> { coldStart, hasGoals, recommendations[] }   (own id only)
POST /api/chatbot                        { message, history[] } -> { reply, provider: 'claude'|'fallback' }
GET  /api/users/directory?q=             search members
GET  /api/chat/conversations
GET  /api/chat/:otherId?before=&limit=   history
POST /api/chat/:otherId                  { content, fileId }  (REST fallback)
POST /api/chat/:otherId/read
POST /api/chat/upload?name=file.pdf      raw body -> { fileId, name, size, mimeType, kind }
GET  /api/chat/files/:fileId             participants only
socket auth: io(url, { auth: { token } })
 client->server: message:send {to,content,fileId,clientId} (ack), message:read {withUserId}, typing {to,typing}, presence:watch [ids] (ack)
 server->client: message:new, message:read, typing, presence, metrics
```

## Tests
`cd backend && npm test` (12 tests, no DB needed): skill normalisation, recommender ranking, chatbot history/fallback,
token parsing, upload validation.

## Known limits / next steps
* Not exercised against a live MongoDB in this environment (no network): run the smoke test below after installing.
* Uploaded-but-never-sent files stay in GridFS; add a cleanup job if that matters.
* Anyone can message any member (as requested). Consider block/report controls before a public launch.
* Reviews/profile GETs are open to logged-in users; `Profile` still shows a hard-coded "sessionsHosted".

## Smoke test
1. Start backend (`npm run dev`) and frontend (`npm start`). Register two users in two browsers.
2. Home page: Members joined increments, Online now shows 2.
3. Edit Profile on user A: teach "React", user B: learn "React" → B's home page shows A with reasons.
4. B → Message → send text + a PDF; A receives it instantly, sees the file, downloads it; read receipt appears.
5. Open the 💬 widget: ask "Who can teach me React?" and an off-topic question.
