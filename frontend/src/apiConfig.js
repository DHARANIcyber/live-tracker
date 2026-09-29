const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL.replace(/\/$/, '');
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:5000';
  }

  const { hostname, port, origin } = window.location;
  const isLocalDevHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  const isTunnelHost = hostname.includes('loca.lt') || hostname.includes('ngrok') || hostname.includes('trycloudflare.com');

  if (port === '3000' || port === '3001' || isLocalDevHost) {
    return 'http://localhost:5000';
  }

  if (isTunnelHost || origin) {
    return origin;
  }

  return 'http://localhost:5000';
};

export const API_BASE_URL = getApiBaseUrl();
