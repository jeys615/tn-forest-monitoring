import axios from 'axios';

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '/api';

/**
 * Retrieve the active authentication token from client storage safely.
 */
export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
};

/**
 * Persist or purge the authentication token across storage and axios defaults.
 */
export const setStoredToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem('token', token);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      localStorage.removeItem('token');
      delete apiClient.defaults.headers.common['Authorization'];
    }
  } catch {
    // Gracefully handle storage quotas or unavailable localStorage in sandboxes
  }
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Synchronize initial default Authorization header if token exists in storage
const initialToken = getStoredToken();
if (initialToken) {
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`;
}

// Request interceptor: guarantees Bearer token on every outgoing request
apiClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      if (config.headers && typeof config.headers.set === 'function') {
        config.headers.set('Authorization', `Bearer ${token}`);
      } else {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: handles 401 Unauthorized without leaving ghost states
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginEndpoint = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginEndpoint) {
      // Clear token from storage and axios defaults
      setStoredToken(null);

      // Dispatch event to synchronize React AuthContext immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('auth:unauthorized', {
            detail: {
              message: error.response?.data?.message || 'Authentication session expired.',
            },
          }),
        );

        // Force redirect to login page if currently on a protected route
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login?session_expired=1';
        }
      }
    }
    return Promise.reject(error);
  },
);
