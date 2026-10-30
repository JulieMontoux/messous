import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, PlusCircle } from 'lucide-react';
import { api } from '../api/client';
import { fmt } from '../utils/budget';
import Modal from '../components/Modal';

const ICONS = ['🎯', '🏖️', '🚗', '🏠', '💍', '✈️', '📱', '🎓', '🛡️', '💰', '🏋️', '🎸'];
const BLANK = { name: '', targetAmount: '', currentAmount: '0', targetDate: '', icon: '🎯' };

function GoalCard({ goal, onEdit, onDelete, onDeposit }) {
  const pct = goal.targetAmount > 0
    ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
    : 0;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const done = goal.currentAmount >= goal.targetAmount;

  let monthsLeft = null;
  if (goal.targetDate) {
    const diff = (new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30);
    monthsLeft = Math.ceil(diff);
  }

  const monthlyNeeded = monthsLeft > 0 ? remaining / monthsLeft : null;

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{goal.icon}</span>
          <div>
            <p className="font-semibold text-slate-800">{goal.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {fmt(goal.currentAmount)} / {fmt(goal.targetAmount)}
              {goal.targetDate && (
                <span className="ml-2">
                  · {monthsLeft > 0 ? `${monthsLeft} mois restants` : monthsLeft === 0 ? 'Ce mois-ci' : 'Échéance dépassée'}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-primary transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-danger transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>{Math.round(pct)}%</span>
          {done ? (
            <span className="text-savings font-semibold">✓ Objectif atteint !</span>
          ) : (
            <span>{fmt(remaining)} restants</span>
          )}
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: done ? '#22c55e' : pct >= 75 ? '#3b82f6' : pct >= 40 ? '#8b5cf6' : '#6366f1',
            }}
          />
        </div>
      </div>

      {monthlyNeeded && !done && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
          💡 Mettre de côté <strong>{fmt(Math.ceil(monthlyNeeded))}/mois</strong> pour atteindre l'objectif à temps
        </p>
      )}

      {!done && (
        <button
          onClick={onDeposit}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-500 hover:border-primary hover:text-primary transition-colors"
        >
          <PlusCircle size={15} />
          Ajouter un versement
        </button>
      )}
    </div>
  );
}

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [modal, setModal] = useState(null); // 'add' | 'edit' | 'deposit'
  const [form, setForm] = useState(BLANK);
  const [depositAmount, setDepositAmount] = useState('');
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadGoals(); }, []);

  async function loadGoals() {
    try {
      const data = await api.get('/api/goals');
      setGoals(data);
    } catch {}
    setLoading(false);
  }

  function openAdd() {
    setForm(BLANK);
    setModal('add');
  }

  function openEdit(goal) {
    setForm({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
      targetDate: goal.targetDate || '',
      icon: goal.icon,
    });
    setSelectedGoal(goal);
    setModal('edit');
  }

  function openDeposit(goal) {
    setDepositAmount('');
    setSelectedGoal(goal);
    setModal('deposit');
  }

  async function saveGoal() {
    if (!form.name || !form.targetAmount) return;
    const body = {
      name: form.name,
      targetAmount: Number(form.targetAmount),
      currentAmount: Number(form.currentAmount) || 0,
      targetDate: form.targetDate || null,
      icon: form.icon,
    };
    try {
      if (modal === 'add') {
        const goal = await api.post('/api/goals', body);
        setGoals(g => [...g, goal]);
      } else {
        const goal = await api.put(`/api/goals/${selectedGoal.id}`, body);
        setGoals(g => g.map(x => x.id === goal.id ? goal : x));
      }
      setModal(null);
    } catch {}
  }

  async function deleteGoal(id) {
    await api.delete(`/api/goals/${id}`);
    setGoals(g => g.filter(x => x.id !== id));
  }

  async function doDeposit() {
    if (!depositAmount || Number(depositAmount) <= 0) return;
    try {
      const goal = await api.post(`/api/goals/${selectedGoal.id}/deposit`, { amount: Number(depositAmount) });
      setGoals(g => g.map(x => x.id === goal.id ? goal : x));
      setModal(null);
    } catch {}
  }

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.currentAmount, 0);

  return (
    <div className="pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Objectifs</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {goals.length > 0 ? `${fmt(totalCurrent)} épargnés sur ${fmt(totalTarget)}` : 'Définis tes projets'}
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5 py-2 text-sm">
          <Plus size={16} /> Nouveau
        </button>
      </div>

      {loading && <p className="text-sm text-slate-400 text-center py-8">Chargement…</p>}

      {!loading && goals.length === 0 && (
        <div className="text-center py-14 text-slate-400">
          <p className="text-4xl mb-3">🎯</p>
          <p className="font-medium">Aucun objectif</p>
          <p className="text-sm mt-1">Vacances, voiture, apport… fixe un cap !</p>
        </div>
      )}

      {goals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {goals.map(g => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={() => openEdit(g)}
              onDelete={() => deleteGoal(g.id)}
              onDeposit={() => openDeposit(g)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal
          title={modal === 'add' ? 'Nouvel objectif' : 'Modifier l\'objectif'}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveGoal} disabled={!form.name || !form.targetAmount}>
                {modal === 'add' ? 'Créer' : 'Enregistrer'}
              </button>
            </>
          }
        >
          <div>
            <label className="label">Icône</label>
            <div className="flex flex-wrap gap-2 mb-1">
              {ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setForm(f => ({ ...f, icon: ic }))}
                  className={`w-9 h-9 rounded-xl text-xl flex items-center justify-center transition-all ${form.icon === ic ? 'bg-primary/15 ring-2 ring-primary' : 'bg-slate-100 hover:bg-slate-200'}`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Nom de l'objectif</label>
            <input className="input" placeholder="Ex. Vacances au Maroc" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Montant cible (€)</label>
            <input className="input text-lg font-semibold" type="number" placeholder="Ex. 3000"
              value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))} />
          </div>
          <div>
            <label className="label">Déjà épargné (€)</label>
            <input className="input" type="number" placeholder="0"
              value={form.currentAmount} onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))} />
          </div>
          <div>
            <label className="label">Date cible (optionnel)</label>
            <input className="input" type="date"
              value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* Deposit modal */}
      {modal === 'deposit' && selectedGoal && (
        <Modal
          title={`Versement — ${selectedGoal.name}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={doDeposit} disabled={!depositAmount || Number(depositAmount) <= 0}>
                Ajouter
              </button>
            </>
          }
        >
          <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 mb-2">
            <span className="text-sm text-slate-500">Progression actuelle</span>
            <span className="font-semibold text-slate-800">
              {fmt(selectedGoal.currentAmount)} / {fmt(selectedGoal.targetAmount)}
            </span>
          </div>
          <div>
            <label className="label">Montant à ajouter (€)</label>
            <input
              className="input text-2xl font-bold"
              type="number"
              placeholder="0"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              autoFocus
            />
          </div>
          {depositAmount && Number(depositAmount) > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              Nouveau total : {fmt(selectedGoal.currentAmount + Number(depositAmount))}
              {' '}({Math.round(Math.min(100, ((selectedGoal.currentAmount + Number(depositAmount)) / selectedGoal.targetAmount) * 100))}%)
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
