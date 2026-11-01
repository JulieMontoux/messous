import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const MIN_PASSWORD = 6;

function AuthScreen({ subtitle, children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-2">💶</p>
          <h1 className="text-2xl font-bold text-slate-800">MesSous</h1>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

// Lien reçu par e-mail : https://…/#reset=<jeton>. Le jeton est retiré de l'adresse
// dès la lecture pour ne pas rester dans l'historique du navigateur.
export function readResetToken() {
  const match = window.location.hash.match(/^#reset=([\w-]+)$/);
  if (!match) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return match[1];
}

export function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, sent: false, error: '' });

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, sent: false, error: '' });
    try {
      await api.post('/api/auth/forgot', { email });
      setState({ busy: false, sent: true, error: '' });
    } catch (err) {
      setState({ busy: false, sent: false, error: err.message });
    }
  }

  return (
    <AuthScreen subtitle="Mot de passe oublié">
      {state.sent ? (
        <div className="card space-y-4 text-center">
          <p className="text-3xl">📬</p>
          <p className="text-sm text-slate-600">
            Si un compte existe pour <strong>{email}</strong>, tu vas recevoir un e-mail avec un lien pour choisir
            un nouveau mot de passe. Il est valable 1 heure.
          </p>
          <p className="text-xs text-slate-400">Pense à regarder dans les indésirables.</p>
          <button type="button" className="btn-primary w-full" onClick={onBack}>Retour à la connexion</button>
        </div>
      ) : (
        <form onSubmit={submit} className="card space-y-4">
          <p className="text-sm text-slate-500">Indique l'adresse de ton compte : on t'envoie un lien pour changer ton mot de passe.</p>
          <div>
            <label className="label" htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="julie@exemple.fr"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          {state.error && <p className="text-sm text-danger font-medium">{state.error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={state.busy}>
            {state.busy ? 'Envoi…' : 'Recevoir le lien'}
          </button>
          <p className="text-center text-sm">
            <button type="button" onClick={onBack} className="text-primary font-semibold">Retour à la connexion</button>
          </p>
        </form>
      )}
    </AuthScreen>
  );
}

export function ResetPassword({ token, onDone, onCancel }) {
  const { resetPassword } = useAuth();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < MIN_PASSWORD) return setError(`Au moins ${MIN_PASSWORD} caractères`);
    if (form.password !== form.confirm) return setError('Les mots de passe ne correspondent pas');
    setBusy(true);
    try {
      await resetPassword(token, form.password);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthScreen subtitle="Nouveau mot de passe">
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="reset-password">Nouveau mot de passe</label>
          <input
            id="reset-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="reset-confirm">Confirmer</label>
          <input
            id="reset-confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
            required
          />
        </div>
        {error && <p className="text-sm text-danger font-medium">{error}</p>}
        <button className="btn-primary w-full" type="submit" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
        </button>
        <p className="text-center text-sm">
          <button type="button" onClick={onCancel} className="text-primary font-semibold">Annuler</button>
        </p>
      </form>
    </AuthScreen>
  );
}
