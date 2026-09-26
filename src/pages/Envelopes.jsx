import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Banknote, RefreshCw } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { ENVELOPE_CATEGORIES, COLOR_MAP, generateId } from '../data/defaults';
import { fmt, fmtDec, spentInPeriod, weeklyAmount, totalFixedExSavings, totalProgrammedSavings } from '../utils/budget';
import { computeWithdrawal } from '../utils/withdrawal';
import { api } from '../api/client';
import Modal from '../components/Modal';

function WithdrawalModal({ envelopes, transactions, viewMode, idealNeeds, idealWants, idealSavings, tobaccoEnv, onClose }) {
  const [mode, setMode] = useState(viewMode);
  const [calcMode, setCalcMode] = useState('ideal');
  const roundUp5 = v => Math.ceil(v / 5) * 5;
  const periodLabel = mode === 'weekly' ? '/ semaine' : '/ mois';
  const isIdeal = calcMode === 'ideal';

  const { envelopes: envResult, ideal: idealResult } = computeWithdrawal({
    envelopes, transactions, mode, idealNeeds, idealWants, idealSavings,
  });

  const { needs: needsData, wants: wantData, savings: savingData, tobacco } = envResult;
  const { budget: tobaccoBudget, spent: tobaccoSpent, toWithdraw: tobaccoToWithdraw } = tobacco;

  const wantSpent = wantData.reduce((s, e) => s + e.spent, 0);
  const savingSpent = savingData.reduce((s, e) => s + e.spent, 0);

  const pleasuresIdealBudget = idealResult.wantsBudget;
  const pleasuresIdealToWithdraw = idealResult.wantsToWithdraw;
  const savingsIdealBudget = idealResult.savingsBudget;
  const savingsIdealToWithdraw = idealResult.savingsToWithdraw;

  // Besoins always shown as individual envelopes; wants/savings switch on calcMode
  const needsTotal = envResult.needsTotal;
  const pleasuresTotal = isIdeal ? pleasuresIdealToWithdraw : envResult.wantsTotal;
  const savingsTotal = isIdeal ? savingsIdealToWithdraw : envResult.savingsTotal;
  const grandTotal = roundUp5(needsTotal + tobaccoToWithdraw + pleasuresTotal + savingsTotal);

  const hasAnySpending = [...needsData, ...wantData, ...savingData].some(e => e.spent > 0) || tobaccoSpent > 0;

  return (
    <Modal
      title="💶 Retrait espèces"
      onClose={onClose}
      footer={<button className="btn-primary w-full" onClick={onClose}>Fermer</button>}
    >
      {/* Période */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 mb-2">
        {[{ id: 'monthly', label: 'Mensuel' }, { id: 'weekly', label: 'Hebdomadaire' }].map(f => (
          <button key={f.id} onClick={() => setMode(f.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === f.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {/* Mode calcul */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 mb-3">
        {[{ id: 'ideal', label: '🎯 Budget idéal' }, { id: 'envelopes', label: '👛 Mes enveloppes' }].map(f => (
          <button key={f.id} onClick={() => setCalcMode(f.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${calcMode === f.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {hasAnySpending && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50 rounded-lg px-3 py-2 mb-3">
          <span>✅</span>
          <span>Dépenses enregistrées déduites automatiquement</span>
        </div>
      )}

      {/* Besoins — toujours lignes individuelles */}
      {needsData.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">🧾 Besoins</p>
          {needsData.map(e => (
            <div key={e.id} className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-sm text-slate-600">{e.icon} {e.name}</span>
                {e.spent > 0 && (
                  <span className="text-xs text-slate-400 ml-1.5">
                    ({fmt(e.spent)} dépensé)
                  </span>
                )}
              </div>
              <span className={`font-semibold ${e.toWithdraw === 0 ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                {fmt(e.toWithdraw === 0 ? e.budget : e.toWithdraw)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
            <span className="text-xs font-semibold text-slate-500">Sous-total</span>
            <span className="font-bold text-needs">{fmt(needsTotal)}</span>
          </div>
        </div>
      )}

      {/* Tabac */}
      {tobaccoBudget > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">🚬 Tabac</p>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-slate-600">{tobaccoEnv.name}</span>
              {tobaccoSpent > 0 && (
                <span className="text-xs text-slate-400 ml-1.5">({fmt(tobaccoSpent)} dépensé)</span>
              )}
            </div>
            <span className={`font-bold ${tobaccoToWithdraw === 0 ? 'text-slate-300 line-through' : 'text-warn'}`}>
              {fmt(tobaccoToWithdraw === 0 ? tobaccoBudget : tobaccoToWithdraw)}
            </span>
          </div>
        </div>
      )}

      {/* Plaisirs */}
      {(isIdeal ? true : wantData.length > 0) && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            🎉 Plaisirs {isIdeal && <span className="normal-case font-normal">(idéal 30% − tabac)</span>}
          </p>
          {isIdeal ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-slate-600">Total plaisirs</span>
                {wantSpent > 0 && (
                  <span className="text-xs text-slate-400 ml-1.5">({fmt(wantSpent)} dépensé)</span>
                )}
              </div>
              <span className={`font-bold ${pleasuresIdealToWithdraw === 0 ? 'text-slate-300 line-through' : 'text-wants'}`}>
                {fmt(pleasuresIdealToWithdraw === 0 ? pleasuresIdealBudget : pleasuresIdealToWithdraw)}
              </span>
            </div>
          ) : (
            <>
              {wantData.map(e => (
                <div key={e.id} className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-sm text-slate-600">{e.icon} {e.name}</span>
                    {e.spent > 0 && (
                      <span className="text-xs text-slate-400 ml-1.5">({fmt(e.spent)} dépensé)</span>
                    )}
                  </div>
                  <span className={`font-semibold ${e.toWithdraw === 0 ? 'text-slate-300 line-through' : 'text-slate-800'}`}>
                    {fmt(e.toWithdraw === 0 ? e.budget : e.toWithdraw)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
                <span className="text-xs font-semibold text-slate-500">Sous-total</span>
                <span className="font-bold text-wants">{fmt(pleasuresTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Épargne */}
      {(isIdeal ? savingsIdealBudget > 0 : savingData.length > 0) && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            🏦 Épargne {isIdeal && <span className="normal-case font-normal">(20% du disponible)</span>}
          </p>
          {isIdeal ? (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-slate-600">Total épargne</span>
                {savingSpent > 0 && (
                  <span className="text-xs text-slate-400 ml-1.5">({fmt(savingSpent)} dépensé)</span>
                )}
              </div>
              <span className={`font-bold ${savingsIdealToWithdraw === 0 ? 'text-slate-300 line-through' : 'text-savings'}`}>
                {fmt(savingsIdealToWithdraw === 0 ? savingsIdealBudget : savingsIdealToWithdraw)}
              </span>
            </div>
          ) : (
            <>
              {savingData.map(e => (
                <div key={e.id} className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-sm text-slate-600">{e.icon} {e.name}</span>
                    {e.spent > 0 && (
                      <span className="text-xs text-slate-400 ml-1.5">({fmt(e.spent)} dépensé)</span>
                    )}
                  </div>
                  <span className={`font-semibold ${e.toWithdraw === 0 ? 'text-slate-300 line-through' : 'text-savings'}`}>
                    {fmt(e.toWithdraw === 0 ? e.budget : e.toWithdraw)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-1">
                <span className="text-xs font-semibold text-slate-500">Sous-total</span>
                <span className="font-bold text-savings">{fmt(savingsTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Total */}
      <div className="bg-primary/5 rounded-xl p-4 mt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total à retirer</p>
            <p className="text-xs text-slate-400 mt-0.5">{periodLabel}</p>
          </div>
          <p className="text-3xl font-bold text-primary">{fmt(grandTotal)}</p>
        </div>
      </div>
    </Modal>
  );
}

const BLANK_ENV = { name: '', categoryId: 'groceries', icon: '🛒', colorKey: 'needs', type: 'need', budgetMonthly: '' };
const BLANK_TX = { amount: '', note: '', date: new Date().toISOString().slice(0, 10), recurring: false, dayOfMonth: new Date().getDate() };

function EnvelopeCard({ env, transactions, viewMode, onEdit, onDelete, onAddTx }) {
  const [open, setOpen] = useState(false);
  const colors = COLOR_MAP[env.colorKey] || COLOR_MAP.needs;
  const budget = viewMode === 'weekly' ? weeklyAmount(env.budgetMonthly) : env.budgetMonthly;
  const spent = spentInPeriod(transactions, env.id, viewMode);
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const remaining = budget - spent;
  const over = remaining < 0;

  const periodTxs = transactions.filter(t => {
    if (t.envelopeId !== env.id) return false;
    const now = new Date();
    let cutoff;
    if (viewMode === 'weekly') {
      cutoff = new Date(now);
      const day = now.getDay();
      cutoff.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
      cutoff.setHours(0, 0, 0, 0);
    } else {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return new Date(t.date) >= cutoff;
  });

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: colors.bg }}
        >
          {env.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-800 truncate">{env.name}</p>
            <div className="text-right flex-shrink-0">
              <span className="text-sm font-bold" style={{ color: over ? '#f43f5e' : colors.ring }}>
                {fmt(remaining)}
              </span>
              <span className="text-xs text-slate-400"> restant</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-400">{fmt(spent)} / {fmt(budget)}</span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: colors.bg, color: colors.text }}
            >
              {env.type === 'saving' ? 'Épargne' : env.type === 'need' ? 'Besoin' : 'Envie'}
            </span>
          </div>
        </div>
        <button
          onClick={onAddTx}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0 transition-colors"
          style={{ background: colors.ring }}
          title="Ajouter une dépense"
        >
          +
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: over ? '#f43f5e' : pct > 80 ? '#f59e0b' : colors.ring,
          }}
        />
      </div>

      {/* Expand transactions */}
      <div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <div
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 cursor-pointer hover:text-slate-600 transition-colors flex-1"
          >
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {periodTxs.length} dépense{periodTxs.length !== 1 ? 's' : ''}
          </div>
          <span className="flex gap-2 ml-auto">
            <button onClick={onEdit} className="p-1 hover:text-primary transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={onDelete} className="p-1 hover:text-danger transition-colors">
              <Trash2 size={13} />
            </button>
          </span>
        </div>
        {open && periodTxs.length > 0 && (
          <div className="mt-2 space-y-1">
            {periodTxs.map(tx => (
              <div key={tx.id} className="flex items-center justify-between text-sm py-1 border-t border-slate-50">
                <div>
                  <span className="text-slate-600">{tx.note || '—'}</span>
                  <span className="text-slate-400 text-xs ml-2">
                    {new Date(tx.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <span className="font-semibold text-slate-800">-{fmtDec(tx.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Envelopes() {
  const { state, dispatch } = useBudget();
  const { envelopes, transactions, settings, profile, fixedCharges } = state;
  const viewMode = settings.viewMode;

  const afterFixed = Math.max(0, profile.netSalary - totalFixedExSavings(fixedCharges) - totalProgrammedSavings(fixedCharges));
  const idealNeeds = afterFixed * 0.5;
  const idealWants = afterFixed * 0.3;
  const idealSavings = afterFixed * 0.2;
  const tobaccoEnv = envelopes.find(e => e.categoryId === 'tobacco');

  const [envModal, setEnvModal] = useState(null);
  const [txModal, setTxModal] = useState(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [envForm, setEnvForm] = useState(BLANK_ENV);
  const [txForm, setTxForm] = useState(BLANK_TX);

  function openAddEnv() {
    setEnvForm(BLANK_ENV);
    setEnvModal({ mode: 'add' });
  }

  function openEditEnv(env) {
    setEnvForm({ name: env.name, categoryId: env.categoryId, icon: env.icon, colorKey: env.colorKey, type: env.type, budgetMonthly: env.budgetMonthly });
    setEnvModal({ mode: 'edit', env });
  }

  function saveEnv() {
    if (!envForm.name || !envForm.budgetMonthly) return;
    if (envModal.mode === 'add') {
      const cat = ENVELOPE_CATEGORIES.find(c => c.id === envForm.categoryId);
      dispatch({
        type: 'ADD_ENVELOPE',
        payload: {
          id: generateId(),
          ...envForm,
          icon: cat?.icon || '📦',
          colorKey: cat?.colorKey || 'needs',
          type: cat?.type || 'need',
          budgetMonthly: Number(envForm.budgetMonthly),
        },
      });
    } else {
      dispatch({ type: 'UPDATE_ENVELOPE', payload: { ...envModal.env, ...envForm, budgetMonthly: Number(envForm.budgetMonthly) } });
    }
    setEnvModal(null);
  }

  function saveTx() {
    if (!txForm.amount || Number(txForm.amount) <= 0) return;
    dispatch({
      type: 'ADD_TRANSACTION',
      payload: {
        id: generateId(),
        envelopeId: txModal.env.id,
        amount: Number(txForm.amount),
        note: txForm.note,
        date: txForm.date,
      },
    });
    if (txForm.recurring) {
      api.post('/api/recurring', {
        envelopeId: txModal.env.id,
        amount: Number(txForm.amount),
        note: txForm.note,
        dayOfMonth: Number(txForm.dayOfMonth),
      }).catch(() => {});
    }
    setTxModal(null);
    setTxForm(BLANK_TX);
  }

  const totalBudget = envelopes.reduce((s, e) => s + (viewMode === 'weekly' ? weeklyAmount(e.budgetMonthly) : e.budgetMonthly), 0);
  const totalSpent = envelopes.reduce((s, e) => s + spentInPeriod(transactions, e.id, viewMode), 0);

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Enveloppes</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {viewMode === 'weekly' ? 'Semaine en cours' : 'Mois en cours'}
          </p>
        </div>
        <div className="flex gap-2">
          {envelopes.length > 0 && (
            <button
              onClick={() => setWithdrawalOpen(true)}
              className="btn-secondary flex items-center gap-1.5 py-2 text-sm"
            >
              <Banknote size={16} /> Retrait
            </button>
          )}
          <button onClick={openAddEnv} className="btn-primary flex items-center gap-1.5 py-2 text-sm">
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
        {['monthly', 'weekly'].map(mode => (
          <button
            key={mode}
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: mode })}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              viewMode === mode ? 'bg-white text-primary shadow-sm' : 'text-slate-500'
            }`}
          >
            {mode === 'monthly' ? 'Mensuel' : 'Hebdomadaire'}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      {envelopes.length > 0 && (
        <div className="card">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-500">Dépensé</span>
            <span className="font-bold text-slate-800">{fmt(totalSpent)} / {fmt(totalBudget)}</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalSpent / totalBudget > 0.9 ? 'bg-warn' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Envelopes */}
      {envelopes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-4xl mb-3">👛</p>
          <p className="font-medium">Aucune enveloppe</p>
          <p className="text-sm mt-1">Crée des enveloppes pour tes dépenses variables</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[
            { type: 'need', label: '🧾 Besoins' },
            { type: 'want', label: '🎉 Envies' },
            { type: 'saving', label: '🏦 Épargne' },
          ].map(({ type, label }) => {
            const group = envelopes.filter(e => e.type === type);
            if (group.length === 0) return null;
            return (
              <div key={type}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{label}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {group.map(env => (
                    <EnvelopeCard
                      key={env.id}
                      env={env}
                      transactions={transactions}
                      viewMode={viewMode}
                      onEdit={() => openEditEnv(env)}
                      onDelete={() => dispatch({ type: 'DELETE_ENVELOPE', payload: env.id })}
                      onAddTx={() => { setTxModal({ env }); setTxForm(BLANK_TX); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Envelope modal */}
      {envModal && (
        <Modal
          title={envModal.mode === 'add' ? 'Nouvelle enveloppe' : 'Modifier l\'enveloppe'}
          onClose={() => setEnvModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEnvModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveEnv} disabled={!envForm.name || !envForm.budgetMonthly}>
                {envModal.mode === 'add' ? 'Créer' : 'Enregistrer'}
              </button>
            </>
          }
        >
          <div>
            <label className="label">Catégorie</label>
            <select
              className="input"
              value={envForm.categoryId}
              onChange={e => {
                const cat = ENVELOPE_CATEGORIES.find(c => c.id === e.target.value);
                setEnvForm(f => ({ ...f, categoryId: e.target.value, name: cat?.name || f.name, icon: cat?.icon || f.icon, colorKey: cat?.colorKey || f.colorKey, type: cat?.type || f.type }));
              }}
            >
              {ENVELOPE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nom personnalisé</label>
            <input className="input" value={envForm.name} onChange={e => setEnvForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Budget mensuel (€)</label>
            <input
              className="input text-lg font-semibold"
              type="number"
              placeholder="Ex. 300"
              value={envForm.budgetMonthly}
              onChange={e => setEnvForm(f => ({ ...f, budgetMonthly: e.target.value }))}
            />
            {envForm.budgetMonthly && (
              <p className="text-xs text-slate-400 mt-1">
                Soit {fmt(weeklyAmount(Number(envForm.budgetMonthly)))} / semaine
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* Transaction modal */}
      {txModal && (
        <Modal
          title={`Dépense — ${txModal.env.name}`}
          onClose={() => setTxModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setTxModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveTx} disabled={!txForm.amount || Number(txForm.amount) <= 0}>
                Enregistrer
              </button>
            </>
          }
        >
          <div>
            <label className="label">Montant (€)</label>
            <input
              className="input text-2xl font-bold"
              type="number"
              placeholder="0.00"
              value={txForm.amount}
              onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Description (optionnel)</label>
            <input
              className="input"
              placeholder="Ex. Carrefour, Total, …"
              value={txForm.note}
              onChange={e => setTxForm(f => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={txForm.date}
              onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          {/* Recurring toggle */}
          <div
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${txForm.recurring ? 'border-primary bg-primary/5' : 'border-slate-200 bg-slate-50'}`}
            onClick={() => setTxForm(f => ({ ...f, recurring: !f.recurring }))}
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={15} className={txForm.recurring ? 'text-primary' : 'text-slate-400'} />
              <span className={`text-sm font-medium ${txForm.recurring ? 'text-primary' : 'text-slate-600'}`}>
                Dépense récurrente
              </span>
            </div>
            <div className={`w-9 h-5 rounded-full transition-colors ${txForm.recurring ? 'bg-primary' : 'bg-slate-200'}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm mt-0.5 transition-transform ${txForm.recurring ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </div>
          {txForm.recurring && (
            <div>
              <label className="label">Jour du mois (1–28)</label>
              <input
                className="input"
                type="number"
                min="1"
                max="28"
                value={txForm.dayOfMonth}
                onChange={e => setTxForm(f => ({ ...f, dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value))) }))}
              />
              <p className="text-xs text-slate-400 mt-1">
                Créée automatiquement le {txForm.dayOfMonth} de chaque mois
              </p>
            </div>
          )}
        </Modal>
      )}

      {/* Withdrawal modal */}
      {withdrawalOpen && (
        <WithdrawalModal
          envelopes={envelopes}
          transactions={transactions}
          viewMode={viewMode}
          idealNeeds={idealNeeds}
          idealWants={idealWants}
          idealSavings={idealSavings}
          tobaccoEnv={tobaccoEnv}
          onClose={() => setWithdrawalOpen(false)}
        />
      )}
    </div>
  );
}
