const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    // If running in development on port 3000/3001, route to backend on 5000
    if (window.location.port === '3000' || window.location.port === '3001') {
      return process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
    }

    // For combined build, production, or shareable link, use current origin
    return window.location.origin;
  }

  return process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
};

export const API_BASE_URL = getApiBaseUrl();
