import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../lib/http';
import API_URL from '../api';
import { socket } from '../socket';
import Chat from './Chat';
import './chat.css';

const Avatar = ({ user, online }) => (
  <div className="avatar">
    {user?.profilePicture ? <img src={user.profilePicture} alt="" /> : (user?.username || '?').slice(0, 1).toUpperCase()}
    {online && <span className="dot" />}
  </div>
);

const preview = (m, currentUserId) => {
  const prefix = m.sender === currentUserId ? 'You: ' : '';
  if (m.attachment) return `${prefix}📎 ${m.attachment.name}${m.content ? ` — ${m.content}` : ''}`;
  return `${prefix}${m.content}`;
};

// Direct messages with any member. Replaces the old "connections only" list.
const Messages = ({ currentUserId }) => {
  const { userId: routeUserId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [connections, setConnections] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = not searching
  const [searching, setSearching] = useState(false);
  const [online, setOnline] = useState(() => new Set());
  const activeId = routeUserId || '';
  const refetchTimer = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/chat/conversations`);
      setConversations(r.data || []);
    } catch (e) { console.error('Error loading conversations', e); }
  }, []);

  useEffect(() => {
    loadConversations();
    axios.get(`${API_URL}/api/connection/connected-users/${currentUserId}`)
      .then((r) => setConnections(r.data || [])).catch(() => {});
  }, [currentUserId, loadConversations]);

  // keep the list fresh when anything arrives (debounced: a burst of messages = one refetch)
  useEffect(() => {
    const refresh = () => { clearTimeout(refetchTimer.current); refetchTimer.current = setTimeout(loadConversations, 250); };
    socket.on('message:new', refresh);
    socket.on('connect', refresh);
    return () => { socket.off('message:new', refresh); socket.off('connect', refresh); clearTimeout(refetchTimer.current); };
  }, [loadConversations]);

  // directory search (any registered member), debounced
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return undefined; }
    setSearching(true);
    const t = setTimeout(() => {
      axios.get(`${API_URL}/api/users/directory`, { params: { q } })
        .then((r) => setResults(r.data || [])).catch(() => setResults([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // presence: watch everyone listed + the open chat; re-subscribe after reconnects
  const watchIds = useMemo(() => {
    const ids = new Set(conversations.map((c) => c.user._id));
    connections.forEach((u) => ids.add(u._id));
    (results || []).forEach((u) => ids.add(u._id));
    if (activeId) ids.add(activeId);
    return [...ids].slice(0, 100).sort();
  }, [conversations, connections, results, activeId]);

  useEffect(() => {
    const watch = () => socket.emit('presence:watch', watchIds, (res) => setOnline(new Set(res?.online || [])));
    const onPresence = ({ userId, online: isOn }) => setOnline((prev) => { const n = new Set(prev); if (isOn) n.add(userId); else n.delete(userId); return n; });
    if (socket.connected) watch();
    socket.on('connect', watch);
    socket.on('presence', onPresence);
    return () => { socket.off('connect', watch); socket.off('presence', onPresence); };
  }, [watchIds]);

  const open = (id) => { setQuery(''); navigate(`/chat/${id}`); };

  const onActivity = useCallback(({ type, peerId }) => {
    if (type === 'read') setConversations((prev) => prev.map((c) => (c.user._id === peerId ? { ...c, unread: 0 } : c)));
    if (type === 'sent') loadConversations();
  }, [loadConversations]);

  const talkedTo = new Set(conversations.map((c) => c.user._id));
  const suggestions = connections.filter((u) => !talkedTo.has(u._id));

  return (
    <div className="msg-page">
      <div className={`msg-shell ${activeId ? 'chat-open' : ''}`}>
        <aside className="msg-panel msg-side" aria-label="Conversations">
          <div className="msg-head">
            <span className="msg-title">Messages</span>
            <button type="button" className="ghost-btn" onClick={() => navigate('/')}>✕ Close</button>
          </div>
          <input className="search-box" placeholder="Search members to start a chat…" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Search members" />

          <div className="list">
            {results !== null ? (
              <>
                <div className="section-label">{searching ? 'Searching…' : `Members (${results.length})`}</div>
                {!searching && results.length === 0 && <div className="empty">No members match “{query}”.</div>}
                {results.map((u) => (
                  <button type="button" key={u._id} className="row" onClick={() => open(u._id)}>
                    <Avatar user={u} online={online.has(u._id)} />
                    <div className="row-main">
                      <div className="row-name">{u.username}</div>
                      <div className="row-sub">{[u.experience_level, u.department].filter(Boolean).join(' · ') || 'Member'}</div>
                    </div>
                  </button>
                ))}
              </>
            ) : (
              <>
                {conversations.length > 0 && <div className="section-label">Recent</div>}
                {conversations.map((c) => (
                  <button type="button" key={c.user._id} className={`row ${c.user._id === activeId ? 'active' : ''}`} onClick={() => open(c.user._id)}>
                    <Avatar user={c.user} online={online.has(c.user._id)} />
                    <div className="row-main">
                      <div className="row-name"><span>{c.user.username}</span>{c.unread > 0 && <span className="badge">{c.unread}</span>}</div>
                      <div className="row-sub">{preview(c.lastMessage, currentUserId)}</div>
                    </div>
                  </button>
                ))}
                {suggestions.length > 0 && <div className="section-label">Your connections</div>}
                {suggestions.map((u) => (
                  <button type="button" key={u._id} className={`row ${u._id === activeId ? 'active' : ''}`} onClick={() => open(u._id)}>
                    <Avatar user={u} online={online.has(u._id)} />
                    <div className="row-main"><div className="row-name">{u.username}</div><div className="row-sub">Say hello 👋</div></div>
                  </button>
                ))}
                {conversations.length === 0 && suggestions.length === 0 && (
                  <div className="empty">No conversations yet.<br />Search for any member above to start one.</div>
                )}
              </>
            )}
          </div>
        </aside>

        <section className="msg-panel msg-main" aria-label="Chat">
          <Chat currentUserId={currentUserId} peerId={activeId} online={online.has(activeId)}
            onActivity={onActivity} onBack={() => navigate('/chat')} />
        </section>
      </div>
    </div>
  );
};

export default Messages;
