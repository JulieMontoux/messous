import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('messous_token'));

  useEffect(() => {
    const handler = () => setToken(null);
    window.addEventListener('messous:logout', handler);
    return () => window.removeEventListener('messous:logout', handler);
  }, []);

  async function login(email, password) {
    const data = await api.post('/api/auth/login', { email, password });
    localStorage.setItem('messous_token', data.token);
    setToken(data.token);
    return data;
  }

  async function register(email, password) {
    const data = await api.post('/api/auth/register', { email, password });
    localStorage.setItem('messous_token', data.token);
    setToken(data.token);
    return data;
  }

  function logout() {
    localStorage.removeItem('messous_token');
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, login, register, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
