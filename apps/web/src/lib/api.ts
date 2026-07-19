import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach auth token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('vs_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor — handle errors globally and unwrap {success, data} envelope
api.interceptors.response.use(
  (response) => {
    // API wraps all responses in {success: true, data: ...} — unwrap to just the data
    const body = response.data;
    return body?.success !== undefined && body?.data !== undefined ? body.data : body;
  },
  (error) => {
    const message = error.response?.data?.error?.message || error.message || 'An error occurred';
    return Promise.reject(new Error(Array.isArray(message) ? message[0] : message));
  },
);

// API functions
export const downloadApi = {
  detectPlatform: (url: string) => api.post('/download/detect', { url }),
  getMetadata: (url: string) => api.post('/download/metadata', { url }),
  download: (url: string, quality: string) => api.post('/download', { url, quality }),
  getPlatforms: () => api.get('/download/platforms'),
};

export const authApi = {
  verify: (token: string) => api.post('/auth/verify', {}, { headers: { Authorization: `Bearer ${token}` } }),
  createGuest: () => api.post('/auth/guest'),
  getLimits: (token?: string) =>
    api.get('/auth/limits', token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
};

export const historyApi = {
  getHistory: (page = 1, limit = 20) => api.get(`/history?page=${page}&limit=${limit}`),
  getFavorites: () => api.get('/favorites'),
  addFavorite: (downloadId: string) => api.post('/favorite', { downloadId }),
  removeFavorite: (downloadId: string) => api.delete(`/favorite/${downloadId}`),
};

export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getUsers: (page = 1, limit = 20) => api.get(`/admin/users?page=${page}&limit=${limit}`),
  getPlatformStats: () => api.get('/admin/platforms'),
};
