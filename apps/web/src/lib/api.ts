import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

// Unwrap {success, data} envelope
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    return body?.data !== undefined ? body.data : body;
  },
  (error) => {
    const message = error.response?.data?.error?.message || error.message || 'An error occurred';
    return Promise.reject(new Error(Array.isArray(message) ? message[0] : message));
  },
);

export const downloadApi = {
  getMetadata: (url: string) => api.post('/download/metadata', { url }),
  download: (url: string, quality?: string) => api.post('/download', { url, quality }),
};
