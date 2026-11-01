import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, PlusCircle } from 'lucide-react';
import { api } from '../api/client';
import { fmt, goalPlan, totalSavingEnvelopesBudget, totalProgrammedSavings, computedSavings } from '../utils/budget';
import { useBudget } from '../context/BudgetContext';
import { MONTHS_FR } from '../data/defaults';
import Modal from '../components/Modal';

const ICONS = ['🎯', '🏖️', '🚗', '🏠', '💍', '✈️', '📱', '🎓', '🛡️', '💰', '🏋️', '🎸'];
const BLANK = { name: '', targetAmount: '', currentAmount: '0', targetDate: '', icon: '🎯', monthlyContribution: '' };

const monthLabel = m => `${MONTHS_FR[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

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

      {!done && (() => {
        const plan = goalPlan(goal);
        if (plan.late) {
          return (
            <p className="text-xs text-warn bg-warn/10 rounded-lg px-3 py-2">
              ⚠️ En retard : {plan.contribution > 0
                ? <>il manque <strong>{fmt(Math.ceil(plan.shortfall))}/mois</strong> (prévu {fmt(plan.contribution)}, nécessaire {fmt(Math.ceil(plan.needed))})</>
                : <>échéance atteinte, il reste {fmt(plan.remaining)}</>}
            </p>
          );
        }
        if (plan.contribution > 0) {
          return (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
              📅 {fmt(plan.contribution)}/mois prévus → objectif atteint en <strong>{monthLabel(plan.reachMonth)}</strong>
            </p>
          );
        }
        return monthlyNeeded ? (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            💡 Mettre de côté <strong>{fmt(Math.ceil(monthlyNeeded))}/mois</strong> pour atteindre l'objectif à temps
          </p>
        ) : null;
      })()}

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
      monthlyContribution: goal.monthlyContribution != null ? String(goal.monthlyContribution) : '',
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
      monthlyContribution: form.monthlyContribution ? Number(form.monthlyContribution) : null,
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
      const goal = await api.patch(`/api/goals/${selectedGoal.id}/deposit`, { amount: Number(depositAmount) });
      setGoals(g => g.map(x => x.id === goal.id ? goal : x));
      setModal(null);
    } catch {}
  }

  const { state } = useBudget();
  const savingCapacity = totalSavingEnvelopesBudget(state.envelopes) + totalProgrammedSavings(state.fixedCharges)
    + Math.max(0, computedSavings(state.profile.netSalary, state.fixedCharges, state.envelopes));
  const activeGoals = goals.filter(g => g.currentAmount < g.targetAmount);
  const plannedTotal = activeGoals.reduce((s, g) => s + (Number(g.monthlyContribution) || 0), 0);
  const neededTotal = activeGoals.reduce((s, g) => s + (goalPlan(g).needed || 0), 0);
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

      {!loading && activeGoals.length > 0 && (plannedTotal > 0 || neededTotal > 0) && (
        <div className="card">
          <p className="text-sm font-semibold text-slate-700 mb-2">Tes objectifs et ton budget</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 py-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Prévu</p>
              <p className="text-sm font-bold text-slate-700">{fmt(plannedTotal)}/mois</p>
            </div>
            <div className="rounded-xl bg-slate-50 py-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Nécessaire</p>
              <p className="text-sm font-bold text-slate-700">{fmt(Math.ceil(neededTotal))}/mois</p>
            </div>
            <div className="rounded-xl bg-slate-50 py-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Épargne du budget</p>
              <p className="text-sm font-bold text-slate-700">{fmt(savingCapacity)}/mois</p>
            </div>
          </div>
          <p className={`text-xs mt-2 ${Math.max(plannedTotal, neededTotal) > savingCapacity ? 'text-warn' : 'text-savings'}`}>
            {Math.max(plannedTotal, neededTotal) > savingCapacity
              ? `⚠️ Tes objectifs demandent plus que l'épargne prévue par ton budget (${fmt(Math.max(plannedTotal, neededTotal) - savingCapacity)}/mois de plus).`
              : '✓ Ton budget permet de financer tes objectifs.'}
          </p>
        </div>
      )}

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
          <div>
            <label className="label">Versement mensuel prévu (optionnel)</label>
            <input className="input" type="number" min="0" placeholder="Ex. 100"
              value={form.monthlyContribution} onChange={e => setForm(f => ({ ...f, monthlyContribution: e.target.value }))} />
            {form.targetAmount && form.targetDate && (() => {
              const p = goalPlan({ targetAmount: Number(form.targetAmount), currentAmount: Number(form.currentAmount) || 0, targetDate: form.targetDate, monthlyContribution: Number(form.monthlyContribution) || 0 });
              return p.needed != null ? <p className="text-xs text-slate-400 mt-1">Pour tenir la date : {fmt(Math.ceil(p.needed))}/mois</p> : null;
            })()}
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
