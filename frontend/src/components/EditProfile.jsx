import React, { useState, useEffect } from "react";
import API_URL from '../api';
import { skillNames } from '../utils/skills';
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/session";

const EditProfile = () => {
  const [user, setUser] = useState({ username: "", email: "", skills: "", learning: "", profilePicture: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text }
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setMessage({ type: "error", text: "Not authenticated. Please login." });
          setLoading(false);
          return;
        }
        const id = localStorage.getItem("id");
        const response = await axios.get(`${API_URL}/api/users/profile/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = response.data || {};
        setUser({
          username: data.username || "",
          email: data.email || "",
          profilePicture: data.profilePicture || data.avatar || "",
          // 2. Load existing skills AND learning interests
          // skills/learning are objects ({ name, proficiency… }); `join` on them printed "[object Object]"
          skills: Array.isArray(data.skills) ? skillNames(data.skills).join(", ") : (data.skills || ""),
          learning: Array.isArray(data.learning) ? skillNames(data.learning).join(", ") : (data.learning || ""),
        });
      } catch (err) {
        console.error("Error fetching user data:", err);
        const status = err?.response?.status;
        if (status === 401 || status === 404) {
          clearSession();
          setMessage({ type: "error", text: "Your session is invalid or expired. Please log in again." });
          setTimeout(() => navigate("/login"), 900);
        } else {
          setMessage({ type: "error", text: "Failed to load profile. Try again later." });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUser((prev) => ({ ...prev, [name]: value }));
  };

  const handleProfilePhotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please choose an image file for your profile photo." });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "Profile photo must be smaller than 5MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUser((prev) => ({ ...prev, profilePicture: reader.result }));
      setMessage({ type: "success", text: "Profile photo selected and ready to save." });
    };
    reader.onerror = () => {
      setMessage({ type: "error", text: "Unable to read the selected image. Please try another file." });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const token = localStorage.getItem("token");
      const id = localStorage.getItem("id");
      if (!token || !id) {
        setMessage({ type: "error", text: "Authentication required." });
        setSaving(false);
        return;
      }

      // 3. Add learning to payload (convert string back to array)
      const payload = {
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture || "",
        skills: user.skills.split(",").map((s) => s.trim()).filter(Boolean),
        learning: user.learning.split(",").map((s) => s.trim()).filter(Boolean),
      };

      const response = await axios.put(`${API_URL}/api/users/profile/${id}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setMessage({ type: "success", text: response.data.message || "Profile updated." });
      // optional: update local storage or global state if needed
      setTimeout(() => navigate("/profile"), 900); // Redirect to profile to see changes
    } catch (err) {
      console.error("Error updating profile:", err);
      const status = err?.response?.status;
      if (status === 401 || status === 404) {
        clearSession();
        setMessage({ type: "error", text: "Your session is invalid or expired. Please log in again." });
        setTimeout(() => navigate("/login"), 900);
      } else {
        const text =
          (err.response && (err.response.data.error || err.response.data.message)) ||
          "Failed to update profile. Try again.";
        setMessage({ type: "error", text });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen edit-bg flex items-center justify-center">
        <style>{`
          :root {
            --navy-900: #071025;
            --navy-950: #020617;
            --cream-50: #fffaf0;
          }
          .edit-bg { background: linear-gradient(180deg, var(--navy-900), var(--navy-950)); color: var(--cream-50); }
        `}</style>
        <div className="text-cream" style={{ color: "var(--cream-50)" }}>
          Loading profile...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen edit-bg flex items-center justify-center p-6">
      <style>{`
        :root {
          --mint-600: #2dd4bf;
          --mint-500: #34d399;
          --navy-900: #071025;
          --navy-950: #020617;
          --cream-50: #fffaf0;
          --cream-200: rgba(255,250,240,0.85);
          --card-bg: rgba(255,250,240,0.03);
          --card-border: rgba(255,250,240,0.06);
        }

        .edit-bg {
          background: linear-gradient(180deg, var(--navy-900) 0%, var(--navy-950) 100%);
          color: var(--cream-50);
        }

        .card {
          width: 100%;
          max-width: 720px;
          background: linear-gradient(180deg, rgba(255,250,240,0.02), rgba(255,250,240,0.01));
          border: 1px solid var(--card-border);
          border-radius: 14px;
          padding: 28px;
          box-shadow: 0 10px 30px rgba(2,6,23,0.6);
        }

        .label { color: var(--cream-200); font-weight:600; }
        .input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--card-border);
          background: rgba(255,250,240,0.03);
          color: var(--cream-50);
          outline: none;
          box-sizing: border-box;
        }
        .input:focus { box-shadow: 0 0 0 4px rgba(45,212,191,0.08); border-color: var(--mint-600); }

        .btn-primary {
          background: linear-gradient(90deg, var(--mint-600), var(--mint-500));
          color: #041f2d;
          padding: 10px 16px;
          border-radius: 12px;
          border: none;
          font-weight:700;
          cursor: pointer;
        }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .btn-ghost {
          background: transparent;
          color: var(--cream-200);
          border: 1px solid rgba(255,250,240,0.06);
          padding: 10px 14px;
          border-radius: 12px;
          cursor: pointer;
        }

        .close-btn {
          background: rgba(255,250,240,0.04);
          border: 1px solid rgba(255,250,240,0.06);
          color: var(--cream-50);
          padding: 6px 10px;
          border-radius: 8px;
          cursor: pointer;
        }

        .profile-photo-preview {
          width: 88px;
          height: 88px;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255,250,240,0.08);
          background: rgba(45,212,191,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,250,240,0.7);
          font-size: 12px;
          text-align: center;
        }

        .profile-photo-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .message-success { color: #9be7cf; }
        .message-error { color: #ffb4b4; }
      `}</style>

      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--mint-500)" }}>Edit Profile</h2>
            <p style={{ marginTop: 6, color: "var(--cream-200)" }}>Update your username, email and skills.</p>
          </div>

          <div>
            <button className="close-btn" onClick={() => navigate("/")}>
              ✕
            </button>
          </div>
        </div>

        {message && (
          <div style={{ marginTop: 16 }}>
            <div className={message.type === "success" ? "message-success" : "message-error"}>
              {message.text}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
          <div style={{ marginBottom: 14 }}>
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              className="input"
              value={user.username}
              onChange={handleChange}
              required
              type="text"
              autoComplete="username"
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              className="input"
              value={user.email}
              onChange={handleChange}
              required
              type="email"
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="label" htmlFor="profilePicture">Profile Photo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 10 }}>
              <div className="profile-photo-preview">
                {user.profilePicture ? <img src={user.profilePicture} alt="Profile preview" /> : "No photo"}
              </div>
              <input type="file" accept="image/*" onChange={handleProfilePhotoChange} />
              {user.profilePicture && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setUser((prev) => ({ ...prev, profilePicture: "" }))}
                  style={{ padding: "8px 10px" }}
                >
                  Remove
                </button>
              )}
            </div>
            <input
              id="profilePicture"
              name="profilePicture"
              className="input"
              value={user.profilePicture}
              onChange={handleChange}
              type="url"
              placeholder="https://example.com/photo.jpg"
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="label" htmlFor="skills">Skills I can Teach</label>
            <input
              id="skills"
              name="skills"
              className="input"
              value={user.skills}
              onChange={handleChange}
              placeholder="e.g. React, Design, Notion"
            />
          </div>

          {/* 4. New Field: Learning Interests (AI Driver) */}
          <div style={{ marginBottom: 18 }}>
            <label className="label" htmlFor="learning" style={{color: '#a855f7'}}>Skills I want to Learn</label>
            <input
              id="learning"
              name="learning"
              className="input"
              value={user.learning}
              onChange={handleChange}
              placeholder="e.g. Python, Spanish, Cooking"
              style={{borderColor: 'rgba(168, 85, 247, 0.4)'}}
            />
            <p style={{fontSize: '12px', color: 'rgba(168, 85, 247, 0.8)', marginTop: 6}}>
              * Adding these will unlock AI recommendations on your dashboard.
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 6 }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => navigate("/")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProfile;