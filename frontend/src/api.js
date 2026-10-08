// Defaults to the local backend while developing (`npm start`) and to the deployed API in production builds.
// Override either with REACT_APP_API_URL.
const API_URL =
  (process.env.REACT_APP_API_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://skill-exchange-platform-oodv.onrender.com'
      : 'http://localhost:5000')).replace(/\/$/, '');

export default API_URL;
