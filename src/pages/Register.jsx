import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Register({ onSwitch }) {
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Les mots de passe ne correspondent pas');
    setLoading(true);
    try {
      await register(form.email, form.password);
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
          <p className="text-sm text-slate-400">Créer un compte</p>
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
              placeholder="Min. 6 caractères"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">Confirmer le mot de passe</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              required
            />
          </div>
          {error && <p className="text-sm text-danger font-medium">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
          <p className="text-center text-sm text-slate-500">
            Déjà un compte ?{' '}
            <button type="button" onClick={onSwitch} className="text-primary font-semibold">
              Se connecter
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
