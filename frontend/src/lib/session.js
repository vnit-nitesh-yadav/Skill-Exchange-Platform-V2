// Single place that knows how the login session is stored.
// The token is stored RAW (no "Bearer " prefix). Older sessions stored "Bearer <jwt>", so reads strip it.
export const getToken = () => (localStorage.getItem('token') || '').replace(/^(Bearer\s+)+/i, '').trim();
export const getUserId = () => localStorage.getItem('id') || '';
export const isAuthenticated = () => !!getToken() && !!getUserId();

export const setSession = ({ token, id }) => {
  if (token) localStorage.setItem('token', String(token).replace(/^(Bearer\s+)+/i, ''));
  if (id) localStorage.setItem('id', id);
  window.dispatchEvent(new Event('session-changed'));
};

export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('id');
  sessionStorage.removeItem('skillbuddy-chat');
  window.dispatchEvent(new Event('session-changed'));
};
