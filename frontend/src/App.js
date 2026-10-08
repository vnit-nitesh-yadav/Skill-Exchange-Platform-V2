import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Register from './components/Auth/Register';
import Login from './components/Auth/Login';
import Profile from './components/Profile';
import Home from './components/Home';
import EditProfile from './components/EditProfile';
import ProfileTemplates from './components/ProfileTemplates';
import SearchSkills from './components/SearchSkills';
import PendingRequests from './components/PendingRequest';
import Messages from './components/Messages';
import ChatbotWidget from './components/ChatbotWidget';
import { socket, reconnectSocket } from './socket';
import { isAuthenticated, getUserId, clearSession } from './lib/session';

const App = () => {
  // Initialise from storage. (It used to start as `false` and be fixed up in an effect, so every page
  // refresh on a protected route redirected to /login before the effect ran.)
  const [isLoggedIn, setIsLoggedIn] = useState(isAuthenticated);
  const currentUserId = isLoggedIn ? getUserId() : '';

  // Keep React state in sync when the session changes anywhere (login, logout, expired token, another tab).
  useEffect(() => {
    const sync = () => setIsLoggedIn(isAuthenticated());
    window.addEventListener('session-changed', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('session-changed', sync); window.removeEventListener('storage', sync); };
  }, []);

  // (Re)connect the shared socket whenever the identity changes so the server knows who we are.
  useEffect(() => {
    reconnectSocket();
    return () => { socket.disconnect(); };
  }, [isLoggedIn]);

  const handleLogout = () => { clearSession(); setIsLoggedIn(false); };
  const guard = (element) => (isLoggedIn ? element : <Navigate to="/login" replace />);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home isLoggedIn={isLoggedIn} onLogout={handleLogout} />} />
        <Route path="/register" element={<Register setIsLoggedIn={setIsLoggedIn} />} />
        <Route path="/login" element={<Login setIsLoggedIn={setIsLoggedIn} />} />
        <Route path="/profile" element={guard(<Profile onLogout={handleLogout} />)} />
        <Route path="/edit-profile" element={guard(<EditProfile />)} />
        <Route path="/profile-templates" element={guard(<ProfileTemplates userId={currentUserId} />)} />
        <Route path="/search-skills" element={guard(<SearchSkills />)} />
        <Route path="/request" element={guard(<PendingRequests currentUserId={currentUserId} />)} />
        <Route path="/chat" element={guard(<Messages currentUserId={currentUserId} />)} />
        <Route path="/chat/:userId" element={guard(<Messages currentUserId={currentUserId} />)} />
        {/* the UI links to a few pages that don't exist yet (/how-it-works, /tutorials, /schedule) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {isLoggedIn && <ChatbotWidget />}
    </Router>
  );
};

export default App;
