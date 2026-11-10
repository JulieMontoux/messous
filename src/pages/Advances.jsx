import { useState } from 'react';
import { Plus, Trash2, Check, Undo2, Landmark } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { api } from '../api/client';
import { fmt, fmtDec } from '../utils/budget';
import { toLocalDate, formatDay } from '../utils/period';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';

const BLANK = () => ({ person: '', amount: '', note: '', date: toLocalDate() });

// Dépenses avancées pour quelqu'un : hors enveloppes, suivies jusqu'au remboursement
export default function Advances() {
  const { state, dispatch } = useBudget();
  const { advances } = state;
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [showRepaid, setShowRepaid] = useState(false);

  const setAdvances = list => dispatch({ type: 'SET_ADVANCES', payload: list });
  const pending = advances.filter(a => !a.repaidAt);
  const repaid = advances.filter(a => a.repaidAt);
  const people = [...new Set(advances.map(a => a.person))];
  const byPerson = Object.entries(
    pending.reduce((acc, a) => ({ ...acc, [a.person]: (acc[a.person] || 0) + a.amount }), {})
  ).sort((a, b) => b[1] - a[1]);
  const totalOwed = pending.reduce((s, a) => s + a.amount, 0);

  async function add() {
    const created = await api.post('/api/advances', { ...form, amount: Number(form.amount) });
    setAdvances([created, ...advances]);
    setModal(false);
    setForm(BLANK());
  }

  async function toggleRepaid(a) {
    const updated = await api.put(`/api/advances/${a.id}/repaid`, { repaid: !a.repaidAt });
    setAdvances(advances.map(x => (x.id === a.id ? updated : x)));
  }

  async function settlePerson(person) {
    const list = pending.filter(a => a.person === person);
    const updated = await Promise.all(list.map(a => api.put(`/api/advances/${a.id}/repaid`, { repaid: true })));
    setAdvances(advances.map(x => updated.find(u => u.id === x.id) || x));
  }

  async function remove(a) {
    if (!window.confirm('Supprimer cette avance ?')) return;
    await api.delete(`/api/advances/${a.id}`);
    setAdvances(advances.filter(x => x.id !== a.id));
  }

  function Row({ a }) {
    return (
      <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">
            {a.person} {a.note && <span className="text-slate-400 font-normal">· {a.note}</span>}
          </p>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            {formatDay(a.date)}
            {a.bankTransactionId && <span title="Depuis le relevé bancaire"><Landmark size={10} /></span>}
            {a.repaidAt && <span className="text-savings">· remboursé le {formatDay(a.repaidAt)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`font-semibold ${a.repaidAt ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{fmtDec(a.amount)}</span>
          <button onClick={() => toggleRepaid(a)} className="p-1.5 text-slate-400 hover:text-savings" title={a.repaidAt ? 'Annuler le remboursement' : 'Marquer remboursé'}>
            {a.repaidAt ? <Undo2 size={15} /> : <Check size={15} />}
          </button>
          <button onClick={() => remove(a)} className="p-1.5 text-slate-300 hover:text-danger" title="Supprimer"><Trash2 size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-6 pb-4 space-y-4">
      <PageHeader title="Avances" subtitle="Ce que tu as payé pour les autres — hors de tes enveloppes">
        <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-1.5 py-2 text-sm">
          <Plus size={16} /> Ajouter
        </button>
      </PageHeader>

      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium">On te doit</p>
            <p className="text-3xl font-semibold text-slate-800 mt-1">{fmt(totalOwed)}</p>
          </div>
          <span className="text-4xl">🤝</span>
        </div>
        {byPerson.length > 0 && (
          <div className="mt-3 divide-y divide-slate-50">
            {byPerson.map(([person, amount]) => (
              <div key={person} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-600">{person}</span>
                <span className="flex items-center gap-3">
                  <strong className="text-slate-800">{fmtDec(amount)}</strong>
                  <button onClick={() => settlePerson(person)} className="text-xs text-savings font-medium hover:underline">Tout remboursé</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          Astuce : dans Banque, classe un paiement en « 🤝 Avance pour quelqu'un » pour l'ajouter ici automatiquement.
        </p>
      </div>

      {pending.length === 0 && repaid.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-medium">Aucune avance</p>
          <p className="text-sm mt-1">Un resto payé pour tout le monde, un cadeau commun…</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="card">
              <p className="text-sm font-semibold text-slate-700 mb-1">En attente de remboursement</p>
              {pending.map(a => <Row key={a.id} a={a} />)}
            </div>
          )}
          {repaid.length > 0 && (
            <div className="card">
              <button onClick={() => setShowRepaid(v => !v)} className="text-sm font-semibold text-slate-500">
                {showRepaid ? '▾' : '▸'} Remboursées ({repaid.length})
              </button>
              {showRepaid && <div className="mt-1">{repaid.map(a => <Row key={a.id} a={a} />)}</div>}
            </div>
          )}
        </>
      )}

      {modal && (
        <Modal
          title="Nouvelle avance"
          onClose={() => setModal(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={add} disabled={!form.person || !(Number(form.amount) > 0)}>Ajouter</button>
            </>
          }
        >
          <div>
            <label className="label">Pour qui ?</label>
            <input className="input" list="advance-people" value={form.person} onChange={e => setForm(f => ({ ...f, person: e.target.value }))} autoFocus />
            <datalist id="advance-people">{people.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Montant (€)</label>
              <input className="input text-lg font-semibold" type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Note (optionnel)</label>
            <input className="input" placeholder="Ex. resto d'anniversaire" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>
        </Modal>
      )}
    </div>
  );
}
