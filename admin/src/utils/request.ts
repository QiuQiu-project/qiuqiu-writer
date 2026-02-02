import axios from 'axios';
import { message } from 'antd';

const request = axios.create({
  baseURL: '/api/v1', // Using proxy
  timeout: 10000,
});

// Request interceptor
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
request.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      if (status === 401) {
        // Token expired or invalid
        localStorage.removeItem('admin_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      } else {
        message.error(data.detail || data.message || 'Request failed');
      }
    } else {
      message.error('Network error');
    }
    return Promise.reject(error);
  }
);

export default request;
