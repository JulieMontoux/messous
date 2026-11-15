import { useState } from 'react';
import { KeyRound, UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';

const MIN_PASSWORD = 6;

function PasswordModal({ onClose, onDone }) {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function submit() {
    setError('');
    if (form.next.length < MIN_PASSWORD) return setError(`Nouveau mot de passe : au moins ${MIN_PASSWORD} caractères`);
    if (form.next !== form.confirm) return setError('Les nouveaux mots de passe ne correspondent pas');
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Changer de mot de passe"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!form.current || !form.next || busy} onClick={submit}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div>
        <label className="label" htmlFor="pwd-current">Mot de passe actuel</label>
        <input id="pwd-current" className="input" type="password" autoComplete="current-password" value={form.current} onChange={set('current')} />
      </div>
      <div>
        <label className="label" htmlFor="pwd-next">Nouveau mot de passe</label>
        <input id="pwd-next" className="input" type="password" autoComplete="new-password" value={form.next} onChange={set('next')} />
      </div>
      <div>
        <label className="label" htmlFor="pwd-confirm">Confirmer le nouveau mot de passe</label>
        <input id="pwd-confirm" className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
      </div>
      <p className="text-xs text-slate-500">Tes autres appareils seront déconnectés.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Modal>
  );
}

function DeleteAccountModal({ email, onClose }) {
  const { deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = password && confirm.trim().toUpperCase() === 'SUPPRIMER';

  async function submit() {
    setBusy(true);
    setError('');
    try {
      // Succès : déconnexion, l'app revient à l'écran de connexion
      await deleteAccount(password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="⚠️ Supprimer mon compte ?"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-danger" disabled={!ready || busy} onClick={submit}>
            {busy ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Supprime définitivement ton compte{email ? <> (<strong>{email}</strong>)</> : null} et toutes ses données :
        profil, budget, dépenses, retraits, historique, objectifs, avances, opérations et connexions bancaires.
        Cette action est irréversible.
      </p>
      <div>
        <label className="label" htmlFor="delete-password">Ton mot de passe</label>
        <input id="delete-password" className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="delete-confirm">Tape SUPPRIMER pour confirmer</label>
        <input id="delete-confirm" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="SUPPRIMER" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Modal>
  );
}

export default function AccountCard({ email }) {
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState(false);

  return (
    <div className="card">
      <p className="text-xs font-semibold text-slate-400 mb-3">Compte</p>
      {email && <p className="text-sm text-slate-600 mb-3">Adresse du compte : <strong>{email}</strong></p>}
      {done && <p className="text-sm text-savings font-medium mb-3">✓ Mot de passe modifié</p>}
      <button
        onClick={() => { setDone(false); setOpen('password'); }}
        className="btn-secondary w-full flex items-center justify-center gap-2 mb-2"
      >
        <KeyRound size={16} /> Changer de mot de passe
      </button>
      <button
        onClick={() => setOpen('delete')}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-danger hover:bg-danger/5"
      >
        <UserX size={16} /> Supprimer mon compte
      </button>

      {open === 'password' && <PasswordModal onClose={() => setOpen(null)} onDone={() => { setOpen(null); setDone(true); }} />}
      {open === 'delete' && <DeleteAccountModal email={email} onClose={() => setOpen(null)} />}
    </div>
  );
}
