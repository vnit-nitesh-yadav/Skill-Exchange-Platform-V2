import React, { useEffect, useRef, useState } from 'react';
import axios from '../lib/http';
import API_URL from '../api';

const STORAGE_KEY = 'skillbuddy-chat';
const SUGGESTIONS = ['Who can teach me what I want to learn?', 'Make me a study plan', 'How do I share notes in chat?', 'How can I get better matches?'];
const GREETING = { role: 'assistant', content: "Hi! I'm SkillBuddy. I know your skills and learning goals, so I can suggest mentors, build study plans, and show you around the platform. What would you like to do?" };

// Tiny safe renderer: **bold** and line breaks, no raw HTML.
const Rich = ({ text }) => text.split('\n').map((line, i) => (
  <div key={i} style={{ minHeight: line ? undefined : 8 }}>
    {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (/^\*\*[^*]+\*\*$/.test(part) ? <strong key={j}>{part.slice(2, -2)}</strong> : <React.Fragment key={j}>{part}</React.Fragment>))}
  </div>
));

const ChatbotWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [GREETING]; } catch { return [GREETING]; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // 'claude' | 'fallback'
  const endRef = useRef(null);

  useEffect(() => { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); }, [messages]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, open, busy]);

  const ask = async (question) => {
    const message = (question ?? input).trim();
    if (!message || busy) return;
    const history = messages.filter((m) => m !== GREETING).slice(-10).map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput(''); setBusy(true);
    try {
      const r = await axios.post(`${API_URL}/api/chatbot`, { message, history });
      setMode(r.data.provider);
      setMessages((prev) => [...prev, { role: 'assistant', content: r.data.reply }]);
    } catch (e) {
      const text = e.response?.data?.error || 'I could not reach the server. Please try again in a moment.';
      setMessages((prev) => [...prev, { role: 'assistant', content: text, error: true }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      <style>{`
        .sb-fab { position: fixed; right: 20px; bottom: 20px; z-index: 70; width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer; font-size: 26px; background: linear-gradient(135deg,#2dd4bf,#34d399); color:#041f2d; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
        .sb-panel { position: fixed; right: 20px; bottom: 90px; z-index: 70; width: min(380px, calc(100vw - 24px)); height: min(560px, calc(100vh - 120px)); display:flex; flex-direction:column; background: #0b1530; color:#fffaf0; border:1px solid rgba(255,250,240,.1); border-radius:16px; box-shadow: 0 20px 50px rgba(0,0,0,.55); overflow:hidden; }
        .sb-head { padding: 12px 14px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,250,240,.08); }
        .sb-body { flex:1; overflow-y:auto; padding: 12px; display:flex; flex-direction:column; gap:8px; }
        .sb-msg { max-width: 88%; padding: 9px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4; word-break: break-word; }
        .sb-msg.user { align-self:flex-end; background: linear-gradient(90deg,#2dd4bf,#34d399); color:#041f2d; border-bottom-right-radius:4px; }
        .sb-msg.assistant { align-self:flex-start; background: rgba(255,250,240,.08); border-bottom-left-radius:4px; }
        .sb-msg.error { background: rgba(255,90,90,.15); }
        .sb-chips { display:flex; flex-wrap:wrap; gap:6px; padding: 0 12px 8px; }
        .sb-chip { font-size:12px; padding:5px 9px; border-radius:99px; border:1px solid rgba(45,212,191,.4); background:transparent; color:#2dd4bf; cursor:pointer; }
        .sb-input { display:flex; gap:8px; padding:10px; border-top:1px solid rgba(255,250,240,.08); }
        .sb-input input { flex:1; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,250,240,.12); background: rgba(255,250,240,.05); color:#fffaf0; outline:none; }
        .sb-input button { border:none; border-radius:10px; padding:0 14px; font-weight:800; cursor:pointer; background:#2dd4bf; color:#041f2d; }
        .sb-input button:disabled { opacity:.5; cursor:not-allowed; }
      `}</style>

      {open && (
        <div className="sb-panel" role="dialog" aria-label="SkillBuddy assistant">
          <div className="sb-head">
            <div>
              <div style={{ fontWeight: 800, color: '#34d399' }}>SkillBuddy</div>
              <div style={{ fontSize: 11, opacity: .6 }}>{mode === 'fallback' ? 'Basic mode (AI key not configured)' : 'Skill-exchange assistant'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="sb-chip" onClick={() => setMessages([GREETING])}>Clear</button>
              <button type="button" className="sb-chip" onClick={() => setOpen(false)} aria-label="Close assistant">✕</button>
            </div>
          </div>
          <div className="sb-body">
            {messages.map((m, i) => <div key={i} className={`sb-msg ${m.role} ${m.error ? 'error' : ''}`}><Rich text={m.content} /></div>)}
            {busy && <div className="sb-msg assistant" aria-live="polite">Thinking…</div>}
            <div ref={endRef} />
          </div>
          {messages.length <= 1 && (
            <div className="sb-chips">{SUGGESTIONS.map((s) => <button type="button" key={s} className="sb-chip" onClick={() => ask(s)}>{s}</button>)}</div>
          )}
          <form className="sb-input" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Ask about skills, mentors, study plans…" aria-label="Ask SkillBuddy" />
            <button type="submit" disabled={busy || !input.trim()}>Ask</button>
          </form>
        </div>
      )}
      <button type="button" className="sb-fab" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close assistant' : 'Open SkillBuddy assistant'}>{open ? '✕' : '💬'}</button>
    </>
  );
};

export default ChatbotWidget;
