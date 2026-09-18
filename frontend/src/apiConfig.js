const getApiBaseUrl = () => {
  const configuredBackendUrl = process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_URL;

  if (configuredBackendUrl) {
    return configuredBackendUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const { hostname } = window.location;

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return 'http://localhost:5000';
    }
  }

  return 'http://localhost:5000';
};

export const API_BASE_URL = getApiBaseUrl();
