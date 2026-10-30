import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { FIXED_CATEGORIES, generateId } from '../data/defaults';
import { fmt, totalFixed, totalProgrammedSavings, weeklyToMonthly } from '../utils/budget';
import Modal from '../components/Modal';

const BLANK = { name: '', categoryId: 'housing', amount: '', freq: 'monthly' };

export default function Charges() {
  const { state, dispatch } = useBudget();
  const { fixedCharges, profile } = state;
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);

  function openAdd() {
    setForm(BLANK);
    setModal({ mode: 'add' });
  }

  function openEdit(charge) {
    setForm({ name: charge.name, categoryId: charge.categoryId, amount: charge.amount, freq: charge.freq || 'monthly' });
    setModal({ mode: 'edit', charge });
  }

  function save() {
    if (!form.name || !form.amount) return;
    const rawAmount = Number(form.amount);
    const amount = form.freq === 'weekly' ? weeklyToMonthly(rawAmount) : rawAmount;
    if (modal.mode === 'add') {
      dispatch({ type: 'ADD_FIXED_CHARGE', payload: { id: generateId(), ...form, amount } });
    } else {
      dispatch({ type: 'UPDATE_FIXED_CHARGE', payload: { ...modal.charge, ...form, amount } });
    }
    setModal(null);
  }

  function remove(id) {
    dispatch({ type: 'DELETE_FIXED_CHARGE', payload: id });
  }

  const total = totalFixed(fixedCharges);
  const programmedSav = totalProgrammedSavings(fixedCharges);
  const pctOfSalary = profile.netSalary > 0 ? Math.round((total / profile.netSalary) * 100) : 0;

  // Group by category
  const grouped = FIXED_CATEGORIES.map(cat => ({
    ...cat,
    items: fixedCharges.filter(c => c.categoryId === cat.id),
  })).filter(g => g.items.length > 0);

  return (
    <div className="pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Charges fixes</h1>
          <p className="text-sm text-slate-400 mt-0.5">Ce qui sort chaque mois, quoi qu'il arrive</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 py-2 text-sm">
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {/* Summary */}
      <div className="card bg-fixed/5 border-fixed/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total mensuel</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{fmt(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">du salaire</p>
            <p className={`text-2xl font-bold mt-1 ${pctOfSalary > 60 ? 'text-danger' : pctOfSalary > 45 ? 'text-warn' : 'text-fixed'}`}>
              {pctOfSalary}%
            </p>
          </div>
        </div>
        {profile.netSalary > 0 && (
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pctOfSalary > 60 ? 'bg-danger' : pctOfSalary > 45 ? 'bg-warn' : 'bg-fixed'}`}
              style={{ width: `${Math.min(100, pctOfSalary)}%` }}
            />
          </div>
        )}
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">Aucune charge fixe</p>
          <p className="text-sm mt-1">Ajoute loyer, électricité, abonnements…</p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.id}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {group.icon} {group.name}
            </p>
            <div className="space-y-2">
              {group.items.map(charge => (
                <div key={charge.id} className="card flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700 truncate">{charge.name}</p>
                  </div>
                  <p className="font-bold text-slate-800 flex-shrink-0">{fmt(charge.amount)}</p>
                  <button onClick={() => openEdit(charge)} className="p-1.5 text-slate-300 hover:text-primary transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => remove(charge.id)} className="p-1.5 text-slate-300 hover:text-danger transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Ungrouped (shouldn't happen but safety net) */}
      {fixedCharges.filter(c => !FIXED_CATEGORIES.find(cat => cat.id === c.categoryId)).map(charge => (
        <div key={charge.id} className="card flex items-center gap-3 py-3">
          <span className="text-xl">📌</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-700 truncate">{charge.name}</p>
          </div>
          <p className="font-bold text-slate-800">{fmt(charge.amount)}</p>
          <button onClick={() => openEdit(charge)} className="p-1.5 text-slate-300 hover:text-primary transition-colors">
            <Pencil size={15} />
          </button>
          <button onClick={() => remove(charge.id)} className="p-1.5 text-slate-300 hover:text-danger transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      {/* Modal */}
      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Nouvelle charge fixe' : 'Modifier la charge'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={save} disabled={!form.name || !form.amount}>
                {modal.mode === 'add' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </>
          }
        >
          <div>
            <label className="label">Nom</label>
            <input className="input" placeholder="Ex. Loyer, EDF, Netflix…" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Catégorie</label>
            <select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
              {FIXED_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fréquence</label>
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              {[{ id: 'monthly', label: 'Mensuel' }, { id: 'weekly', label: 'Hebdomadaire' }].map(f => (
                <button
                  key={f.id}
                  onClick={() => setForm(fm => ({ ...fm, freq: f.id }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${form.freq === f.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">
              Montant {form.freq === 'weekly' ? 'hebdomadaire' : 'mensuel'} (€)
            </label>
            <input
              className="input text-lg font-semibold"
              type="number"
              placeholder={form.freq === 'weekly' ? 'Ex. 70' : 'Ex. 700'}
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            />
            {form.freq === 'weekly' && form.amount && (
              <p className="text-xs text-slate-400 mt-1">
                = <strong>{fmt(weeklyToMonthly(Number(form.amount)))}</strong> / mois (× 4,33 semaines)
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
