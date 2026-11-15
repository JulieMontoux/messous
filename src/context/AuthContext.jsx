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

  function startSession(data) {
    localStorage.setItem('messous_token', data.token);
    setToken(data.token);
    return data;
  }

  async function login(email, password) {
    return startSession(await api.post('/api/auth/login', { email, password }));
  }

  async function register(email, password) {
    return startSession(await api.post('/api/auth/register', { email, password }));
  }

  // Lien « mot de passe oublié » : nouveau mot de passe puis connexion directe
  async function resetPassword(resetToken, password) {
    return startSession(await api.post('/api/auth/reset', { token: resetToken, password }));
  }

  // Le serveur renvoie un nouveau jeton (les autres appareils sont déconnectés)
  async function changePassword(currentPassword, newPassword) {
    return startSession(await api.put('/api/auth/password', { currentPassword, newPassword }));
  }

  function logout() {
    localStorage.removeItem('messous_token');
    setToken(null);
  }

  async function deleteAccount(password) {
    await api.delete('/api/auth/account', { password });
    logout();
  }

  return (
    <AuthContext.Provider value={{ token, login, register, logout, resetPassword, changePassword, deleteAccount, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
