import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from '../lib/http';
import API_URL from '../api';
import { socket } from '../socket';
import './chat.css';

const MAX_MB = 10;
const ALLOWED = 'pdf,doc,docx,ppt,pptx,xls,xlsx,txt,md,csv,rtf,odt,zip,ipynb,py,js,ts,java,c,cpp,sql,html,css,png,jpg,jpeg,gif,webp';

const uid = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtSize = (b = 0) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dayLabel = (iso) => {
  const d = new Date(iso); const t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Today';
  t.setDate(t.getDate() - 1);
  return d.toDateString() === t.toDateString() ? 'Yesterday' : d.toLocaleDateString();
};
const fileIcon = (name = '') => {
  const e = name.split('.').pop().toLowerCase();
  if (e === 'pdf') return '📕';
  if (['doc', 'docx', 'rtf', 'odt', 'txt', 'md'].includes(e)) return '📄';
  if (['ppt', 'pptx'].includes(e)) return '📊';
  if (['xls', 'xlsx', 'csv'].includes(e)) return '📈';
  if (e === 'zip') return '🗜️';
  return '🧾';
};

// Turn http(s) URLs in text into safe links (no HTML injection: we build React elements, not markup).
const Linkified = ({ text }) => {
  const parts = String(text).split(/(https?:\/\/[^\s<]+)/g);
  return parts.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a>
    : <React.Fragment key={i}>{p}</React.Fragment>));
};

// Attachments are protected (only the two chat participants may read them), so they are fetched with the
// auth header as a blob instead of being linked directly.
const fetchBlob = (fileId) => axios.get(`${API_URL}/api/chat/files/${fileId}`, { responseType: 'blob' }).then((r) => r.data);

const Attachment = ({ attachment }) => {
  const [src, setSrc] = useState(null);
  const [busy, setBusy] = useState(false);
  const isImage = attachment.kind === 'image';

  useEffect(() => {
    if (!isImage) return undefined;
    let url; let cancelled = false;
    fetchBlob(attachment.fileId).then((b) => { if (!cancelled) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [attachment.fileId, isImage]);

  const download = async () => {
    setBusy(true);
    try {
      const url = URL.createObjectURL(await fetchBlob(attachment.fileId));
      const a = document.createElement('a');
      a.href = url; a.download = attachment.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { alert('Could not download the file. Please try again.'); } finally { setBusy(false); }
  };

  if (isImage) {
    return src
      ? <img className="img-thumb" src={src} alt={attachment.name} onClick={() => window.open(src, '_blank', 'noopener')} />
      : <div className="file-card"><span className="ico">🖼️</span><span className="name">{attachment.name}</span></div>;
  }
  return (
    <div className="file-card">
      <span className="ico">{fileIcon(attachment.name)}</span>
      <div><div className="name">{attachment.name}</div><div className="size">{fmtSize(attachment.size)}</div></div>
      <button type="button" onClick={download} disabled={busy}>{busy ? '…' : 'Download'}</button>
    </div>
  );
};

// merge a message into the list: replace the optimistic bubble (same clientId) or an existing copy (same _id)
const upsert = (list, msg) => {
  const i = list.findIndex((m) => (msg.clientId && m.clientId === msg.clientId) || (msg._id && m._id === msg._id));
  if (i === -1) return [...list, msg];
  const copy = [...list];
  copy[i] = { ...copy[i], ...msg, pending: false, failed: false };
  return copy;
};

const Chat = ({ currentUserId, peerId, online, onActivity, onBack }) => {
  const [peer, setPeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [pendingFile, setPendingFile] = useState(null); // { name, size, progress, uploaded?: {...}, error? }
  const [peerTyping, setPeerTyping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const bottomRef = useRef(null);
  const stickToBottom = useRef(true);
  const typingTimer = useRef(null);
  const lastTypingEmit = useRef(0);
  const fileInput = useRef(null);
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity; // keep the latest callback without re-running the effects below

  const markRead = useCallback(() => {
    if (!peerId) return;
    if (socket.connected) socket.emit('message:read', { withUserId: peerId });
    else axios.post(`${API_URL}/api/chat/${peerId}/read`).catch(() => {});
    activityRef.current?.({ type: 'read', peerId });
  }, [peerId]);

  // ---- load peer + history when the conversation changes --------------------------------
  useEffect(() => {
    setMessages([]); setPeer(null); setText(''); setPendingFile(null); setPeerTyping(false); setHasMore(false);
    if (!peerId) return undefined;
    let cancelled = false;
    setLoading(true);
    stickToBottom.current = true;

    axios.get(`${API_URL}/api/users/profile/${peerId}`).then((r) => { if (!cancelled) setPeer(r.data); }).catch(() => {});
    axios.get(`${API_URL}/api/chat/${peerId}`)
      .then((r) => { if (!cancelled) { setMessages(r.data.messages || []); setHasMore(!!r.data.hasMore); markRead(); } })
      .catch((e) => console.error('Error fetching messages:', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [peerId, markRead]);

  // ---- realtime events -------------------------------------------------------------------
  useEffect(() => {
    if (!peerId) return undefined;
    const inThisChat = (m) => (m.sender === peerId && m.receiver === currentUserId) || (m.sender === currentUserId && m.receiver === peerId);

    const onNew = (m) => {
      if (!inThisChat(m)) return;
      setMessages((prev) => upsert(prev, m));
      if (m.sender === peerId) { setPeerTyping(false); markRead(); }
    };
    const onRead = ({ by }) => {
      if (by !== peerId) return;
      const now = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.sender === currentUserId && !m.readAt ? { ...m, readAt: now } : m)));
    };
    const onTyping = ({ from, typing }) => {
      if (from !== peerId) return;
      setPeerTyping(!!typing);
      clearTimeout(typingTimer.current);
      if (typing) typingTimer.current = setTimeout(() => setPeerTyping(false), 3000);
    };
    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    socket.on('typing', onTyping);
    return () => {
      socket.off('message:new', onNew); socket.off('message:read', onRead); socket.off('typing', onTyping);
      clearTimeout(typingTimer.current);
    };
  }, [peerId, currentUserId, markRead]);

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, peerTyping]);

  const loadEarlier = async () => {
    if (!messages.length) return;
    stickToBottom.current = false;
    try {
      const r = await axios.get(`${API_URL}/api/chat/${peerId}`, { params: { before: messages[0].createdAt } });
      setMessages((prev) => [...(r.data.messages || []), ...prev]);
      setHasMore(!!r.data.hasMore);
    } catch (e) { console.error(e); }
  };

  // ---- sending ---------------------------------------------------------------------------
  const deliver = useCallback(async (payload) => {
    // socket path (with ack) when connected, REST fallback when the socket is down
    if (socket.connected) {
      return new Promise((resolve) => {
        socket.timeout(10000).emit('message:send', payload, (err, res) => {
          if (err) resolve({ ok: false, error: 'Timed out — tap to retry' });
          else resolve(res);
        });
      });
    }
    try {
      const r = await axios.post(`${API_URL}/api/chat/${payload.to}`, { content: payload.content, fileId: payload.fileId });
      return { ok: true, message: r.data, clientId: payload.clientId };
    } catch (e) {
      return { ok: false, error: e.response?.data?.error || 'Failed to send' };
    }
  }, []);

  const send = async (override) => {
    const content = (override?.content ?? text).trim();
    const file = override ? override.attachment : pendingFile?.uploaded;
    if ((!content && !file) || !peerId) return;
    if (!override && pendingFile && !pendingFile.uploaded && !pendingFile.error) return; // still uploading

    const clientId = override?.clientId || uid();
    const optimistic = {
      clientId, sender: currentUserId, receiver: peerId, content, attachment: file || null,
      createdAt: new Date().toISOString(), pending: true,
    };
    stickToBottom.current = true;
    setMessages((prev) => (override ? prev.map((m) => (m.clientId === clientId ? { ...m, pending: true, failed: false } : m)) : [...prev, optimistic]));
    if (!override) { setText(''); setPendingFile(null); }

    const res = await deliver({ to: peerId, content, fileId: file?.fileId, clientId });
    if (res?.ok) {
      setMessages((prev) => upsert(prev, { ...res.message, clientId }));
      activityRef.current?.({ type: 'sent', peerId });
    } else {
      setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true, error: res?.error } : m)));
    }
  };

  const onInput = (e) => {
    setText(e.target.value);
    const now = Date.now();
    if (socket.connected && now - lastTypingEmit.current > 1500) {
      lastTypingEmit.current = now;
      socket.emit('typing', { to: peerId, typing: true });
    }
  };

  // ---- attachments -----------------------------------------------------------------------
  const uploadFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { setPendingFile({ name: file.name, size: file.size, error: `Max file size is ${MAX_MB} MB` }); return; }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED.split(',').includes(ext)) { setPendingFile({ name: file.name, size: file.size, error: `.${ext} files are not supported` }); return; }

    setPendingFile({ name: file.name, size: file.size, progress: 0 });
    try {
      const r = await axios.post(`${API_URL}/api/chat/upload`, file, {
        params: { name: file.name },
        headers: { 'Content-Type': 'application/octet-stream' },
        onUploadProgress: (ev) => setPendingFile((p) => (p ? { ...p, progress: Math.round((ev.loaded / (ev.total || file.size)) * 100) } : p)),
      });
      setPendingFile({ name: file.name, size: file.size, progress: 100, uploaded: r.data });
    } catch (e) {
      setPendingFile({ name: file.name, size: file.size, error: e.response?.data?.error || 'Upload failed' });
    }
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); uploadFile(e.dataTransfer.files?.[0]); };

  // ---- render ----------------------------------------------------------------------------
  if (!peerId) return <div className="empty" style={{ margin: 'auto' }}>Pick a conversation or search for someone to start chatting.</div>;

  const days = [];
  messages.forEach((m) => {
    const label = dayLabel(m.createdAt);
    if (!days.length || days[days.length - 1].label !== label) days.push({ label, items: [] });
    days[days.length - 1].items.push(m);
  });

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      {dragging && <div className="drop-hint">Drop to attach (max {MAX_MB} MB)</div>}

      <div className="msg-head">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          <button type="button" className="ghost-btn back-btn" onClick={onBack} aria-label="Back to conversations">←</button>
          <div className="avatar">
            {peer?.profilePicture ? <img src={peer.profilePicture} alt="" /> : (peer?.username || '?').slice(0, 1).toUpperCase()}
            {online && <span className="dot" />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="msg-title">{peer?.username || 'Loading…'}</div>
            <div className={`status-line ${online ? 'on' : ''}`}>{peerTyping ? 'typing…' : online ? 'Online' : 'Offline'}</div>
          </div>
        </div>
      </div>

      <div className="chat-body" onScroll={(e) => { const el = e.currentTarget; stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {hasMore && <button type="button" className="ghost-btn" style={{ alignSelf: 'center' }} onClick={loadEarlier}>Load earlier messages</button>}
        {loading && <div className="empty">Loading messages…</div>}
        {!loading && messages.length === 0 && <div className="empty">No messages yet — say hello 👋 or share some study material.</div>}

        {days.map((d) => (
          <React.Fragment key={d.label + d.items[0].createdAt}>
            <div className="day">{d.label}</div>
            {d.items.map((m) => {
              const mine = m.sender === currentUserId;
              return (
                <div key={m._id || m.clientId} className={`bubble-row ${mine ? 'me' : ''}`}>
                  <div className={`bubble ${mine ? 'me' : 'them'}`}>
                    {m.attachment && <Attachment attachment={m.attachment} />}
                    {m.content && <div><Linkified text={m.content} /></div>}
                    <div className="meta">
                      {fmtTime(m.createdAt)}
                      {mine && !m.failed && (m.pending ? ' · sending…' : m.readAt ? ' · Read' : ' · Sent')}
                      {m.failed && (
                        <span className="err"> · {m.error || 'Failed'} <a href="#retry" onClick={(e) => { e.preventDefault(); send({ content: m.content, attachment: m.attachment, clientId: m.clientId }); }}>Retry</a></span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="typing" aria-live="polite">{peerTyping ? `${peer?.username || 'They'} is typing…` : ''}</div>

      <div className="composer">
        {pendingFile && (
          <div className="pending-file">
            <span>{fileIcon(pendingFile.name)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, wordBreak: 'break-all' }}>{pendingFile.name} <span style={{ opacity: .6, fontWeight: 400 }}>({fmtSize(pendingFile.size)})</span></div>
              {pendingFile.error
                ? <div style={{ color: '#ff9b9b' }}>{pendingFile.error}</div>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="progress"><div style={{ width: `${pendingFile.progress || 0}%` }} /></div><span>{pendingFile.uploaded ? 'Ready' : `${pendingFile.progress || 0}%`}</span></div>}
            </div>
            <button type="button" className="ghost-btn" onClick={() => setPendingFile(null)} aria-label="Remove attachment">✕</button>
          </div>
        )}
        <div className="composer-row">
          <input ref={fileInput} type="file" hidden accept={ALLOWED.split(',').map((e) => `.${e}`).join(',')}
            onChange={(e) => { uploadFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="attach-btn" title="Attach study material" aria-label="Attach file" onClick={() => fileInput.current?.click()}>📎</button>
          <textarea className="chat-input" rows={1} value={text} onChange={onInput} aria-label="Message"
            placeholder={`Message ${peer?.username || ''}…`}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button type="button" className="send-btn" onClick={() => send()}
            disabled={(!text.trim() && !pendingFile?.uploaded) || (pendingFile && !pendingFile.uploaded && !pendingFile.error)}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
