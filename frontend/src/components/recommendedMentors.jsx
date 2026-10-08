import React, { useState, useEffect } from 'react';
import API_URL from '../api';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import profileIcon from '../assets/usericon.png';

const RecommendedMentors = () => {
  const [recommendations, setRecommendations] = useState([]);
  const [coldStart, setColdStart] = useState(false);
  const [loading, setLoading] = useState(true);
  // New state to track connection status per user ID: 'sending' | 'sent' | undefined
  const [requestStatus, setRequestStatus] = useState({}); 
  const navigate = useNavigate();
  const currentUserId = localStorage.getItem('id');

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/recommendations/${currentUserId}`);
        // API shape: { coldStart, hasGoals, recommendations: [...] }
        const list = Array.isArray(res.data) ? res.data : (res.data.recommendations || []);
        setRecommendations(list);
        setColdStart(!Array.isArray(res.data) && !!res.data.coldStart);
        // restore button state after a page reload
        setRequestStatus(Object.fromEntries(list.filter((r) => r.connectionStatus && r.connectionStatus !== 'none').map((r) => [r._id, r.connectionStatus])));
      } catch (err) {
        console.error("Failed to fetch recommendations", err);
      } finally {
        setLoading(false);
      }
    };

    if (currentUserId) fetchRecommendations();
  }, [currentUserId]);

  // --- NEW: Handle Connect Logic ---
  const handleConnect = async (receiverId) => {
    if (!currentUserId) return;

    // 1. Set state to sending
    setRequestStatus(prev => ({ ...prev, [receiverId]: 'sending' }));

    try {
      // 2. Call the connection endpoint
      await axios.post(`${API_URL}/api/connection/send-request`, {
        senderId: currentUserId,
        receiverId,
      });

      // 3. Set state to sent on success
      setRequestStatus(prev => ({ ...prev, [receiverId]: 'sent' }));
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || "Failed to connect");
      if (error.response?.status === 409) { setRequestStatus(prev => ({ ...prev, [receiverId]: 'pending_sent' })); return; }
      // Reset status if failed so user can try again
      setRequestStatus(prev => ({ ...prev, [receiverId]: undefined }));
    }
  };

  if (loading) return <div className="p-6 text-center text-sm opacity-60" style={{color: 'var(--cream-50)'}}>Analysing skills for matches...</div>;
  
  // Handle empty state gracefully (from previous fix)
  if (recommendations.length === 0) return (
    <div className="p-8 text-center border border-dashed border-gray-700 rounded-xl mt-12 mb-12" style={{background: 'rgba(255,250,240,0.02)'}}>
      <h3 className="text-xl font-bold" style={{color: 'var(--cream-50)'}}>No AI Matches Yet</h3>
      <p className="text-sm mt-2 mb-4" style={{color: 'rgba(255,250,240,0.6)'}}>
        Add "Learning" interests to your profile to see matches.
      </p>
      <button onClick={() => navigate('/edit-profile')} className="px-4 py-2 rounded-lg font-bold text-sm" style={{background: 'var(--mint-600)', color: '#041f2d'}}>
        Update Profile
      </button>
    </div>
  );

  return (
    <div className="rec-container mt-12 mb-12">
      <style>{`
        :root {
          --mint-600: #2dd4bf;
          --mint-500: #34d399;
          --navy-900: #071025;
          --card-bg: rgba(255,250,240,0.03);
          --card-border: rgba(255,250,240,0.08);
          --cream-50: #fffaf0;
        }

        .rec-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .ai-badge {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 99px;
          letter-spacing: 0.5px;
          box-shadow: 0 0 15px rgba(168, 85, 247, 0.4);
        }

        .rec-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }

        .rec-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          padding: 20px;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .rec-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 30px rgba(2, 6, 23, 0.5);
          border-color: rgba(45, 212, 191, 0.3);
        }

        .rec-avatar {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: rgba(45,212,191,0.1);
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.05);
        }
        
        .match-score {
          font-size: 24px;
          font-weight: 800;
          background: linear-gradient(90deg, var(--mint-600), var(--mint-500));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .match-label {
          font-size: 10px;
          text-transform: uppercase;
          color: rgba(255,250,240,0.5);
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .skill-pill {
          font-size: 12px;
          background: rgba(7, 16, 37, 0.6);
          border: 1px solid rgba(255,250,240,0.1);
          color: rgba(255,250,240,0.8);
          padding: 4px 10px;
          border-radius: 6px;
        }

        .btn-connect-rec {
          width: 100%;
          margin-top: 16px;
          padding: 10px;
          border-radius: 10px;
          background: linear-gradient(90deg, var(--mint-600), var(--mint-500));
          color: #041f2d;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-connect-rec:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        /* Disabled state for "Sent" or "Sending" */
        .btn-connect-rec:disabled {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.5);
          cursor: default;
          box-shadow: none;
        }
      `}</style>

      <div className="rec-header">
        <h3 className="text-2xl font-bold" style={{color: 'var(--cream-50)'}}>Recommended Mentors</h3>
        <span className="ai-badge">AI MATCH</span>
      </div>
      {coldStart && (
        <p className="text-sm mb-4" style={{color: 'rgba(255,250,240,0.6)'}}>
          Showing popular mentors. <button onClick={() => navigate('/edit-profile')} style={{color: 'var(--mint-500)', textDecoration: 'underline'}}>Add what you want to learn</button> for personalised matches.
        </p>
      )}
      
      <div className="rec-grid">
        {recommendations.map((user) => {
          const status = requestStatus[user._id]; // Get status for this specific user
          const isConnected = status === 'connected';
          const isSent = status === 'sent' || status === 'pending_sent' || status === 'pending_received';
          const isSending = status === 'sending';

          return (
            <div key={user._id} className="rec-card">
              
              {/* Top Section: Avatar + Score */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="rec-avatar">
                    <img src={user.avatar || profileIcon} alt={user.username} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="font-bold text-lg leading-tight" style={{color: 'var(--cream-50)'}}>
                      {user.username}
                    </div>
                    <div className="text-xs opacity-60" style={{color: 'var(--cream-50)'}}>
                      {[user.experience_level, user.department].filter(Boolean).join(' · ') || 'Member'}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="match-score">{user.matchScore}%</div>
                  <div className="match-label">Match</div>
                </div>
              </div>

              {/* Middle Section: Skills */}
              <div className="mb-4">
                <div className="text-xs font-semibold mb-2 opacity-50" style={{color: 'var(--cream-50)'}}>TEACHES</div>
                <div className="flex flex-wrap gap-2">
                  {user.skills.slice(0, 4).map((skill, i) => (
                    <span key={i} className="skill-pill">
                      {skill}
                    </span>
                  ))}
                  {user.skills.length > 4 && (
                    <span className="skill-pill opacity-50">+{user.skills.length - 4}</span>
                  )}
                </div>
              </div>

              {/* Why this person was recommended */}
              {user.reasons?.length > 0 && (
                <ul className="mb-2 text-xs" style={{color: 'rgba(255,250,240,0.72)', listStyle: 'disc', paddingLeft: 16}}>
                  {user.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}

              <div style={{display: 'flex', gap: 8}}>
                <button
                  onClick={() => navigate(`/chat/${user._id}`)}
                  className="btn-connect-rec"
                  style={{background: 'rgba(255,255,255,0.08)', color: 'var(--cream-50)'}}
                >
                  Message
                </button>
                <button
                  onClick={() => handleConnect(user._id)}
                  disabled={isConnected || isSent || isSending}
                  className="btn-connect-rec"
                >
                  {isConnected ? 'Connected' : status === 'pending_received' ? 'Requested you' : isSent ? 'Request Sent' : (isSending ? 'Sending...' : 'Connect')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecommendedMentors;