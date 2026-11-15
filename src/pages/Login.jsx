import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login({ onSwitch, onForgot }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <p className="font-semibold text-slate-800 text-lg">MesSous</p>
          </div>
          <p className="text-sm text-slate-400">Connexion à ton compte</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="julie@exemple.fr"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          {error && <p className="text-sm text-danger font-medium">{error}</p>}
          <p className="text-right -mt-2">
            <button type="button" onClick={onForgot} className="text-xs text-primary font-medium">
              Mot de passe oublié ?
            </button>
          </p>
          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="text-center text-sm text-slate-500">
            Pas encore de compte ?{' '}
            <button type="button" onClick={onSwitch} className="text-primary font-semibold">
              S'inscrire
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
