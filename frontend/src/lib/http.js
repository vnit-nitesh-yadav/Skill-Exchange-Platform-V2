// Configures the global axios instance once (imported from index.js) so every component that calls
// `axios.get(`${API_URL}/...`)` automatically sends the JWT and handles expired sessions.
import axios from 'axios';
import API_URL from '../api';
import { getToken, clearSession } from './session';

axios.interceptors.request.use((config) => {
  const isApiCall = typeof config.url === 'string' && config.url.startsWith(API_URL);
  const token = getToken();
  if (isApiCall && token && !config.headers?.Authorization) {
    config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthCall = url.includes('/api/auth/');
    if (error.response?.status === 401 && !isAuthCall && getToken()) {
      // token expired / invalid: log out and send the user to the login page
      clearSession();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default axios;
